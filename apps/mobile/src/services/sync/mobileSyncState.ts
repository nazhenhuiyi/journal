import * as FileSystem from 'expo-file-system/legacy'
import {
  createPersistedSyncSnapshot,
  normalizePersistedSyncSnapshot,
  type SyncSnapshot,
  type SyncSnapshotPersistenceIdentity,
} from '@journal/sync'
import { appendMobileE2eSuffix } from '../e2eEnvironment'

const syncStateFileName = 'journal-mobile-sync-state.json'

export async function loadMobileSyncSnapshot(
  identity: SyncSnapshotPersistenceIdentity,
): Promise<SyncSnapshot | null> {
  const filePath = getMobileSyncStateFilePath()
  const info = await FileSystem.getInfoAsync(filePath)

  if (!info.exists) {
    return null
  }

  try {
    const contents = await FileSystem.readAsStringAsync(filePath)
    const parsed = JSON.parse(contents) as unknown

    return normalizePersistedSyncSnapshot(parsed, identity)?.snapshot ?? null
  } catch {
    return null
  }
}

export async function saveMobileSyncSnapshot(input: {
  identity: SyncSnapshotPersistenceIdentity
  snapshot: SyncSnapshot
}) {
  const persistedSnapshot = createPersistedSyncSnapshot(input)

  if (!persistedSnapshot) {
    return null
  }

  await FileSystem.writeAsStringAsync(
    getMobileSyncStateFilePath(),
    JSON.stringify(persistedSnapshot),
  )

  return persistedSnapshot
}

function getMobileSyncStateFilePath() {
  if (!FileSystem.documentDirectory) {
    throw new Error('File system document directory is unavailable.')
  }

  return `${FileSystem.documentDirectory}${appendMobileE2eSuffix(syncStateFileName)}`
}
