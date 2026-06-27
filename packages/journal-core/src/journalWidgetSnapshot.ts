import {
  BUILT_IN_THEMES,
  getBuiltInThemeById,
  normalizeThemeIds,
} from './themes'
import type {
  JournalWidgetAction,
  JournalWidgetBundleSnapshot,
  JournalWidgetMomentSnapshot,
  JournalWidgetReviewMode,
  JournalWidgetReviewSnapshot,
  JournalWidgetSnapshot,
  JournalWidgetWeeklyReviewInput,
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

type CreateJournalWidgetBundleSnapshotInput = CreateJournalWidgetSnapshotInput & {
  now?: Date
  weeklyReviews?: readonly JournalWidgetWeeklyReviewInput[]
}

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/
const weekKeyPattern = /^\d{4}-W\d{2}$/
const freshWeeklyReviewThresholdDays = 1
const emptyReviewPlaceholders = [
  {
    summary: '写一句也很好，未来会在这里遇见它。',
    title: '今天还没有留下什么',
  },
  {
    summary: '不用完整，把眼前的一小件事放下来。',
    title: '先留下一点此刻',
  },
  {
    summary: '拍一张照片，或写下一句刚刚想到的话。',
    title: '给今天一个入口',
  },
] as const

export function createJournalWidgetSnapshot({
  date,
  generatedAt = new Date().toISOString(),
  reviewMoments = [],
  sourceDays,
}: CreateJournalWidgetSnapshotInput): JournalWidgetSnapshot {
  const reviewMoment = selectReviewMomentForWidget({
    date,
    reviewMoments,
  })

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

export function createJournalWidgetBundleSnapshot({
  date,
  generatedAt,
  now,
  reviewMoments = [],
  sourceDays,
  weeklyReviews = [],
}: CreateJournalWidgetBundleSnapshotInput): JournalWidgetBundleSnapshot {
  const snapshotTime = now ?? new Date()

  return {
    date,
    generatedAt: generatedAt ?? snapshotTime.toISOString(),
    moment: createThemeEntryMomentSnapshot({
      date,
      now: snapshotTime,
      sourceDays,
    }),
    review: createReviewSnapshotForBundle({
      date,
      reviewMoments,
      weeklyReviews,
    }),
    version: 2,
  }
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

export function normalizeJournalWidgetBundleSnapshot(value: unknown): JournalWidgetBundleSnapshot | null {
  if (!isRecord(value) || value.version !== 2 || !isDateKey(value.date)) {
    return null
  }

  if (typeof value.generatedAt !== 'string' || !value.generatedAt.trim()) {
    return null
  }

  const review = normalizeJournalWidgetReviewSnapshot(value.review)
  const moment = normalizeJournalWidgetMomentSnapshot(value.moment)

  if (!review || !moment) {
    return null
  }

  return {
    date: value.date,
    generatedAt: value.generatedAt.trim(),
    moment,
    review,
    version: 2,
  }
}

export function adaptJournalWidgetSnapshotToBundle(
  snapshot: JournalWidgetSnapshot,
): JournalWidgetBundleSnapshot {
  const fallbackMoment = createThemeEntryMomentSnapshot({
    date: snapshot.date,
    now: new Date(snapshot.generatedAt),
    sourceDays: [],
  })
  const moment: JournalWidgetMomentSnapshot = snapshot.mode === 'theme-entry'
    ? {
        action: snapshot.action.type === 'write'
          ? snapshot.action
          : fallbackMoment.action,
        footnote: snapshot.footnote,
        mode: 'theme-entry',
        subtitle: snapshot.subtitle,
        title: snapshot.title,
      }
    : fallbackMoment
  const review: JournalWidgetReviewSnapshot = snapshot.mode === 'review-moment'
    ? {
        action: snapshot.action.type === 'reviewDay' || snapshot.action.type === 'review'
          ? snapshot.action
          : { type: 'review' },
        mode: 'daily-review',
        summary: snapshot.subtitle,
        subtitle: snapshot.footnote,
        title: snapshot.title,
      }
    : createEmptyReviewSnapshot(snapshot.date)

  return {
    date: snapshot.date,
    generatedAt: snapshot.generatedAt,
    moment,
    review,
    version: 2,
  }
}

function createReviewSnapshotForBundle({
  date,
  reviewMoments,
  weeklyReviews,
}: {
  date: string
  reviewMoments: readonly ReviewMoment[]
  weeklyReviews: readonly JournalWidgetWeeklyReviewInput[]
}): JournalWidgetReviewSnapshot {
  const weeklyReview = selectFreshWeeklyReview(weeklyReviews, date)

  if (weeklyReview) {
    return {
      action: {
        type: 'weeklyReview',
        week: weeklyReview.week,
      },
      mode: 'weekly-review',
      summary: weeklyReview.summary.trim(),
      subtitle: formatDateRangeShort(weeklyReview.startDate, weeklyReview.endDate),
      title: weeklyReview.title.trim(),
    }
  }

  const reviewMoment = selectReviewMomentForWidget({
    date,
    reviewMoments,
  })

  if (reviewMoment) {
    return createDailyReviewSnapshot({
      moment: reviewMoment,
    })
  }

  return createEmptyReviewSnapshot(date)
}

function createDailyReviewSnapshot({
  moment,
}: {
  moment: ReviewMoment
}): JournalWidgetReviewSnapshot {
  const sourceDay = moment.sourceDays.find(isDateKey)
  const displayImageSrc = moment.displayImage?.src.trim()
  const backgroundImageSrc = displayImageSrc && isSafeMediaPath(displayImageSrc)
    ? displayImageSrc
    : ''
  const displayLabel = backgroundImageSrc
    ? moment.displayLabel?.trim() || undefined
    : undefined

  return {
    action: sourceDay
      ? { date: sourceDay, type: 'reviewDay' }
      : { type: 'review' },
    ...(backgroundImageSrc ? { backgroundImageSrc } : {}),
    ...(displayLabel ? { displayLabel } : {}),
    mode: 'daily-review',
    summary: moment.subtitle,
    subtitle: formatReviewMomentFootnote(moment),
    title: moment.title,
  }
}

function createEmptyReviewSnapshot(date: string): JournalWidgetReviewSnapshot {
  const placeholder = emptyReviewPlaceholders[hashString(date) % emptyReviewPlaceholders.length]

  return {
    action: {
      themeId: 'small-thing',
      type: 'write',
    },
    footnote: '回看',
    mode: 'empty-review',
    summary: placeholder.summary,
    title: placeholder.title,
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

function createThemeEntryMomentSnapshot({
  date,
  now,
  sourceDays,
}: {
  date: string
  now: Date
  sourceDays: readonly ReviewSourceDay[]
}): JournalWidgetMomentSnapshot {
  const theme = selectMomentThemeEntry({
    date,
    now,
    sourceDays,
  })

  return {
    action: {
      themeId: theme.id,
      type: 'write',
    },
    footnote: '此刻',
    mode: 'theme-entry',
    subtitle: theme.entrySubtitle,
    title: theme.label,
  }
}

function selectReviewMomentForWidget({
  date,
  reviewMoments,
}: {
  date: string
  reviewMoments: readonly ReviewMoment[]
}) {
  const eligibleMoments = reviewMoments.filter(isWidgetEligibleReviewMoment)
  const strongMoment = eligibleMoments.find(isStrongReviewMoment)

  if (strongMoment) {
    return strongMoment
  }

  if (eligibleMoments.length === 0) {
    return null
  }

  return eligibleMoments[hashString(date) % eligibleMoments.length] ?? null
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

function selectMomentThemeEntry({
  date,
  now,
  sourceDays,
}: {
  date: string
  now: Date
  sourceDays: readonly ReviewSourceDay[]
}) {
  const currentDay = sourceDays.find((day) => day.date === date)
  const usedThemeIds = new Set(normalizeThemeIds(
    currentDay?.murmurs.flatMap((murmur) => murmur.themes) ?? [],
  ))
  const candidates = getThemeCandidatesForMoment(date, now)
  const availableTheme = candidates
    .filter((themeId) => !usedThemeIds.has(themeId))
    .map((themeId) => getBuiltInThemeById(themeId))
    .find(Boolean)
  const fallbackTheme = candidates
    .map((themeId) => getBuiltInThemeById(themeId))
    .find(Boolean)

  return availableTheme ?? fallbackTheme ?? BUILT_IN_THEMES[hashString(date) % BUILT_IN_THEMES.length]
}

function getThemeCandidatesForMoment(date: string, now: Date) {
  const hour = Number.isFinite(now.getTime()) ? now.getHours() : 12

  if (isWeekendDate(date) && hour >= 9 && hour < 17) {
    return ['breathe-moment', 'small-thing', 'quick-photo']
  }

  if (hour >= 5 && hour < 10) {
    return ['sky-now', 'sunrise-sunset', 'small-thing']
  }

  if (hour >= 10 && hour < 14) {
    return ['food-today', 'small-thing', 'today-three-lines']
  }

  if (hour >= 17 && hour < 20) {
    return ['light-shadow', 'sunrise-sunset', 'sky-now']
  }

  if (hour >= 21 || hour < 5) {
    return ['thought-maybe', 'small-thing', 'shower-thought']
  }

  return ['small-thing', 'today-three-lines', 'quick-photo']
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
  const atmosphereAnchor = moment.anchors
    .find((anchor) => anchor.type === 'weather' || anchor.type === 'solarTerm')

  if (atmosphereAnchor) {
    return atmosphereAnchor.label
  }

  const anchorLabels = moment.anchors
    .filter((anchor) => anchor.type !== 'date' && anchor.type !== 'timeOfDay')
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

  if (value.type === 'weeklyReview') {
    if (typeof value.week !== 'string') {
      return null
    }

    const week = value.week.trim()

    return isWeekKey(week) ? { type: 'weeklyReview', week } : null
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

function normalizeJournalWidgetReviewSnapshot(value: unknown): JournalWidgetReviewSnapshot | null {
  if (!isRecord(value) || !isJournalWidgetReviewMode(value.mode)) {
    return null
  }

  if (typeof value.title !== 'string' || !value.title.trim()) {
    return null
  }

  if (value.subtitle !== undefined && typeof value.subtitle !== 'string') {
    return null
  }

  if (value.summary !== undefined && typeof value.summary !== 'string') {
    return null
  }

  if (value.footnote !== undefined && typeof value.footnote !== 'string') {
    return null
  }

  if (value.mode === 'daily-review' &&
    value.backgroundImageSrc !== undefined &&
    (typeof value.backgroundImageSrc !== 'string' || !isSafeMediaPath(value.backgroundImageSrc.trim()))) {
    return null
  }

  if (value.mode === 'daily-review' &&
    value.displayLabel !== undefined &&
    typeof value.displayLabel !== 'string') {
    return null
  }

  const action = normalizeJournalWidgetAction(value.action)

  if (!action || !isActionCompatibleWithReviewMode(value.mode, action)) {
    return null
  }

  const backgroundImageSrc = value.mode === 'daily-review' && typeof value.backgroundImageSrc === 'string'
    ? value.backgroundImageSrc.trim()
    : ''
  const displayLabel = backgroundImageSrc && typeof value.displayLabel === 'string'
    ? value.displayLabel.trim()
    : ''
  const footnote = typeof value.footnote === 'string' ? value.footnote.trim() : ''
  const subtitle = typeof value.subtitle === 'string' ? value.subtitle.trim() : ''
  const summary = typeof value.summary === 'string' ? value.summary.trim() : ''

  return {
    action,
    ...(backgroundImageSrc ? { backgroundImageSrc } : {}),
    ...(displayLabel ? { displayLabel } : {}),
    ...(footnote ? { footnote } : {}),
    mode: value.mode,
    ...(subtitle ? { subtitle } : {}),
    ...(summary ? { summary } : {}),
    title: value.title.trim(),
  }
}

function normalizeJournalWidgetMomentSnapshot(value: unknown): JournalWidgetMomentSnapshot | null {
  if (!isRecord(value) || value.mode !== 'theme-entry') {
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

  if (!action || action.type !== 'write') {
    return null
  }

  const footnote = typeof value.footnote === 'string' ? value.footnote.trim() : ''
  const subtitle = typeof value.subtitle === 'string' ? value.subtitle.trim() : ''

  return {
    action,
    ...(footnote ? { footnote } : {}),
    mode: 'theme-entry',
    ...(subtitle ? { subtitle } : {}),
    title: value.title.trim(),
  }
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

function isActionCompatibleWithReviewMode(
  mode: JournalWidgetReviewMode,
  action: JournalWidgetAction,
) {
  if (mode === 'weekly-review') {
    return action.type === 'weeklyReview'
  }

  if (mode === 'daily-review') {
    return action.type === 'reviewDay' || action.type === 'review'
  }

  return action.type === 'write'
}

function isJournalWidgetReviewMode(value: unknown): value is JournalWidgetReviewMode {
  return value === 'weekly-review' ||
    value === 'daily-review' ||
    value === 'empty-review'
}

function selectFreshWeeklyReview(
  weeklyReviews: readonly JournalWidgetWeeklyReviewInput[],
  date: string,
) {
  return [...weeklyReviews]
    .filter((review) => (
      isWeekKey(review.week) &&
      isDateKey(review.startDate) &&
      isDateKey(review.endDate) &&
      review.startDate <= review.endDate &&
      Boolean(review.title.trim()) &&
      Boolean(review.summary.trim()) &&
      review.endDate <= date &&
      getDayDistance(review.endDate, date) <= freshWeeklyReviewThresholdDays
    ))
    .sort((first, second) => (
      second.endDate.localeCompare(first.endDate) ||
      second.week.localeCompare(first.week)
    ))[0] ?? null
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

function formatDateRangeShort(startDate: string, endDate: string) {
  return `${formatDateShort(startDate)} - ${formatDateShort(endDate)}`
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

function isWeekKey(value: unknown): value is string {
  return typeof value === 'string' && weekKeyPattern.test(value)
}

function isSafeMediaPath(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }

  const path = value.trim()

  return path.startsWith('media/') && !path.split('/').some((segment) => (
    !segment ||
    segment.startsWith('.') ||
    segment.endsWith('.tmp') ||
    segment === '..'
  ))
}

function isWeekendDate(date: string) {
  const timestamp = Date.parse(`${date}T12:00:00Z`)

  if (Number.isNaN(timestamp)) {
    return false
  }

  const day = new Date(timestamp).getUTCDay()

  return day === 0 || day === 6
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
