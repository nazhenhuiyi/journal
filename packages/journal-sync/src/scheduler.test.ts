import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JournalSyncCoordinator, type SyncOperationRequest, type SyncOperationResult } from './scheduler'

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

  it('keeps background pull checks out of the visible status when nothing changed', async () => {
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
    expect(coordinator.getSnapshot().status).toBe('idle')
    expect(snapshots).toEqual([])
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
})
