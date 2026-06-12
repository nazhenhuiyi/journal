import type { MergeDriverCallback } from 'isomorphic-git'
import { getMergeDriverContents } from './mergeDriverContent'

export type FallbackMergeSide = 'ours' | 'theirs'

export type FallbackMergeInput = {
  fallbackSide?: FallbackMergeSide
  ours: string
  path: string
  theirs: string
}

export type FallbackMergeResult = {
  content: string
  reason: 'fallback' | 'updatedAt'
  side: FallbackMergeSide
}

export type LastWriteWinsSide = FallbackMergeSide
export type LastWriteWinsInput = FallbackMergeInput
export type LastWriteWinsResult = FallbackMergeResult

export function chooseFallbackMergeContent(input: FallbackMergeInput): FallbackMergeResult {
  const fallbackSide = input.fallbackSide ?? 'theirs'
  const oursUpdatedAt = getContentUpdatedAt(input.path, input.ours)
  const theirsUpdatedAt = getContentUpdatedAt(input.path, input.theirs)

  if (oursUpdatedAt !== null || theirsUpdatedAt !== null) {
    if ((oursUpdatedAt ?? Number.NEGATIVE_INFINITY) > (theirsUpdatedAt ?? Number.NEGATIVE_INFINITY)) {
      return {
        content: input.ours,
        reason: 'updatedAt',
        side: 'ours',
      }
    }

    if ((theirsUpdatedAt ?? Number.NEGATIVE_INFINITY) > (oursUpdatedAt ?? Number.NEGATIVE_INFINITY)) {
      return {
        content: input.theirs,
        reason: 'updatedAt',
        side: 'theirs',
      }
    }
  }

  return {
    content: fallbackSide === 'ours' ? input.ours : input.theirs,
    reason: 'fallback',
    side: fallbackSide,
  }
}

export function createFallbackMergeDriver(
  fallbackSide: FallbackMergeSide = 'theirs',
): MergeDriverCallback {
  return ({ contents, path }) => {
    const { ours, theirs } = getMergeDriverContents(contents)
    const result = chooseFallbackMergeContent({
      fallbackSide,
      ours,
      path,
      theirs,
    })

    return {
      cleanMerge: true,
      mergedText: result.content,
    }
  }
}

export const chooseLastWriteWinsContent = chooseFallbackMergeContent
export const createLastWriteWinsMergeDriver = createFallbackMergeDriver

function getContentUpdatedAt(path: string, content: string) {
  if (isJsonPath(path)) {
    return getJsonUpdatedAt(content)
  }

  return null
}

function getJsonUpdatedAt(content: string) {
  try {
    const parsed = JSON.parse(content) as {
      annotations?: Array<{
        createdAt?: unknown
        updatedAt?: unknown
      }>
      generatedAt?: unknown
      updatedAt?: unknown
    }
    const directTimestamp = parseTimestamp(parsed.updatedAt) ?? parseTimestamp(parsed.generatedAt)

    if (directTimestamp !== null) {
      return directTimestamp
    }

    if (!Array.isArray(parsed.annotations)) {
      return null
    }

    return parsed.annotations.reduce<number | null>((latest, annotation) => {
      const timestamp = parseTimestamp(annotation.updatedAt) ?? parseTimestamp(annotation.createdAt)

      if (timestamp === null) {
        return latest
      }

      return latest === null ? timestamp : Math.max(latest, timestamp)
    }, null)
  } catch {
    return null
  }
}

function isJsonPath(path: string) {
  return path.endsWith('.json')
}

function parseTimestamp(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const timestamp = Date.parse(value)

  return Number.isFinite(timestamp) ? timestamp : null
}
