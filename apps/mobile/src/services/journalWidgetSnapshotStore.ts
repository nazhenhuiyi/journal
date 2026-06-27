import * as FileSystem from 'expo-file-system/legacy'
import {
  manipulateAsync,
  SaveFormat,
} from 'expo-image-manipulator'
import ExpoWidgetsModule from 'expo-widgets/build/ExpoWidgets'
import {
  adaptJournalWidgetSnapshotToBundle,
  createJournalWidgetBundleSnapshot,
  normalizeJournalWidgetBundleSnapshot,
  normalizeJournalWidgetSnapshot,
  type JournalWidgetBundleSnapshot,
  type JournalWidgetWeeklyReviewInput,
  type ReviewMoment,
  type ReviewSourceDay,
} from '@journal/core'
import {
  getLocalDateKey,
  listDailyJournals,
  listWeeklyReviews,
  loadOrCreateDailyReview,
  resolveJournalMediaFileUri,
  type LoadDailyReviewResult,
  type MobileJournalRecord,
} from './mobileJournalStore'
import { appendMobileE2eSuffix } from './e2eEnvironment'
import { updateNativeJournalWidgets } from '../widgets/journalWidgetNative'

type NativeJournalWidgetBundleSnapshot = JournalWidgetBundleSnapshot & {
  review: JournalWidgetBundleSnapshot['review'] & {
    backgroundImageUri?: string
  }
}

export type RefreshJournalWidgetSnapshotInput = {
  currentDay?: ReviewSourceDay
  date?: string
  now?: Date
}

export type RefreshJournalWidgetSnapshotResult = {
  reviewResult: LoadDailyReviewResult
  snapshot: JournalWidgetBundleSnapshot
  timeline: JournalWidgetSnapshotTimelineEntry[]
}

export type RefreshJournalWidgetSnapshotOptions = {
  updateNativeWidgets?: boolean
}

export type JournalWidgetSnapshotTimelineEntry = {
  date: Date
  snapshot: JournalWidgetBundleSnapshot
}

const widgetSnapshotFileName = 'journal-widget-snapshot-v2.json'
const legacyWidgetSnapshotFileName = 'journal-widget-snapshot-v1.json'
const momentTimelineRefreshHours = [5, 10, 14, 17, 20, 21] as const
const nativeWidgetReviewImageWidth = 900
const nativeWidgetReviewImageQuality = 0.82

export async function refreshJournalWidgetSnapshot({
  currentDay,
  date,
  now,
}: RefreshJournalWidgetSnapshotInput = {}, {
  updateNativeWidgets = true,
}: RefreshJournalWidgetSnapshotOptions = {}): Promise<RefreshJournalWidgetSnapshotResult> {
  const snapshotTime = now ?? new Date()
  const snapshotDate = date ?? getLocalDateKey(snapshotTime)
  const [records, weeklyReviews] = await Promise.all([
    listDailyJournals(),
    listWeeklyReviews(),
  ])
  const sourceDays = mergeCurrentDay(records, currentDay)
  const reviewResult = await loadOrCreateDailyReview({
    date: snapshotDate,
    sourceDays,
  })
  const timeline = createJournalWidgetSnapshotTimeline({
    date: snapshotDate,
    now: snapshotTime,
    reviewMoments: reviewResult.review?.moments ?? [],
    sourceDays,
    weeklyReviews,
  })
  const snapshot = timeline[0]?.snapshot ?? createJournalWidgetBundleSnapshot({
    date: snapshotDate,
    now: snapshotTime,
    reviewMoments: reviewResult.review?.moments ?? [],
    sourceDays,
    weeklyReviews,
  })

  await saveJournalWidgetSnapshot(snapshot)

  if (updateNativeWidgets) {
    await updateNativeJournalWidgetsBestEffort(snapshot, timeline)
  }

  return {
    reviewResult,
    snapshot,
    timeline,
  }
}

export async function loadJournalWidgetSnapshot(): Promise<JournalWidgetBundleSnapshot | null> {
  const filePath = getJournalWidgetSnapshotFilePath()
  const fileInfo = await FileSystem.getInfoAsync(filePath)

  if (fileInfo.exists) {
    try {
      const contents = await FileSystem.readAsStringAsync(filePath)
      const parsed = JSON.parse(contents) as unknown

      return normalizeJournalWidgetBundleSnapshot(parsed)
    } catch {
      return null
    }
  }

  return loadLegacyJournalWidgetSnapshot()
}

