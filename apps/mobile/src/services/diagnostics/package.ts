import * as FileSystem from 'expo-file-system/legacy'
import type { SyncSnapshot } from '@journal/sync'
import {
  flushMobileDiagnosticLogs,
  getMobileDiagnosticLogDirectory,
  mobileDiagnosticLog,
  sanitizeMobileDiagnosticJsonLines,
  sanitizeMobileDiagnosticPayload,
} from './log'

export type MobileDiagnosticPackagePaths = {
  adbLogDirectory: string
  diagnosticLogDirectory: string
  diagnosticPackageDirectory: string
  todayEntryPath: string
  uiSettingsStorage: string
  worktreeDirectory: string
}

export type MobileDiagnosticPackageSyncInput = {
  branch: string
  hasStoredSyncToken: boolean
  remoteUrl: string
  snapshot: SyncSnapshot
}

export type MobileDiagnosticPackageInput = {
  paths: MobileDiagnosticPackagePaths
  sync: MobileDiagnosticPackageSyncInput
  today: string
}

export type MobileDiagnosticPackageResult = {
  contents: string
  fileName: string
  filePath: string
  includedLogBytes: number
  includedLogFileCount: number
  truncatedLogs: boolean
}

export type MobileDiagnosticExternalSaveResult =
  | {
    fileName: string
    status: 'saved'
    uri: string
  }
  | {
    status: 'canceled'
  }

type DiagnosticLogFile = {
  name: string
  size: number
  uri: string
}

const diagnosticPackageDirectoryName = 'journal-diagnostic-packages'
const diagnosticPackageFilePrefix = 'journal-diagnostics'
const diagnosticPackageMimeType = 'application/json'
const maxDiagnosticPackageLogBytes = 4 * 1024 * 1024

export async function createMobileDiagnosticPackage(
  input: MobileDiagnosticPackageInput,
): Promise<MobileDiagnosticPackageResult> {
  await flushMobileDiagnosticLogs()

  const generatedAt = new Date()
  const logSnapshot = await readDiagnosticLogSnapshot()
  const packageFileName = `${diagnosticPackageFilePrefix}-${formatTimestampForFileName(generatedAt)}.json`
  const packageContents = `${JSON.stringify({
    generatedAt: generatedAt.toISOString(),
    logs: logSnapshot,
    paths: input.paths,
    schemaVersion: 1,
    sync: sanitizeSyncDiagnostic(input.sync),
    today: input.today,
  }, null, 2)}\n`
  const packageDirectory = await ensureMobileDiagnosticPackageDirectory()
  const packageFilePath = `${packageDirectory}${packageFileName}`

  await FileSystem.writeAsStringAsync(packageFilePath, packageContents)
  mobileDiagnosticLog.info('diagnostic-package', 'Diagnostic package created', {
    fileName: packageFileName,
    includedLogBytes: logSnapshot.includedBytes,
    includedLogFileCount: logSnapshot.files.length,
    truncatedLogs: logSnapshot.truncated,
  })

  return {
    contents: packageContents,
    fileName: packageFileName,
    filePath: packageFilePath,
    includedLogBytes: logSnapshot.includedBytes,
    includedLogFileCount: logSnapshot.files.length,
    truncatedLogs: logSnapshot.truncated,
  }
}

export async function saveMobileDiagnosticPackageToAndroidDirectory(
  diagnosticPackage: MobileDiagnosticPackageResult,
): Promise<MobileDiagnosticExternalSaveResult> {
  const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()

  if (!permissions.granted) {
    return { status: 'canceled' }
  }

  const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
    permissions.directoryUri,
    diagnosticPackage.fileName.replace(/\.json$/i, ''),
    diagnosticPackageMimeType,
  )

  await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, diagnosticPackage.contents)
  mobileDiagnosticLog.info('diagnostic-package', 'Diagnostic package saved to external directory', {
    fileName: diagnosticPackage.fileName,
  })

  return {
    fileName: diagnosticPackage.fileName,
    status: 'saved',
    uri: fileUri,
  }
}

export function getMobileDiagnosticPackageDirectory() {
  if (!FileSystem.documentDirectory) {
    throw new Error('File system document directory is unavailable.')
  }

  return `${FileSystem.documentDirectory}${diagnosticPackageDirectoryName}/`
}

async function ensureMobileDiagnosticPackageDirectory() {
  const directory = getMobileDiagnosticPackageDirectory()

  await FileSystem.makeDirectoryAsync(directory, { intermediates: true })

  return directory
}

async function readDiagnosticLogSnapshot() {
  const directory = getMobileDiagnosticLogDirectory()
  const files = await listDiagnosticLogFiles(directory)
  const selectedFiles: DiagnosticLogFile[] = []
  let includedBytes = 0
  let truncated = false

  for (const file of [...files].reverse()) {
    if (includedBytes + file.size > maxDiagnosticPackageLogBytes && selectedFiles.length > 0) {
      truncated = true
      continue
    }

    selectedFiles.push(file)
    includedBytes += file.size
  }

  selectedFiles.reverse()

  const entries = await Promise.all(
    selectedFiles.map(async (file) => ({
      contents: sanitizeMobileDiagnosticJsonLines(await FileSystem.readAsStringAsync(file.uri), {
        maxLength: Math.max(file.size * 2, 16_000),
      }),
      name: file.name,
      size: file.size,
    })),
  )

  return {
    directory,
    files: entries,
    includedBytes,
    sourceFileCount: files.length,
    truncated,
  }
}

async function listDiagnosticLogFiles(directory: string): Promise<DiagnosticLogFile[]> {
  let fileNames: string[]

  try {
    fileNames = await FileSystem.readDirectoryAsync(directory)
  } catch {
    return []
  }

  const files = await Promise.all(
    fileNames
      .filter((fileName) => /^journal-mobile-\d{4}-\d{2}-\d{2}(?:\.\d+)?\.jsonl$/.test(fileName))
      .sort()
      .map(async (fileName): Promise<DiagnosticLogFile | null> => {
        const uri = `${directory}${fileName}`
        const info = await FileSystem.getInfoAsync(uri)

        if (!info.exists || info.isDirectory) {
          return null
        }

        return {
          name: fileName,
          size: typeof info.size === 'number' ? info.size : 0,
          uri,
        }
      }),
  )

  return files.filter((file): file is DiagnosticLogFile => Boolean(file))
}

function sanitizeSyncDiagnostic(sync: MobileDiagnosticPackageSyncInput) {
  return sanitizeMobileDiagnosticPayload({
    branch: sync.branch.trim() || 'main',
    hasStoredSyncToken: sync.hasStoredSyncToken,
    remoteHost: getRemoteHost(sync.remoteUrl),
    snapshot: {
      lastError: sync.snapshot.lastError,
      lastSyncedAt: sync.snapshot.lastSyncedAt,
      pendingReason: sync.snapshot.pendingReason,
      status: sync.snapshot.status,
    },
  })
}

function getRemoteHost(remoteUrl: string) {
  if (!remoteUrl.trim()) {
    return ''
  }

  try {
    return new URL(remoteUrl).hostname
  } catch {
    const sshHost = /^[^@]+@([^:/]+)[:/]/.exec(remoteUrl)

    return sshHost?.[1] ?? 'unknown'
  }
}

function formatTimestampForFileName(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[:.]/g, '-')
}
