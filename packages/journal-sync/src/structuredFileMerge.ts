export type StructuredMergeSide = 'ours' | 'theirs'

export type StructuredFileMergeInput = {
  defaultSide?: StructuredMergeSide
  ours: string
  path: string
  theirs: string
}

export type StructuredFileMergeResult = {
  content: string
  reason: 'default-side' | 'updatedAt'
  side: StructuredMergeSide
}

export function chooseStructuredFileMergeContent(input: StructuredFileMergeInput): StructuredFileMergeResult {
  const defaultSide = input.defaultSide ?? 'theirs'
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
    content: defaultSide === 'ours' ? input.ours : input.theirs,
    reason: 'default-side',
    side: defaultSide,
  }
}

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
