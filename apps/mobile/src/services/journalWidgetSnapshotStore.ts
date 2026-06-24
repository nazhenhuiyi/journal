import * as FileSystem from 'expo-file-system/legacy'
import {
  adaptJournalWidgetSnapshotToBundle,
  createJournalWidgetBundleSnapshot,
  normalizeJournalWidgetBundleSnapshot,
  normalizeJournalWidgetSnapshot,
  type JournalWidgetBundleSnapshot,
  type ReviewSourceDay,
} from '@journal/core'
import {
  getLocalDateKey,
  listDailyJournals,
  listWeeklyReviews,
  loadOrCreateDailyReview,
  type LoadDailyReviewResult,
  type MobileJournalRecord,
} from './mobileJournalStore'
import { appendMobileE2eSuffix } from './e2eEnvironment'
import { updateNativeJournalWidgets } from '../widgets/journalWidgetNative'

export type RefreshJournalWidgetSnapshotInput = {
  currentDay?: ReviewSourceDay
  date?: string
}

export type RefreshJournalWidgetSnapshotResult = {
  reviewResult: LoadDailyReviewResult
  snapshot: JournalWidgetBundleSnapshot
}

export type RefreshJournalWidgetSnapshotOptions = {
  updateNativeWidgets?: boolean
}

const widgetSnapshotFileName = 'journal-widget-snapshot-v2.json'
const legacyWidgetSnapshotFileName = 'journal-widget-snapshot-v1.json'

export async function refreshJournalWidgetSnapshot({
  currentDay,
  date = getLocalDateKey(),
}: RefreshJournalWidgetSnapshotInput = {}, {
  updateNativeWidgets = true,
}: RefreshJournalWidgetSnapshotOptions = {}): Promise<RefreshJournalWidgetSnapshotResult> {
  const [records, weeklyReviews] = await Promise.all([
    listDailyJournals(),
    listWeeklyReviews(),
  ])
  const sourceDays = mergeCurrentDay(records, currentDay)
  const reviewResult = await loadOrCreateDailyReview({
    date,
    sourceDays,
  })
  const snapshot = createJournalWidgetBundleSnapshot({
    date,
    reviewMoments: reviewResult.review?.moments ?? [],
    sourceDays,
    weeklyReviews,
  })

  await saveJournalWidgetSnapshot(snapshot)

  if (updateNativeWidgets) {
    await updateNativeJournalWidgetsBestEffort(snapshot)
  }

  return {
    reviewResult,
    snapshot,
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

async function updateNativeJournalWidgetsBestEffort(snapshot: JournalWidgetBundleSnapshot) {
  try {
    await updateNativeJournalWidgets(snapshot)
  } catch (error) {
    console.error(error)
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
