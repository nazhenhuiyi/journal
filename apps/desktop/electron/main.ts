import { app, BrowserWindow, dialog, ipcMain, nativeImage, net, protocol } from 'electron'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { promisify } from 'node:util'
import { loadJournalSettings, saveJournalSettings } from './journalSettings'
import {
  loadJournalGitSyncStatus,
  pullJournalUpdates,
  pushJournalChanges,
  saveJournalGitSyncSnapshot,
  saveJournalGitSyncSettings,
  syncJournalNow,
} from './journalSync'
import { importJournalImagesForDate } from './journalMedia'
import {
  createJournalMarkdownWithFrontMatter,
  hasMeaningfulJournalChange,
  isFreshWeather,
  isFreshWeatherForLocation,
  normalizeWeatherQueryForWttr,
  parseOpenMeteoGeocoding,
  parseOpenMeteoWeather,
  parseJournalMarkdown,
  parseWttrWeather,
  stripManagedFrontMatter,
} from '@journal/core'
import type {
  Annotation,
  AnnotationFile,
  DayFrontMatter,
  LinePosition,
  TextPosition,
  TextQuote,
  TextSelector,
  WeatherLookupLocation,
  WeatherLookupPayload,
} from '@journal/core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_ID = 'app.zilin.journal.desktop'
const APP_NAME = '且留'
const APP_MIN_WIDTH = 1180
const JOURNAL_DIR_NAME = '.journal'
const JOURNAL_MEDIA_PROTOCOL = 'journal-media'
const JOURNAL_DIR_OVERRIDE = process.env['JOURNAL_DIR']?.trim()
const JOURNAL_USER_DATA_DIR = process.env['JOURNAL_USER_DATA_DIR']?.trim()
const SHOULD_DISABLE_WEATHER = process.env['JOURNAL_DISABLE_WEATHER'] === '1'
const execFileAsync = promisify(execFile)

if (JOURNAL_USER_DATA_DIR) {
  mkdirSync(JOURNAL_USER_DATA_DIR, { recursive: true })
  app.setPath('userData', path.resolve(JOURNAL_USER_DATA_DIR))
}

app.setName(APP_NAME)
app.setAppUserModelId(APP_ID)

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = app.isPackaged ? undefined : process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

