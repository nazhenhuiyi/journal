import {
  JournalSyncCoordinator,
  type SyncOperationRequest,
  type SyncOperationResult,
  type SyncSnapshot,
} from '@journal/sync'
import {
  getMobileGitSyncStatus,
  pullMobileJournalUpdatesFromGitHub,
  syncMobileJournalWithGitHub,
  type MobileGitSyncStatus,
} from './mobileGitSync'
import {
  loadGitHubSyncCredentials,
  loadGitHubSyncSettings,
  saveGitHubSyncCredentials,
  saveGitHubSyncSettings,
  type GitHubSyncCredentialsState,
  type GitHubSyncSettingsState,
} from './secureSyncCredentials'
import {
  loadPendingMobileSyncPaths,
  savePendingMobileSyncPaths,
} from './pendingSyncPaths'
import type { SaveDailyJournalResult } from '../mobileJournalStore'

export type MobileSyncSaveState = 'dirty' | 'idle' | 'loading' | 'saving' | 'saved' | 'error'

export type MobileSyncRuntimeBinding = {
  getSaveState: () => MobileSyncSaveState
  isInputUnstable: () => boolean
  reloadTodayFromDisk: () => Promise<void>
  reloadTodayFromDiskIfChanged: () => Promise<boolean>
  saveCurrentJournal: (options?: {
    scheduleSync?: boolean
    showAlert?: boolean
  }) => Promise<SaveDailyJournalResult | null>
}

export type MobileSyncManagerState = {
  gitStatusError: string | null
  hasLoadedSyncConfiguration: boolean
  hasStoredSyncToken: boolean
  isLoadingGitStatus: boolean
  isSavingSyncConfiguration: boolean
  mobileGitStatus: MobileGitSyncStatus | null
  syncBranch: string
  syncCredentialStatus: GitHubSyncCredentialsState['status']
  syncMessage: string
  syncRemoteUrl: string
  syncSnapshot: SyncSnapshot
  syncTokenDraft: string
}

export type MobileSyncActionResult = {
  alertMessage?: string
  alertTitle?: string
  ok: boolean
}

const mobilePullIntervalMs = 30_000
const mobileRecentCommitLimit = 3

const initialSyncSnapshot: SyncSnapshot = {
  lastError: null,
  lastSyncedAt: null,
  pendingReason: null,
  status: 'idle',
}

const initialState: MobileSyncManagerState = {
  gitStatusError: null,
  hasLoadedSyncConfiguration: false,
  hasStoredSyncToken: false,
  isLoadingGitStatus: false,
  isSavingSyncConfiguration: false,
  mobileGitStatus: null,
  syncBranch: 'main',
  syncCredentialStatus: 'missing',
  syncMessage: '',
  syncRemoteUrl: '',
  syncSnapshot: initialSyncSnapshot,
  syncTokenDraft: '',
}

class MobileSyncManager {
  private coordinator = this.createCoordinator()
  private initializePromise: Promise<void> | null = null
  private listeners = new Set<() => void>()
  private runtimeBinding: MobileSyncRuntimeBinding | null = null
  private state = initialState

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  getState = () => this.state

  initialize = () => {
    if (!this.initializePromise) {
      this.initializePromise = this.loadInitialConfiguration()
    }

    return this.initializePromise
  }

  bindJournalRuntime = (binding: MobileSyncRuntimeBinding) => {
    this.runtimeBinding = binding

    return () => {
      if (this.runtimeBinding === binding) {
        this.runtimeBinding = null
      }
    }
  }

  setSyncBranch = (syncBranch: string) => {
    this.setState({ syncBranch })
  }

  setSyncRemoteUrl = (syncRemoteUrl: string) => {
    this.setState({ syncRemoteUrl })
  }

  setSyncTokenDraft = (syncTokenDraft: string) => {
    this.setState({ syncTokenDraft })
  }

  markLocalSave = (changedPaths: readonly string[]) => {
    this.coordinator.markLocalSave(changedPaths)
  }

