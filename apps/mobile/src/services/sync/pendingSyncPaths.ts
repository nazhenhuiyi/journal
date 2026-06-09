import * as FileSystem from 'expo-file-system/legacy'
import { appendMobileE2eSuffix } from '../e2eEnvironment'

const pendingSyncPathsFileName = 'journal-mobile-sync-pending-paths.json'

type PendingSyncPathsFile = {
  paths?: unknown
  version?: unknown
}

export async function loadPendingMobileSyncPaths() {
  const filePath = getPendingSyncPathsFilePath()
  const info = await FileSystem.getInfoAsync(filePath)

  if (!info.exists) {
    return []
  }

  try {
    const contents = await FileSystem.readAsStringAsync(filePath)
    const parsed = JSON.parse(contents) as PendingSyncPathsFile

    if (!Array.isArray(parsed.paths)) {
      return []
    }

    return normalizePendingPaths(parsed.paths)
  } catch {
    return []
  }
}

export async function savePendingMobileSyncPaths(paths: readonly string[]) {
  const filePath = getPendingSyncPathsFilePath()
  const contents = JSON.stringify({
    paths: normalizePendingPaths(paths),
    version: 1,
  })

  await FileSystem.writeAsStringAsync(filePath, contents)
}

function normalizePendingPaths(paths: readonly unknown[]) {
  return [...new Set(
    paths
      .filter((path): path is string => typeof path === 'string')
      .map((path) => path.trim().replace(/\\/g, '/').replace(/^\.?\//, ''))
      .filter(isSafePendingJournalPath),
  )].sort()
}

function isSafePendingJournalPath(path: string) {
  return /^entries\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.md$/.test(path) ||
    /^annotations\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.json$/.test(path) ||
    path === 'manifest.json' ||
    (path.startsWith('media/') && !path.split('/').some(isUnsafePathSegment))
}

function isUnsafePathSegment(segment: string) {
  return !segment || segment.startsWith('.') || segment.endsWith('.tmp')
}

function getPendingSyncPathsFilePath() {
  if (!FileSystem.documentDirectory) {
    throw new Error('File system document directory is unavailable.')
  }

  return `${FileSystem.documentDirectory}${appendMobileE2eSuffix(pendingSyncPathsFileName)}`
}