protocol.registerSchemesAsPrivileged([
  {
    scheme: JOURNAL_MEDIA_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

ipcMain.handle('journalSettings:load', () => loadJournalSettings(getJournalDirectory()))
ipcMain.handle('journalSettings:save', (_event, payload: unknown) =>
  saveJournalSettings(getJournalDirectory(), payload),
)
ipcMain.handle('journalSync:loadStatus', () => loadJournalGitSyncStatus(getJournalDirectory()))
ipcMain.handle('journalSync:saveSettings', (_event, payload: unknown) =>
  saveJournalGitSyncSettings(getJournalDirectory(), payload),
)
ipcMain.handle('journalSync:saveState', (_event, payload: unknown) =>
  saveJournalGitSyncSnapshot(getJournalDirectory(), payload),
)
ipcMain.handle('journalSync:pull', () => pullJournalUpdates(getJournalDirectory()))
ipcMain.handle('journalSync:push', (_event, options: unknown) =>
  pushJournalChanges(getJournalDirectory(), options),
)
ipcMain.handle('journalSync:syncNow', (_event, options: unknown) =>
  syncJournalNow(getJournalDirectory(), options),
)
ipcMain.handle('journal:loadToday', () => loadTodayJournal())
ipcMain.handle('journal:saveToday', (_event, content: unknown) => saveTodayJournal(content))
ipcMain.handle('journal:listEntries', () => listJournalEntries())
ipcMain.handle('journal:loadDate', (_event, date: unknown) => loadJournal(date))
ipcMain.handle('journal:saveDate', (_event, date: unknown, content: unknown) => saveJournal(date, content))
ipcMain.handle('journal:readAnnotations', (_event, date: unknown) => readJournalAnnotations(date))
ipcMain.handle('journal:saveAnnotations', (_event, date: unknown, annotations: unknown) =>
  saveJournalAnnotations(date, annotations),
)
ipcMain.handle('journal:refreshTodayWeather', (_event, location: unknown) => refreshTodayWeather(location))
ipcMain.handle('journal:importImages', (_event, date: unknown) => importJournalImages(date))

type JournalFile = {
  content: string
  date: string
  didWrite: boolean
  fileName: string
  filePath: string
  updatedAt: string | null
}

type JournalEntry = Omit<JournalFile, 'content'>

function getTodayDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function createDefaultJournalMarkdown(dateKey: string) {
  return createJournalMarkdownWithFrontMatter('', { date: dateKey })
}

function getTodayJournalPath() {
  return getJournalPath(getTodayDateKey())
}

function getJournalDirectory() {
  if (JOURNAL_DIR_OVERRIDE) {
    return path.resolve(JOURNAL_DIR_OVERRIDE)
  }

  return path.join(app.getPath('home'), JOURNAL_DIR_NAME)
}

function getJournalPath(date: string) {
  assertDateKey(date)

  const [year, month] = date.split('-')
  const fileName = `${date}.md`
  const directory = path.join(getJournalDirectory(), 'entries', year, month)

  return {
    date,
    directory,
    fileName,
    filePath: path.join(directory, fileName),
  }
}

function getJournalAnnotationsPath(date: string) {
  assertDateKey(date)

  const [year, month] = date.split('-')
  const directory = getJournalDirectory()
  const annotationsDirectory = path.join(directory, 'annotations', year, month)
  const fileName = `${date}.json`

  return {
    date,
    directory: annotationsDirectory,
    fileName,
    filePath: path.join(annotationsDirectory, fileName),
    sourcePath: getJournalPath(date).filePath,
  }
}

function assertDateKey(date: unknown): asserts date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError('Journal date must use YYYY-MM-DD format.')
  }
}

async function journalFilePayload(
  content: string,
  date = getTodayDateKey(),
  didWrite = false,
): Promise<JournalFile> {
  const { fileName, filePath } = getJournalPath(date)
  const fileStat = await stat(filePath).catch(() => null)

  return {
    content,
    date,
    didWrite,
    fileName,
    filePath,
    updatedAt: fileStat?.mtime.toISOString() ?? null,
  }
}

async function loadTodayJournal() {
  return loadJournal(getTodayDateKey())
}

async function listJournalEntries(): Promise<JournalEntry[]> {
  const directory = getJournalDirectory()
  const journalFiles = await collectJournalMarkdownFiles(directory)
  const entries = await Promise.all(
    journalFiles.map(async ({ date, fileName, filePath }) => {
      const content = await readFile(filePath, 'utf8').catch(() => null)

      if (!content || !hasJournalContent(content)) {
        return null
      }

      const fileStat = await stat(filePath).catch(() => null)

      return {
        date,
        fileName,
        filePath,
        updatedAt: fileStat?.mtime.toISOString() ?? null,
      }
    }),
  )

  return entries
    .filter((entry): entry is JournalEntry => entry !== null)
    .sort((left, right) => left.date.localeCompare(right.date))
}

function hasJournalContent(content: string) {
  const parsedEntry = parseJournalMarkdown(content)

  return Boolean(
    parsedEntry.longEntryMarkdown.trim() ||
      parsedEntry.murmurs.some((murmur) => murmur.body.trim() || murmur.images.length > 0),
  )
}

async function collectJournalMarkdownFiles(journalDirectory: string) {
  const entriesDirectory = path.join(journalDirectory, 'entries')

  return collectNestedJournalMarkdownFiles(entriesDirectory, journalDirectory)
}

async function collectNestedJournalMarkdownFiles(directory: string, journalDirectory: string) {
  const dirents = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return []
    }

    throw error
  })
  const files: Array<{
    date: string
    fileName: string
    filePath: string
  }> = []

  for (const dirent of dirents) {
    const filePath = path.join(directory, dirent.name)

    if (dirent.isDirectory()) {
      files.push(...await collectNestedJournalMarkdownFiles(filePath, journalDirectory))
      continue
    }

    if (!dirent.isFile() || !/^\d{4}-\d{2}-\d{2}\.md$/.test(dirent.name)) {
      continue
    }

    files.push({
      date: dirent.name.slice(0, -3),
      fileName: path.relative(journalDirectory, filePath),
      filePath,
    })
  }

  return files
}

async function loadJournal(date: unknown) {
  if (typeof date !== 'string') {
    throw new TypeError('Journal date must be a string.')
  }

  const { date: dateKey, directory, filePath } = getJournalPath(date)

  await mkdir(directory, { recursive: true })

  const existingContent = await readFile(filePath, 'utf8').catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }

    throw error
  })

  if (existingContent !== null) {
    return journalFilePayload(existingContent, dateKey)
  }

  const content = createDefaultJournalMarkdown(dateKey)

  return journalFilePayload(content, dateKey)
}

