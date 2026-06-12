import * as FileSystem from 'expo-file-system/legacy'
import {
  createJournalWidgetSnapshot,
  normalizeJournalWidgetSnapshot,
  type JournalWidgetSnapshot,
  type ReviewSourceDay,
} from '@journal/core'
import {
  getLocalDateKey,
  listDailyJournals,
  loadOrCreateDailyReview,
  type LoadDailyReviewResult,
  type MobileJournalRecord,
} from './mobileJournalStore'
import { updateNativeJournalWidgets } from '../widgets/journalWidgetNative'

export type RefreshJournalWidgetSnapshotInput = {
  currentDay?: ReviewSourceDay
  date?: string
}

export type RefreshJournalWidgetSnapshotResult = {
  reviewResult: LoadDailyReviewResult
  snapshot: JournalWidgetSnapshot
}

const widgetSnapshotFileName = 'journal-widget-snapshot-v1.json'

export async function refreshJournalWidgetSnapshot({
  currentDay,
  date = getLocalDateKey(),
}: RefreshJournalWidgetSnapshotInput = {}): Promise<RefreshJournalWidgetSnapshotResult> {
  const records = await listDailyJournals()
  const sourceDays = mergeCurrentDay(records, currentDay)
  const reviewResult = await loadOrCreateDailyReview({
    date,
    sourceDays,
  })
  const snapshot = createJournalWidgetSnapshot({
    date,
    reviewMoments: reviewResult.review?.moments ?? [],
    sourceDays,
  })

  await saveJournalWidgetSnapshot(snapshot)
  await updateNativeJournalWidgetsBestEffort(snapshot)

  return {
    reviewResult,
    snapshot,
  }
}

export async function loadJournalWidgetSnapshot(): Promise<JournalWidgetSnapshot | null> {
  const filePath = getJournalWidgetSnapshotFilePath()
  const fileInfo = await FileSystem.getInfoAsync(filePath)

  if (!fileInfo.exists) {
    return null
  }

  try {
    const contents = await FileSystem.readAsStringAsync(filePath)
    const parsed = JSON.parse(contents) as unknown

    return normalizeJournalWidgetSnapshot(parsed)
  } catch {
    return null
  }
}

export async function saveJournalWidgetSnapshot(snapshot: JournalWidgetSnapshot) {
  const filePath = getJournalWidgetSnapshotFilePath()

  await FileSystem.writeAsStringAsync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`)
}

export function getJournalWidgetSnapshotFilePath() {
  if (!FileSystem.documentDirectory) {
    throw new Error('File system document directory is unavailable.')
  }

  return `${FileSystem.documentDirectory}${widgetSnapshotFileName}`
}

async function updateNativeJournalWidgetsBestEffort(snapshot: JournalWidgetSnapshot) {
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
