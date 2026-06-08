import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadGitHubSyncCredentials,
  loadGitHubSyncSettings,
  saveGitHubSyncCredentials,
  saveGitHubSyncSettings,
} from './secureSyncCredentials'

const mockSecureStore = vi.hoisted(() => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))

vi.mock('expo-secure-store', () => mockSecureStore)

describe('secure sync credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores trimmed GitHub credentials in SecureStore', async () => {
    await saveGitHubSyncCredentials({
      token: '  ghp_secret  ',
      username: '  x-access-token  ',
    })

    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'journal.githubSyncCredentials.v1',
      JSON.stringify({
        token: 'ghp_secret',
        username: 'x-access-token',
      }),
    )
  })

  it('loads trimmed GitHub credentials and clears corrupt values', async () => {
    mockSecureStore.getItemAsync
      .mockResolvedValueOnce(JSON.stringify({
        token: '  ghp_secret  ',
        username: '  journal  ',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        token: '',
      }))

    await expect(loadGitHubSyncCredentials()).resolves.toEqual({
      token: 'ghp_secret',
      username: 'journal',
    })
    await expect(loadGitHubSyncCredentials()).resolves.toBeNull()
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(
      'journal.githubSyncCredentials.v1',
    )
  })

  it('stores and loads normalized repository settings', async () => {
    await saveGitHubSyncSettings({
      branch: '  ',
      remoteUrl: '  https://github.com/example/journal-sync.git  ',
    })

    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'journal.githubSyncSettings.v1',
      JSON.stringify({
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      }),
    )

    mockSecureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({
      branch: '  sync  ',
      remoteUrl: '  https://github.com/example/journal-sync.git  ',
    }))

    await expect(loadGitHubSyncSettings()).resolves.toEqual({
      branch: 'sync',
      remoteUrl: 'https://github.com/example/journal-sync.git',
    })
  })

  it('rejects repository URLs that include credentials', async () => {
    await expect(saveGitHubSyncSettings({
      branch: 'main',
      remoteUrl: 'https://token@github.com/example/journal-sync.git',
    })).rejects.toThrow('不能包含用户名或 token')

    mockSecureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({
      branch: 'main',
      remoteUrl: 'https://token@github.com/example/journal-sync.git',
    }))

    await expect(loadGitHubSyncSettings()).resolves.toBeNull()
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(
      'journal.githubSyncSettings.v1',
    )
  })
})