export async function saveJournalWidgetSnapshot(snapshot: JournalWidgetBundleSnapshot) {
  const filePath = getJournalWidgetSnapshotFilePath()

  await FileSystem.writeAsStringAsync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`)
}

export function getJournalWidgetSnapshotFilePath() {
  if (!FileSystem.documentDirectory) {
    throw new Error('File system document directory is unavailable.')
  }

  return `${FileSystem.documentDirectory}${appendMobileE2eSuffix(widgetSnapshotFileName)}`
}

export function getLegacyJournalWidgetSnapshotFilePath() {
  if (!FileSystem.documentDirectory) {
    throw new Error('File system document directory is unavailable.')
  }

  return `${FileSystem.documentDirectory}${appendMobileE2eSuffix(legacyWidgetSnapshotFileName)}`
}

function createJournalWidgetSnapshotTimeline({
  date,
  now = new Date(),
  reviewMoments = [],
  sourceDays,
  weeklyReviews = [],
}: {
  date: string
  now?: Date
  reviewMoments?: readonly ReviewMoment[]
  sourceDays: readonly ReviewSourceDay[]
  weeklyReviews?: readonly JournalWidgetWeeklyReviewInput[]
}): JournalWidgetSnapshotTimelineEntry[] {
  const entryDates = [
    now,
    ...getUpcomingMomentTimelineDates(date, now),
  ]

  return entryDates.map((entryDate) => ({
    date: entryDate,
    snapshot: createJournalWidgetBundleSnapshot({
      date,
      generatedAt: entryDate.toISOString(),
      now: entryDate,
      reviewMoments,
      sourceDays,
      weeklyReviews,
    }),
  }))
}

async function loadLegacyJournalWidgetSnapshot(): Promise<JournalWidgetBundleSnapshot | null> {
  const filePath = getLegacyJournalWidgetSnapshotFilePath()
  const fileInfo = await FileSystem.getInfoAsync(filePath)

  if (!fileInfo.exists) {
    return null
  }

  try {
    const contents = await FileSystem.readAsStringAsync(filePath)
    const parsed = JSON.parse(contents) as unknown
    const legacySnapshot = normalizeJournalWidgetSnapshot(parsed)

    return legacySnapshot ? adaptJournalWidgetSnapshotToBundle(legacySnapshot) : null
  } catch {
    return null
  }
}

async function updateNativeJournalWidgetsBestEffort(
  snapshot: JournalWidgetBundleSnapshot,
  timeline: readonly JournalWidgetSnapshotTimelineEntry[],
) {
  try {
    const nativeSnapshot = await prepareNativeJournalWidgetSnapshot(snapshot)
    const nativeTimeline = await Promise.all(timeline.map(async (entry) => ({
      ...entry,
      snapshot: await prepareNativeJournalWidgetSnapshot(entry.snapshot),
    })))

    await updateNativeJournalWidgets(nativeSnapshot, nativeTimeline)
  } catch (error) {
    console.error(error)
  }
}

async function prepareNativeJournalWidgetSnapshot(
  snapshot: JournalWidgetBundleSnapshot,
): Promise<NativeJournalWidgetBundleSnapshot> {
  if (snapshot.review.mode !== 'daily-review' || !snapshot.review.backgroundImageSrc) {
    return snapshot
  }

  const backgroundImageUri = await resolveNativeJournalWidgetImageUri(snapshot.review.backgroundImageSrc)

  if (!backgroundImageUri) {
    return snapshot
  }

  return {
    ...snapshot,
    review: {
      ...snapshot.review,
      backgroundImageUri,
    },
  }
}

async function resolveNativeJournalWidgetImageUri(src: string) {
  const sourceUri = resolveJournalMediaFileUri(src)
  const widgetsDirectory = normalizeDirectoryUri(ExpoWidgetsModule.widgetsDirectory)

  if (!sourceUri || !widgetsDirectory) {
    return null
  }

  const sourceInfo = await FileSystem.getInfoAsync(sourceUri)

  if (!sourceInfo.exists) {
    return null
  }

  const sourceMetadata = sourceInfo as typeof sourceInfo & {
    modificationTime?: number
    size?: number
  }
  const targetDirectory = `${widgetsDirectory}journal-review-images/`
  const targetUri = `${targetDirectory}${hashString([
    src,
    `${sourceMetadata.size ?? 0}`,
    `${sourceMetadata.modificationTime ?? 0}`,
    `jpeg-${nativeWidgetReviewImageWidth}`,
  ].join(':'))}.jpg`

  try {
    await FileSystem.makeDirectoryAsync(targetDirectory, { intermediates: true })

    const targetInfo = await FileSystem.getInfoAsync(targetUri)

    if (!targetInfo.exists) {
      const result = await manipulateAsync(
        sourceUri,
        [{ resize: { width: nativeWidgetReviewImageWidth } }],
        {
          compress: nativeWidgetReviewImageQuality,
          format: SaveFormat.JPEG,
        },
      )

      await FileSystem.copyAsync({
        from: result.uri,
        to: targetUri,
      })
    }

    return targetUri
  } catch {
    return null
  }
}

function getUpcomingMomentTimelineDates(date: string, now: Date) {
  const dateParts = parseDateKey(date)
  const nowTime = now.getTime()

  if (!dateParts || !Number.isFinite(nowTime)) {
    return []
  }

  return momentTimelineRefreshHours
    .map((hour) => new Date(dateParts.year, dateParts.month - 1, dateParts.day, hour, 0, 0, 0))
    .filter((entryDate) => entryDate.getTime() > nowTime)
}

function normalizeDirectoryUri(value: string | null | undefined) {
  if (!value || typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim()

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function hashString(value: string) {
  let hash = 5381

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index)
  }

  return (hash >>> 0).toString(36)
}

function parseDateKey(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)

  if (!match) {
    return null
  }

  return {
    day: Number(match[3]),
    month: Number(match[2]),
    year: Number(match[1]),
  }
}

function mergeCurrentDay(
  records: MobileJournalRecord[],
  currentDay: ReviewSourceDay | undefined,
): ReviewSourceDay[] {
  if (!currentDay) {
    return records
  }

  const savedRecords = records.filter((record) => record.date !== currentDay.date)

  if (!hasCurrentDayContent(currentDay)) {
    return savedRecords
  }

  return [currentDay, ...savedRecords]
}

function hasCurrentDayContent(day: ReviewSourceDay) {
  return Boolean(
    day.longEntryMarkdown.trim() ||
      day.murmurs.some((murmur) => murmur.body.trim() || murmur.images.length > 0),
  )
}