async function saveTodayJournal(content: unknown) {
  return saveJournal(getTodayDateKey(), content)
}

async function saveJournal(date: unknown, content: unknown) {
  if (typeof date !== 'string') {
    throw new TypeError('Journal date must be a string.')
  }

  if (typeof content !== 'string') {
    throw new TypeError('Journal content must be a string.')
  }

  const { date: dateKey, directory, filePath } = getJournalPath(date)
  const parsedEntry = parseJournalMarkdown(content)
  const nextFrontMatter: DayFrontMatter = {
    ...parsedEntry.frontMatter,
    date: dateKey,
  }

  if (!isFreshWeather(nextFrontMatter.weather, dateKey)) {
    delete nextFrontMatter.weather
  }

  const todayContent = createJournalMarkdownWithFrontMatter(
    stripManagedFrontMatter(content),
    nextFrontMatter,
  )
  const existingContent = await readFile(filePath, 'utf8').catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }

    throw error
  })

  if (!hasMeaningfulJournalChange(existingContent ?? '', todayContent)) {
    return journalFilePayload(existingContent ?? todayContent, dateKey)
  }

  await mkdir(directory, { recursive: true })
  await writeJournalFile(filePath, todayContent)

  return journalFilePayload(todayContent, dateKey, true)
}

async function readJournalAnnotations(date: unknown): Promise<AnnotationFile> {
  if (typeof date !== 'string') {
    throw new TypeError('Annotation date must be a string.')
  }

  const { filePath, sourcePath } = getJournalAnnotationsPath(date)
  const content = await readFile(filePath, 'utf8').catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }

    throw error
  })

  if (content === null) {
    return {
      version: 1,
      date,
      source: sourcePath,
      sourceHash: '',
      annotations: [],
    }
  }

  return normalizeAnnotationFile(JSON.parse(content), date)
}

async function saveJournalAnnotations(date: unknown, payload: unknown): Promise<AnnotationFile> {
  if (typeof date !== 'string') {
    throw new TypeError('Annotation date must be a string.')
  }

  assertDateKey(date)

  if (!Array.isArray(payload)) {
    throw new TypeError('Annotations payload must be an array.')
  }

  const { directory, filePath, sourcePath } = getJournalAnnotationsPath(date)
  const sourceContent = await readFile(sourcePath, 'utf8').catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return createDefaultJournalMarkdown(date)
    }

    throw error
  })
  const { longEntryMarkdown } = parseJournalMarkdown(sourceContent)
  const annotationFile: AnnotationFile = {
    version: 1,
    date,
    source: sourcePath,
    sourceHash: hashText(longEntryMarkdown),
    annotations: payload.flatMap((annotation) => normalizeAnnotation(annotation)),
  }

  await mkdir(directory, { recursive: true })
  await writeJournalFile(filePath, `${JSON.stringify(annotationFile, null, 2)}\n`)

  return annotationFile
}

async function importJournalImages(date: unknown) {
  assertDateKey(date)

  const options = {
    title: '选择要放进今天的图片',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Images',
        extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'tif', 'tiff', 'bmp'],
      },
    ],
  } satisfies Electron.OpenDialogOptions
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)

  if (result.canceled) {
    return []
  }

  return importJournalImagesForDate(date, getJournalDirectory(), result.filePaths)
}

function registerJournalMediaProtocol() {
  protocol.handle(JOURNAL_MEDIA_PROTOCOL, async (request) => {
    const filePath = resolveJournalMediaRequestPath(request.url)

    if (!filePath) {
      return new Response('Not found', { status: 404 })
    }

    if (isHeicImagePath(filePath)) {
      const displayableImage = await createDisplayableHeicResponse(filePath)

      if (displayableImage) {
        return displayableImage
      }
    }

    return net.fetch(pathToFileURL(filePath).toString())
  })
}

async function createDisplayableHeicResponse(filePath: string) {
  const nativeResponse = createNativeImageResponse(filePath)

  if (nativeResponse) {
    return nativeResponse
  }

  if (process.platform !== 'darwin') {
    return null
  }

  const jpegBuffer = await convertHeicWithSips(filePath).catch(() => null)

  if (!jpegBuffer) {
    return null
  }

  return createJpegResponse(jpegBuffer)
}