  refreshStatus = async (input?: {
    branch?: string
    includeDirtyPaths?: boolean
    remoteUrl?: string
  }) => {
    const branch = input?.branch ?? this.state.syncBranch
    const includeDirtyPaths = input?.includeDirtyPaths ?? false
    const remoteUrl = input?.remoteUrl ?? this.state.syncRemoteUrl

    this.setState({
      gitStatusError: null,
      isLoadingGitStatus: true,
    })

    try {
      const status = await getMobileGitSyncStatus({
        branch: branch.trim() || 'main',
        remoteUrl: remoteUrl.trim(),
      }, {
        includeDirtyPaths,
        recentCommitLimit: mobileRecentCommitLimit,
      })

      this.setState({ mobileGitStatus: status })
      return status
    } catch (error) {
      console.error(error)
      this.setState({ gitStatusError: getErrorMessage(error) })
      return null
    } finally {
      this.setState({ isLoadingGitStatus: false })
    }
  }

  saveConfiguration = async (): Promise<MobileSyncActionResult> => {
    const remoteUrl = this.state.syncRemoteUrl.trim()
    const branch = this.state.syncBranch.trim() || 'main'
    const token = this.state.syncTokenDraft.trim()

    if (!remoteUrl) {
      return {
        alertMessage: '请先填写 GitHub 私有仓库地址。',
        alertTitle: '缺少仓库地址',
        ok: false,
      }
    }

    this.setState({ isSavingSyncConfiguration: true })

    try {
      await saveGitHubSyncSettings({ branch, remoteUrl })

      if (token) {
        await saveGitHubSyncCredentials({ token })
      }

      const hasTokenAfterSave = token ? true : this.state.hasStoredSyncToken
      const nextCredentialStatus = token ? 'available' : this.state.syncCredentialStatus
      const nextConfigurationError = nextCredentialStatus === 'corrupt'
        ? 'GitHub token 无法读取，请重新保存。'
        : null

      this.setState({
        hasStoredSyncToken: hasTokenAfterSave,
        syncBranch: branch,
        syncCredentialStatus: nextCredentialStatus,
        syncMessage: nextConfigurationError
          ?? (hasTokenAfterSave ? '同步配置已保存' : '仓库已保存，继续保存 GitHub token'),
        syncRemoteUrl: remoteUrl,
        syncSnapshot: {
          ...this.state.syncSnapshot,
          lastError: nextConfigurationError,
          status: nextConfigurationError ? 'error' : 'idle',
        },
        syncTokenDraft: token ? '' : this.state.syncTokenDraft,
      })
      await this.refreshStatus({ branch, remoteUrl })
      await this.startPullingIfConfigured()

      return { ok: true }
    } catch (error) {
      console.error(error)
      this.setState({
        syncMessage: '同步配置保存失败',
        syncSnapshot: {
          ...this.state.syncSnapshot,
          lastError: '同步配置保存失败',
          status: 'error',
        },
      })

      return {
        alertMessage: '同步配置没有保存成功。',
        alertTitle: '保存失败',
        ok: false,
      }
    } finally {
      this.setState({ isSavingSyncConfiguration: false })
    }
  }

  syncNow = async (): Promise<MobileSyncActionResult> => {
    const remoteUrl = this.state.syncRemoteUrl.trim()
    const branch = this.state.syncBranch.trim() || 'main'
    const token = this.state.syncTokenDraft.trim()

    if (!remoteUrl) {
      return {
        alertMessage: '请先填写 GitHub 私有仓库地址。',
        alertTitle: '缺少仓库地址',
        ok: false,
      }
    }

    if (!token && !this.state.hasStoredSyncToken) {
      return {
        alertMessage: this.state.syncCredentialStatus === 'corrupt'
          ? '请重新填写并保存 GitHub token。'
          : '请先填写并保存 GitHub token。',
        alertTitle: this.state.syncCredentialStatus === 'corrupt' ? 'Token 无法读取' : '缺少 GitHub token',
        ok: false,
      }
    }

    try {
      await saveGitHubSyncSettings({ branch, remoteUrl })

      if (token) {
        await saveGitHubSyncCredentials({ token })
      }

      const nextCredentialStatus = token ? 'available' : this.state.syncCredentialStatus
      const nextConfigurationError = nextCredentialStatus === 'corrupt'
        ? 'GitHub token 无法读取，请重新保存。'
        : null

      this.setState({
        hasStoredSyncToken: token ? true : this.state.hasStoredSyncToken,
        syncBranch: branch,
        syncCredentialStatus: nextCredentialStatus,
        syncRemoteUrl: remoteUrl,
        syncTokenDraft: token ? '' : this.state.syncTokenDraft,
      })

      if (nextConfigurationError) {
        this.setState({
          syncMessage: nextConfigurationError,
          syncSnapshot: {
            ...this.state.syncSnapshot,
            lastError: nextConfigurationError,
            status: 'error',
          },
        })

        return { ok: false }
      }

      this.setState({ syncMessage: '' })

      const snapshot = await this.coordinator.syncNow()

      if (snapshot.status === 'error' || snapshot.status === 'retrying' || snapshot.status === 'needs-auth') {
        return {
          alertMessage: snapshot.lastError ?? '同步过程中出现未知错误。',
          alertTitle: '同步失败',
          ok: false,
        }
      }

      this.setState({ syncMessage: '同步完成' })
      await this.refreshStatus({ branch, remoteUrl })
      await this.startPullingIfConfigured()

      return { ok: true }
    } catch (error) {
      console.error(error)
      this.setState({
        syncMessage: '同步失败',
        syncSnapshot: {
          ...this.state.syncSnapshot,
          lastError: getErrorMessage(error),
          status: 'error',
        },
      })

      return {
        alertMessage: getErrorMessage(error),
        alertTitle: '同步失败',
        ok: false,
      }
    }
  }

