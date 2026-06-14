import type {
  SyncPendingReason,
  SyncSnapshot,
  SyncState,
} from './scheduler'

export type SyncSnapshotPersistenceIdentity = {
  branch: string
  remoteUrl: string
}

export type PersistedSyncSnapshot = {
  identity: SyncSnapshotPersistenceIdentity
  snapshot: SyncSnapshot
  updatedAt: string
  version: 1
}

const persistedSyncSnapshotVersion = 1
const syncStates = new Set<SyncState>([
  'disabled',
  'idle',
  'pending',
  'syncing',
  'synced',
  'retrying',
  'needs-auth',
  'error',
])
const syncPendingReasons = new Set<SyncPendingReason>([
  'local-save',
  'remote-check',
  'retry',
])
const defaultSyncSnapshot: SyncSnapshot = {
  lastError: null,
  lastSyncedAt: null,
  pendingReason: null,
  status: 'idle',
}

export function createSyncSnapshotPersistenceIdentity(input: {
  branch?: string | null
  remoteUrl?: string | null
}): SyncSnapshotPersistenceIdentity {
  return {
    branch: input.branch?.trim() || 'main',
    remoteUrl: input.remoteUrl?.trim() ?? '',
  }
}

export function areSyncSnapshotPersistenceIdentitiesEqual(
  first: SyncSnapshotPersistenceIdentity,
  second: SyncSnapshotPersistenceIdentity,
) {
  return first.branch === second.branch && first.remoteUrl === second.remoteUrl
}

export function createPersistedSyncSnapshot(input: {
  identity: SyncSnapshotPersistenceIdentity
  now?: Date
  snapshot: SyncSnapshot
}): PersistedSyncSnapshot | null {
  const snapshot = normalizeRestoredSyncSnapshot(input.snapshot)

  if (!snapshot || !shouldPersistSyncSnapshot(snapshot)) {
    return null
  }

  return {
    identity: input.identity,
    snapshot,
    updatedAt: (input.now ?? new Date()).toISOString(),
    version: persistedSyncSnapshotVersion,
  }
}

export function normalizePersistedSyncSnapshot(
  value: unknown,
  expectedIdentity?: SyncSnapshotPersistenceIdentity,
): PersistedSyncSnapshot | null {
  if (!isRecord(value) || value.version !== persistedSyncSnapshotVersion) {
    return null
  }

  const identity = normalizeSyncSnapshotPersistenceIdentity(value.identity)

  if (!identity) {
    return null
  }

  if (expectedIdentity && !areSyncSnapshotPersistenceIdentitiesEqual(identity, expectedIdentity)) {
    return null
  }

  const snapshot = normalizeRestoredSyncSnapshot(value.snapshot)

  if (!snapshot || !shouldPersistSyncSnapshot(snapshot)) {
    return null
  }

  const updatedAt = normalizeTimestamp(value.updatedAt)

  if (!updatedAt) {
    return null
  }

  return {
    identity,
    snapshot,
    updatedAt,
    version: persistedSyncSnapshotVersion,
  }
}

export function normalizeRestoredSyncSnapshot(value: unknown): SyncSnapshot | null {
  if (!isRecord(value)) {
    return null
  }

  const status = normalizeSyncState(value.status)

  if (!status) {
    return null
  }

  const pendingReason = normalizePendingReason(value.pendingReason)
  const lastSyncedAt = normalizeTimestamp(value.lastSyncedAt)
  const lastError = normalizeOptionalString(value.lastError)
  const restoredSnapshot: SyncSnapshot = {
    lastError,
    lastSyncedAt,
    pendingReason,
    status,
  }

  if (status === 'syncing') {
    return normalizeInterruptedSyncSnapshot(restoredSnapshot)
  }

  if (status === 'pending' && !pendingReason) {
    return {
      ...restoredSnapshot,
      pendingReason: 'local-save',
    }
  }

  if (status !== 'pending' && status !== 'retrying') {
    return {
      ...restoredSnapshot,
      pendingReason: null,
    }
  }

  if (status === 'retrying') {
    return {
      ...restoredSnapshot,
      pendingReason: pendingReason ?? 'retry',
    }
  }

  return restoredSnapshot
}

export function getDefaultSyncSnapshot(): SyncSnapshot {
  return { ...defaultSyncSnapshot }
}

export function shouldPersistSyncSnapshot(snapshot: SyncSnapshot) {
  return snapshot.status === 'synced' ||
    snapshot.status === 'pending' ||
    snapshot.status === 'retrying' ||
    snapshot.status === 'needs-auth' ||
    snapshot.status === 'error' ||
    Boolean(snapshot.lastSyncedAt)
}

function normalizeInterruptedSyncSnapshot(snapshot: SyncSnapshot): SyncSnapshot {
  if (snapshot.pendingReason === 'local-save') {
    return {
      ...snapshot,
      lastError: null,
      pendingReason: 'local-save',
      status: 'pending',
    }
  }

  if (snapshot.lastError) {
    return {
      ...snapshot,
      pendingReason: snapshot.pendingReason === 'retry' ? 'retry' : null,
      status: snapshot.pendingReason === 'retry' ? 'retrying' : 'error',
    }
  }

  if (snapshot.lastSyncedAt) {
    return {
      ...snapshot,
      pendingReason: null,
      status: 'synced',
    }
  }

  return getDefaultSyncSnapshot()
}

function normalizeSyncSnapshotPersistenceIdentity(value: unknown): SyncSnapshotPersistenceIdentity | null {
  if (!isRecord(value)) {
    return null
  }

  if (typeof value.remoteUrl !== 'string' || !value.remoteUrl.trim()) {
    return null
  }

  if (typeof value.branch !== 'string' || !value.branch.trim()) {
    return null
  }

  return createSyncSnapshotPersistenceIdentity({
    branch: value.branch,
    remoteUrl: value.remoteUrl,
  })
}

function normalizeSyncState(value: unknown): SyncState | null {
  return typeof value === 'string' && syncStates.has(value as SyncState)
    ? value as SyncState
    : null
}

function normalizePendingReason(value: unknown): SyncPendingReason | null {
  return typeof value === 'string' && syncPendingReasons.has(value as SyncPendingReason)
    ? value as SyncPendingReason
    : null
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const timestamp = value.trim()

  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    return null
  }

  return timestamp
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