function createNativeImageResponse(filePath: string) {
  const image = nativeImage.createFromPath(filePath)

  if (image.isEmpty()) {
    return null
  }

  const jpegBuffer = image.toJPEG(90)

  if (jpegBuffer.length === 0) {
    return null
  }

  return createJpegResponse(jpegBuffer)
}

async function convertHeicWithSips(filePath: string) {
  const fileStat = await stat(filePath)
  const cacheDirectory = path.join(app.getPath('userData'), 'heic-cache')
  const cacheKey = hashText(`${filePath}:${fileStat.size}:${fileStat.mtimeMs}`)
  const cacheFilePath = path.join(cacheDirectory, `${cacheKey}.jpg`)
  const cachedImage = await readFile(cacheFilePath).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }

    throw error
  })

  if (cachedImage) {
    return cachedImage
  }

  await mkdir(cacheDirectory, { recursive: true })
  await execFileAsync('/usr/bin/sips', ['-s', 'format', 'jpeg', filePath, '--out', cacheFilePath])

  return readFile(cacheFilePath)
}

function createJpegResponse(jpegBuffer: Buffer) {
  return new Response(new Uint8Array(jpegBuffer), {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': 'image/jpeg',
    },
  })
}

function resolveJournalMediaRequestPath(requestUrl: string) {
  const url = new URL(requestUrl)
  const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ''))

  if (!relativePath || path.isAbsolute(relativePath)) {
    return null
  }

  const journalDirectory = getJournalDirectory()
  const filePath = path.resolve(journalDirectory, relativePath)
  const isInsideJournalDirectory =
    filePath === journalDirectory || filePath.startsWith(`${journalDirectory}${path.sep}`)

  if (!isInsideJournalDirectory || !isSupportedJournalMediaPath(filePath)) {
    return null
  }

  return filePath
}

function isSupportedJournalMediaPath(filePath: string) {
  return /\.(bmp|gif|heic|heif|jpe?g|png|tiff?|webp)$/i.test(filePath)
}

function isHeicImagePath(filePath: string) {
  return /\.(heic|heif)$/i.test(filePath)
}

function normalizeAnnotationFile(payload: unknown, date: string): AnnotationFile {
  const root = asRecord(payload)
  const annotations = Array.isArray(root.annotations)
    ? root.annotations.flatMap((annotation) => normalizeAnnotation(annotation))
    : []

  return {
    version: 1,
    date: typeof root.date === 'string' ? root.date : date,
    source: typeof root.source === 'string' ? root.source : getJournalAnnotationsPath(date).sourcePath,
    sourceHash: typeof root.sourceHash === 'string' ? root.sourceHash : '',
    annotations,
  }
}

function normalizeAnnotation(payload: unknown): Annotation[] {
  const annotation = asRecord(payload)
  const id = stringFromRecord(annotation, 'id')
  const author = stringFromRecord(annotation, 'author')
  const kind = stringFromRecord(annotation, 'kind')
  const status = stringFromRecord(annotation, 'status')
  const createdAt = stringFromRecord(annotation, 'createdAt')
  const body = asRecord(annotation.body)
  const content = stringFromRecord(body, 'content')
  const target = asRecord(annotation.target)

  if (
    !id ||
    !isAnnotationAuthor(author) ||
    !isAnnotationKind(kind) ||
    !isAnnotationStatus(status) ||
    !createdAt ||
    !content
  ) {
    return []
  }

  if (target.type === 'day') {
    return [
      {
        id,
        author,
        kind,
        target: {
          type: 'day',
        },
        body: {
          content,
        },
        status,
        createdAt,
        updatedAt: stringFromRecord(annotation, 'updatedAt'),
        ai: normalizeAnnotationAi(asRecord(annotation.ai)),
      },
    ]
  }

  if (target.type !== 'longEntryRange') {
    return []
  }

  const selector = normalizeTextSelector(asRecord(target.selector))

  if (!selector) {
    return []
  }

  return [
    {
      id,
      author,
      kind,
      target: {
        type: 'longEntryRange',
        selector,
      },
      body: {
        content,
      },
      status,
      createdAt,
      updatedAt: stringFromRecord(annotation, 'updatedAt'),
      ai: normalizeAnnotationAi(asRecord(annotation.ai)),
    },
  ]
}

function normalizeAnnotationAi(payload: Record<string, unknown>): Annotation['ai'] | undefined {
  const threadId = stringFromRecord(payload, 'threadId')

  return threadId ? { threadId } : undefined
}