  resume = async () => {
    if (!this.hasCompleteConfiguration()) {
      return
    }

    await this.restorePendingPathsForSync()
    await this.coordinator.notifyForeground()
  }

  flushBeforeLeave = async () => {
    const binding = this.runtimeBinding

    if (binding?.getSaveState() === 'dirty') {
      const savedRecord = await binding.saveCurrentJournal({
        scheduleSync: false,
        showAlert: false,
      })

      if (savedRecord?.didWrite) {
        this.coordinator.markLocalSave(savedRecord.changedPaths)
      }
    }

    if (binding?.isInputUnstable()) {
      return
    }

    await this.coordinator.flushBeforeLeave()
  }

  private createCoordinator() {
    return new JournalSyncCoordinator({
      onPendingChangedPathsChange: (pendingPaths) => {
        void savePendingMobileSyncPaths(pendingPaths).catch((error) => {
          console.error(error)
        })
      },
      onSnapshot: (snapshot) => {
        this.setState({
          syncMessage: snapshot.status === 'synced' ? this.state.syncMessage : '',
          syncSnapshot: snapshot,
        })
      },
      pullIntervalMs: mobilePullIntervalMs,
      runOperation: (request) => this.runOperation(request),
    })
  }

  private async loadInitialConfiguration() {
    try {
      const [settingsState, credentialsState] = await Promise.all([
        loadGitHubSyncSettings(),
        loadGitHubSyncCredentials(),
      ])
      const nextBranch = settingsState.status === 'available' ? settingsState.settings.branch : 'main'
      const nextRemoteUrl = settingsState.status === 'available' ? settingsState.settings.remoteUrl : ''
      const hasToken = credentialsState.status === 'available'
      const configurationError = getSyncConfigurationError(settingsState, credentialsState)

      this.setState({
        hasLoadedSyncConfiguration: true,
        hasStoredSyncToken: hasToken,
        syncBranch: nextBranch,
        syncCredentialStatus: credentialsState.status,
        syncMessage: configurationError ?? '',
        syncRemoteUrl: nextRemoteUrl,
        syncSnapshot: {
          ...this.state.syncSnapshot,
          lastError: configurationError,
          status: configurationError ? 'error' : 'idle',
        },
      })
      await this.startPullingIfConfigured()
    } catch (error) {
      console.error(error)
      this.setState({
        hasLoadedSyncConfiguration: true,
        syncMessage: '同步配置读取失败',
        syncSnapshot: {
          ...this.state.syncSnapshot,
          lastError: '同步配置读取失败',
          status: 'error',
        },
      })
    }
  }

  private async startPullingIfConfigured() {
    if (!this.hasCompleteConfiguration()) {
      this.coordinator.stopPulling()
      return
    }

    await this.restorePendingPathsForSync()
    this.coordinator.startPulling()
  }

  private async restorePendingPathsForSync() {
    if (!this.hasCompleteConfiguration()) {
      return
    }

    try {
      const pendingPaths = await loadPendingMobileSyncPaths()

      this.coordinator.markDirtyWorktree(pendingPaths)
    } catch (error) {
      console.error(error)
    }
  }

