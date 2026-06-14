export type SyncState =
  | 'disabled'
  | 'idle'
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'retrying'
  | 'needs-auth'
  | 'error'

export type SyncTrigger =
  | 'app-open'
  | 'app-background'
  | 'manual'
  | 'network-online'
  | 'pull-interval'
  | 'retry-timer'
  | 'save-idle'

export type SyncOperation = 'full' | 'pull' | 'push'
export type SyncPendingReason = 'local-save' | 'remote-check' | 'retry'

export type SyncSnapshot = {
  lastError: string | null
  lastSyncedAt: string | null
  pendingReason: SyncPendingReason | null
  status: SyncState
}

export type SyncOperationRequest = {
  changedPaths?: readonly string[]
  operation: SyncOperation
  trigger: SyncTrigger
}

export type SyncOperationResult = {
  changed?: boolean
  message?: string
  needsAuth?: boolean
  skipped?: boolean
}

export type SyncTimerApi = {
  clearInterval(handle: unknown): void
  clearTimeout(handle: unknown): void
  setInterval(callback: () => void, delayMs: number): unknown
  setTimeout(callback: () => void, delayMs: number): unknown
}

export type JournalSyncCoordinatorOptions = {
  leaveFlushTimeoutMs?: number
  now?: () => Date
  onPendingChangedPathsChange?: (changedPaths: readonly string[]) => void
  onSnapshot?: (snapshot: SyncSnapshot) => void
  pullIntervalMs?: number
  pushDebounceMs?: number
  retryDelayMs?: number
  runOperation: (request: SyncOperationRequest) => Promise<SyncOperationResult>
  timers?: SyncTimerApi
}

const defaultPushDebounceMs = 20_000
const defaultPullIntervalMs = 180_000
const defaultLeaveFlushTimeoutMs = 5_000
const defaultRetryDelayMs = 300_000

const defaultTimers: SyncTimerApi = {
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
}

export class JournalSyncCoordinator {
  private activeRun: Promise<SyncSnapshot> | null = null
  private leaveFlushTimeoutHandle: unknown | null = null
  private pendingChangedPathsKnown = true
  private pendingChangedPaths = new Set<string>()
  private pendingPullAfterRun: SyncTrigger | null = null
  private pendingPushAfterRun: SyncTrigger | null = null
  private pullIntervalHandle: unknown | null = null
  private pushTimeoutHandle: unknown | null = null
  private queuedRun: Promise<SyncSnapshot> | null = null
  private retryTimeoutHandle: unknown | null = null
  private snapshot: SyncSnapshot = {
    lastError: null,
    lastSyncedAt: null,
    pendingReason: null,
    status: 'idle',
  }

  constructor(private readonly options: JournalSyncCoordinatorOptions) {}

  getSnapshot() {
    return this.snapshot
  }

  hasPendingLocalChanges() {
    return this.pushTimeoutHandle !== null ||
      this.pendingPushAfterRun !== null ||
      this.pendingChangedPaths.size > 0 ||
      !this.pendingChangedPathsKnown ||
      this.snapshot.pendingReason === 'local-save'
  }

  markLocalSave(changedPaths?: readonly string[]) {
    this.addPendingChangedPaths(changedPaths)
    this.markLocalChangesPending()
  }

  markDirtyWorktree(dirtyPaths: readonly string[]) {
    if (dirtyPaths.length === 0) {
      return false
    }

    this.addPendingChangedPaths(dirtyPaths)
    this.markLocalChangesPending()
    return true
  }

  recordPendingChangedPaths(changedPaths: readonly string[]) {
    this.addPendingChangedPaths(changedPaths)
  }

  private markLocalChangesPending() {
    this.clearPushTimer()
    this.clearRetryTimer()
    this.updateSnapshot({
      lastError: null,
      pendingReason: 'local-save',
      status: 'pending',
    })
    this.pushTimeoutHandle = this.timers.setTimeout(() => {
      this.pushTimeoutHandle = null
      void this.runSingleFlight('push', 'save-idle')
    }, this.pushDebounceMs)
  }

  startPulling(options: { immediate?: boolean } = {}) {
    this.stopPulling()

    if (options.immediate ?? true) {
      void this.pullNow('app-open')
    }

    this.pullIntervalHandle = this.timers.setInterval(() => {
      void this.pullNow('pull-interval')
    }, this.pullIntervalMs)
  }