function normalizeTextSelector(selector: Record<string, unknown>): TextSelector | null {
  const sourceQuote = normalizeTextQuote(asRecord(selector.sourceQuote))
  const plainQuote = normalizeTextQuote(asRecord(selector.plainQuote))
  const textPosition = normalizeTextPosition(asRecord(selector.textPosition))
  const linePosition = normalizeLinePosition(asRecord(selector.linePosition))

  if (!sourceQuote || !plainQuote || !textPosition || !linePosition) {
    return null
  }

  return {
    sourceQuote,
    plainQuote,
    textPosition,
    linePosition,
  }
}

function normalizeTextQuote(payload: Record<string, unknown>): TextQuote | null {
  const exact = stringFromRecord(payload, 'exact')

  if (!exact) {
    return null
  }

  return {
    exact,
    prefix: stringFromRecord(payload, 'prefix'),
    suffix: stringFromRecord(payload, 'suffix'),
  }
}

function normalizeTextPosition(payload: Record<string, unknown>): TextPosition | null {
  const start = numberFromRecord(payload, 'start')
  const end = numberFromRecord(payload, 'end')

  if (start === undefined || end === undefined || start < 0 || end < start) {
    return null
  }

  return { start, end }
}

function normalizeLinePosition(payload: Record<string, unknown>): LinePosition | null {
  const startLine = numberFromRecord(payload, 'startLine')
  const startColumn = numberFromRecord(payload, 'startColumn')
  const endLine = numberFromRecord(payload, 'endLine')
  const endColumn = numberFromRecord(payload, 'endColumn')

  if (
    startLine === undefined ||
    startColumn === undefined ||
    endLine === undefined ||
    endColumn === undefined
  ) {
    return null
  }

  return { startLine, startColumn, endLine, endColumn }
}

function isAnnotationAuthor(value: string | undefined): value is Annotation['author'] {
  return value === 'ai' || value === 'user'
}

function isAnnotationKind(value: string | undefined): value is Annotation['kind'] {
  return value === 'observation' || value === 'question' || value === 'format' || value === 'spelling'
}

function isAnnotationStatus(value: string | undefined): value is Annotation['status'] {
  return value === 'visible' || value === 'hidden' || value === 'orphaned'
}

async function refreshTodayWeather(location: unknown) {
  const { date, directory, filePath } = getTodayJournalPath()

  await mkdir(directory, { recursive: true })

  const existingContent = await readFile(filePath, 'utf8').catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return createDefaultJournalMarkdown(date)
    }

    throw error
  })
  const parsedEntry = parseJournalMarkdown(existingContent)
  const journalSettings = await loadJournalSettings(getJournalDirectory())

  if (SHOULD_DISABLE_WEATHER) {
    return journalFilePayload(existingContent, date)
  }

  if (isFreshWeatherForLocation(parsedEntry.frontMatter, date, journalSettings.weatherLocation)) {
    return journalFilePayload(existingContent)
  }

  const weatherPayload = await fetchTodayWeather(
    resolveWeatherLookupLocation(journalSettings.weatherLocation, location),
  )
  const latestContent = await readFile(filePath, 'utf8').catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return existingContent
    }

    throw error
  })
  const latestParsedEntry = parseJournalMarkdown(latestContent)

  if (isFreshWeatherForLocation(latestParsedEntry.frontMatter, date, journalSettings.weatherLocation)) {
    return journalFilePayload(latestContent)
  }

  const nextFrontMatter: DayFrontMatter = {
    ...latestParsedEntry.frontMatter,
    date,
    weather: weatherPayload.weather,
    location: withWeatherLocationQuery(
      weatherPayload.location ?? latestParsedEntry.frontMatter.location,
      journalSettings.weatherLocation,
    ),
  }
  const nextContent = createJournalMarkdownWithFrontMatter(
    stripManagedFrontMatter(latestContent),
    nextFrontMatter,
  )

  if (!hasMeaningfulJournalChange(latestContent, nextContent)) {
    return journalFilePayload(latestContent, date)
  }

  await writeJournalFile(filePath, nextContent)

  return journalFilePayload(nextContent, date, true)
}

