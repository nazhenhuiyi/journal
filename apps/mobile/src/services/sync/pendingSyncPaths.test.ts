import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadPendingMobileSyncPaths,
  savePendingMobileSyncPaths,
} from './pendingSyncPaths'

const mockFileSystem = vi.hoisted(() => ({
  documentDirectory: 'file:///app/',
  files: new Map<string, string>(),
  getInfoAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
}))

vi.mock('expo-file-system/legacy', () => mockFileSystem)

const pendingPath = 'file:///app/journal-mobile-sync-pending-paths.json'

describe('pendingSyncPaths', () => {
  beforeEach(() => {
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', '')
    vi.clearAllMocks()
    mockFileSystem.files.clear()
    mockFileSystem.getInfoAsync.mockImplementation(async (path: string) => ({
      exists: mockFileSystem.files.has(path),
      isDirectory: false,
      modificationTime: 0,
      size: mockFileSystem.files.get(path)?.length ?? 0,
      uri: path,
    }))
    mockFileSystem.readAsStringAsync.mockImplementation(async (path: string) => {
      const content = mockFileSystem.files.get(path)

      if (content === undefined) {
        throw new Error(`Missing test file: ${path}`)
      }

      return content
    })
    mockFileSystem.writeAsStringAsync.mockImplementation(async (path: string, content: string) => {
      mockFileSystem.files.set(path, content)
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('persists safe pending sync paths outside the worktree', async () => {
    await savePendingMobileSyncPaths([
      'entries/2026/06/2026-06-08.md',
      'entries/2026/06/2026-06-08.md',
      'entries/2026/06/2026-06-08.md.tmp',
      '../manifest.json',
      'media/2026/06/photo.jpg',
      'reviews/2026/06/2026-06-10.json',
      'reviews/2026/06/2026-06-10.json.tmp',
    ])

    await expect(loadPendingMobileSyncPaths()).resolves.toEqual([
      'entries/2026/06/2026-06-08.md',
      'media/2026/06/photo.jpg',
      'reviews/2026/06/2026-06-10.json',
    ])
    expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      pendingPath,
      expect.stringContaining('"version":1'),
    )
  })
})
