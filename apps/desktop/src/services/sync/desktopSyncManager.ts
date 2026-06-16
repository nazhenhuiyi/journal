import {
  JournalSyncCoordinator,
  type SyncOperationRequest,
  type SyncOperationResult,
  type SyncSnapshot,
  type SyncTrigger,
} from '@journal/sync/scheduler'
import {
  createSyncSnapshotPersistenceIdentity,
  getDefaultSyncSnapshot,
  shouldPersistSyncSnapshot,
  type SyncSnapshotPersistenceIdentity,
} from '@journal/sync/persistedSnapshot'
import {
  getJournalGitAuthenticationErrorMessage,
} from '@journal/sync/gitCore'

type JournalSyncStore = NonNullable<Window['journalSync']>
type JournalSyncStatus = Awaited<ReturnType<JournalSyncStore['loadStatus']>>
type DesktopSyncCredentialStatus = JournalSyncStatus['credentialStatus']

export type DesktopSyncRuntimeBinding = {
  automaticPushDelayMs: number
  flushPendingSave: (
    shouldUpdateState?: boolean,
    options?: { scheduleSync?: boolean },
  ) => Promise<boolean>
  getCurrentJournalDate: () => string | null
  getIsEditorComposing: () => boolean
  getIsJournalDirty: () => boolean
  getLastJournalEditedAt: () => number
  loadJournalForDate: (date: string | null, shouldApply?: () => boolean) => Promise<void>
}

export type DesktopSyncManagerState = {
  branch: string
  credentialMessage: string
  credentialStatus: DesktopSyncCredentialStatus
  dirtyPaths: string[]
  hasCredentials: boolean
  isLoadingSettings: boolean
  isSavingSettings: boolean
  isSyncingNow: boolean
  message: string
  recentCommits: JournalSyncStatus['recentCommits']
  remoteUrl: string
  snapshot: SyncSnapshot
  tokenDraft: string
}

const initialSyncSnapshot: SyncSnapshot = getDefaultSyncSnapshot()

const initialState: DesktopSyncManagerState = {
  branch: 'main',
  credentialMessage: '',
  credentialStatus: 'missing',
  dirtyPaths: [],
  hasCredentials: false,
  isLoadingSettings: false,
  isSavingSettings: false,
  isSyncingNow: false,
  message: '',
  recentCommits: [],
  remoteUrl: '',
  snapshot: initialSyncSnapshot,
  tokenDraft: '',
}

class DesktopSyncManager {
  private coordinator = this.createCoordinator()
  private lastManualSyncChanged: boolean | null = null
  private listeners = new Set<() => void>()
  private runtimeBinding: DesktopSyncRuntimeBinding | null = null
  private state = initialState
  private syncSnapshotIdentity: SyncSnapshotPersistenceIdentity | null = null

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  getState = () => this.state

  bindJournalRuntime = (binding: DesktopSyncRuntimeBinding) => {
    this.runtimeBinding = binding

    return () => {
      void this.flushBeforeLeave().finally(() => {
        if (this.runtimeBinding === binding) {
          this.runtimeBinding = null
        }
      })
    }
  }

  initialize = async () => {
    await this.refreshStatus({ markDirtyWorktree: true })
    this.startPullingIfConfigured()
  }

  markLocalSave = (changedPaths: readonly string[]) => {
    this.coordinator.markLocalSave(changedPaths)
  }

  setSyncBranch = (branch: string) => {
    this.setState({ branch })
  }

  setSyncRemoteUrl = (remoteUrl: string) => {
    this.setState({ remoteUrl })
  }

  setSyncTokenDraft = (tokenDraft: string) => {
    this.setState({ tokenDraft })
  }

