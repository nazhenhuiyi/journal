import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  let lastCoordinator: MockJournalSyncCoordinator | null = null
  let coordinatorOptions: {
    onSnapshot?: (snapshot: {
      lastError: string | null
      lastSyncedAt: string | null
      pendingReason: string | null
      status: string
    }) => void
    runOperation: (request: {
      changedPaths?: readonly string[]
      operation: 'full' | 'pull' | 'push'
      trigger: string
    }) => Promise<{
      changed?: boolean
      message?: string
      needsAuth?: boolean
      skipped?: boolean
    }>
  } | null = null

  class MockJournalSyncCoordinator {
    flushBeforeLeave = vi.fn(async () => true)
    hasPendingLocalChanges = vi.fn(() => false)
    markDirtyWorktree = vi.fn()
    markLocalSave = vi.fn()
    notifyForeground = vi.fn()
    recordPendingChangedPaths = vi.fn()
    startPulling = vi.fn()
    stopPulling = vi.fn()

    constructor(options: NonNullable<typeof coordinatorOptions>) {
      coordinatorOptions = options
      lastCoordinator = this
    }

    syncNow = vi.fn(async () => {
      if (!coordinatorOptions) {
        throw new Error('Coordinator options were not captured.')
      }

      const result = await coordinatorOptions.runOperation({
        operation: 'full',
        trigger: 'manual',
      })
      const snapshot = {
        lastError: result.message ?? null,
        lastSyncedAt: '2026-06-14T12:00:00.000Z',
        pendingReason: null,
        status: result.needsAuth ? 'needs-auth' : 'synced',
      }

      coordinatorOptions.onSnapshot?.(snapshot)

      return snapshot
    })
  }

  return {
    MockJournalSyncCoordinator,
    mockGetMobileGitSyncStatus: vi.fn(),
    mockLoadGitHubSyncCredentials: vi.fn(),
    mockLoadGitHubSyncSettings: vi.fn(),
    mockLoadPendingMobileSyncPaths: vi.fn(),
    mockPullMobileJournalUpdatesFromGitHub: vi.fn(),
    mockSaveGitHubSyncCredentials: vi.fn(),
    mockSaveGitHubSyncSettings: vi.fn(),
    mockSavePendingMobileSyncPaths: vi.fn(),
    mockSyncMobileJournalWithGitHub: vi.fn(),
    getCoordinator: () => lastCoordinator,
    runOperation: (request: {
      changedPaths?: readonly string[]
      operation: 'full' | 'pull' | 'push'
      trigger: string
    }) => {
      if (!coordinatorOptions) {
        throw new Error('Coordinator options were not captured.')
      }

      return coordinatorOptions.runOperation(request)
    },
    resetCoordinator: () => {
      coordinatorOptions = null
      lastCoordinator = null
    },
  }
})

vi.mock('@journal/sync', () => ({
  JournalSyncCoordinator: mocks.MockJournalSyncCoordinator,
}))

vi.mock('./mobileGitSync', () => ({
  getMobileGitSyncStatus: mocks.mockGetMobileGitSyncStatus,
  pullMobileJournalUpdatesFromGitHub: mocks.mockPullMobileJournalUpdatesFromGitHub,
  syncMobileJournalWithGitHub: mocks.mockSyncMobileJournalWithGitHub,
}))

vi.mock('./mobileSyncTrace', () => ({
  createMobileSyncTrace: vi.fn(() => undefined),
}))

vi.mock('./pendingSyncPaths', () => ({
  loadPendingMobileSyncPaths: mocks.mockLoadPendingMobileSyncPaths,
  savePendingMobileSyncPaths: mocks.mockSavePendingMobileSyncPaths,
}))

vi.mock('./secureSyncCredentials', () => ({
  loadGitHubSyncCredentials: mocks.mockLoadGitHubSyncCredentials,
  loadGitHubSyncSettings: mocks.mockLoadGitHubSyncSettings,
  saveGitHubSyncCredentials: mocks.mockSaveGitHubSyncCredentials,
  saveGitHubSyncSettings: mocks.mockSaveGitHubSyncSettings,
}))

vi.mock('../e2eEnvironment', () => ({
  getMobileE2eSyncConfiguration: vi.fn(() => null),
}))

