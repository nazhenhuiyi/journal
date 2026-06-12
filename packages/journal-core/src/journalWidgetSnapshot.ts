import {
  BUILT_IN_THEMES,
  getBuiltInThemeById,
  normalizeThemeIds,
} from './themes'
import type {
  JournalWidgetAction,
  JournalWidgetSnapshot,
  ReviewAnchor,
  ReviewMoment,
  ReviewSourceDay,
} from './types'

type CreateJournalWidgetSnapshotInput = {
  date: string
  generatedAt?: string
  reviewMoments?: readonly ReviewMoment[]
  sourceDays: readonly ReviewSourceDay[]
}

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/
const staleEntryThresholdDays = 3

export function createJournalWidgetSnapshot({
  date,
  generatedAt = new Date().toISOString(),
  reviewMoments = [],
  sourceDays,
}: CreateJournalWidgetSnapshotInput): JournalWidgetSnapshot {
  const eligibleMoments = reviewMoments.filter(isWidgetEligibleReviewMoment)
  const strongMoment = eligibleMoments.find(isStrongReviewMoment)
  const currentDay = sourceDays.find((day) => day.date === date)
  const hasCurrentDayContent = currentDay ? hasReviewableDayContent(currentDay) : false
  const latestPastDay = sourceDays
    .filter((day) => day.date !== date && hasReviewableDayContent(day))
    .sort((first, second) => second.date.localeCompare(first.date))[0]
  const daysSinceLatestPastDay = latestPastDay
    ? getDayDistance(latestPastDay.date, date)
    : Number.POSITIVE_INFINITY
  const shouldPreferEntry = daysSinceLatestPastDay >= staleEntryThresholdDays && !strongMoment
  const reviewMoment = strongMoment ??
    (hasCurrentDayContent || !shouldPreferEntry ? selectReviewMomentByWeight({
      date,
      moments: eligibleMoments,
      sourceDays,
      hasCurrentDayContent,
    }) : null)

  if (reviewMoment) {
    return createReviewMomentSnapshot({
      date,
      generatedAt,
      moment: reviewMoment,
    })
  }

  return createThemeEntrySnapshot({
    date,
    generatedAt,
    sourceDays,
  })
}

export function normalizeJournalWidgetSnapshot(value: unknown): JournalWidgetSnapshot | null {
  if (!isRecord(value) || value.version !== 1 || !isDateKey(value.date)) {
    return null
  }

  if (
    value.mode !== 'theme-entry' &&
    value.mode !== 'review-moment'
  ) {
    return null
  }

  if (typeof value.generatedAt !== 'string' || !value.generatedAt.trim()) {
    return null
  }

  if (typeof value.title !== 'string' || !value.title.trim()) {
    return null
  }

  if (value.subtitle !== undefined && typeof value.subtitle !== 'string') {
    return null
  }

  if (value.footnote !== undefined && typeof value.footnote !== 'string') {
    return null
  }

  const action = normalizeJournalWidgetAction(value.action)

  if (!action || !isActionCompatibleWithMode(value.mode, action)) {
    return null
  }

  return {
    action,
    date: value.date,
    footnote: value.footnote?.trim() || undefined,
    generatedAt: value.generatedAt.trim(),
    mode: value.mode,
    subtitle: value.subtitle?.trim() || undefined,
    title: value.title.trim(),
    version: 1,
  }
}

function createReviewMomentSnapshot({
  date,
  generatedAt,
  moment,
}: {
  date: string
  generatedAt: string
  moment: ReviewMoment
}): JournalWidgetSnapshot {
  const [sourceDay] = moment.sourceDays
  const footnote = formatReviewMomentFootnote(moment)

  return {
    action: sourceDay
      ? { date: sourceDay, type: 'reviewDay' }
      : { type: 'review' },
    date,
    footnote,
    generatedAt,
    mode: 'review-moment',
    subtitle: moment.subtitle,
    title: moment.title,
    version: 1,
  }
}

function createThemeEntrySnapshot({
  date,
  generatedAt,
  sourceDays,
}: {
  date: string
  generatedAt: string
  sourceDays: readonly ReviewSourceDay[]
}): JournalWidgetSnapshot {
  const theme = selectThemeEntry(date, sourceDays)

  return {
    action: {
      themeId: theme.id,
      type: 'write',
    },
    date,
    footnote: '且留',
    generatedAt,
    mode: 'theme-entry',
    subtitle: theme.entrySubtitle,
    title: theme.label,
    version: 1,
  }
}