  private async runOperation({ changedPaths, operation, trigger }: SyncOperationRequest): Promise<SyncOperationResult> {
    const branch = this.state.syncBranch.trim() || 'main'
    const remoteUrl = this.state.syncRemoteUrl.trim()
    const binding = this.runtimeBinding
    let operationChangedPaths = [...(changedPaths ?? [])]

    if (!remoteUrl) {
      return {
        message: '还没有配置同步仓库',
        needsAuth: true,
      }
    }

    if (!this.state.hasStoredSyncToken) {
      return {
        message: '还没有保存 GitHub token',
        needsAuth: true,
      }
    }

    if (operation === 'pull') {
      if (binding && (binding.getSaveState() === 'dirty' || binding.getSaveState() === 'saving')) {
        return {
          message: '正在编辑，稍后检查远端更新',
          skipped: true,
        }
      }

      const result = await pullMobileJournalUpdatesFromGitHub({ branch, remoteUrl }, undefined, {
        collectDirtyPathsAfterSync: false,
      })
      let didReloadFromDisk = false

      if (result.dirtyPathsAfterPull.length > 0) {
        this.coordinator.markDirtyWorktree(result.dirtyPathsAfterPull)

        return {
          changed: false,
          message: '本地更改等待同步',
        }
      }

      if (binding && canApplyRemoteUpdates(binding.getSaveState())) {
        didReloadFromDisk = await binding.reloadTodayFromDiskIfChanged()
      }

      return {
        changed: result.updatedWorktree || didReloadFromDisk,
      }
    }

    if (binding?.getSaveState() === 'saving') {
      return {
        message: '本地保存还没有完成，稍后同步',
        skipped: true,
      }
    }

    if (binding?.getSaveState() === 'dirty') {
      if (trigger === 'save-idle' && binding.isInputUnstable()) {
        return {
          message: '正在编辑，稍后同步',
          skipped: true,
        }
      }

      const savedRecord = await binding.saveCurrentJournal({
        scheduleSync: false,
        showAlert: operation === 'full',
      })

      if (!savedRecord) {
        return {
          message: '本地保存还没有完成，稍后同步',
          skipped: true,
        }
      }

      if (savedRecord.didWrite) {
        operationChangedPaths = mergeChangedPaths(operationChangedPaths, savedRecord.changedPaths)
        this.coordinator.recordPendingChangedPaths(savedRecord.changedPaths)
      }
    }

    const collectDirtyPathsAfterSync = operationChangedPaths.length === 0

    console.info(`[journal-sync] mobile.operation ok 0ms ${JSON.stringify({
      changedPathCount: operationChangedPaths.length,
      collectDirtyPathsAfterSync,
      operation,
      trigger,
    })}`)

    const result = await syncMobileJournalWithGitHub({ branch, remoteUrl }, undefined, {
      changedPaths: operationChangedPaths.length > 0 ? operationChangedPaths : undefined,
      collectDirtyPathsAfterSync,
    })

    if (binding && canApplyRemoteUpdates(binding.getSaveState())) {
      await binding.reloadTodayFromDisk()
    }

    return {
      changed: Boolean(result.localCommitOid || result.mergeResult || result.retriedPush),
    }
  }

  private hasCompleteConfiguration() {
    return Boolean(this.state.syncRemoteUrl.trim() && this.state.hasStoredSyncToken)
  }

  private setState(nextState: Partial<MobileSyncManagerState>) {
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
}

export const mobileSyncManager = new MobileSyncManager()

function mergeChangedPaths(first: readonly string[], second: readonly string[]) {
  return [...new Set([...first, ...second])].sort()
}

function canApplyRemoteUpdates(saveState: MobileSyncSaveState) {
  return saveState !== 'dirty' && saveState !== 'saving'
}

function getSyncConfigurationError(
  settingsState: GitHubSyncSettingsState,
  credentialsState: GitHubSyncCredentialsState,
) {
  const messages = [
    settingsState.status === 'corrupt' ? settingsState.message ?? '同步配置无法读取，请重新保存仓库地址。' : '',
    credentialsState.status === 'corrupt' ? credentialsState.message ?? 'GitHub token 无法读取，请重新保存。' : '',
  ].filter(Boolean)

  return messages.length > 0 ? messages.join(' ') : null
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '同步过程中出现未知错误。'
}