  refreshStatus = async (options: { markDirtyWorktree?: boolean; showLoading?: boolean } = {}) => {
    const journalSync = getJournalSyncStore()
    const showLoading = options.showLoading ?? true

    if (!journalSync) {
      this.setUnavailableState()
      return null
    }

    if (showLoading) {
      this.setState({ isLoadingSettings: true })
    }

    try {
      const status = await journalSync.loadStatus()

      this.applyStatus(status)

      if (options.markDirtyWorktree && status.remoteUrl && status.hasCredentials) {
        this.coordinator.markDirtyWorktree(status.dirtyPaths)
      }

      return status
    } catch (error) {
      this.setState({
        message: this.state.message,
        snapshot: {
          ...this.state.snapshot,
          lastError: getErrorMessage(error),
          status: 'error',
        },
      })
      return null
    } finally {
      if (showLoading) {
        this.setState({ isLoadingSettings: false })
      }
    }
  }

  saveConfiguration = async (options: {
    showSuccessMessage?: boolean
    startPulling?: boolean
  } = {}) => {
    const journalSync = getJournalSyncStore()

    if (!journalSync) {
      this.setUnavailableState()
      return null
    }

    const branch = this.state.branch.trim() || 'main'
    const remoteUrl = this.state.remoteUrl.trim()
    const token = this.state.tokenDraft.trim()

    this.setState({
      isSavingSettings: true,
      message: '',
    })

    try {
      const status = await journalSync.saveSettings({
        syncBranch: branch,
        syncRemoteUrl: remoteUrl,
        syncToken: token,
      })

      this.applyStatus(status)
      this.setState({
        message: (options.showSuccessMessage ?? true) ? '同步配置已保存' : this.state.message,
        tokenDraft: '',
      })

      if (options.startPulling ?? true) {
        this.startPullingIfConfigured()
      }

      return status
    } catch (error) {
      this.setState({
        message: '同步配置保存失败',
        snapshot: {
          ...this.state.snapshot,
          lastError: getErrorMessage(error),
          status: 'error',
        },
      })
      return null
    } finally {
      this.setState({ isSavingSettings: false })
    }
  }

  resume = async () => {
    if (!this.hasCompleteConfiguration()) {
      return
    }

    await this.markDirtyWorktreeForSync()
    await this.coordinator.notifyForeground()
  }

  syncNow = async () => {
    this.setState({
      isSyncingNow: true,
      message: '',
    })

    try {
      const savedStatus = await this.saveConfiguration({
        showSuccessMessage: false,
        startPulling: false,
      })

      if (!savedStatus) {
        return null
      }

      if (!savedStatus.remoteUrl.trim()) {
        this.setState({
          message: '请先填写仓库地址',
          snapshot: {
            ...initialSyncSnapshot,
            status: 'needs-auth',
          },
        })
        return this.state.snapshot
      }

      const credentialStatus = getCredentialStatus(savedStatus)

      if (isCredentialReadError(credentialStatus)) {
        this.setState({
          message: savedStatus.credentialMessage ?? getCredentialStatusMessage(credentialStatus),
          snapshot: createSyncSnapshotFromStatus(savedStatus),
        })
        return this.state.snapshot
      }

      if (!savedStatus.hasCredentials) {
        this.setState({
          message: '请先保存 GitHub token',
          snapshot: {
            ...initialSyncSnapshot,
            status: 'needs-auth',
          },
        })
        return this.state.snapshot
      }

      this.lastManualSyncChanged = null
      const snapshot = await this.coordinator.syncNow()

      if (
        snapshot.status === 'blocked' ||
        snapshot.status === 'error' ||
        snapshot.status === 'needs-auth' ||
        snapshot.status === 'retrying'
      ) {
        this.setState({
          message: snapshot.lastError ?? (snapshot.status === 'blocked' ? '同步受阻' : '同步失败'),
          snapshot,
        })
        return snapshot
      }

      const refreshedStatus = await this.refreshStatus({ showLoading: false })
      const didChange = this.lastManualSyncChanged ?? false
      const message = didChange ? '同步完成' : '已经是最新'

      if (refreshedStatus?.dirtyPaths.length) {
        this.setState({ message })
      } else {
        this.setState({
          message,
          snapshot: {
            ...initialSyncSnapshot,
            lastSyncedAt: snapshot.lastSyncedAt ?? new Date().toISOString(),
            status: 'synced',
          },
        })
        this.persistSnapshot(this.state.snapshot)
      }

      return this.state.snapshot
    } catch (error) {
      this.setState({
        message: '同步失败',
        snapshot: {
          ...initialSyncSnapshot,
          lastError: getErrorMessage(error),
          status: 'error',
        },
      })
      return this.state.snapshot
    } finally {
      this.setState({ isSyncingNow: false })
      this.startPullingIfConfigured()
    }
  }