function selectReviewMomentByWeight({
  date,
  moments,
  sourceDays,
  hasCurrentDayContent,
}: {
  date: string
  moments: ReviewMoment[]
  sourceDays: readonly ReviewSourceDay[]
  hasCurrentDayContent: boolean
}) {
  if (moments.length === 0) {
    return null
  }

  if (hasCurrentDayContent) {
    return moments[0]
  }

  const reviewWeight = getReviewWeight(sourceDays, date)
  const bucket = hashString(date) % 10

  return bucket < reviewWeight ? moments[0] : null
}

function getReviewWeight(sourceDays: readonly ReviewSourceDay[], today: string) {
  const reviewableDates = sourceDays
    .filter((day) => day.date !== today && hasReviewableDayContent(day))
    .map((day) => day.date)
    .sort()
  const reviewableDayCount = reviewableDates.length
  const spanDays = reviewableDates.length >= 2
    ? getDayDistance(reviewableDates[0], reviewableDates[reviewableDates.length - 1])
    : 0

  if (reviewableDayCount >= 365 || spanDays >= 365) {
    return 7
  }

  if (reviewableDayCount >= 180 || spanDays >= 180) {
    return 7
  }

  if (reviewableDayCount >= 90 || spanDays >= 90) {
    return 5
  }

  return 3
}

function selectThemeEntry(date: string, sourceDays: readonly ReviewSourceDay[]) {
  const recentlyUsedThemeIds = normalizeThemeIds(sourceDays
    .filter((day) => day.date <= date)
    .sort((first, second) => second.date.localeCompare(first.date))
    .flatMap((day) => day.murmurs.flatMap((murmur) => murmur.themes)))
  const matchedRecentTheme = recentlyUsedThemeIds
    .map((themeId) => getBuiltInThemeById(themeId))
    .find(Boolean)

  if (matchedRecentTheme) {
    return matchedRecentTheme
  }

  return BUILT_IN_THEMES[hashString(date) % BUILT_IN_THEMES.length]
}

function isWidgetEligibleReviewMoment(moment: ReviewMoment) {
  return moment.widgetEligible &&
    moment.title.trim() &&
    moment.sourceDays.some(isDateKey)
}

function isStrongReviewMoment(moment: ReviewMoment) {
  return moment.kind === 'anniversary' ||
    moment.anchors.some(isStrongAnchor)
}

function isStrongAnchor(anchor: ReviewAnchor) {
  return anchor.type === 'solarTerm' ||
    anchor.type === 'weather'
}

function formatReviewMomentFootnote(moment: ReviewMoment) {
  const anchorLabels = moment.anchors
    .filter((anchor) => anchor.type !== 'date')
    .slice(0, 2)
    .map((anchor) => anchor.label)

  if (anchorLabels.length > 0) {
    return anchorLabels.join(' · ')
  }

  const [sourceDay] = moment.sourceDays

  return sourceDay ? formatDateShort(sourceDay) : undefined
}

function normalizeJournalWidgetAction(value: unknown): JournalWidgetAction | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null
  }

  if (value.type === 'review') {
    return { type: 'review' }
  }

  if (value.type === 'reviewDay') {
    return typeof value.date === 'string' && isDateKey(value.date)
      ? { date: value.date, type: 'reviewDay' }
      : null
  }

  if (value.type === 'write') {
    return typeof value.themeId === 'string' && value.themeId.trim()
      ? { themeId: value.themeId.trim(), type: 'write' }
      : null
  }

  return null
}

function isActionCompatibleWithMode(
  mode: JournalWidgetSnapshot['mode'],
  action: JournalWidgetAction,
) {
  if (mode === 'theme-entry') {
    return action.type === 'write'
  }

  return action.type === 'reviewDay' || action.type === 'review'
}

function hasReviewableDayContent(day: ReviewSourceDay) {
  return Boolean(
    day.longEntryMarkdown.trim() ||
      day.murmurs.some((murmur) => murmur.body.trim() || murmur.images.length > 0),
  )
}

function getDayDistance(from: string, to: string) {
  const fromTime = Date.parse(`${from}T00:00:00Z`)
  const toTime = Date.parse(`${to}T00:00:00Z`)

  if (Number.isNaN(fromTime) || Number.isNaN(toTime)) {
    return Number.POSITIVE_INFINITY
  }

  return Math.max(0, Math.floor((toTime - fromTime) / 86_400_000))
}

function formatDateShort(dateKey: string) {
  const [, month, day] = dateKey.split('-')

  if (!month || !day) {
    return dateKey
  }

  return `${Number(month)}月${Number(day)}日`
}

function hashString(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }

  return Math.abs(hash)
}

function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && dateKeyPattern.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
