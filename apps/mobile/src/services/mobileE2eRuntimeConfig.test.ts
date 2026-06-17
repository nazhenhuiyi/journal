import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendMobileE2eSuffix,
  isMobileE2eDebugLinkEnabled,
} from './e2eEnvironment'
import {
  loadMobileE2eRuntimeConfig,
  mobileE2eRuntimeConfigFileName,
} from './mobileE2eRuntimeConfig'

const mockFileSystem = vi.hoisted(() => ({
  documentDirectory: 'file:///app/',
  files: new Map<string, string>(),
  getInfoAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
}))

vi.mock('expo-file-system/legacy', () => mockFileSystem)

const configPath = `file:///app/${mobileE2eRuntimeConfigFileName}`

describe('mobile E2E runtime config', () => {
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
  })

  it('loads run id and debug fixture gate from the app sandbox', async () => {
    mockFileSystem.files.set(configPath, JSON.stringify({
      debugFixturesEnabled: true,
      runId: ' sync/run:1 ',
      version: 1,
    }))

    await expect(loadMobileE2eRuntimeConfig()).resolves.toEqual({
      debugFixturesEnabled: true,
      runId: ' sync/run:1 ',
    })

    expect(appendMobileE2eSuffix('journal.key')).toBe('journal.key.sync-run-1')
    expect(isMobileE2eDebugLinkEnabled()).toBe(true)
  })

  it('clears runtime config when the sandbox file is absent', async () => {
    mockFileSystem.files.set(configPath, JSON.stringify({
      debugFixturesEnabled: true,
      runId: 'first-run',
    }))
    await loadMobileE2eRuntimeConfig()
    mockFileSystem.files.clear()

    await loadMobileE2eRuntimeConfig()

    expect(appendMobileE2eSuffix('journal.key')).toBe('journal.key')
    expect(isMobileE2eDebugLinkEnabled()).toBe(false)
  })
})
