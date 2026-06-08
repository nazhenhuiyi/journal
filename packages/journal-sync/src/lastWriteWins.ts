import { parseJournalMarkdown } from '@journal/core'
import type { MergeDriverCallback } from 'isomorphic-git'

export type LastWriteWinsSide = 'ours' | 'theirs'

export type LastWriteWinsInput = {
  fallbackSide?: LastWriteWinsSide
  ours: string
  path: string
  theirs: string
}

export type LastWriteWinsResult = {
  content: string
  reason: 'fallback' | 'updatedAt'
  side: LastWriteWinsSide
}

export function chooseLastWriteWinsContent(input: LastWriteWinsInput): LastWriteWinsResult {
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

export function createLastWriteWinsMergeDriver(
  fallbackSide: LastWriteWinsSide = 'theirs',
): MergeDriverCallback {
  return ({ contents, path }) => {
    const ours = contents.length >= 3 ? contents[1] : contents[0] ?? ''
    const theirs = contents.length >= 3 ? contents[2] : contents[1] ?? ''
    const result = chooseLastWriteWinsContent({
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

function getContentUpdatedAt(path: string, content: string) {
  if (isJournalMarkdownPath(path)) {
    return parseTimestamp(parseJournalMarkdown(content).frontMatter.updatedAt)
  }

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

function isJournalMarkdownPath(path: string) {
  return path.startsWith('entries/') && path.endsWith('.md')
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
