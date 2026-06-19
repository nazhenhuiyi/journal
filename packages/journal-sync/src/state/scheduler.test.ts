import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JournalSyncCoordinator, type SyncOperationRequest, type SyncOperationResult } from './scheduler'
import { createJournalSyncBlockedError } from './syncBlock'

describe('JournalSyncCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-08T10:00:00.000Z'))
  })

  it('debounces many local saves into one push', async () => {
    const runOperation = vi.fn(async () => ({}))
    const coordinator = new JournalSyncCoordinator({
      pushDebounceMs: 20_000,
      runOperation,
    })

    for (let index = 0; index < 10; index += 1) {
      coordinator.markLocalSave()
      await vi.advanceTimersByTimeAsync(1_000)
    }

    expect(runOperation).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(20_000)

    expect(runOperation).toHaveBeenCalledTimes(1)
    expect(runOperation).toHaveBeenCalledWith({
      operation: 'push',
      trigger: 'save-idle',
    })
  })

  it('passes pending changed paths to the debounced push', async () => {
    const pendingSnapshots: string[][] = []
    const runOperation = vi.fn(async () => ({}))
    const coordinator = new JournalSyncCoordinator({
      onPendingChangedPathsChange: (paths) => pendingSnapshots.push([...paths]),
      pushDebounceMs: 20_000,
      runOperation,
    })

    coordinator.markLocalSave(['entries/2026/06/2026-06-08.md'])
    coordinator.markLocalSave(['entries/2026/06/2026-06-09.md'])

    await vi.advanceTimersByTimeAsync(20_000)

    expect(runOperation).toHaveBeenCalledWith({
      changedPaths: [
        'entries/2026/06/2026-06-08.md',
        'entries/2026/06/2026-06-09.md',
      ],
      operation: 'push',
      trigger: 'save-idle',
    })
    expect(pendingSnapshots[pendingSnapshots.length - 1]).toEqual([])
  })

  it('passes an explicit empty changed path set to a clean manual full sync', async () => {
    const runOperation = vi.fn(async () => ({}))
    const coordinator = new JournalSyncCoordinator({
      runOperation,
    })

    await coordinator.syncNow()

    expect(runOperation).toHaveBeenCalledWith({
      changedPaths: [],
      operation: 'full',
      trigger: 'manual',
    })
  })

  it('keeps pending changed paths after a failed push and clears them after retry succeeds', async () => {
    const pendingSnapshots: string[][] = []
    const runOperation = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({})
    const coordinator = new JournalSyncCoordinator({
      onPendingChangedPathsChange: (paths) => pendingSnapshots.push([...paths]),
      pushDebounceMs: 20_000,
      retryDelayMs: 300_000,
      runOperation,
    })

    coordinator.markLocalSave(['entries/2026/06/2026-06-08.md'])
    await vi.advanceTimersByTimeAsync(20_000)

    expect(coordinator.getSnapshot().status).toBe('retrying')
    expect(pendingSnapshots[pendingSnapshots.length - 1]).toEqual(['entries/2026/06/2026-06-08.md'])

    await vi.advanceTimersByTimeAsync(300_000)

    expect(runOperation).toHaveBeenLastCalledWith({
      changedPaths: ['entries/2026/06/2026-06-08.md'],
      operation: 'push',
      trigger: 'retry-timer',
    })
    expect(pendingSnapshots[pendingSnapshots.length - 1]).toEqual([])
  })

  it('flushes pending push when the app leaves', async () => {
    const runOperation = vi.fn(async () => ({}))
    const coordinator = new JournalSyncCoordinator({
      leaveFlushTimeoutMs: 5_000,
      pushDebounceMs: 20_000,
      runOperation,
    })

    coordinator.markLocalSave()
    const flush = coordinator.flushBeforeLeave()

    await vi.runAllTimersAsync()
    await flush

    expect(runOperation).toHaveBeenCalledTimes(1)
    expect(runOperation).toHaveBeenCalledWith({
      operation: 'push',
      trigger: 'app-background',
    })
  })

  it('does not block leave forever when push is slow', async () => {
    const runOperation = vi.fn(() => new Promise<SyncOperationResult>(() => undefined))
    const coordinator = new JournalSyncCoordinator({
      leaveFlushTimeoutMs: 5_000,
      runOperation,
    })

    coordinator.markLocalSave()
    const flush = coordinator.flushBeforeLeave()

    await vi.advanceTimersByTimeAsync(5_000)

    await expect(flush).resolves.toBe(false)
    expect(coordinator.getSnapshot().status).toBe('pending')
  })

  it('pulls immediately and then on interval while foregrounded', async () => {
    const runOperation = vi.fn(async () => ({}))
    const coordinator = new JournalSyncCoordinator({
      pullIntervalMs: 180_000,
      runOperation,
    })

    coordinator.startPulling()
    await vi.advanceTimersByTimeAsync(1)

    expect(runOperation).toHaveBeenCalledTimes(1)
    expect(runOperation).toHaveBeenLastCalledWith({
      operation: 'pull',
      trigger: 'app-open',
    })

    await vi.advanceTimersByTimeAsync(180_000)

    expect(runOperation).toHaveBeenCalledTimes(2)
    expect(runOperation).toHaveBeenLastCalledWith({
      operation: 'pull',
      trigger: 'pull-interval',
    })
  })

  it('can start the pull interval without an immediate foreground pull', async () => {
    const runOperation = vi.fn(async () => ({}))
    const coordinator = new JournalSyncCoordinator({
      pullIntervalMs: 180_000,
      runOperation,
    })

    coordinator.startPulling({ immediate: false })
    await vi.advanceTimersByTimeAsync(1)

    expect(runOperation).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(180_000)

    expect(runOperation).toHaveBeenCalledTimes(1)
    expect(runOperation).toHaveBeenCalledWith({
      operation: 'pull',
      trigger: 'pull-interval',
    })
  })

  it('deduplicates automatic app-open pulls during the cooldown window', async () => {
    const runOperation = vi.fn(async () => ({}))
    const coordinator = new JournalSyncCoordinator({
      automaticPullCooldownMs: 15_000,
      runOperation,
    })

    coordinator.startPulling()
    await vi.advanceTimersByTimeAsync(1)
    await coordinator.notifyForeground()

    expect(runOperation).toHaveBeenCalledTimes(1)
    expect(runOperation).toHaveBeenLastCalledWith({
      operation: 'pull',
      trigger: 'app-open',
    })

    await vi.advanceTimersByTimeAsync(15_000)
    await coordinator.notifyForeground()

    expect(runOperation).toHaveBeenCalledTimes(2)
    expect(runOperation).toHaveBeenLastCalledWith({
      operation: 'pull',
      trigger: 'app-open',
    })
  })

  it('deduplicates automatic foreground pulls while one is active', async () => {
    let resolvePull: () => void = () => undefined
    const runOperation = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        resolvePull = resolve
      })

      return {}
    })
    const coordinator = new JournalSyncCoordinator({
      automaticPullCooldownMs: 15_000,
      runOperation,
    })

    const firstPull = coordinator.pullNow('app-open')
    await vi.advanceTimersByTimeAsync(1)
    const secondPull = coordinator.notifyForeground()

    expect(runOperation).toHaveBeenCalledTimes(1)

    resolvePull()
    await vi.advanceTimersByTimeAsync(1)
    await firstPull
    await secondPull

    expect(runOperation).toHaveBeenCalledTimes(1)
  })

  it('does not apply the automatic pull cooldown to manual pulls', async () => {
    const runOperation = vi.fn(async () => ({}))
    const coordinator = new JournalSyncCoordinator({
      automaticPullCooldownMs: 15_000,
      runOperation,
    })

    await coordinator.pullNow('app-open')
    await coordinator.pullNow('manual')

    expect(runOperation).toHaveBeenCalledTimes(2)
    expect(runOperation).toHaveBeenLastCalledWith({
      operation: 'pull',
      trigger: 'manual',
    })
  })

  it('drops pull interval ticks that fire during an active sync', async () => {
    let resolveSync: () => void = () => undefined
    const requests: SyncOperationRequest[] = []
    const runOperation = vi.fn(async (request: SyncOperationRequest) => {
      requests.push(request)

      if (request.operation === 'full') {
        await new Promise<void>((resolve) => {
          resolveSync = resolve
        })
      }

      return {}
    })
    const coordinator = new JournalSyncCoordinator({
      pullIntervalMs: 180_000,
      runOperation,
    })

    coordinator.startPulling({ immediate: false })
    const sync = coordinator.syncNow()
    await vi.advanceTimersByTimeAsync(1)

    expect(runOperation).toHaveBeenCalledTimes(1)
    expect(requests).toEqual([
      { changedPaths: [], operation: 'full', trigger: 'manual' },
    ])

    await vi.advanceTimersByTimeAsync(180_000)

    expect(runOperation).toHaveBeenCalledTimes(1)

    resolveSync()
    await vi.advanceTimersByTimeAsync(1)
    await sync

    await vi.advanceTimersByTimeAsync(180_000)

    expect(runOperation).toHaveBeenCalledTimes(2)
    expect(runOperation).toHaveBeenLastCalledWith({
      operation: 'pull',
      trigger: 'pull-interval',
    })
  })

  it('marks the first unchanged app-open pull as synced', async () => {
    const snapshots: unknown[] = []
    const runOperation = vi.fn(async () => ({
      changed: false,
    }))
    const coordinator = new JournalSyncCoordinator({
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      runOperation,
    })

    await coordinator.pullNow('app-open')

    expect(runOperation).toHaveBeenCalledOnce()
    expect(coordinator.getSnapshot()).toEqual({
      block: null,
      lastError: null,
      lastSyncedAt: '2026-06-08T10:00:00.000Z',
      pendingReason: null,
      status: 'synced',
    })
    expect(snapshots).toHaveLength(1)
  })

  it('keeps later background pull checks quiet when nothing changed', async () => {
    const snapshots: unknown[] = []
    const runOperation = vi.fn(async () => ({
      changed: false,
    }))
    const coordinator = new JournalSyncCoordinator({
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      runOperation,
    })

    await coordinator.pullNow('app-open')
    await coordinator.pullNow('pull-interval')

    expect(runOperation).toHaveBeenCalledTimes(2)
    expect(coordinator.getSnapshot().status).toBe('synced')
    expect(snapshots).toHaveLength(1)
  })

  it('keeps git operations single-flight and queues a push after the active run', async () => {
    let resolveFirstRun: () => void = () => undefined
    const requests: SyncOperationRequest[] = []
    const runOperation = vi.fn(async (request: SyncOperationRequest) => {
      requests.push(request)

      if (requests.length === 1) {
        await new Promise<void>((resolve) => {
          resolveFirstRun = resolve
        })
      }

      return {}
    })
    const coordinator = new JournalSyncCoordinator({
      pushDebounceMs: 20_000,
      runOperation,
    })

    void coordinator.pullNow('app-open')
    await vi.advanceTimersByTimeAsync(1)
    coordinator.markLocalSave()
    await vi.advanceTimersByTimeAsync(20_000)

    expect(runOperation).toHaveBeenCalledTimes(1)

    resolveFirstRun?.()
    await vi.advanceTimersByTimeAsync(1)

    expect(runOperation).toHaveBeenCalledTimes(2)
    expect(requests).toEqual([
      { operation: 'pull', trigger: 'app-open' },
      { operation: 'push', trigger: 'save-idle' },
    ])
  })

  it('waits for the queued push when leaving during an active pull', async () => {
    let resolvePull: () => void = () => undefined
    let resolvePush: () => void = () => undefined
    let didFlush = false
    const requests: SyncOperationRequest[] = []
    const runOperation = vi.fn(async (request: SyncOperationRequest) => {
      requests.push(request)

      if (request.operation === 'pull') {
        await new Promise<void>((resolve) => {
          resolvePull = resolve
        })
      }

      if (request.operation === 'push') {
        await new Promise<void>((resolve) => {
          resolvePush = resolve
        })
      }

      return {}
    })
    const coordinator = new JournalSyncCoordinator({
      leaveFlushTimeoutMs: 5_000,
      pushDebounceMs: 20_000,
      runOperation,
    })

    void coordinator.pullNow('app-open')
    await vi.advanceTimersByTimeAsync(1)
    coordinator.markLocalSave()
    const flush = coordinator.flushBeforeLeave()

    void flush.then(() => {
      didFlush = true
    })
    await vi.advanceTimersByTimeAsync(1)

    expect(runOperation).toHaveBeenCalledTimes(1)
    expect(didFlush).toBe(false)

    resolvePull()
    await vi.advanceTimersByTimeAsync(1)

    expect(runOperation).toHaveBeenCalledTimes(2)
    expect(requests).toEqual([
      { operation: 'pull', trigger: 'app-open' },
      { operation: 'push', trigger: 'app-background' },
    ])
    expect(didFlush).toBe(false)

    resolvePush()
    await vi.advanceTimersByTimeAsync(1)

    await expect(flush).resolves.toBe(true)
    expect(didFlush).toBe(true)
  })

  it('keeps pending local changes visible when a pull finishes before the debounced push', async () => {
    const runOperation = vi.fn(async (request: SyncOperationRequest) => ({
      skipped: request.operation === 'pull',
    }))
    const coordinator = new JournalSyncCoordinator({
      pushDebounceMs: 20_000,
      runOperation,
    })

    coordinator.markLocalSave()
    await coordinator.pullNow('app-open')

    expect(coordinator.getSnapshot()).toMatchObject({
      pendingReason: 'local-save',
      status: 'pending',
    })

    await vi.advanceTimersByTimeAsync(20_000)

    expect(runOperation).toHaveBeenCalledTimes(2)
    expect(runOperation).toHaveBeenLastCalledWith({
      operation: 'push',
      trigger: 'save-idle',
    })
  })

  it('reschedules the push window when an automatic push is skipped', async () => {
    const runOperation = vi.fn(async () => ({
      skipped: true,
    }))
    const coordinator = new JournalSyncCoordinator({
      pushDebounceMs: 20_000,
      runOperation,
    })

    coordinator.markLocalSave()
    await vi.advanceTimersByTimeAsync(20_000)

    expect(runOperation).toHaveBeenCalledTimes(1)
    expect(coordinator.getSnapshot()).toMatchObject({
      pendingReason: 'local-save',
      status: 'pending',
    })

    await vi.advanceTimersByTimeAsync(19_999)
    expect(runOperation).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(runOperation).toHaveBeenCalledTimes(2)
    expect(runOperation).toHaveBeenLastCalledWith({
      operation: 'push',
      trigger: 'save-idle',
    })
  })

  it('marks tracked dirty worktree paths as pending local changes', async () => {
    const runOperation = vi.fn(async () => ({}))
    const coordinator = new JournalSyncCoordinator({
      pushDebounceMs: 20_000,
      runOperation,
    })

    expect(coordinator.markDirtyWorktree([])).toBe(false)
    expect(coordinator.getSnapshot().status).toBe('idle')

    expect(coordinator.markDirtyWorktree(['entries/2026/06/2026-06-08.md'])).toBe(true)
    expect(coordinator.getSnapshot()).toMatchObject({
      pendingReason: 'local-save',
      status: 'pending',
    })

    await vi.advanceTimersByTimeAsync(20_000)

    expect(runOperation).toHaveBeenCalledWith({
      changedPaths: ['entries/2026/06/2026-06-08.md'],
      operation: 'push',
      trigger: 'save-idle',
    })
  })

  it('waits for the retry delay after a failed push', async () => {
    const runOperation = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({})
    const coordinator = new JournalSyncCoordinator({
      pushDebounceMs: 20_000,
      retryDelayMs: 300_000,
      runOperation,
    })

    coordinator.markLocalSave()
    await vi.advanceTimersByTimeAsync(20_000)

    expect(coordinator.getSnapshot().status).toBe('retrying')
    expect(runOperation).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(299_999)

    expect(runOperation).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)

    expect(runOperation).toHaveBeenCalledTimes(2)
    expect(runOperation).toHaveBeenLastCalledWith({
      operation: 'push',
      trigger: 'retry-timer',
    })
  })

  it('does not retry immediately when leaving with only a failed push pending', async () => {
    const runOperation = vi.fn().mockRejectedValue(new Error('network down'))
    const coordinator = new JournalSyncCoordinator({
      pushDebounceMs: 20_000,
      retryDelayMs: 300_000,
      runOperation,
    })

    coordinator.markLocalSave()
    await vi.advanceTimersByTimeAsync(20_000)

    await expect(coordinator.flushBeforeLeave()).resolves.toBe(true)

    expect(coordinator.getSnapshot().status).toBe('retrying')
    expect(runOperation).toHaveBeenCalledTimes(1)
  })

  it('marks blocked errors without scheduling retry', async () => {
    const runOperation = vi.fn().mockRejectedValue(createJournalSyncBlockedError({
      message: 'Resolve the journal conflict before syncing.',
      paths: ['entries/2026/06/2026-06-08.md'],
      reason: 'content-conflict',
    }))
    const coordinator = new JournalSyncCoordinator({
      pushDebounceMs: 20_000,
      retryDelayMs: 300_000,
      runOperation,
    })

    coordinator.markLocalSave(['entries/2026/06/2026-06-08.md'])
    await vi.advanceTimersByTimeAsync(20_000)

    expect(coordinator.getSnapshot()).toMatchObject({
      block: {
        paths: ['entries/2026/06/2026-06-08.md'],
        reason: 'content-conflict',
      },
      lastError: 'Resolve the journal conflict before syncing.',
      pendingReason: null,
      status: 'blocked',
    })

    await vi.advanceTimersByTimeAsync(300_000)

    expect(runOperation).toHaveBeenCalledTimes(1)
  })

  it('records local saves without clearing a blocked state', async () => {
    const runOperation = vi.fn(async () => ({}))
    const coordinator = new JournalSyncCoordinator({
      initialSnapshot: {
        block: {
          message: 'Choose sync direction.',
          reason: 'first-sync-needs-choice',
        },
        lastError: 'Choose sync direction.',
        lastSyncedAt: null,
        pendingReason: null,
        status: 'blocked',
      },
      pushDebounceMs: 20_000,
      runOperation,
    })

    coordinator.markLocalSave(['entries/2026/06/2026-06-08.md'])
    await vi.advanceTimersByTimeAsync(20_000)

    expect(coordinator.getSnapshot()).toMatchObject({
      block: {
        reason: 'first-sync-needs-choice',
      },
      status: 'blocked',
    })
    expect(runOperation).not.toHaveBeenCalled()
  })

  it('does not let automatic pulls clear a blocked state', async () => {
    const runOperation = vi.fn(async () => ({}))
    const coordinator = new JournalSyncCoordinator({
      initialSnapshot: {
        block: {
          message: 'Resolve the journal conflict before syncing.',
          reason: 'content-conflict',
        },
        lastError: 'Resolve the journal conflict before syncing.',
        lastSyncedAt: '2026-06-08T09:00:00.000Z',
        pendingReason: null,
        status: 'blocked',
      },
      pullIntervalMs: 180_000,
      runOperation,
    })

    coordinator.startPulling()
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(180_001)
    await coordinator.notifyForeground()
    await coordinator.notifyNetworkOnline()

    expect(runOperation).not.toHaveBeenCalled()
    expect(coordinator.getSnapshot()).toMatchObject({
      block: {
        reason: 'content-conflict',
      },
      lastError: 'Resolve the journal conflict before syncing.',
      status: 'blocked',
    })
  })

  it('clears blocked state after a successful manual sync', async () => {
    const runOperation = vi.fn(async () => ({}))
    const coordinator = new JournalSyncCoordinator({
      initialSnapshot: {
        block: {
          message: 'Local object store needs repair.',
          reason: 'object-store-corrupt',
        },
        lastError: 'Local object store needs repair.',
        lastSyncedAt: null,
        pendingReason: null,
        status: 'blocked',
      },
      runOperation,
    })

    await coordinator.syncNow()

    expect(coordinator.getSnapshot()).toMatchObject({
      block: null,
      lastError: null,
      pendingReason: null,
      status: 'synced',
    })
  })
})