  stopPulling() {
    if (this.pullIntervalHandle !== null) {
      this.timers.clearInterval(this.pullIntervalHandle)
      this.pullIntervalHandle = null
    }
  }

  notifyForeground() {
    return this.pullNow('app-open')
  }

  notifyNetworkOnline() {
    if (this.snapshot.status === 'retrying') {
      this.scheduleRetry()
      return Promise.resolve(this.snapshot)
    }

    return this.pullNow('network-online')
  }

  pullNow(trigger: SyncTrigger = 'manual') {
    return this.runSingleFlight('pull', trigger)
  }

  syncNow() {
    this.clearPushTimer()
    this.clearRetryTimer()
    return this.runSingleFlight('full', 'manual')
  }

  async flushBeforeLeave() {
    if (this.snapshot.status !== 'pending' || this.snapshot.pendingReason !== 'local-save') {
      return true
    }

    this.clearPushTimer()

    const run = this.runSingleFlight('push', 'app-background')
    const didFinish = await Promise.race([
      run.then(() => true, () => true),
      this.createLeaveTimeout(),
    ])

    if (didFinish && this.leaveFlushTimeoutHandle !== null) {
      this.timers.clearTimeout(this.leaveFlushTimeoutHandle)
      this.leaveFlushTimeoutHandle = null
    }

    if (!didFinish) {
      this.updateSnapshot({
        pendingReason: 'local-save',
        status: 'pending',
      })
    }

    return didFinish
  }

  dispose() {
    this.clearPushTimer()
    this.clearRetryTimer()
    this.stopPulling()

    if (this.leaveFlushTimeoutHandle !== null) {
      this.timers.clearTimeout(this.leaveFlushTimeoutHandle)
      this.leaveFlushTimeoutHandle = null
    }
  }

  private async runSingleFlight(operation: SyncOperation, trigger: SyncTrigger): Promise<SyncSnapshot> {
    if (this.activeRun) {
      if (operation === 'pull' && trigger === 'pull-interval') {
        return this.activeRun.then(() => this.snapshot)
      }

      if (operation === 'pull') {
        this.pendingPullAfterRun = trigger
      } else {
        this.pendingPushAfterRun = trigger
      }

      return this.activeRun.then(() => this.queuedRun ?? this.snapshot)
    }

    if (this.shouldSurfaceSyncing(operation, trigger)) {
      this.updateSnapshot({
        lastError: null,
        status: 'syncing',
      })
    }

    this.activeRun = this.executeOperation(operation, trigger)

    try {
      return await this.activeRun
    } finally {
      this.activeRun = null

      if (this.pendingPushAfterRun) {
        const nextTrigger = this.pendingPushAfterRun

        this.pendingPushAfterRun = null
        this.startQueuedRun('push', nextTrigger)
      } else if (this.pendingPullAfterRun) {
        const nextTrigger = this.pendingPullAfterRun

        this.pendingPullAfterRun = null
        this.startQueuedRun('pull', nextTrigger)
      }
    }
  }

  private startQueuedRun(operation: SyncOperation, trigger: SyncTrigger) {
    const run = this.runSingleFlight(operation, trigger)

    this.queuedRun = run
    void run.finally(() => {
      if (this.queuedRun === run) {
        this.queuedRun = null
      }
    })
  }

  private async executeOperation(operation: SyncOperation, trigger: SyncTrigger) {
    const isBackgroundPull = operation === 'pull' && trigger !== 'manual'

    try {
      const request = this.createOperationRequest(operation, trigger)
      const result = await this.options.runOperation(request)

      if (result.needsAuth) {
        this.clearRetryTimer()
        this.updateSnapshot({
          lastError: result.message ?? null,
          pendingReason: null,
          status: 'needs-auth',
        })
      } else if (operation === 'pull' && this.pushTimeoutHandle !== null) {
        this.updateSnapshot({
          lastError: null,
          pendingReason: 'local-save',
          status: 'pending',
        })
      } else if (result.skipped && operation === 'push') {
        this.markLocalChangesPending()
      } else if (result.skipped && operation === 'pull') {
        this.updateSnapshot({
          pendingReason: null,
          status: this.snapshot.lastSyncedAt ? 'synced' : 'idle',
        })
      } else if (isBackgroundPull && !result.changed && this.snapshot.lastSyncedAt) {
        return this.snapshot
      } else {
        this.clearRetryTimer()
        this.clearCompletedLocalChanges(operation)
        this.updateSnapshot({
          lastError: null,
          lastSyncedAt: this.now().toISOString(),
          pendingReason: null,
          status: 'synced',
        })
      }
    } catch (error) {
      if (operation === 'pull' && this.pushTimeoutHandle !== null) {
        this.updateSnapshot({
          lastError: null,
          pendingReason: 'local-save',
          status: 'pending',
        })

        return this.snapshot
      }

      if (isBackgroundPull) {
        return this.snapshot
      }

      this.updateSnapshot({
        lastError: getErrorMessage(error),
        pendingReason: operation === 'pull' ? 'remote-check' : 'retry',
        status: operation === 'pull' ? 'error' : 'retrying',
      })

      if (operation !== 'pull') {
        this.clearPushTimer()
        this.scheduleRetry()
      }
    }

    return this.snapshot
  }

