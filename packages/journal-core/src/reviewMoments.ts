import { SolarDay } from 'tyme4ts'
import {
  getBuiltInThemeById,
  getThemeLabel,
  normalizeThemeIds,
} from './themes'
import type {
  ImageBlock,
  MurmurBlock,
  ReviewAnchor,
  ReviewMoment,
  ReviewSourceDay,
} from './types'

export type CreateReviewMomentsOptions = {
  maxMoments?: number
  today?: string
}

type SolarTerm = {
  label: string
  value: string
}

type DayCandidate = {
  day: ReviewSourceDay
  image?: ImageBlock
  sentence?: string
  themes: string[]
  timeAnchor?: ReviewAnchor
}

type RelativeDateMomentRule = {
  id: string
  label: string
  getDate: (today: string) => string | null
}

const defaultMaxMoments = 5
const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/
const negativeSnippetPattern = /(崩溃|绝望|痛苦|讨厌|恨|焦虑|抑郁|难受|想死|自杀|死亡|糟糕|烂透|完蛋|撑不住)/
const millisecondsPerDay = 86_400_000
const relativeDateMomentRules: RelativeDateMomentRule[] = [
  {
    getDate: getPreviousWeekDateKey,
    id: 'last-week',
    label: '上周的今天',
  },
  {
    getDate: getPreviousMonthDateKey,
    id: 'last-month',
    label: '上个月的今天',
  },
]

export function createReviewMoments(
  sourceDays: readonly ReviewSourceDay[],
  options: CreateReviewMomentsOptions = {},
): ReviewMoment[] {
  const today = options.today
  const maxMoments = options.maxMoments ?? defaultMaxMoments
  const days = sourceDays
    .filter((day) => day.date !== today && hasReviewableContent(day))
    .sort((first, second) => second.date.localeCompare(first.date))
  const moments: ReviewMoment[] = []
  const anniversary = today ? createAnniversaryMoment(days, today) : null

  if (anniversary) {
    moments.push(anniversary)
  }

  const solarTermMoment = today ? createSolarTermMoment(days, today) : null

  if (solarTermMoment && !hasMomentForSourceDay(moments, solarTermMoment.sourceDays[0])) {
    moments.push(solarTermMoment)
  }

  const clusterMoment = createThemeClusterMoment(days)

  if (clusterMoment) {
    moments.push(clusterMoment)
  }

  if (today) {
    for (const relativeDateMoment of createRelativeDateMoments(days, today)) {
      if (moments.length >= maxMoments) {
        break
      }

      if (hasMomentForSourceDay(moments, relativeDateMoment.sourceDays[0])) {
        continue
      }

      moments.push(relativeDateMoment)
    }
  }

  for (const day of days) {
    if (moments.length >= maxMoments) {
      break
    }

    if (hasMomentForSourceDay(moments, day.date)) {
      continue
    }

    const singleMoment = createSingleDayMoment(day)

    if (singleMoment) {
      moments.push(singleMoment)
    }
  }

  return moments.slice(0, maxMoments)
}

export function getSolarTermForDate(dateKey: string): SolarTerm | null {
  const dateKeyMatch = dateKeyPattern.exec(dateKey)

  if (!dateKeyMatch) {
    return null
  }

  const [, year, month, day] = dateKeyMatch

  try {
    const solarTermDay = SolarDay.fromYmd(Number(year), Number(month), Number(day)).getTermDay()

    if (solarTermDay.getDayIndex() !== 0) {
      return null
    }

    const solarTerm = solarTermDay.getSolarTerm()

    return {
      label: solarTerm.getName(),
      value: `term-${String(solarTerm.getIndex()).padStart(2, '0')}`,
    }
  } catch {
    return null
  }
}

function createAnniversaryMoment(days: ReviewSourceDay[], today: string) {
  const monthDay = today.slice(5, 10)
  const sourceDay = days.find((day) => day.date.slice(5, 10) === monthDay)

  if (!sourceDay) {
    return null
  }

  const candidate = createDayCandidate(sourceDay)
  const anchors = [
    createDateAnchor(sourceDay.date, '那年今日'),
    ...createContextAnchors(sourceDay, candidate),
  ]

  return createMoment({
    anchors,
    id: `anniversary-${sourceDay.date}`,
    kind: 'anniversary',
    sourceDays: [sourceDay.date],
    subtitle: createCandidateSubtitle(candidate),
    themes: candidate.themes,
    title: createAnchoredTitle('那年今日', sourceDay, candidate),
    widgetEligible: true,
  })
}

