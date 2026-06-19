import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  type MockSyncBlock = {
    message: string
    paths?: string[]
    reason: string
    retryAfterMs?: number
  }
  type MockSyncSnapshot = {
    block: MockSyncBlock | null
    lastError: string | null
    lastSyncedAt: string | null
    pendingReason: string | null
    status: string
  }

  let lastCoordinator: MockJournalSyncCoordinator | null = null
  let coordinatorOptions: {
    onSnapshot?: (snapshot: MockSyncSnapshot) => void
    pullIntervalMs?: number
    runOperation: (request: {
      changedPaths?: readonly string[]
      operation: 'full' | 'pull' | 'push'
      trigger: string
    }) => Promise<{
      block?: MockSyncBlock | null
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
    restoreSnapshot = vi.fn()
    startPulling = vi.fn()
    stopPulling = vi.fn()

    constructor(options: NonNullable<typeof coordinatorOptions>) {
      coordinatorOptions = options
      // Test harness needs access to the coordinator instance created by the manager.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      lastCoordinator = this
    }

    syncNow = vi.fn(async (): Promise<MockSyncSnapshot> => {
      if (!coordinatorOptions) {
        throw new Error('Coordinator options were not captured.')
      }

      const result = await coordinatorOptions.runOperation({
        operation: 'full',
        trigger: 'manual',
      })
      const snapshot: MockSyncSnapshot = {
        block: result.block ?? null,
        lastError: result.message ?? null,
        lastSyncedAt: '2026-06-14T12:00:00.000Z',
        pendingReason: null,
        status: result.block ? 'blocked' : result.needsAuth ? 'needs-auth' : 'synced',
      }

      coordinatorOptions.onSnapshot?.(snapshot)

      return snapshot
    })
  }

  return {
    MockJournalSyncCoordinator,
    mockGetJournalGitAuthenticationErrorMessage: vi.fn(),
    mockCommitMobileJournalChanges: vi.fn(),
    mockGetMobileGitSyncStatus: vi.fn(),
    mockLoadGitHubSyncCredentials: vi.fn(),
    mockLoadGitHubSyncSettings: vi.fn(),
    mockLoadMobileSyncSnapshot: vi.fn(),
    mockLoadPendingMobileSyncPaths: vi.fn(),
    mockPullMobileJournalUpdatesFromGitHub: vi.fn(),
    mockResolveMobileJournalSyncConflict: vi.fn(),
    mockSaveGitHubSyncCredentials: vi.fn(),
    mockSaveGitHubSyncSettings: vi.fn(),
    mockSaveDailyJournal: vi.fn(),
    mockSaveMobileSyncSnapshot: vi.fn(),
    mockSavePendingMobileSyncPaths: vi.fn(),
    mockSyncMobileJournalWithGitHub: vi.fn(),
    getCoordinator: () => lastCoordinator,
    getCoordinatorOptions: () => coordinatorOptions,
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
  createSyncSnapshotPersistenceIdentity: (input: {
    branch?: string | null
    remoteUrl?: string | null
  }) => ({
    branch: input.branch?.trim() || 'main',
    remoteUrl: input.remoteUrl?.trim() ?? '',
  }),
  getDefaultSyncSnapshot: () => ({
    block: null,
    lastError: null,
    lastSyncedAt: null,
    pendingReason: null,
    status: 'idle',
  }),
  getJournalGitAuthenticationErrorMessage: mocks.mockGetJournalGitAuthenticationErrorMessage,
  JournalSyncCoordinator: mocks.MockJournalSyncCoordinator,
  shouldPersistSyncSnapshot: (snapshot: {
    lastSyncedAt: string | null
    status: string
  }) => snapshot.status !== 'idle' || Boolean(snapshot.lastSyncedAt),
}))

