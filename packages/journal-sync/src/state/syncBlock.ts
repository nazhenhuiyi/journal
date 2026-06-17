export type SyncBlockedReason =
  | 'content-conflict'
  | 'first-sync-needs-choice'
  | 'object-store-corrupt'
  | 'unrelated-histories'

export type SyncBlockConflictPreview = {
  ours: string
  path: string
  theirs: string
}

export type SyncBlock = {
  conflicts?: SyncBlockConflictPreview[]
  message: string
  paths?: string[]
  reason: SyncBlockedReason
  retryAfterMs?: number
}

const syncBlockedReasons = new Set<SyncBlockedReason>([
  'content-conflict',
  'first-sync-needs-choice',
  'object-store-corrupt',
  'unrelated-histories',
])

export class JournalSyncBlockedError extends Error {
  readonly block: SyncBlock
  readonly cause?: unknown
  readonly code = 'JournalSyncBlockedError'

  constructor(block: SyncBlock, cause?: unknown) {
    const normalizedBlock = normalizeSyncBlock(block)

    super(normalizedBlock?.message ?? block.message)

    this.block = normalizedBlock ?? block
    this.cause = cause
    this.name = 'JournalSyncBlockedError'
  }
}

export function createJournalSyncBlockedError(block: SyncBlock, cause?: unknown) {
  return new JournalSyncBlockedError(block, cause)
}

export function getJournalSyncBlock(error: unknown): SyncBlock | null {
  if (error instanceof JournalSyncBlockedError) {
    return error.block
  }

  if (!isRecord(error)) {
    return null
  }

  return normalizeSyncBlock(error.block) ??
    (isRecord(error.data) ? normalizeSyncBlock(error.data.block) : null)
}

export function normalizeSyncBlock(value: unknown): SyncBlock | null {
  if (!isRecord(value)) {
    return null
  }

  if (typeof value.reason !== 'string' || !syncBlockedReasons.has(value.reason as SyncBlockedReason)) {
    return null
  }

  if (typeof value.message !== 'string' || !value.message.trim()) {
    return null
  }

  const conflicts = normalizeSyncBlockConflicts(value.conflicts)
  const paths = normalizeSyncBlockPaths(value.paths)
  const retryAfterMs = normalizeRetryAfterMs(value.retryAfterMs)

  return {
    ...(conflicts.length > 0 ? { conflicts } : {}),
    message: value.message.trim(),
    ...(paths.length > 0 ? { paths } : {}),
    reason: value.reason as SyncBlockedReason,
    ...(retryAfterMs === null ? {} : { retryAfterMs }),
  }
}

function normalizeSyncBlockConflicts(value: unknown): SyncBlockConflictPreview[] {
  if (!Array.isArray(value)) {
    return []
  }

  const conflicts: SyncBlockConflictPreview[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (!isRecord(item)) {
      continue
    }

    const path = typeof item.path === 'string' ? item.path.trim() : ''
    const ours = typeof item.ours === 'string' ? trimConflictPreviewText(item.ours) : ''
    const theirs = typeof item.theirs === 'string' ? trimConflictPreviewText(item.theirs) : ''

    if (!path || (!ours && !theirs)) {
      continue
    }

    const key = `${path}\n${ours}\n${theirs}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    conflicts.push({ ours, path, theirs })

    if (conflicts.length >= 4) {
      break
    }
  }

  return conflicts
}

function normalizeSyncBlockPaths(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return [...new Set(
    value
      .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
      .map((path) => path.trim()),
  )].sort()
}

function normalizeRetryAfterMs(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return Math.ceil(value)
}

function trimConflictPreviewText(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 1200)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
