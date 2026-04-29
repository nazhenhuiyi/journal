import { createTextSelector } from './createTextSelector'
import type { Annotation, AnnotationTarget, TextPosition } from './types'

export type AiAnnotationDraft = {
  id?: string
  kind: 'observation' | 'question'
  content: string
  anchorQuote?: string
  anchorPrefix?: string
  anchorSuffix?: string
}

export type ResolvedAnnotationDraft = {
  id: string
  kind: AiAnnotationDraft['kind']
  content: string
  target: AnnotationTarget
  matchStatus: 'anchored' | 'day'
}

export function createAnnotationFromDraft(
  draft: AiAnnotationDraft,
  longEntryMarkdown: string,
  createdAt: string,
): Annotation {
  const resolvedDraft = resolveAnnotationDraft(draft, longEntryMarkdown)

  return {
    id: resolvedDraft.id,
    author: 'ai',
    kind: resolvedDraft.kind,
    target: resolvedDraft.target,
    body: {
      content: resolvedDraft.content,
    },
    status: 'visible',
    createdAt,
  }
}

export function resolveAnnotationDraft(
  draft: AiAnnotationDraft,
  longEntryMarkdown: string,
): ResolvedAnnotationDraft {
  const content = draft.content.trim()
  const kind = draft.kind === 'question' ? 'question' : 'observation'
  const range = findDraftAnchorRange(longEntryMarkdown, draft)

  return {
    id: draft.id?.trim() || createAnnotationId(),
    kind,
    content,
    target: range
      ? {
          type: 'longEntryRange',
          selector: createTextSelector(longEntryMarkdown, range.start, range.end),
        }
      : {
          type: 'day',
        },
    matchStatus: range ? 'anchored' : 'day',
  }
}

export function findDraftAnchorRange(
  longEntryMarkdown: string,
  draft: Pick<AiAnnotationDraft, 'anchorQuote' | 'anchorPrefix' | 'anchorSuffix'>,
): TextPosition | null {
  const quote = draft.anchorQuote?.trim()

  if (!quote) {
    return null
  }

  const candidates = findAllRanges(longEntryMarkdown, quote)

  if (candidates.length === 0) {
    return null
  }

  return [...candidates].sort((left, right) => {
    return scoreDraftContext(longEntryMarkdown, right, draft) - scoreDraftContext(longEntryMarkdown, left, draft)
  })[0]
}

function findAllRanges(text: string, exact: string): TextPosition[] {
  const ranges: TextPosition[] = []
  let fromIndex = 0

  while (fromIndex <= text.length) {
    const start = text.indexOf(exact, fromIndex)

    if (start === -1) {
      break
    }

    ranges.push({
      start,
      end: start + exact.length,
    })
    fromIndex = start + 1
  }

  return ranges
}

function scoreDraftContext(
  text: string,
  range: TextPosition,
  draft: Pick<AiAnnotationDraft, 'anchorPrefix' | 'anchorSuffix'>,
) {
  let score = 0
  const prefix = draft.anchorPrefix?.trim()
  const suffix = draft.anchorSuffix?.trim()

  if (prefix) {
    const before = text.slice(Math.max(0, range.start - prefix.length), range.start).trim()

    if (before.endsWith(prefix)) {
      score += prefix.length
    }
  }

  if (suffix) {
    const after = text.slice(range.end, range.end + suffix.length).trim()

    if (after.startsWith(suffix)) {
      score += suffix.length
    }
  }

  return score
}

function createAnnotationId() {
  const randomPart = Math.random().toString(36).slice(2, 8)

  return `ann_ai_${Date.now().toString(36)}_${randomPart}`
}
