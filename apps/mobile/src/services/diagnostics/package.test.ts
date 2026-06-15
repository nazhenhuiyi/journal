import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncSnapshot } from '@journal/sync'

const mockFileSystem = vi.hoisted(() => ({
  StorageAccessFramework: {
    createFileAsync: vi.fn(),
    requestDirectoryPermissionsAsync: vi.fn(),
    writeAsStringAsync: vi.fn(),
  },
  deleteAsync: vi.fn(),
  documentDirectory: 'file:///app/',
  files: new Map<string, string>(),
  getInfoAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  readDirectoryAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
}))

vi.mock('expo-file-system/legacy', () => mockFileSystem)

describe('mobile diagnostic package', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T08:09:10.000Z'))
    vi.clearAllMocks()
    mockFileSystem.files.clear()

    mockFileSystem.getInfoAsync.mockImplementation(async (path: string) => {
      const content = mockFileSystem.files.get(path)

      return content === undefined
        ? { exists: false, isDirectory: false }
        : { exists: true, isDirectory: false, size: content.length }
    })
    mockFileSystem.makeDirectoryAsync.mockResolvedValue(undefined)
    mockFileSystem.readAsStringAsync.mockImplementation(async (path: string) => {
      const content = mockFileSystem.files.get(path)

      if (content === undefined) {
        throw new Error(`Missing file: ${path}`)
      }

      return content
    })
    mockFileSystem.readDirectoryAsync.mockImplementation(async (path: string) => {
      if (path === 'file:///app/journal-diagnostic-logs/') {
        return ['journal-mobile-2026-06-14.jsonl', 'notes.txt']
      }

      return []
    })
    mockFileSystem.writeAsStringAsync.mockImplementation(async (path: string, contents: string) => {
      mockFileSystem.files.set(path, contents)
    })
    mockFileSystem.StorageAccessFramework.createFileAsync.mockResolvedValue('content://diagnostics/package')
    mockFileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync.mockResolvedValue({
      directoryUri: 'content://downloads',
      granted: true,
    })
    mockFileSystem.StorageAccessFramework.writeAsStringAsync.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a sanitized diagnostic package without journal content or credentials', async () => {
    const { createMobileDiagnosticPackage } = await import('./package')

    mockFileSystem.files.set(
      'file:///app/journal-diagnostic-logs/journal-mobile-2026-06-14.jsonl',
      '{"message":"sync failed","details":{"token":"ghp_12345678901234567890","body":"not journal body"}}\n',
    )

    const result = await createMobileDiagnosticPackage({
      paths: createPaths(),
      sync: {
        branch: 'main',
        hasStoredSyncToken: true,
        remoteUrl: 'https://token@github.com/example/private-journal.git',
        snapshot: createSnapshot({
          lastError: 'Authorization: Bearer ghp_12345678901234567890',
          status: 'error',
        }),
      },
      today: '2026-06-15',
    })
    const parsed = JSON.parse(result.contents) as {
      logs: { files: Array<{ contents: string }> }
      sync: {
        remoteHost: string
        snapshot: { lastError: string }
      }
    }

    expect(result.fileName).toBe('journal-diagnostics-2026-06-15T08-09-10Z.json')
    expect(result.filePath).toBe('file:///app/journal-diagnostic-packages/journal-diagnostics-2026-06-15T08-09-10Z.json')
    expect(parsed.sync.remoteHost).toBe('github.com')
    expect(parsed.sync.snapshot.lastError).toBe('Authorization: [redacted]')
    expect(result.contents).not.toContain('ghp_12345678901234567890')
    expect(result.contents).not.toContain('token@github.com')
    expect(result.contents).not.toContain('not journal body')
    expect(parsed.logs.files[0].contents).toContain('[redacted]')
  })

  it('saves a generated diagnostic package to an Android SAF directory', async () => {
    const {
      saveMobileDiagnosticPackageToAndroidDirectory,
    } = await import('./package')

    const result = await saveMobileDiagnosticPackageToAndroidDirectory({
      contents: '{"schemaVersion":1}\n',
      fileName: 'journal-diagnostics-2026-06-15T08-09-10Z.json',
      filePath: 'file:///app/journal-diagnostic-packages/journal-diagnostics-2026-06-15T08-09-10Z.json',
      includedLogBytes: 0,
      includedLogFileCount: 0,
      truncatedLogs: false,
    })

    expect(result).toEqual({
      fileName: 'journal-diagnostics-2026-06-15T08-09-10Z.json',
      status: 'saved',
      uri: 'content://diagnostics/package',
    })
    expect(mockFileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
      'content://downloads',
      'journal-diagnostics-2026-06-15T08-09-10Z',
      'application/json',
    )
    expect(mockFileSystem.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledWith(
      'content://diagnostics/package',
      '{"schemaVersion":1}\n',
    )
  })
})

function createSnapshot(input: Partial<SyncSnapshot> = {}): SyncSnapshot {
  return {
    lastError: null,
    lastSyncedAt: null,
    pendingReason: null,
    status: 'idle',
    ...input,
  }
}

function createPaths() {
  return {
    adbLogDirectory: 'files/journal-diagnostic-logs',
    diagnosticLogDirectory: 'file:///app/journal-diagnostic-logs/',
    diagnosticPackageDirectory: 'file:///app/journal-diagnostic-packages/',
    todayEntryPath: 'file:///app/journal-worktree/entries/2026/06/2026-06-15.md',
    uiSettingsStorage: 'SecureStore: journal.mobileUiSettings.v1',
    worktreeDirectory: 'file:///app/journal-worktree/',
  }
}