  flushBeforeLeave = async () => {
    const binding = this.runtimeBinding
    const didSave = await binding?.flushPendingSave(false)

    if (didSave) {
      await this.coordinator.flushBeforeLeave()
    }
  }

  private createCoordinator() {
    return new JournalSyncCoordinator({
      onSnapshot: (snapshot) => {
        this.setState({
          message: snapshot.status === 'synced' ? this.state.message : '',
          snapshot,
        })
        this.persistSnapshot(snapshot)
      },
      runOperation: (request) => this.runOperation(request),
    })
  }

  private async runOperation({ changedPaths, operation, trigger }: SyncOperationRequest): Promise<SyncOperationResult> {
    const journalSync = getJournalSyncStore()
    const binding = this.runtimeBinding

    if (!journalSync) {
      return {
        message: '当前环境还不能同步。',
        skipped: true,
      }
    }

    if (!this.state.remoteUrl.trim()) {
      return {
        message: '请先配置 GitHub 同步仓库地址。',
        needsAuth: true,
      }
    }

    if (!this.state.hasCredentials) {
      return {
        message: '请先保存 GitHub token。',
        needsAuth: true,
      }
    }

    if (operation === 'pull') {
      if (binding?.getIsJournalDirty()) {
        return {
          message: '正在编辑，稍后检查远端更新。',
          skipped: true,
        }
      }

      let result: Awaited<ReturnType<JournalSyncStore['pull']>>

      try {
        result = await journalSync.pull()
      } catch (error) {
        const authResult = getAuthFailureOperationResult(error)

        if (authResult) {
          return authResult
        }

        throw error
      }

      if (result.changed && binding && !binding.getIsJournalDirty()) {
        await binding.loadJournalForDate(binding.getCurrentJournalDate(), () => !binding.getIsJournalDirty())
      }

      return {
        changed: result.changed,
      }
    }

    if (binding?.getIsJournalDirty()) {
      if (this.shouldDeferAutomaticPush(binding, trigger)) {
        return {
          message: '正在编辑，稍后同步。',
          skipped: true,
        }
      }

      const didFlush = await binding.flushPendingSave(true, { scheduleSync: false })

      if (!didFlush) {
        return {
          message: '本地保存还没有完成，稍后同步。',
          skipped: true,
        }
      }
    }

    const operationOptions = changedPaths && changedPaths.length > 0
      ? {
          changedPaths,
          collectDirtyPathsAfterSync: false,
        }
      : undefined
    let result: Awaited<ReturnType<JournalSyncStore['syncNow']>>

    try {
      result = operation === 'full'
        ? await journalSync.syncNow(operationOptions)
        : await journalSync.push(operationOptions)
    } catch (error) {
      const authResult = getAuthFailureOperationResult(error)

      if (authResult) {
        return authResult
      }

      throw error
    }

    if (operation === 'full' && trigger === 'manual') {
      this.lastManualSyncChanged = Boolean(result.changed)
    }

    if (operation === 'full' && binding && !binding.getIsJournalDirty()) {
      await binding.loadJournalForDate(binding.getCurrentJournalDate(), () => !binding.getIsJournalDirty())
    }

    return {
      changed: result.changed,
    }
  }

  private shouldDeferAutomaticPush(binding: DesktopSyncRuntimeBinding, trigger: SyncTrigger) {
    return trigger === 'save-idle' &&
      (binding.getIsEditorComposing() ||
        Date.now() - binding.getLastJournalEditedAt() < binding.automaticPushDelayMs)
  }

  private async markDirtyWorktreeForSync() {
    const journalSync = getJournalSyncStore()

    if (!journalSync || !this.hasCompleteConfiguration()) {
      return
    }

    try {
      const status = await journalSync.loadStatus()

      this.applyStatus(status)
      this.coordinator.markDirtyWorktree(status.dirtyPaths)
    } catch (error) {
      console.error(error)
    }
  }

