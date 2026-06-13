import * as FileSystem from 'expo-file-system/legacy'
import {
  createReviewFile,
  createReviewMoments,
  createJournalMarkdownWithFrontMatter,
  hasMeaningfulJournalChange,
  normalizeReviewFile,
  parseJournalMarkdown,
  normalizeThemeIds,
  serializeJournalMarkdownBody,
  stripManagedFrontMatter,
  type DayFrontMatter,
  type ImageLocation,
  type MarkdownDiagnostic,
  type MurmurBlock,
  type ReviewFile,
  type ReviewSourceDay,
} from '@journal/core'
import { getMobileE2eRunId } from './e2eEnvironment'

export type MobileJournalRecord = {
  date: string
  diagnostics: MarkdownDiagnostic[]
  frontMatter: DayFrontMatter
  longEntryMarkdown: string
  murmurs: MurmurBlock[]
  markdown: string
  updatedAt: string | null
}

export type SaveDailyJournalResult = MobileJournalRecord & {
  changedPaths: string[]
  didWrite: boolean
}

export type LoadDailyReviewResult = {
  changedPaths: string[]
  didWrite: boolean
  review: ReviewFile | null
}

type SaveJournalInput = {
  additionalChangedPaths?: readonly string[]
  date: string
  longEntryMarkdown: string
  murmurs: MurmurBlock[]
}