function createSolarTermMoment(days: ReviewSourceDay[], today: string) {
  const solarTerm = getSolarTermForDate(today)

  if (!solarTerm) {
    return null
  }

  const sourceDay = days.find((day) => getSolarTermForDate(day.date)?.label === solarTerm.label)

  if (!sourceDay) {
    return null
  }

  const candidate = createDayCandidate(sourceDay)
  const anchors = [
    createDateAnchor(sourceDay.date),
    {
      label: solarTerm.label,
      type: 'solarTerm',
      value: solarTerm.value,
    } satisfies ReviewAnchor,
    ...createContextAnchors(sourceDay, candidate, { skipSolarTerm: true }),
  ]

  return createMoment({
    anchors,
    id: `solar-term-${solarTerm.value}-${sourceDay.date}`,
    kind: 'single',
    sourceDays: [sourceDay.date],
    subtitle: createCandidateSubtitle(candidate),
    themes: candidate.themes,
    title: `${solarTerm.label}那天`,
    widgetEligible: true,
  })
}

function createThemeClusterMoment(days: ReviewSourceDay[]) {
  const grouped = new Map<string, ReviewSourceDay[]>()

  for (const day of days) {
    for (const themeId of collectDayThemes(day)) {
      const group = grouped.get(themeId) ?? []

      group.push(day)
      grouped.set(themeId, group)
    }
  }

  const [themeId, themeDays] = [...grouped.entries()]
    .filter(([, groupedDays]) => groupedDays.length >= 2)
    .sort((left, right) => right[1].length - left[1].length || right[1][0].date.localeCompare(left[1][0].date))[0] ?? []

  if (!themeId || !themeDays) {
    return null
  }

  const latestDay = themeDays[0]
  const latestCandidate = createDayCandidate(latestDay)
  const themeLabel = getThemeLabel(themeId)
  const shortThemeLabel = themeLabel.replace(/^此刻的/, '').replace(/^今天/, '').trim() || themeLabel

  return createMoment({
    anchors: [
      {
        label: themeLabel,
        type: 'theme',
        value: themeId,
      },
      createDateAnchor(latestDay.date),
      ...(latestCandidate.timeAnchor ? [latestCandidate.timeAnchor] : []),
    ],
    id: `theme-cluster-${themeId}-${latestDay.date}`,
    kind: 'cluster',
    sourceDays: themeDays.slice(0, 3).map((day) => day.date),
    subtitle: `最近一次是 ${formatDateShort(latestDay.date)}${latestCandidate.timeAnchor ? `，${latestCandidate.timeAnchor.label}` : ''}`,
    themes: [themeId],
    title: `你留下过一些${shortThemeLabel}`,
    widgetEligible: true,
  })
}

function createRelativeDateMoments(days: ReviewSourceDay[], today: string) {
  return relativeDateMomentRules.flatMap((rule) => {
    const sourceDate = rule.getDate(today)
    const sourceDay = sourceDate
      ? days.find((day) => day.date === sourceDate)
      : undefined

    if (!sourceDay) {
      return []
    }

    const candidate = createDayCandidate(sourceDay)

    return [createMoment({
      anchors: [
        createDateAnchor(sourceDay.date, rule.label),
        ...createContextAnchors(sourceDay, candidate),
      ],
      id: `${rule.id}-${sourceDay.date}`,
      kind: 'relative',
      sourceDays: [sourceDay.date],
      subtitle: createCandidateSubtitle(candidate),
      themes: candidate.themes,
      title: createAnchoredTitle(rule.label, sourceDay, candidate),
      widgetEligible: true,
    })]
  })
}

function createSingleDayMoment(day: ReviewSourceDay) {
  const candidate = createDayCandidate(day)
  const title = createAnchoredTitle(formatDateShort(day.date), day, candidate)
  const subtitle = createCandidateSubtitle(candidate)

  if (!subtitle) {
    return null
  }

  return createMoment({
    anchors: [
      createDateAnchor(day.date),
      ...createContextAnchors(day, candidate),
    ],
    id: `single-${day.date}`,
    kind: 'single',
    sourceDays: [day.date],
    subtitle,
    themes: candidate.themes,
    title,
    widgetEligible: Boolean(candidate.sentence || candidate.image || candidate.themes.length > 0),
  })
}

function createMoment(moment: ReviewMoment): ReviewMoment {
  return {
    ...moment,
    themes: normalizeThemeIds(moment.themes),
  }
}

function createDayCandidate(day: ReviewSourceDay): DayCandidate {
  const firstMurmurWithText = day.murmurs.find((murmur) => Boolean(selectMurmurSentence(murmur)))
  const firstImageMurmur = day.murmurs.find((murmur) => murmur.images.length > 0)
  const anchorMurmur = firstMurmurWithText ?? firstImageMurmur ?? day.murmurs[0]

  return {
    day,
    image: firstImageMurmur?.images[0],
    sentence: firstMurmurWithText ? selectMurmurSentence(firstMurmurWithText) : undefined,
    themes: collectDayThemes(day),
    timeAnchor: anchorMurmur ? createTimeAnchor(anchorMurmur) : undefined,
  }
}

function createCandidateSubtitle(candidate: DayCandidate) {
  if (candidate.sentence) {
    return `你写过一句：${candidate.sentence}`
  }

  if (candidate.image) {
    return candidate.image.caption?.trim() || '你留过一张照片。'
  }

  const themeId = candidate.themes[0]

  if (themeId) {
    return getBuiltInThemeById(themeId)
      ? `${getThemeLabel(themeId)}里的一小块。`
      : themeId
  }

  return undefined
}