  private startPullingIfConfigured() {
    if (this.hasCompleteConfiguration()) {
      this.coordinator.startPulling()
      return
    }

    this.coordinator.stopPulling()
  }

  private applyStatus(status: JournalSyncStatus) {
    const snapshot = createSyncSnapshotFromStatus(status)
    this.syncSnapshotIdentity = status.remoteUrl
      ? createSyncSnapshotPersistenceIdentity({
          branch: status.branch,
          remoteUrl: status.remoteUrl,
        })
      : null

    this.coordinator.restoreSnapshot(snapshot, { emit: false })
    this.setState({
      branch: status.branch || 'main',
      credentialMessage: status.credentialMessage ?? '',
      credentialStatus: getCredentialStatus(status),
      dirtyPaths: status.dirtyPaths ?? [],
      hasCredentials: Boolean(status.hasCredentials),
      recentCommits: status.recentCommits ?? [],
      remoteUrl: status.remoteUrl ?? '',
      snapshot,
    })
  }

  private hasCompleteConfiguration() {
    return Boolean(this.state.remoteUrl.trim() && this.state.hasCredentials)
  }

  private setState(nextState: Partial<DesktopSyncManagerState>) {
    this.state = {
      ...this.state,
      ...nextState,
    }
    this.emit()
  }

  private emit() {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private setUnavailableState() {
    this.setState({
      isLoadingSettings: false,
      message: '当前环境还不能同步',
      snapshot: {
        ...initialSyncSnapshot,
        lastError: '当前环境还不能同步。',
        status: 'error',
      },
    })
  }

  private persistSnapshot(snapshot: SyncSnapshot) {
    const journalSync = getJournalSyncStore()
    const identity = this.syncSnapshotIdentity

    if (!journalSync || !identity || !shouldPersistSyncSnapshot(snapshot)) {
      return
    }

    void Promise.resolve(journalSync.saveState({
      snapshot,
      syncBranch: identity.branch,
      syncRemoteUrl: identity.remoteUrl,
    })).catch((error) => {
      console.error(error)
    })
  }
}

export const desktopSyncManager = new DesktopSyncManager()

function getJournalSyncStore() {
  return typeof window === 'undefined' ? undefined : window.journalSync
}

function createSyncSnapshotFromStatus(status: JournalSyncStatus): SyncSnapshot {
  const credentialStatus = getCredentialStatus(status)
  const restoredSnapshot = status.syncSnapshot ?? null

  if (isCredentialReadError(credentialStatus)) {
    return {
      ...initialSyncSnapshot,
      lastError: status.credentialMessage ?? getCredentialStatusMessage(credentialStatus),
      status: 'error',
    }
  }

  if (status.dirtyPaths.length > 0) {
    return {
      ...(restoredSnapshot ?? initialSyncSnapshot),
      lastError: null,
      pendingReason: 'local-save',
      status: 'pending',
    }
  }

  return restoredSnapshot ?? initialSyncSnapshot
}

function getCredentialStatus(status: JournalSyncStatus): DesktopSyncCredentialStatus {
  return status.credentialStatus ?? (status.hasCredentials ? 'available' : 'missing')
}

function isCredentialReadError(status: DesktopSyncCredentialStatus) {
  return status === 'corrupt' || status === 'encryption-unavailable'
}

function getCredentialStatusMessage(status: DesktopSyncCredentialStatus) {
  if (status === 'corrupt') {
    return 'GitHub token 无法读取，请重新保存。'
  }

  if (status === 'encryption-unavailable') {
    return '系统加密存储不可用，无法读取 GitHub token。'
  }

  return '请先保存 GitHub token。'
}

function getAuthFailureOperationResult(error: unknown): SyncOperationResult | null {
  const message = getJournalGitAuthenticationErrorMessage(error)

  return message ? {
    message,
    needsAuth: true,
  } : null
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '同步过程中出现未知错误。'
}