const worktreeDirectoryName = 'journal-worktree'
const supportedImageExtensions = new Set([
  '.bmp',
  '.gif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
])
const mimeTypeExtensions = new Map([
  ['image/bmp', '.bmp'],
  ['image/gif', '.gif'],
  ['image/heic', '.heic'],
  ['image/heif', '.heif'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/png', '.png'],
  ['image/tiff', '.tiff'],
  ['image/webp', '.webp'],
])

export type MobileJournalImageAsset = {
  exif?: Record<string, unknown> | null
  fileName?: string | null
  mimeType?: string | null
  type?: string | null
  uri?: string | null
}

export type ImportedMobileJournalImage = {
  id: string
  src: string
  fileName: string
  filePath: string
  repositoryPath: string
  location?: ImageLocation
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function createMurmur(
  date: string,
  body: string,
  options: { now?: Date; themes?: readonly string[] } = {},
): MurmurBlock {
  const now = options.now ?? new Date()
  const timestamp = now.toISOString()

  return {
    id: createMurmurId(date, now),
    time: timestamp,
    themes: normalizeThemeIds(options.themes),
    body: body.trim(),
    images: [],
  }
}

export async function loadDailyJournal(date: string): Promise<MobileJournalRecord> {
  const filePath = await getEntryFilePath(date)
  const fileInfo = await FileSystem.getInfoAsync(filePath)

  if (!fileInfo.exists) {
    return {
      date,
      diagnostics: [],
      frontMatter: { date },
      longEntryMarkdown: '',
      murmurs: [],
      markdown: '',
      updatedAt: null,
    }
  }

  const markdown = await FileSystem.readAsStringAsync(filePath)
  const parsed = parseJournalMarkdown(markdown)

  return {
    date,
    diagnostics: parsed.diagnostics,
    frontMatter: parsed.frontMatter,
    longEntryMarkdown: parsed.longEntryMarkdown,
    murmurs: parsed.murmurs,
    markdown,
    updatedAt: parsed.frontMatter.updatedAt ?? null,
  }
}

export async function listDailyJournals(): Promise<MobileJournalRecord[]> {
  const entriesDirectory = `${getJournalWorktreeDirectory()}entries/`
  const years = await readDirectoryIfExists(entriesDirectory)
  const records: MobileJournalRecord[] = []

  for (const year of years.filter(isYearDirectoryName)) {
    const yearDirectory = `${entriesDirectory}${year}/`
    const months = await readDirectoryIfExists(yearDirectory)

    for (const month of months.filter(isMonthDirectoryName)) {
      const monthDirectory = `${yearDirectory}${month}/`
      const fileNames = await readDirectoryIfExists(monthDirectory)

      for (const fileName of fileNames.filter(isDailyJournalFileName)) {
        const filePath = `${monthDirectory}${fileName}`
        const markdown = await FileSystem.readAsStringAsync(filePath)
        const parsed = parseJournalMarkdown(markdown)
        const date = fileName.slice(0, -'.md'.length)

        records.push({
          date,
          diagnostics: parsed.diagnostics,
          frontMatter: parsed.frontMatter,
          longEntryMarkdown: parsed.longEntryMarkdown,
          markdown,
          murmurs: parsed.murmurs,
          updatedAt: parsed.frontMatter.updatedAt ?? null,
        })
      }
    }
  }

  return records.sort((first, second) => second.date.localeCompare(first.date))
}

export async function loadDailyReview(date: string): Promise<ReviewFile | null> {
  const filePath = await getReviewFilePath(date, false)
  const fileInfo = await FileSystem.getInfoAsync(filePath)

  if (!fileInfo.exists) {
    return null
  }

  try {
    const contents = await FileSystem.readAsStringAsync(filePath)
    const parsed = JSON.parse(contents) as unknown
    const review = normalizeReviewFile(parsed)

    return review?.date === date ? review : null
  } catch {
    return null
  }
}

export async function loadOrCreateDailyReview({
  date,
  sourceDays,
}: {
  date: string
  sourceDays: readonly ReviewSourceDay[]
}): Promise<LoadDailyReviewResult> {
  const existingReview = await loadDailyReview(date)

  if (existingReview) {
    return {
      changedPaths: [],
      didWrite: false,
      review: existingReview,
    }
  }

  const moments = createReviewMoments(sourceDays, {
    maxMoments: 5,
    today: date,
  })

  if (moments.length === 0) {
    return {
      changedPaths: [],
      didWrite: false,
      review: null,
    }
  }

  const review = createReviewFile({
    date,
    moments,
  })
  const filePath = await getReviewFilePath(date, true)

  await FileSystem.writeAsStringAsync(filePath, `${JSON.stringify(review, null, 2)}\n`)

  return {
    changedPaths: [getReviewRepositoryPath(date)],
    didWrite: true,
    review,
  }
}

export async function saveDailyJournal(input: SaveJournalInput): Promise<SaveDailyJournalResult> {
  const existingRecord = await loadDailyJournal(input.date)
  const additionalChangedPaths = normalizeChangedPaths(input.additionalChangedPaths ?? [])
  const previous = existingRecord.markdown
    ? parseJournalMarkdown(existingRecord.markdown).frontMatter
    : {}
  const updatedAt = new Date().toISOString()
  const frontMatter: DayFrontMatter = {
    ...previous,
    date: input.date,
    createdAt: previous.createdAt ?? updatedAt,
    updatedAt,
  }
  const body = serializeJournalMarkdownBody(input.longEntryMarkdown, input.murmurs)
  const markdown = createJournalMarkdownWithFrontMatter(body, frontMatter)

  if (!hasMeaningfulJournalChange(existingRecord.markdown, markdown)) {
    return {
      ...existingRecord,
      changedPaths: additionalChangedPaths,
      didWrite: additionalChangedPaths.length > 0,
    }
  }

  const filePath = await getEntryFilePath(input.date)

  await FileSystem.writeAsStringAsync(filePath, markdown)

  const parsed = parseJournalMarkdown(markdown)

  return {
    date: input.date,
    diagnostics: parsed.diagnostics,
    frontMatter: parsed.frontMatter,
    longEntryMarkdown: parsed.longEntryMarkdown,
    murmurs: parsed.murmurs,
    markdown,
    updatedAt,
    changedPaths: normalizeChangedPaths([getEntryRepositoryPath(input.date), ...additionalChangedPaths]),
    didWrite: true,
  }
}

export async function updateDailyJournalFrontMatter(
  date: string,
  frontMatterPatch: DayFrontMatter,
): Promise<SaveDailyJournalResult> {
  const existingRecord = await loadDailyJournal(date)
  const previousFrontMatter = existingRecord.markdown
    ? parseJournalMarkdown(existingRecord.markdown).frontMatter
    : existingRecord.frontMatter
  const nextFrontMatter: DayFrontMatter = {
    ...previousFrontMatter,
    ...frontMatterPatch,
    date,
  }
  const body = existingRecord.markdown
    ? stripManagedFrontMatter(existingRecord.markdown)
    : serializeJournalMarkdownBody(existingRecord.longEntryMarkdown, existingRecord.murmurs)
  const markdown = createJournalMarkdownWithFrontMatter(body, nextFrontMatter)
  const parsed = parseJournalMarkdown(markdown)

  if (!hasMeaningfulJournalChange(existingRecord.markdown, markdown)) {
    return {
      date,
      diagnostics: parsed.diagnostics,
      frontMatter: parsed.frontMatter,
      longEntryMarkdown: parsed.longEntryMarkdown,
      murmurs: parsed.murmurs,
      markdown,
      updatedAt: parsed.frontMatter.updatedAt ?? null,
      changedPaths: [],
      didWrite: false,
    }
  }

  const filePath = await getEntryFilePath(date)

  await FileSystem.writeAsStringAsync(filePath, markdown)

  return {
    date,
    diagnostics: parsed.diagnostics,
    frontMatter: parsed.frontMatter,
    longEntryMarkdown: parsed.longEntryMarkdown,
    murmurs: parsed.murmurs,
    markdown,
    updatedAt: parsed.frontMatter.updatedAt ?? null,
    changedPaths: [getEntryRepositoryPath(date)],
    didWrite: true,
  }
}

export async function importMobileJournalImagesForDate(
  date: string,
  assets: readonly MobileJournalImageAsset[],
  now = new Date(),
): Promise<ImportedMobileJournalImage[]> {
  assertDateKey(date)

  const imageAssets = assets.flatMap((asset) => {
    const normalizedAsset = normalizeImageAsset(asset)

    return normalizedAsset ? [normalizedAsset] : []
  })

  if (imageAssets.length === 0) {
    return []
  }

  const [year, month] = date.split('-')
  const repositoryDirectory = `media/${year}/${month}`
  const mediaDirectory = `${getJournalWorktreeDirectory()}${repositoryDirectory}/`
  const timestamp = formatImageTimestamp(now)
  const usedFileNames = new Set<string>()
  const usedImageIds = new Set<string>()
  const importedImages: ImportedMobileJournalImage[] = []

  await FileSystem.makeDirectoryAsync(mediaDirectory, { intermediates: true })

  for (const imageAsset of imageAssets) {
    const fileStem = `img_${date.replaceAll('-', '')}_${timestamp}`
    const fileName = await createAvailableImageFileName(mediaDirectory, fileStem, imageAsset.extension, usedFileNames)
    const imageId = createAvailableImageId(fileName, imageAsset.extension, usedImageIds)
    const filePath = `${mediaDirectory}${fileName}`
    const repositoryPath = `${repositoryDirectory}/${fileName}`

    await FileSystem.copyAsync({
      from: imageAsset.uri,
      to: filePath,
    })

    usedFileNames.add(fileName)
    usedImageIds.add(imageId)

    const importedImage: ImportedMobileJournalImage = {
      id: imageId,
      src: repositoryPath,
      fileName,
      filePath,
      repositoryPath,
    }
    const location = parseExifLocation(imageAsset.exif)

    if (location) {
      importedImage.location = location
    }

    importedImages.push(importedImage)
  }

  return importedImages
}

export function getEntryRepositoryPath(date: string) {
  const [year, month] = date.split('-')

  return `entries/${year}/${month}/${date}.md`
}

export function getDailyJournalFileUri(date: string) {
  return `${getJournalWorktreeDirectory()}${getEntryRepositoryPath(date)}`
}

export function getReviewRepositoryPath(date: string) {
  const [year, month] = date.split('-')

  return `reviews/${year}/${month}/${date}.json`
}

export function resolveJournalMediaFileUri(src: string) {
  const normalizedSrc = src.trim().replace(/^\.?\//, '')

  if (!isSafeMediaRepositoryPath(normalizedSrc)) {
    return null
  }

  return `${getJournalWorktreeDirectory()}${normalizedSrc}`
}

async function getEntryFilePath(date: string) {
  const [year, month] = date.split('-')
  const entriesDirectory = `${getJournalWorktreeDirectory()}entries/${year}/${month}/`

  await FileSystem.makeDirectoryAsync(entriesDirectory, { intermediates: true })

  return `${entriesDirectory}${date}.md`
}

async function getReviewFilePath(date: string, shouldEnsureDirectory: boolean) {
  const [year, month] = date.split('-')
  const reviewsDirectory = `${getJournalWorktreeDirectory()}reviews/${year}/${month}/`

  if (shouldEnsureDirectory) {
    await FileSystem.makeDirectoryAsync(reviewsDirectory, { intermediates: true })
  }

  return `${reviewsDirectory}${date}.json`
}

export async function ensureJournalWorktreeDirectory() {
  const worktreeDirectory = getJournalWorktreeDirectory()

  await FileSystem.makeDirectoryAsync(worktreeDirectory, { intermediates: true })

  return worktreeDirectory
}

export function getJournalWorktreeDirectory() {
  if (!FileSystem.documentDirectory) {
    throw new Error('File system document directory is unavailable.')
  }

  const e2eRunId = getMobileE2eRunId()
  const directoryName = e2eRunId ? `journal-e2e-worktree-${e2eRunId}` : worktreeDirectoryName

  return `${FileSystem.documentDirectory}${directoryName}/`
}

async function readDirectoryIfExists(path: string) {
  const info = await FileSystem.getInfoAsync(path)

  if (!info.exists || !info.isDirectory) {
    return []
  }

  return FileSystem.readDirectoryAsync(path)
}

function isYearDirectoryName(value: string) {
  return /^\d{4}$/.test(value)
}

function isMonthDirectoryName(value: string) {
  return /^\d{2}$/.test(value)
}

function isDailyJournalFileName(value: string) {
  return /^\d{4}-\d{2}-\d{2}\.md$/.test(value)
}

function normalizeImageAsset(asset: MobileJournalImageAsset) {
  const uri = typeof asset.uri === 'string' ? asset.uri.trim() : ''

  if (!uri || (asset.type && asset.type !== 'image')) {
    return null
  }

  const extension = getImageAssetExtension(asset)

  if (!extension) {
    return null
  }

  return {
    exif: asset.exif ?? null,
    extension,
    uri,
  }
}

function getImageAssetExtension(asset: MobileJournalImageAsset) {
  const candidates = [
    asset.fileName,
    asset.uri,
  ]

  for (const candidate of candidates) {
    const extension = getSupportedImagePathExtension(candidate)

    if (extension) {
      return extension
    }
  }

  const mimeType = typeof asset.mimeType === 'string' ? asset.mimeType.toLowerCase() : ''

  return mimeTypeExtensions.get(mimeType) ?? null
}

function getSupportedImagePathExtension(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const pathWithoutQuery = value.split(/[?#]/)[0] ?? ''
  const match = /(\.[A-Za-z0-9]+)$/.exec(pathWithoutQuery)
  const extension = match?.[1]?.toLowerCase()

  return extension && supportedImageExtensions.has(extension) ? extension : null
}

async function createAvailableImageFileName(
  directory: string,
  fileStem: string,
  extension: string,
  usedFileNames: Set<string>,
) {
  for (let index = 0; index < 10_000; index += 1) {
    const suffix = index === 0 ? '' : `_${index + 1}`
    const fileName = `${fileStem}${suffix}${extension}`

    if (usedFileNames.has(fileName)) {
      continue
    }

    const fileInfo = await FileSystem.getInfoAsync(`${directory}${fileName}`)

    if (!fileInfo.exists) {
      return fileName
    }
  }

  throw new Error('Could not create a unique journal image file name.')
}

function createAvailableImageId(fileName: string, extension: string, usedImageIds: Set<string>) {
  const baseId = fileName.slice(0, -extension.length)

  for (let index = 0; index < 10_000; index += 1) {
    const suffix = index === 0 ? '' : `_${index + 1}`
    const imageId = `${baseId}${suffix}`

    if (!usedImageIds.has(imageId)) {
      return imageId
    }
  }

  throw new Error('Could not create a unique journal image id.')
}

function formatImageTimestamp(date: Date) {
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  const seconds = `${date.getSeconds()}`.padStart(2, '0')

  return `${hours}${minutes}${seconds}`
}

function parseExifLocation(exif: Record<string, unknown> | null | undefined): ImageLocation | undefined {
  if (!exif) {
    return undefined
  }

  const latitude = parseExifCoordinate(exif, [
    'GPSLatitude',
    'latitude',
    'Latitude',
  ], [
    'GPSLatitudeRef',
    'latitudeRef',
    'LatitudeRef',
  ])
  const longitude = parseExifCoordinate(exif, [
    'GPSLongitude',
    'longitude',
    'Longitude',
  ], [
    'GPSLongitudeRef',
    'longitudeRef',
    'LongitudeRef',
  ])

  if (latitude === undefined || longitude === undefined) {
    return undefined
  }

  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
    source: 'exif',
  }
}

function parseExifCoordinate(
  exif: Record<string, unknown>,
  valueKeys: readonly string[],
  referenceKeys: readonly string[],
) {
  const value = firstExifValue(exif, valueKeys)
  const coordinate = parseCoordinateValue(value)

  if (coordinate === undefined) {
    return undefined
  }

  const reference = firstExifValue(exif, referenceKeys)

  return typeof reference === 'string' && /^[SW]$/i.test(reference)
    ? -Math.abs(coordinate)
    : coordinate
}

function firstExifValue(exif: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    if (exif[key] !== undefined && exif[key] !== null) {
      return exif[key]
    }
  }

  return undefined
}

function parseCoordinateValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const numberValue = Number(value)

    if (Number.isFinite(numberValue)) {
      return numberValue
    }
  }

  if (Array.isArray(value) && value.length >= 3) {
    const parts = value.slice(0, 3).map(parseCoordinatePart)

    if (parts.every((part): part is number => part !== undefined)) {
      return parts[0] + parts[1] / 60 + parts[2] / 3600
    }
  }

  return undefined
}

function parseCoordinatePart(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const rationalMatch = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(value.trim())

    if (rationalMatch) {
      const numerator = Number(rationalMatch[1])
      const denominator = Number(rationalMatch[2])

      return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0
        ? numerator / denominator
        : undefined
    }

    const numberValue = Number(value)

    return Number.isFinite(numberValue) ? numberValue : undefined
  }

  return undefined
}

function roundCoordinate(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000
}

function normalizeChangedPaths(paths: readonly string[]) {
  return [...new Set(
    paths
      .map((path) => path.trim().replace(/\\/g, '/').replace(/^\.?\//, ''))
      .filter(Boolean),
  )].sort()
}

function assertDateKey(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError('Journal date must use YYYY-MM-DD format.')
  }
}

function isSafeMediaRepositoryPath(path: string) {
  return path.startsWith('media/') && !path.split('/').some((segment) => (
    !segment ||
    segment.startsWith('.') ||
    segment.endsWith('.tmp') ||
    segment === '..'
  ))
}

function createMurmurId(date: string, now: Date) {
  const compactDate = date.replaceAll('-', '')
  const time = [
    `${now.getHours()}`.padStart(2, '0'),
    `${now.getMinutes()}`.padStart(2, '0'),
    `${now.getSeconds()}`.padStart(2, '0'),
    `${now.getMilliseconds()}`.padStart(3, '0'),
  ].join('')
  const suffix = Math.random().toString(36).slice(2, 8)

  return `m_${compactDate}_${time}_${suffix}`
}