describe('mobile sync manager', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.resetCoordinator()

    mocks.mockGetMobileGitSyncStatus.mockResolvedValue({
      branch: 'main',
      dirtyPaths: [],
      hasCredentials: true,
      hasRepository: true,
      recentCommits: [],
      remoteUrl: 'https://github.com/example/journal-sync.git',
      worktreeDirectory: '/mobile/worktree',
    })
    mocks.mockLoadGitHubSyncCredentials.mockResolvedValue({
      credentials: {
        token: 'stored-token',
      },
      status: 'available',
    })
    mocks.mockLoadGitHubSyncSettings.mockResolvedValue({
      settings: {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      status: 'available',
    })
    mocks.mockLoadPendingMobileSyncPaths.mockResolvedValue([])
    mocks.mockPullMobileJournalUpdatesFromGitHub.mockResolvedValue({
      dirtyPathsAfterPull: [],
      fetchResult: null,
      mergeCommitOid: null,
      mergeResult: null,
      updatedWorktree: false,
    })
    mocks.mockSaveGitHubSyncCredentials.mockResolvedValue(undefined)
    mocks.mockSaveGitHubSyncSettings.mockResolvedValue(undefined)
    mocks.mockSavePendingMobileSyncPaths.mockResolvedValue(undefined)
    mocks.mockSyncMobileJournalWithGitHub.mockResolvedValue({
      dirtyPathsAfterSync: [],
      fetchResult: null,
      localCommitOid: null,
      mergeCommitOid: null,
      mergeResult: null,
      pushResult: null,
      retriedPush: false,
    })
  })

  it('passes an empty trusted changed path set for clean manual sync', async () => {
    const { mobileSyncManager } = await import('./mobileSyncManager')
    const binding = createRuntimeBinding('saved')

    mobileSyncManager.setSyncRemoteUrl('https://github.com/example/journal-sync.git')
    mobileSyncManager.setSyncTokenDraft('runtime-token')
    mobileSyncManager.bindJournalRuntime(binding)

    const result = await mobileSyncManager.syncNow()

    expect(result.ok).toBe(true)
    expect(binding.saveCurrentJournal).not.toHaveBeenCalled()
    expect(mocks.mockSyncMobileJournalWithGitHub).toHaveBeenCalledWith(
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      undefined,
      expect.objectContaining({
        changedPaths: [],
        collectDirtyPathsAfterSync: false,
        skipDirtyCheckBeforeMerge: true,
      }),
    )
    expect(mocks.mockGetMobileGitSyncStatus).toHaveBeenCalledWith(
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      expect.objectContaining({
        includeDirtyPaths: false,
        includeRecentCommits: false,
      }),
    )
    const coordinator = mocks.getCoordinator()

    if (!coordinator) {
      throw new Error('Expected coordinator to be created.')
    }

    expect(coordinator.stopPulling).toHaveBeenCalledTimes(1)
    expect(coordinator.stopPulling.mock.invocationCallOrder[0]).toBeLessThan(
      coordinator.syncNow.mock.invocationCallOrder[0],
    )
    expect(coordinator.startPulling).toHaveBeenCalledWith({
      immediate: false,
    })
    expect(coordinator.syncNow.mock.invocationCallOrder[0]).toBeLessThan(
      coordinator.startPulling.mock.invocationCallOrder[0],
    )
  })

  it('restarts the pull interval after a failed manual sync', async () => {
    mocks.mockSyncMobileJournalWithGitHub.mockRejectedValueOnce(new Error('network down'))

    const { mobileSyncManager } = await import('./mobileSyncManager')
    const binding = createRuntimeBinding('saved')

    mobileSyncManager.setSyncRemoteUrl('https://github.com/example/journal-sync.git')
    mobileSyncManager.setSyncTokenDraft('runtime-token')
    mobileSyncManager.bindJournalRuntime(binding)

    const result = await mobileSyncManager.syncNow()
    const coordinator = mocks.getCoordinator()

    if (!coordinator) {
      throw new Error('Expected coordinator to be created.')
    }

    expect(result.ok).toBe(false)
    expect(coordinator.stopPulling).toHaveBeenCalledTimes(1)
    expect(coordinator.startPulling).toHaveBeenCalledWith({
      immediate: false,
    })
  })

  it('skips pull checks while local changes are pending', async () => {
    const { mobileSyncManager } = await import('./mobileSyncManager')

    await mobileSyncManager.initialize()

    const coordinator = mocks.getCoordinator()

    if (!coordinator) {
      throw new Error('Expected coordinator to be created.')
    }

    coordinator.hasPendingLocalChanges.mockReturnValue(true)

    const result = await mocks.runOperation({
      operation: 'pull',
      trigger: 'pull-interval',
    })

    expect(result).toEqual({
      message: '本地更改等待同步，稍后检查远端更新',
      skipped: true,
    })
    expect(mocks.mockPullMobileJournalUpdatesFromGitHub).not.toHaveBeenCalled()
  })

  it('keeps full dirty collection when no journal runtime is bound', async () => {
    const { mobileSyncManager } = await import('./mobileSyncManager')

    mobileSyncManager.setSyncRemoteUrl('https://github.com/example/journal-sync.git')
    mobileSyncManager.setSyncTokenDraft('runtime-token')

    const result = await mobileSyncManager.syncNow()

    expect(result.ok).toBe(true)
    expect(mocks.mockSyncMobileJournalWithGitHub).toHaveBeenCalledWith(
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      undefined,
      expect.objectContaining({
        changedPaths: undefined,
        collectDirtyPathsAfterSync: true,
        skipDirtyCheckBeforeMerge: false,
      }),
    )
  })
})

type TestSaveState = 'dirty' | 'idle' | 'loading' | 'saving' | 'saved' | 'error'

function createRuntimeBinding(saveState: TestSaveState) {
  return {
    getSaveState: vi.fn(() => saveState),
    isInputUnstable: vi.fn(() => false),
    onRemoteUpdatesApplied: vi.fn(),
    refreshAfterJournalSaved: vi.fn(async ({ record }: {
      record: {
        changedPaths: readonly string[]
      }
    }) => record.changedPaths),
    reloadTodayFromDisk: vi.fn(async () => undefined),
    reloadTodayFromDiskIfChanged: vi.fn(async () => false),
    saveCurrentJournal: vi.fn(),
  }
}