vi.mock('./mobileGitSync', () => ({
  commitMobileJournalChanges: mocks.mockCommitMobileJournalChanges,
  getMobileGitSyncStatus: mocks.mockGetMobileGitSyncStatus,
  pullMobileJournalUpdatesFromGitHub: mocks.mockPullMobileJournalUpdatesFromGitHub,
  resolveMobileJournalSyncConflict: mocks.mockResolveMobileJournalSyncConflict,
  syncMobileJournalWithGitHub: mocks.mockSyncMobileJournalWithGitHub,
}))

vi.mock('./mobileSyncTrace', () => ({
  createMobileSyncTrace: vi.fn(() => undefined),
}))

vi.mock('../diagnostics/log', () => ({
  mobileDiagnosticLog: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('../mobileJournalStore', () => ({
  saveDailyJournal: mocks.mockSaveDailyJournal,
}))

vi.mock('./pendingSyncPaths', () => ({
  loadPendingMobileSyncPaths: mocks.mockLoadPendingMobileSyncPaths,
  savePendingMobileSyncPaths: mocks.mockSavePendingMobileSyncPaths,
}))

vi.mock('./mobileSyncState', () => ({
  loadMobileSyncSnapshot: mocks.mockLoadMobileSyncSnapshot,
  saveMobileSyncSnapshot: mocks.mockSaveMobileSyncSnapshot,
}))

vi.mock('./secureSyncCredentials', () => ({
  loadGitHubSyncCredentials: mocks.mockLoadGitHubSyncCredentials,
  loadGitHubSyncSettings: mocks.mockLoadGitHubSyncSettings,
  saveGitHubSyncCredentials: mocks.mockSaveGitHubSyncCredentials,
  saveGitHubSyncSettings: mocks.mockSaveGitHubSyncSettings,
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
    mocks.mockLoadMobileSyncSnapshot.mockResolvedValue(null)
    mocks.mockGetJournalGitAuthenticationErrorMessage.mockReturnValue(null)
    mocks.mockPullMobileJournalUpdatesFromGitHub.mockResolvedValue({
      dirtyPathsAfterPull: [],
      fetchResult: null,
      mergeCommitOid: null,
      mergeResult: null,
      updatedWorktree: false,
    })
    mocks.mockSaveGitHubSyncCredentials.mockResolvedValue(undefined)
    mocks.mockSaveGitHubSyncSettings.mockResolvedValue(undefined)
    mocks.mockSaveDailyJournal.mockResolvedValue({
      changedPaths: ['entries/2026/06/2026-06-17.md'],
      didWrite: true,
    })
    mocks.mockSaveMobileSyncSnapshot.mockResolvedValue(undefined)
    mocks.mockSavePendingMobileSyncPaths.mockResolvedValue(undefined)
    mocks.mockCommitMobileJournalChanges.mockResolvedValue('local-fixture-commit')
    mocks.mockResolveMobileJournalSyncConflict.mockResolvedValue({
      localCommitOid: 'resolution-head',
      pushResult: {
        error: null,
        ok: true,
        refs: {},
      },
      strategy: 'keep-local',
      updatedWorktree: false,
    })
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

  it('configures foreground automatic pulls every 90 seconds', async () => {
    await import('./mobileSyncManager')

    expect(mocks.getCoordinatorOptions()?.pullIntervalMs).toBe(90_000)
  })

  it('stops automatic pulls before flushing while leaving the app', async () => {
    const { mobileSyncManager } = await import('./mobileSyncManager')
    const binding = createRuntimeBinding('saved')

    mobileSyncManager.bindJournalRuntime(binding)

    await mobileSyncManager.flushBeforeLeave()

    const coordinator = mocks.getCoordinator()

    if (!coordinator) {
      throw new Error('Expected coordinator to be created.')
    }

    expect(coordinator.stopPulling).toHaveBeenCalledTimes(1)
    expect(coordinator.stopPulling.mock.invocationCallOrder[0]).toBeLessThan(
      coordinator.flushBeforeLeave.mock.invocationCallOrder[0],
    )
  })

  it('restarts automatic pulls and checks foreground updates on resume', async () => {
    const { mobileSyncManager } = await import('./mobileSyncManager')

    await mobileSyncManager.initialize()

    const coordinator = mocks.getCoordinator()

    if (!coordinator) {
      throw new Error('Expected coordinator to be created.')
    }

    coordinator.startPulling.mockClear()
    coordinator.notifyForeground.mockClear()

    await mobileSyncManager.resume()

    expect(coordinator.startPulling).toHaveBeenCalledWith({
      immediate: false,
    })
    expect(coordinator.notifyForeground).toHaveBeenCalledTimes(1)
    expect(coordinator.startPulling.mock.invocationCallOrder[0]).toBeLessThan(
      coordinator.notifyForeground.mock.invocationCallOrder[0],
    )
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

  it('reports blocked manual sync results without treating them as success', async () => {
    const { mobileSyncManager } = await import('./mobileSyncManager')
    const coordinator = mocks.getCoordinator()

    if (!coordinator) {
      throw new Error('Expected coordinator to be created.')
    }

    coordinator.syncNow.mockResolvedValueOnce({
      block: {
        message: '首次同步前需要选择方向。',
        reason: 'first-sync-needs-choice',
      },
      lastError: '首次同步前需要选择方向。',
      lastSyncedAt: null,
      pendingReason: null,
      status: 'blocked',
    })

    mobileSyncManager.setSyncRemoteUrl('https://github.com/example/journal-sync.git')
    mobileSyncManager.setSyncTokenDraft('runtime-token')

    const result = await mobileSyncManager.syncNow()

    expect(result).toMatchObject({
      alertMessage: '首次同步前需要选择方向。',
      alertTitle: '同步受阻',
      ok: false,
    })
    expect(mocks.mockGetMobileGitSyncStatus).not.toHaveBeenCalled()
  })

  it('creates a debug content-conflict blocked snapshot for E2E fixtures', async () => {
    const { mobileSyncManager } = await import('./mobileSyncManager')
    const coordinator = mocks.getCoordinator()

    mobileSyncManager.showDebugBlockedSnapshot('content-conflict')

    expect(coordinator?.stopPulling).toHaveBeenCalledTimes(1)
    expect(mobileSyncManager.getState().syncSnapshot).toMatchObject({
      block: {
        conflicts: [
          {
            ours: '本机段落：移动端 blocked 验收。',
            path: 'entries/2026/06/2026-06-16.md',
            theirs: '远端段落：GitHub 同段修改。',
          },
        ],
        paths: [
          'entries/2026/06/2026-06-16.md',
          'reviews/2026/06/2026-06-16.json',
        ],
        reason: 'content-conflict',
      },
      status: 'blocked',
    })
  })

  it('prepares a debug sync conflict fixture with a committed local side', async () => {
    const { mobileSyncManager } = await import('./mobileSyncManager')

    await mobileSyncManager.initialize()

    const coordinator = mocks.getCoordinator()

    coordinator?.startPulling.mockClear()
    coordinator?.stopPulling.mockClear()

    const result = await mobileSyncManager.prepareDebugSyncConflictFixture({
      date: '2026-06-17',
      localText: 'local conflict text',
    })

    expect(result).toEqual({ ok: true })
    expect(coordinator?.stopPulling).toHaveBeenCalled()
    expect(mocks.mockSyncMobileJournalWithGitHub).toHaveBeenCalledWith(
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      undefined,
      expect.objectContaining({
        changedPaths: [],
        firstSyncLocalContent: 'empty',
      }),
    )
    expect(mocks.mockSaveDailyJournal).toHaveBeenCalledWith({
      date: '2026-06-17',
      longEntryMarkdown: 'local conflict text',
      murmurs: [],
    })
    expect(mocks.mockCommitMobileJournalChanges).toHaveBeenCalledWith(
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      'Prepare mobile sync conflict local side',
      expect.objectContaining({
        changedPaths: ['entries/2026/06/2026-06-17.md'],
      }),
    )
    expect(coordinator?.startPulling).not.toHaveBeenCalled()
    expect(mobileSyncManager.getState()).toMatchObject({
      hasStoredSyncToken: true,
      syncBranch: 'main',
      syncMessage: '冲突环境已准备',
      syncRemoteUrl: 'https://github.com/example/journal-sync.git',
      syncSnapshot: {
        pendingReason: 'local-save',
        status: 'pending',
      },
    })
  })

  it('resolves restored content conflict blocks through the mobile git adapter', async () => {
    mocks.mockLoadMobileSyncSnapshot.mockResolvedValueOnce({
      block: {
        message: '日记内容存在需要人工处理的合并冲突。',
        paths: ['entries/2026/06/2026-06-08.md'],
        reason: 'content-conflict',
      },
      lastError: '日记内容存在需要人工处理的合并冲突。',
      lastSyncedAt: null,
      pendingReason: null,
      status: 'blocked',
    })

    const { mobileSyncManager } = await import('./mobileSyncManager')

    await mobileSyncManager.initialize()

    const result = await mobileSyncManager.resolveConflict('keep-local')

    expect(result).toEqual({ ok: true })
    expect(mocks.mockResolveMobileJournalSyncConflict).toHaveBeenCalledWith(
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      { strategy: 'keep-local' },
    )
    expect(mobileSyncManager.getState().syncSnapshot).toMatchObject({
      block: null,
      status: 'synced',
    })
    expect(mobileSyncManager.getState().syncMessage).toBe('已保留本机内容')
  })

  it('passes keep-both conflict resolution through the mobile git adapter', async () => {
    mocks.mockLoadMobileSyncSnapshot.mockResolvedValueOnce({
      block: {
        message: '本机和远端改到了同一段内容，同步已暂停。',
        paths: ['entries/2026/06/2026-06-08.md'],
        reason: 'content-conflict',
      },
      lastError: '本机和远端改到了同一段内容，同步已暂停。',
      lastSyncedAt: null,
      pendingReason: null,
      status: 'blocked',
    })
    mocks.mockResolveMobileJournalSyncConflict.mockResolvedValueOnce({
      localCommitOid: 'both-resolution-head',
      pushResult: {
        error: null,
        ok: true,
        refs: {},
      },
      strategy: 'keep-both',
      updatedWorktree: true,
    })

    const { mobileSyncManager } = await import('./mobileSyncManager')

    await mobileSyncManager.initialize()

    const result = await mobileSyncManager.resolveConflict('keep-both')

    expect(result).toEqual({ ok: true })
    expect(mocks.mockResolveMobileJournalSyncConflict).toHaveBeenCalledWith(
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      { strategy: 'keep-both' },
    )
    expect(mobileSyncManager.getState().syncSnapshot).toMatchObject({
      block: null,
      status: 'synced',
    })
    expect(mobileSyncManager.getState().syncMessage).toBe('已保留两边内容')
  })

  it('marks remote authentication failures as needing auth', async () => {
    const authError = Object.assign(new Error('HTTP Error: 401 Unauthorized'), {
      data: {
        statusCode: 401,
      },
    })

    mocks.mockSyncMobileJournalWithGitHub.mockRejectedValueOnce(authError)
    mocks.mockGetJournalGitAuthenticationErrorMessage.mockReturnValueOnce('GitHub token 无效或已过期，请重新保存 token。')

    const { mobileSyncManager } = await import('./mobileSyncManager')

    mobileSyncManager.setSyncRemoteUrl('https://github.com/example/journal-sync.git')
    mobileSyncManager.setSyncTokenDraft('runtime-token')

    const result = await mobileSyncManager.syncNow()

    expect(result).toMatchObject({
      alertMessage: 'GitHub token 无效或已过期，请重新保存 token。',
      ok: false,
    })
    expect(mobileSyncManager.getState().syncSnapshot).toMatchObject({
      lastError: 'GitHub token 无效或已过期，请重新保存 token。',
      status: 'needs-auth',
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

  it('restores persisted sync state on initialize', async () => {
    mocks.mockLoadMobileSyncSnapshot.mockResolvedValueOnce({
      lastError: null,
      lastSyncedAt: '2026-06-14T12:00:00.000Z',
      pendingReason: null,
      status: 'synced',
    })

    const { mobileSyncManager } = await import('./mobileSyncManager')

    await mobileSyncManager.initialize()

    expect(mocks.mockLoadMobileSyncSnapshot).toHaveBeenCalledWith({
      branch: 'main',
      remoteUrl: 'https://github.com/example/journal-sync.git',
    })
    expect(mobileSyncManager.getState().syncSnapshot).toMatchObject({
      lastSyncedAt: '2026-06-14T12:00:00.000Z',
      status: 'synced',
    })
  })

  it('restores persisted error state and pending paths on initialize', async () => {
    mocks.mockLoadMobileSyncSnapshot.mockResolvedValueOnce({
      lastError: 'network down',
      lastSyncedAt: '2026-06-14T12:00:00.000Z',
      pendingReason: 'retry',
      status: 'retrying',
    })
    mocks.mockLoadPendingMobileSyncPaths.mockResolvedValueOnce([
      'content/days/2026-06-14.md',
    ])

    const { mobileSyncManager } = await import('./mobileSyncManager')

    await mobileSyncManager.initialize()

    expect(mobileSyncManager.getState().syncSnapshot).toMatchObject({
      lastError: 'network down',
      lastSyncedAt: '2026-06-14T12:00:00.000Z',
      pendingReason: 'retry',
      status: 'retrying',
    })
    expect(mocks.getCoordinator()?.markDirtyWorktree).toHaveBeenCalledWith([
      'content/days/2026-06-14.md',
    ])
  })

  it('persists successful sync snapshots', async () => {
    const { mobileSyncManager } = await import('./mobileSyncManager')

    mobileSyncManager.setSyncRemoteUrl('https://github.com/example/journal-sync.git')
    mobileSyncManager.setSyncTokenDraft('runtime-token')

    const result = await mobileSyncManager.syncNow()

    expect(result.ok).toBe(true)
    expect(mocks.mockSaveMobileSyncSnapshot).toHaveBeenCalledWith({
      identity: {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      snapshot: expect.objectContaining({
        lastSyncedAt: '2026-06-14T12:00:00.000Z',
        status: 'synced',
      }),
    })
  })

  it('clears a restored error after a successful sync', async () => {
    mocks.mockLoadMobileSyncSnapshot.mockResolvedValueOnce({
      lastError: 'network down',
      lastSyncedAt: '2026-06-14T11:00:00.000Z',
      pendingReason: 'retry',
      status: 'retrying',
    })

    const { mobileSyncManager } = await import('./mobileSyncManager')

    await mobileSyncManager.initialize()
    const result = await mobileSyncManager.syncNow()

    expect(result.ok).toBe(true)
    expect(mobileSyncManager.getState().syncSnapshot).toMatchObject({
      lastError: null,
      lastSyncedAt: '2026-06-14T12:00:00.000Z',
      pendingReason: null,
      status: 'synced',
    })
  })

  it('does not carry an old sync time when the remote changes', async () => {
    mocks.mockLoadMobileSyncSnapshot.mockResolvedValueOnce({
      lastError: null,
      lastSyncedAt: '2026-06-14T12:00:00.000Z',
      pendingReason: null,
      status: 'synced',
    })

    const { mobileSyncManager } = await import('./mobileSyncManager')

    await mobileSyncManager.initialize()
    mobileSyncManager.setSyncRemoteUrl('https://github.com/example/other.git')
    mobileSyncManager.setSyncTokenDraft('runtime-token')

    await mobileSyncManager.saveConfiguration()

    expect(mobileSyncManager.getState().syncSnapshot).toMatchObject({
      lastSyncedAt: null,
      status: 'idle',
    })
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
