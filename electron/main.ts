import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { askCodex } from './codex'
import {
  createJournalMarkdownWithFrontMatter,
  stripManagedFrontMatter,
} from '../src/domain/markdown/frontMatter'
import type { DayFrontMatter } from '../src/domain/markdown/types'
import { parseJournalMarkdown } from '../src/domain/markdown/parseJournalMarkdown'
import type {
  Annotation,
  AnnotationFile,
  LinePosition,
  TextPosition,
  TextQuote,
  TextSelector,
} from '../src/domain/annotations/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_MIN_WIDTH = 1180
const JOURNAL_DIR_NAME = '.journal'

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
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

ipcMain.handle('codex:ask', (_event, prompt: unknown) => askCodex(prompt, process.env.APP_ROOT))
ipcMain.handle('journal:loadToday', () => loadTodayJournal())
ipcMain.handle('journal:saveToday', (_event, content: unknown) => saveTodayJournal(content))
ipcMain.handle('journal:readAnnotations', (_event, date: unknown) => readJournalAnnotations(date))
ipcMain.handle('journal:refreshTodayWeather', (_event, location: unknown) => refreshTodayWeather(location))

type JournalFile = {
  content: string
  date: string
  fileName: string
  filePath: string
  updatedAt: string | null
}

type WeatherLookupLocation = {
  latitude?: number
  longitude?: number
}

type WeatherLookupPayload = {
  weather: NonNullable<DayFrontMatter['weather']>
  location?: NonNullable<DayFrontMatter['location']>
}

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

function getJournalPath(date: string) {
  assertDateKey(date)

  const fileName = `${date}.md`
  const directory = path.join(app.getPath('home'), JOURNAL_DIR_NAME)

  return {
    date,
    directory,
    fileName,
    filePath: path.join(directory, fileName),
  }
}

function getJournalAnnotationsPath(date: string) {
  assertDateKey(date)

  const directory = path.join(app.getPath('home'), JOURNAL_DIR_NAME)
  const annotationsDirectory = path.join(directory, 'annotations')
  const fileName = `${date}.json`

  return {
    date,
    directory: annotationsDirectory,
    fileName,
    filePath: path.join(annotationsDirectory, fileName),
    sourcePath: path.join(directory, `${date}.md`),
  }
}

function assertDateKey(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError('Journal date must use YYYY-MM-DD format.')
  }
}

async function journalFilePayload(content: string): Promise<JournalFile> {
  const { date, fileName, filePath } = getTodayJournalPath()
  const fileStat = await stat(filePath).catch(() => null)

  return {
    content,
    date,
    fileName,
    filePath,
    updatedAt: fileStat?.mtime.toISOString() ?? null,
  }
}

async function loadTodayJournal() {
  const { date, directory, filePath } = getTodayJournalPath()

  await mkdir(directory, { recursive: true })

  const existingContent = await readFile(filePath, 'utf8').catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }

    throw error
  })

  if (existingContent !== null) {
    return journalFilePayload(existingContent)
  }

  const content = createDefaultJournalMarkdown(date)

  await writeFile(filePath, content, 'utf8')

  return journalFilePayload(content)
}

async function saveTodayJournal(content: unknown) {
  if (typeof content !== 'string') {
    throw new TypeError('Journal content must be a string.')
  }

  const { directory, filePath } = getTodayJournalPath()

  await mkdir(directory, { recursive: true })
  await writeJournalFile(filePath, content)

  return journalFilePayload(content)
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
    },
  ]
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

  if (hasFreshWeather(parsedEntry.frontMatter.weather, date)) {
    return journalFilePayload(existingContent)
  }

  const weatherPayload = await fetchTodayWeather(normalizeWeatherLookupLocation(location))
  const latestContent = await readFile(filePath, 'utf8').catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return existingContent
    }

    throw error
  })
  const latestParsedEntry = parseJournalMarkdown(latestContent)

  if (hasFreshWeather(latestParsedEntry.frontMatter.weather, date)) {
    return journalFilePayload(latestContent)
  }

  const nextFrontMatter: DayFrontMatter = {
    ...latestParsedEntry.frontMatter,
    date,
    weather: weatherPayload.weather,
    location: weatherPayload.location ?? latestParsedEntry.frontMatter.location,
  }
  const nextContent = createJournalMarkdownWithFrontMatter(
    stripManagedFrontMatter(latestContent),
    nextFrontMatter,
  )

  await writeJournalFile(filePath, nextContent)

  return journalFilePayload(nextContent)
}

async function writeJournalFile(filePath: string, content: string) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`

  await writeFile(temporaryPath, content, 'utf8')
  await rename(temporaryPath, filePath)
}

async function fetchTodayWeather(location: WeatherLookupLocation): Promise<WeatherLookupPayload> {
  const weatherTarget = hasCoordinates(location)
    ? `${location.latitude},${location.longitude}`
    : ''
  const requestUrl = `https://wttr.in/${weatherTarget}?format=j1&lang=zh`
  const response = await fetch(requestUrl, {
    headers: {
      'User-Agent': 'JournalDesktop/0.0.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Weather request failed with ${response.status}.`)
  }

  return parseWttrWeather(await response.json())
}

function parseWttrWeather(payload: unknown): WeatherLookupPayload {
  const root = asRecord(payload)
  const currentCondition = firstRecord(root.current_condition)
  const nearestArea = firstRecord(root.nearest_area)
  const temperature = numberFromRecord(currentCondition, 'temp_C')
  const feelsLike = numberFromRecord(currentCondition, 'FeelsLikeC')
  const humidity = numberFromRecord(currentCondition, 'humidity')
  const windSpeed = numberFromRecord(currentCondition, 'windspeedKmph')
  const text = firstLocalizedValue(currentCondition.lang_zh) ?? firstLocalizedValue(currentCondition.weatherDesc)

  if (!text || temperature === undefined) {
    throw new Error('Weather response did not include current weather.')
  }

  const areaName = firstLocalizedValue(nearestArea.areaName)
  const region = firstLocalizedValue(nearestArea.region)
  const country = firstLocalizedValue(nearestArea.country)

  return {
    weather: {
      text,
      temperature,
      feelsLike,
      humidity,
      windSpeed,
      updatedAt: new Date().toISOString(),
    },
    location: {
      name: areaName,
      region,
      country,
    },
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

function normalizeCoordinate(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function hasCoordinates(location: WeatherLookupLocation): location is Required<WeatherLookupLocation> {
  return location.latitude !== undefined && location.longitude !== undefined
}

function hasFreshWeather(weather: DayFrontMatter['weather'], date: string) {
  return Boolean(weather?.text && weather.updatedAt?.startsWith(date))
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

function firstLocalizedValue(value: unknown) {
  const record = firstRecord(value)
  const localizedValue = record.value

  return typeof localizedValue === 'string' && localizedValue.trim() ? localizedValue.trim() : undefined
}

function firstRecord(value: unknown): Record<string, unknown> {
  return Array.isArray(value) ? asRecord(value[0]) : {}
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
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
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

app.whenReady().then(createWindow)
