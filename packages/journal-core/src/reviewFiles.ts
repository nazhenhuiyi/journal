import { normalizeThemeIds } from './themes'
import type {
  ReviewAnchor,
  ReviewAnchorType,
  ReviewFile,
  ReviewMoment,
} from './types'

type CreateReviewFileInput = {
  date: string
  generatedAt?: string
  moments: readonly ReviewMoment[]
}

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/
const reviewAnchorTypes = new Set<ReviewAnchorType>([
  'date',
  'personal',
  'season',
  'solarTerm',
  'theme',
  'timeOfDay',
  'weather',
])
const reviewMomentKinds = new Set<ReviewMoment['kind']>([
  'anniversary',
  'cluster',
  'relative',
  'single',
])

export function createReviewFile({
  date,
  generatedAt = new Date().toISOString(),
  moments,
}: CreateReviewFileInput): ReviewFile {
  return {
    date,
    generatedAt,
    moments: moments.map(normalizeReviewMoment),
    version: 1,
  }
}

export function normalizeReviewFile(value: unknown): ReviewFile | null {
  if (!isRecord(value) || value.version !== 1 || !isDateKey(value.date)) {
    return null
  }

  if (typeof value.generatedAt !== 'string' || !value.generatedAt.trim()) {
    return null
  }

  if (!Array.isArray(value.moments)) {
    return null
  }

  const moments = value.moments.flatMap((moment) => {
    const normalized = normalizeReviewMomentInput(moment)

    return normalized ? [normalized] : []
  })

  if (moments.length === 0) {
    return null
  }

  return {
    date: value.date,
    generatedAt: value.generatedAt.trim(),
    moments,
    version: 1,
  }
}

function normalizeReviewMomentInput(value: unknown): ReviewMoment | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    !Array.isArray(value.sourceDays) ||
    !reviewMomentKinds.has(value.kind as ReviewMoment['kind']) ||
    typeof value.title !== 'string' ||
    !value.title.trim()
  ) {
    return null
  }

  if (value.subtitle !== undefined && typeof value.subtitle !== 'string') {
    return null
  }

  const sourceDays = value.sourceDays.filter((sourceDay): sourceDay is string => (
    typeof sourceDay === 'string' && isDateKey(sourceDay)
  ))

  if (sourceDays.length === 0) {
    return null
  }

  return normalizeReviewMoment({
    anchors: Array.isArray(value.anchors)
      ? value.anchors.flatMap((anchor) => {
          const normalized = normalizeReviewAnchorInput(anchor)

          return normalized ? [normalized] : []
        })
      : [],
    id: value.id,
    kind: value.kind as ReviewMoment['kind'],
    sourceDays,
    subtitle: value.subtitle,
    themes: Array.isArray(value.themes)
      ? value.themes.filter((themeId): themeId is string => typeof themeId === 'string')
      : [],
    title: value.title,
    widgetEligible: value.widgetEligible === true,
  })
}

function normalizeReviewMoment(moment: ReviewMoment): ReviewMoment {
  return {
    anchors: moment.anchors.map(normalizeReviewAnchor),
    id: moment.id.trim(),
    kind: moment.kind,
    sourceDays: normalizeDateKeys(moment.sourceDays),
    subtitle: moment.subtitle?.trim() || undefined,
    themes: normalizeThemeIds(moment.themes),
    title: moment.title.trim(),
    widgetEligible: moment.widgetEligible,
  }
}

function normalizeReviewAnchorInput(value: unknown): ReviewAnchor | null {
  if (!isRecord(value) || !reviewAnchorTypes.has(value.type as ReviewAnchorType)) {
    return null
  }

  if (typeof value.label !== 'string' || !value.label.trim()) {
    return null
  }

  if (value.value !== undefined && typeof value.value !== 'string') {
    return null
  }

  return normalizeReviewAnchor({
    label: value.label,
    type: value.type as ReviewAnchorType,
    value: value.value,
  })
}

function normalizeReviewAnchor(anchor: ReviewAnchor): ReviewAnchor {
  return {
    label: anchor.label.trim(),
    type: anchor.type,
    value: anchor.value?.trim() || undefined,
  }
}

function normalizeDateKeys(dateKeys: readonly string[]) {
  return [...new Set(dateKeys.filter(isDateKey))]
}

function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && dateKeyPattern.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
