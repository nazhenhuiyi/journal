import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import {
  createPersistedSyncSnapshot,
  createSyncSnapshotPersistenceIdentity,
  normalizePersistedSyncSnapshot,
  normalizeRestoredSyncSnapshot,
  type SyncSnapshot,
  type SyncSnapshotPersistenceIdentity,
} from '@journal/sync'

type SaveJournalGitSyncStatePayload = {
  snapshot?: unknown
  syncBranch?: unknown
  syncRemoteUrl?: unknown
}

const STATE_FILE_NAME = 'sync-state.json'

export async function loadJournalGitSyncState(
  journalDirectory: string,
  identity: SyncSnapshotPersistenceIdentity,
): Promise<SyncSnapshot | null> {
  const content = await readFile(getSyncStatePath(journalDirectory), 'utf8').catch((error: unknown) => {
    if (isNodeError(error, 'ENOENT')) {
      return null
    }

    throw error
  })

  if (content === null) {
    return null
  }

  try {
    const parsed = JSON.parse(content) as unknown
    return normalizePersistedSyncSnapshot(parsed, identity)?.snapshot ?? null
  } catch {
    return null
  }
}

export async function saveJournalGitSyncState(
  journalDirectory: string,
  payload: unknown,
) {
  const normalizedPayload = normalizeSavePayload(payload)
  const persistedSnapshot = createPersistedSyncSnapshot(normalizedPayload)

  if (!persistedSnapshot) {
    return null
  }

  const syncStatePath = getSyncStatePath(journalDirectory)
  const temporaryPath = `${syncStatePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`

  await mkdir(path.dirname(syncStatePath), { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(persistedSnapshot, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, syncStatePath)

  return persistedSnapshot
}

function normalizeSavePayload(payload: unknown): {
  identity: SyncSnapshotPersistenceIdentity
  snapshot: SyncSnapshot
} {
  if (!isRecord(payload)) {
    throw new Error('同步状态格式不正确。')
  }

  const syncPayload = payload as SaveJournalGitSyncStatePayload

  if (typeof syncPayload.syncRemoteUrl !== 'string' || !syncPayload.syncRemoteUrl.trim()) {
    throw new Error('同步状态缺少仓库地址。')
  }

  const snapshot = normalizeRestoredSyncSnapshot(syncPayload.snapshot)

  if (!snapshot) {
    throw new Error('同步状态内容格式不正确。')
  }

  return {
    identity: createSyncSnapshotPersistenceIdentity({
      branch: typeof syncPayload.syncBranch === 'string' ? syncPayload.syncBranch : 'main',
      remoteUrl: syncPayload.syncRemoteUrl,
    }),
    snapshot,
  }
}

function getSyncStatePath(journalDirectory: string) {
  return path.join(getSyncStateDirectory(), getSyncStateFileName(journalDirectory))
}

function getSyncStateDirectory() {
  return path.join(app.getPath('userData'), 'journal-sync-state')
}

function getSyncStateFileName(journalDirectory: string) {
  const journalKey = createHash('sha256')
    .update(path.resolve(journalDirectory))
    .digest('hex')

  return `${journalKey}-${STATE_FILE_NAME}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNodeError(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code
}