function createAnchoredTitle(prefix: string, day: ReviewSourceDay, candidate: DayCandidate) {
  const weatherText = normalizeOptionalString(day.frontMatter.weather?.text)

  if (weatherText) {
    return `${prefix}，${weatherText}`
  }

  const solarTerm = getSolarTermForDate(day.date)

  if (solarTerm) {
    return `${solarTerm.label}那天`
  }

  if (candidate.timeAnchor) {
    return `${prefix}，${candidate.timeAnchor.label}`
  }

  return prefix
}

function createContextAnchors(
  day: ReviewSourceDay,
  candidate: DayCandidate,
  options: { skipSolarTerm?: boolean } = {},
) {
  const anchors: ReviewAnchor[] = []
  const weatherText = normalizeOptionalString(day.frontMatter.weather?.text)

  if (weatherText) {
    anchors.push({
      label: weatherText,
      type: 'weather',
      value: weatherText,
    })
  }

  const solarTerm = getSolarTermForDate(day.date)

  if (solarTerm && !options.skipSolarTerm) {
    anchors.push({
      label: solarTerm.label,
      type: 'solarTerm',
      value: solarTerm.value,
    })
  }

  if (candidate.timeAnchor) {
    anchors.push(candidate.timeAnchor)
  }

  for (const themeId of candidate.themes.slice(0, 2)) {
    anchors.push({
      label: getThemeLabel(themeId),
      type: 'theme',
      value: themeId,
    })
  }

  return anchors
}

function createDateAnchor(date: string, label = formatDateShort(date)): ReviewAnchor {
  return {
    label,
    type: 'date',
    value: date,
  }
}

function createTimeAnchor(murmur: MurmurBlock): ReviewAnchor | undefined {
  const date = new Date(murmur.time)

  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  const hour = date.getHours()
  let label = '夜里'

  if (hour >= 5 && hour < 9) {
    label = '清晨'
  } else if (hour >= 9 && hour < 12) {
    label = '上午'
  } else if (hour >= 12 && hour < 17) {
    label = '午后'
  } else if (hour >= 17 && hour < 20) {
    label = '傍晚'
  } else if (hour >= 20 && hour < 24) {
    label = '夜里'
  } else {
    label = '深夜'
  }

  return {
    label,
    type: 'timeOfDay',
    value: String(hour).padStart(2, '0'),
  }
}

function collectDayThemes(day: ReviewSourceDay) {
  return normalizeThemeIds(day.murmurs.flatMap((murmur) => murmur.themes))
}

function selectMurmurSentence(murmur: MurmurBlock) {
  const sentences = murmur.body
    .split(/[\n。！？!?；;]/)
    .map((part) => part.trim())
    .filter(Boolean)

  return sentences.find((sentence) => isGoodHookSentence(sentence))
}

function isGoodHookSentence(sentence: string) {
  const visibleLength = sentence.replace(/\s/g, '').length

  return visibleLength >= 6 &&
    visibleLength <= 28 &&
    !negativeSnippetPattern.test(sentence)
}

function hasReviewableContent(day: ReviewSourceDay) {
  return Boolean(
    day.longEntryMarkdown.trim() ||
      day.murmurs.some((murmur) => murmur.body.trim() || murmur.images.length > 0),
  )
}

function hasMomentForSourceDay(moments: ReviewMoment[], date: string | undefined) {
  return Boolean(date && moments.some((moment) => moment.sourceDays.includes(date)))
}

function formatDateShort(dateKey: string) {
  const [, month, day] = dateKey.split('-')

  if (!month || !day) {
    return dateKey
  }

  return `${Number(month)} 月 ${Number(day)} 日`
}

function getPreviousWeekDateKey(dateKey: string) {
  const parsed = parseDateKey(dateKey)

  if (!parsed) {
    return null
  }

  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day) - 7 * millisecondsPerDay)

  return formatDateKey(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  )
}

function getPreviousMonthDateKey(dateKey: string) {
  const parsed = parseDateKey(dateKey)

  if (!parsed) {
    return null
  }

  const targetYear = parsed.month === 1 ? parsed.year - 1 : parsed.year
  const targetMonth = parsed.month === 1 ? 12 : parsed.month - 1

  if (parsed.day > getDaysInMonth(targetYear, targetMonth)) {
    return null
  }

  return formatDateKey(targetYear, targetMonth, parsed.day)
}

function parseDateKey(dateKey: string) {
  const dateKeyMatch = dateKeyPattern.exec(dateKey)

  if (!dateKeyMatch) {
    return null
  }

  const [, yearText, monthText, dayText] = dateKeyMatch
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)

  if (
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > getDaysInMonth(year, month)
  ) {
    return null
  }

  return {
    day,
    month,
    year,
  }
}

function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function formatDateKey(year: number, month: number, day: number) {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}