  private createLeaveTimeout() {
    return new Promise<false>((resolve) => {
      this.leaveFlushTimeoutHandle = this.timers.setTimeout(() => {
        this.leaveFlushTimeoutHandle = null
        resolve(false)
      }, this.leaveFlushTimeoutMs)
    })
  }

  private clearPushTimer() {
    if (this.pushTimeoutHandle !== null) {
      this.timers.clearTimeout(this.pushTimeoutHandle)
      this.pushTimeoutHandle = null
    }
  }

  private clearRetryTimer() {
    if (this.retryTimeoutHandle !== null) {
      this.timers.clearTimeout(this.retryTimeoutHandle)
      this.retryTimeoutHandle = null
    }
  }

  private createOperationRequest(operation: SyncOperation, trigger: SyncTrigger): SyncOperationRequest {
    if (operation === 'pull') {
      return { operation, trigger }
    }

    const changedPaths = this.getPendingChangedPaths()
    const changedPathsKnown = this.pendingChangedPathsKnown

    if (!changedPathsKnown) {
      return { operation, trigger }
    }

    return {
      changedPaths,
      operation,
      trigger,
    }
  }

  private addPendingChangedPaths(changedPaths: readonly string[] | undefined) {
    if (changedPaths === undefined) {
      this.pendingChangedPathsKnown = false
      return
    }

    let didChange = false

    for (const changedPath of changedPaths) {
      if (!changedPath || this.pendingChangedPaths.has(changedPath)) {
        continue
      }

      this.pendingChangedPaths.add(changedPath)
      didChange = true
    }

    if (didChange) {
      this.emitPendingChangedPaths()
    }
  }

  private clearCompletedLocalChanges(operation: SyncOperation) {
    if (operation === 'pull' || (this.pendingChangedPaths.size === 0 && this.pendingChangedPathsKnown)) {
      return
    }

    this.pendingChangedPaths.clear()
    this.pendingChangedPathsKnown = true
    this.clearPushTimer()
    this.emitPendingChangedPaths()
  }

  private emitPendingChangedPaths() {
    this.options.onPendingChangedPathsChange?.(this.getPendingChangedPaths())
  }

  private getPendingChangedPaths() {
    return [...this.pendingChangedPaths].sort()
  }

  private scheduleRetry() {
    if (this.retryTimeoutHandle !== null) {
      return
    }

    this.retryTimeoutHandle = this.timers.setTimeout(() => {
      this.retryTimeoutHandle = null
      void this.runSingleFlight('push', 'retry-timer')
    }, this.retryDelayMs)
  }

  private updateSnapshot(nextSnapshot: Partial<SyncSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...nextSnapshot,
    }
    this.options.onSnapshot?.(this.snapshot)
  }

  private shouldSurfaceSyncing(operation: SyncOperation, trigger: SyncTrigger) {
    return operation !== 'pull' || trigger === 'manual'
  }

  private get leaveFlushTimeoutMs() {
    return this.options.leaveFlushTimeoutMs ?? defaultLeaveFlushTimeoutMs
  }

  private get now() {
    return this.options.now ?? (() => new Date())
  }

  private get pullIntervalMs() {
    return this.options.pullIntervalMs ?? defaultPullIntervalMs
  }

  private get pushDebounceMs() {
    return this.options.pushDebounceMs ?? defaultPushDebounceMs
  }

  private get retryDelayMs() {
    return this.options.retryDelayMs ?? defaultRetryDelayMs
  }

  private get timers() {
    return this.options.timers ?? defaultTimers
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '同步过程中出现未知错误。'
}