async function writeJournalFile(filePath: string, content: string) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`

  await writeFile(temporaryPath, content, 'utf8')
  await rename(temporaryPath, filePath)
}

async function fetchTodayWeather(location: WeatherLookupLocation): Promise<WeatherLookupPayload> {
  try {
    return await fetchOpenMeteoWeather(location)
  } catch {
    return fetchWttrWeather(location)
  }
}

type ResolvedOpenMeteoLocation = WeatherLookupLocation & {
  location?: DayFrontMatter['location']
}

async function fetchOpenMeteoWeather(location: WeatherLookupLocation): Promise<WeatherLookupPayload> {
  const resolvedLocation: ResolvedOpenMeteoLocation = location.query
    ? await fetchOpenMeteoLocation(location.query)
    : location
  const frontMatterLocation = resolvedLocation.location

  if (!hasCoordinates(resolvedLocation)) {
    throw new Error('Weather coordinates unavailable.')
  }

  const requestUrl = new URL('https://api.open-meteo.com/v1/forecast')

  requestUrl.searchParams.set('latitude', `${resolvedLocation.latitude}`)
  requestUrl.searchParams.set('longitude', `${resolvedLocation.longitude}`)
  requestUrl.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
  )
  requestUrl.searchParams.set('wind_speed_unit', 'kmh')
  requestUrl.searchParams.set('timezone', 'auto')
  requestUrl.searchParams.set('forecast_days', '1')

  const response = await fetchJson(requestUrl)

  return parseOpenMeteoWeather(response, frontMatterLocation)
}

async function fetchOpenMeteoLocation(query: string): Promise<ResolvedOpenMeteoLocation> {
  const requestUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')

  requestUrl.searchParams.set('name', query.trim())
  requestUrl.searchParams.set('count', '1')
  requestUrl.searchParams.set('language', 'zh')
  requestUrl.searchParams.set('format', 'json')

  const location = parseOpenMeteoGeocoding(await fetchJson(requestUrl))

  if (!location) {
    throw new Error('Open-Meteo geocoding did not include a usable location.')
  }

  return location
}

async function fetchWttrWeather(location: WeatherLookupLocation): Promise<WeatherLookupPayload> {
  const weatherTarget = getWeatherTarget(location)
  const requestUrl = `https://wttr.in/${weatherTarget}?format=j1&lang=zh`

  return parseWttrWeather(await fetchJson(requestUrl, {
    headers: {
      'User-Agent': 'JournalDesktop/0.0.0',
    },
  }))
}

function getWeatherTarget(location: WeatherLookupLocation) {
  if (location.query) {
    return encodeWeatherTarget(normalizeWeatherQueryForWttr(location.query))
  }

  if (hasCoordinates(location)) {
    return encodeWeatherTarget(`${location.latitude},${location.longitude}`)
  }

  return ''
}

function encodeWeatherTarget(target: string) {
  return encodeURIComponent(target).replace(/%2C/g, ',')
}

async function fetchJson(input: string | URL, init: RequestInit = {}) {
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), 4500)

  try {
    const response = await fetch(input, {
      ...init,
      signal: abortController.signal,
    })

    if (!response.ok) {
      throw new Error(`Weather request failed with ${response.status}.`)
    }

    return response.json() as Promise<unknown>
  } finally {
    clearTimeout(timeoutId)
  }
}

function normalizeWeatherLookupLocation(location: unknown): WeatherLookupLocation {
  if (!isRecord(location)) {
    return {}
  }

  return {
    latitude: normalizeCoordinate(location.latitude),
    longitude: normalizeCoordinate(location.longitude),
  }
}

function resolveWeatherLookupLocation(
  weatherLocation: string,
  browserLocation: unknown,
): WeatherLookupLocation {
  const query = weatherLocation.trim()

  if (query) {
    return { query }
  }

  return normalizeWeatherLookupLocation(browserLocation)
}

function withWeatherLocationQuery(
  location: DayFrontMatter['location'],
  weatherLocation: string,
): DayFrontMatter['location'] {
  const query = weatherLocation.trim()

  if (!query || !location) {
    return location
  }

  return {
    ...location,
    name: query,
    query,
  }
}

function normalizeCoordinate(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function hasCoordinates(
  location: WeatherLookupLocation,
): location is WeatherLookupLocation & { latitude: number; longitude: number } {
  return location.latitude !== undefined && location.longitude !== undefined
}

function hashText(text: string) {
  return createHash('sha256').update(text).digest('hex')
}

function numberFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key]
  const numberValue = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(numberValue) ? numberValue : undefined
}

function stringFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key]

  return typeof value === 'string' && value ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: APP_MIN_WIDTH,
    minHeight: 720,
    title: APP_NAME,
    icon: path.join(process.env.VITE_PUBLIC, 'brand/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  registerJournalMediaProtocol()
  createWindow()
})
