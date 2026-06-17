import {
  createSyncSnapshotPersistenceIdentity,
  getDefaultSyncSnapshot,
  getJournalGitAuthenticationErrorMessage,
  JournalSyncCoordinator,
  type JournalGitConflictResolutionStrategy,
  shouldPersistSyncSnapshot,
  type SyncBlockedReason,
  type SyncOperationRequest,
  type SyncOperationResult,
  type SyncSnapshot,
  type SyncSnapshotPersistenceIdentity,
} from '@journal/sync'
import {
  commitMobileJournalChanges,
  getMobileGitSyncStatus,
  pullMobileJournalUpdatesFromGitHub,
  resolveMobileJournalSyncConflict,
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
import {
  loadMobileSyncSnapshot,
  saveMobileSyncSnapshot,
} from './mobileSyncState'
import { createMobileSyncTrace } from './mobileSyncTrace'
import type { SaveDailyJournalResult } from '../mobileJournalStore'
import { saveDailyJournal } from '../mobileJournalStore'
import type { JournalSavedReason } from '../journalEffects'
import { mobileDiagnosticLog } from '../diagnostics/log'

export type MobileSyncSaveState = 'dirty' | 'idle' | 'loading' | 'saving' | 'saved' | 'error'

export type MobileSyncRuntimeBinding = {
  getSaveState: () => MobileSyncSaveState
  isInputUnstable: () => boolean
  onRemoteUpdatesApplied: () => void
  refreshAfterJournalSaved: (input: {
    reason: JournalSavedReason
    record: SaveDailyJournalResult
  }) => Promise<readonly string[]>
  reloadTodayFromDisk: () => Promise<void>
  reloadTodayFromDiskIfChanged: () => Promise<boolean>
  saveCurrentJournal: (options?: {
    emitEvent?: boolean
    reason?: JournalSavedReason
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

export type MobileSyncConflictFixtureInput = {
  date: string
  localText: string
}

type MobileTraceDetails = Record<string, boolean | null | number | string>

const mobilePullIntervalMs = 30_000
const mobileRecentCommitLimit = 3

const initialSyncSnapshot: SyncSnapshot = getDefaultSyncSnapshot()

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
  private syncSnapshotIdentity: SyncSnapshotPersistenceIdentity | null = null
  private trace = createMobileSyncTrace()

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

  showDebugBlockedSnapshot = (reason: SyncBlockedReason) => {
    const block = createDebugSyncBlock(reason)

    this.coordinator.stopPulling()
    this.setState({
      gitStatusError: null,
      isLoadingGitStatus: false,
      syncMessage: block.message,
      syncSnapshot: {
        ...initialSyncSnapshot,
        block,
        lastError: block.message,
        status: 'blocked',
      },
    })
  }

  prepareDebugSyncConflictFixture = async (
    input: MobileSyncConflictFixtureInput,
  ): Promise<MobileSyncActionResult> => {
    const branch = this.state.syncBranch.trim() || 'main'
    const remoteUrl = this.state.syncRemoteUrl.trim()
    const localText = input.localText.trim()

    if (!remoteUrl || !this.state.hasStoredSyncToken || !localText) {
      return {
        alertMessage: '缺少同步冲突 E2E fixture 参数。',
        alertTitle: '无法准备冲突环境',
        ok: false,
      }
    }

    try {
      await this.waitForSyncToSettle()
    } catch (error) {
      return {
        alertMessage: getErrorMessage(error),
        alertTitle: '无法准备冲突环境',
        ok: false,
      }
    }

    const identity = createSyncSnapshotPersistenceIdentity({ branch, remoteUrl })
    const syncingSnapshot: SyncSnapshot = {
      ...initialSyncSnapshot,
      lastError: null,
      pendingReason: null,
      status: 'syncing',
    }

    this.coordinator.stopPulling()
    this.syncSnapshotIdentity = identity
    this.coordinator.restoreSnapshot(syncingSnapshot, { emit: false })
    this.setState({
      gitStatusError: null,
      hasStoredSyncToken: true,
      isLoadingGitStatus: false,
      syncBranch: branch,
      syncCredentialStatus: 'available',
      syncMessage: '准备冲突环境',
      syncRemoteUrl: remoteUrl,
      syncSnapshot: syncingSnapshot,
      syncTokenDraft: '',
    })

    try {
      this.coordinator.stopPulling()

      await this.traceStep(
        'mobile.debugSyncConflictFixture.syncBase',
        () => syncMobileJournalWithGitHub({ branch, remoteUrl }, undefined, {
          changedPaths: [],
          collectDirtyPathsAfterSync: false,
          firstSyncLocalContent: 'empty',
          skipDirtyCheckBeforeMerge: true,
        }),
        {
          branch,
          remoteHost: getRemoteHost(remoteUrl),
        },
      )

      const savedRecord = await this.traceStep(
        'mobile.debugSyncConflictFixture.writeLocal',
        () => saveDailyJournal({
          date: input.date,
          longEntryMarkdown: localText,
          murmurs: [],
        }),
        {
          date: input.date,
        },
      )

      await this.traceStep(
        'mobile.debugSyncConflictFixture.commitLocal',
        () => commitMobileJournalChanges(
          { branch, remoteUrl },
          'Prepare mobile sync conflict local side',
          {
            changedPaths: savedRecord.changedPaths,
            collectDirtyPathsAfterSync: false,
            skipDirtyCheckBeforeMerge: true,
          },
        ),
        {
          changedPathCount: savedRecord.changedPaths.length,
        },
      )

      const preparedSnapshot: SyncSnapshot = {
        ...initialSyncSnapshot,
        pendingReason: 'local-save',
        status: 'pending',
      }

      this.coordinator.restoreSnapshot(preparedSnapshot, { emit: false })
      this.setState({
        syncMessage: '冲突环境已准备',
        syncSnapshot: preparedSnapshot,
      })
      mobileDiagnosticLog.info('sync.debugFixture', 'Prepared mobile sync conflict fixture', {
        branch,
        date: input.date,
        remoteHost: getRemoteHost(remoteUrl),
      })

      return { ok: true }
    } catch (error) {
      const lastError = getErrorMessage(error)
      const errorSnapshot: SyncSnapshot = {
        ...initialSyncSnapshot,
        lastError,
        status: 'error',
      }

      this.coordinator.restoreSnapshot(errorSnapshot, { emit: false })
      this.setState({
        syncMessage: '冲突环境准备失败',
        syncSnapshot: errorSnapshot,
      })
      mobileDiagnosticLog.error('sync.debugFixture', 'Mobile sync conflict fixture failed', {
        branch,
        error,
        remoteHost: getRemoteHost(remoteUrl),
      })

      return {
        alertMessage: lastError,
        alertTitle: '冲突环境准备失败',
        ok: false,
      }
    }
  }

  refreshStatus = async (input?: {
    allowDuringSync?: boolean
    branch?: string
    includeRecentCommits?: boolean
    includeDirtyPaths?: boolean
    remoteUrl?: string
  }) => {
    if (this.state.syncSnapshot.status === 'syncing' && !input?.allowDuringSync) {
      this.trace?.({
        details: {
          reason: 'sync-in-progress',
          skipped: true,
        },
        durationMs: 0,
        name: 'mobile.refreshStatus',
        ok: true,
      })

      return this.state.mobileGitStatus
    }

    const branch = input?.branch ?? this.state.syncBranch
    const includeDirtyPaths = input?.includeDirtyPaths ?? false
    const includeRecentCommits = input?.includeRecentCommits ?? true
    const remoteUrl = input?.remoteUrl ?? this.state.syncRemoteUrl

    this.setState({
      gitStatusError: null,
      isLoadingGitStatus: true,
    })

    try {
      const status = await this.traceStep(
        'mobile.refreshStatus',
        () => getMobileGitSyncStatus({
          branch: branch.trim() || 'main',
          remoteUrl: remoteUrl.trim(),
        }, {
          includeDirtyPaths,
          includeRecentCommits,
          recentCommitLimit: mobileRecentCommitLimit,
        }),
        {
          includeDirtyPaths,
          includeRecentCommits,
        },
      )

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
      mobileDiagnosticLog.warn('sync.configuration', 'Sync configuration save skipped without remote URL')
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
      const nextIdentity = createSyncSnapshotPersistenceIdentity({
        branch,
        remoteUrl,
      })
      const previousIdentity = this.syncSnapshotIdentity
      const didChangeIdentity = !previousIdentity ||
        previousIdentity.branch !== nextIdentity.branch ||
        previousIdentity.remoteUrl !== nextIdentity.remoteUrl
      const nextSnapshot = {
        ...(didChangeIdentity ? initialSyncSnapshot : this.state.syncSnapshot),
        lastError: nextConfigurationError,
        pendingReason: null,
        status: nextConfigurationError ? 'error' : 'idle',
      } satisfies SyncSnapshot

      this.setState({
        hasStoredSyncToken: hasTokenAfterSave,
        syncBranch: branch,
        syncCredentialStatus: nextCredentialStatus,
        syncMessage: nextConfigurationError
          ?? (hasTokenAfterSave ? '同步配置已保存' : '仓库已保存，继续保存 GitHub token'),
        syncRemoteUrl: remoteUrl,
        syncSnapshot: nextSnapshot,
        syncTokenDraft: token ? '' : this.state.syncTokenDraft,
      })
      this.syncSnapshotIdentity = nextIdentity
      this.coordinator.restoreSnapshot(nextSnapshot, { emit: false })
      await this.refreshStatus({ branch, remoteUrl })
      await this.startPullingIfConfigured()
      mobileDiagnosticLog.info('sync.configuration', 'Sync configuration saved', {
        branch,
        didChangeIdentity,
        hasToken: hasTokenAfterSave,
        remoteHost: getRemoteHost(remoteUrl),
      })

      return { ok: true }
    } catch (error) {
      mobileDiagnosticLog.error('sync.configuration', 'Sync configuration save failed', {
        branch,
        error,
        remoteHost: getRemoteHost(remoteUrl),
      })
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
      mobileDiagnosticLog.warn('sync.manual', 'Manual sync skipped without remote URL')
      return {
        alertMessage: '请先填写 GitHub 私有仓库地址。',
        alertTitle: '缺少仓库地址',
        ok: false,
      }
    }

    if (!token && !this.state.hasStoredSyncToken) {
      mobileDiagnosticLog.warn('sync.manual', 'Manual sync skipped without token', {
        branch,
        credentialStatus: this.state.syncCredentialStatus,
        remoteHost: getRemoteHost(remoteUrl),
      })
      return {
        alertMessage: this.state.syncCredentialStatus === 'corrupt'
          ? '请重新填写并保存 GitHub token。'
          : '请先填写并保存 GitHub token。',
        alertTitle: this.state.syncCredentialStatus === 'corrupt' ? 'Token 无法读取' : '缺少 GitHub token',
        ok: false,
      }
    }

    let didPausePulling = false
    mobileDiagnosticLog.info('sync.manual', 'Manual sync requested', {
      branch,
      hasRuntimeToken: Boolean(token),
      hasStoredToken: this.state.hasStoredSyncToken,
      remoteHost: getRemoteHost(remoteUrl),
    })

    try {
      await saveGitHubSyncSettings({ branch, remoteUrl })

      if (token) {
        await saveGitHubSyncCredentials({ token })
      }

      const nextCredentialStatus = token ? 'available' : this.state.syncCredentialStatus
      const nextConfigurationError = nextCredentialStatus === 'corrupt'
        ? 'GitHub token 无法读取，请重新保存。'
        : null
      const nextIdentity = createSyncSnapshotPersistenceIdentity({
        branch,
        remoteUrl,
      })
      const previousIdentity = this.syncSnapshotIdentity
      const didChangeIdentity = !previousIdentity ||
        previousIdentity.branch !== nextIdentity.branch ||
        previousIdentity.remoteUrl !== nextIdentity.remoteUrl
      const nextSnapshot = didChangeIdentity
        ? initialSyncSnapshot
        : this.state.syncSnapshot

      this.setState({
        hasStoredSyncToken: token ? true : this.state.hasStoredSyncToken,
        syncBranch: branch,
        syncCredentialStatus: nextCredentialStatus,
        syncRemoteUrl: remoteUrl,
        syncSnapshot: nextSnapshot,
        syncTokenDraft: token ? '' : this.state.syncTokenDraft,
      })
      this.syncSnapshotIdentity = nextIdentity
      this.coordinator.restoreSnapshot(nextSnapshot, { emit: false })

      if (nextConfigurationError) {
        const errorSnapshot = {
          ...this.state.syncSnapshot,
          lastError: nextConfigurationError,
          pendingReason: null,
          status: 'error',
        } satisfies SyncSnapshot

        this.setState({
          syncMessage: nextConfigurationError,
          syncSnapshot: errorSnapshot,
        })
        this.coordinator.restoreSnapshot(errorSnapshot, { emit: false })
        mobileDiagnosticLog.error('sync.manual', 'Manual sync stopped by configuration error', {
          branch,
          errorMessage: nextConfigurationError,
          remoteHost: getRemoteHost(remoteUrl),
        })

        return { ok: false }
      }

      this.setState({ syncMessage: '' })

      this.coordinator.stopPulling()
      didPausePulling = true

      const snapshot = await this.coordinator.syncNow()

      if (
        snapshot.status === 'blocked' ||
        snapshot.status === 'error' ||
        snapshot.status === 'retrying' ||
        snapshot.status === 'needs-auth'
      ) {
        const isBlocked = snapshot.status === 'blocked'

        mobileDiagnosticLog.error('sync.manual', 'Manual sync finished with error snapshot', {
          branch,
          lastError: snapshot.lastError,
          remoteHost: getRemoteHost(remoteUrl),
          status: snapshot.status,
        })
        return {
          alertMessage: snapshot.lastError ?? (isBlocked ? '同步受阻，需要处理后再继续。' : '同步过程中出现未知错误。'),
          alertTitle: isBlocked ? '同步受阻' : '同步失败',
          ok: false,
        }
      }

      this.setState({ syncMessage: '同步完成' })
      await this.refreshStatus({
        allowDuringSync: true,
        branch,
        includeRecentCommits: false,
        remoteUrl,
      })
      mobileDiagnosticLog.info('sync.manual', 'Manual sync completed', {
        branch,
        remoteHost: getRemoteHost(remoteUrl),
        status: snapshot.status,
      })

      return { ok: true }
    } catch (error) {
      mobileDiagnosticLog.error('sync.manual', 'Manual sync failed', {
        branch,
        error,
        remoteHost: getRemoteHost(remoteUrl),
      })
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
    } finally {
      if (didPausePulling) {
        await this.startPullingIfConfigured({ immediate: false })
      }
    }
  }

  resolveConflict = async (
    strategy: JournalGitConflictResolutionStrategy,
  ): Promise<MobileSyncActionResult> => {
    const remoteUrl = this.state.syncRemoteUrl.trim()
    const branch = this.state.syncBranch.trim() || 'main'
    const token = this.state.syncTokenDraft.trim()
    const binding = this.runtimeBinding

    if (this.state.syncSnapshot.status !== 'blocked' || this.state.syncSnapshot.block?.reason !== 'content-conflict') {
      return {
        alertMessage: '当前没有需要选边处理的内容冲突。',
        alertTitle: '无需处理',
        ok: false,
      }
    }

    if (binding?.getSaveState() === 'dirty' || binding?.getSaveState() === 'saving' || binding?.isInputUnstable()) {
      return {
        alertMessage: '请先保存当前日记，再处理同步冲突。',
        alertTitle: '本地内容尚未稳定',
        ok: false,
      }
    }

    if (!remoteUrl) {
      return {
        alertMessage: '请先填写 GitHub 私有仓库地址。',
        alertTitle: '缺少仓库地址',
        ok: false,
      }
    }

    if (!token && !this.state.hasStoredSyncToken) {
      return {
        alertMessage: '请先填写并保存 GitHub token。',
        alertTitle: '缺少 GitHub token',
        ok: false,
      }
    }

    this.coordinator.stopPulling()
    this.setState({
      syncMessage: '',
      syncSnapshot: {
        ...this.state.syncSnapshot,
        status: 'syncing',
      },
    })

    try {
      await saveGitHubSyncSettings({ branch, remoteUrl })

      if (token) {
        await saveGitHubSyncCredentials({ token })
      }

      const nextIdentity = createSyncSnapshotPersistenceIdentity({ branch, remoteUrl })

      this.syncSnapshotIdentity = nextIdentity
      this.setState({
        hasStoredSyncToken: token ? true : this.state.hasStoredSyncToken,
        syncBranch: branch,
        syncCredentialStatus: token ? 'available' : this.state.syncCredentialStatus,
        syncRemoteUrl: remoteUrl,
        syncTokenDraft: token ? '' : this.state.syncTokenDraft,
      })

      const result = await this.traceStep(
        'mobile.resolveConflict',
        () => resolveMobileJournalSyncConflict({ branch, remoteUrl }, { strategy }),
        {
          branch,
          remoteHost: getRemoteHost(remoteUrl),
          strategy,
        },
      )

      if (binding && canApplyRemoteUpdates(binding.getSaveState())) {
        await this.traceStep('mobile.reloadTodayAfterConflictResolution', () => binding.reloadTodayFromDisk(), {
          strategy,
        })
      }

      if (result.updatedWorktree) {
        binding?.onRemoteUpdatesApplied()
      }

      const snapshot: SyncSnapshot = {
        ...initialSyncSnapshot,
        lastSyncedAt: new Date().toISOString(),
        status: 'synced',
      }

      this.coordinator.restoreSnapshot(snapshot, { emit: false })
      this.setState({
        syncMessage: getConflictResolutionSuccessMessage(strategy),
        syncSnapshot: snapshot,
      })
      this.persistSnapshot(snapshot)
      await this.refreshStatus({
        allowDuringSync: true,
        branch,
        includeRecentCommits: false,
        remoteUrl,
      })

      return { ok: true }
    } catch (error) {
      const authResult = getAuthFailureOperationResult(error)
      const lastError = authResult?.message ?? getErrorMessage(error)

      this.setState({
        syncMessage: '冲突处理失败',
        syncSnapshot: {
          ...this.state.syncSnapshot,
          lastError,
          status: authResult ? 'needs-auth' : 'blocked',
        },
      })

      return {
        alertMessage: lastError,
        alertTitle: authResult ? '需要重新连接' : '冲突处理失败',
        ok: false,
      }
    } finally {
      await this.startPullingIfConfigured({ immediate: false })
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
        emitEvent: false,
        reason: 'background-flush',
        scheduleSync: false,
        showAlert: false,
      })

      if (savedRecord?.didWrite) {
        const changedPaths = await this.collectSavedJournalChangedPaths(
          binding,
          'background-flush',
          savedRecord,
        )

        this.coordinator.markLocalSave(changedPaths)
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
        this.persistSnapshot(snapshot)
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
      const identity = nextRemoteUrl
        ? createSyncSnapshotPersistenceIdentity({
            branch: nextBranch,
            remoteUrl: nextRemoteUrl,
          })
        : null
      const restoredSnapshot = identity && !configurationError
        ? await loadMobileSyncSnapshot(identity)
        : null
      const nextSnapshot = configurationError
        ? {
            ...initialSyncSnapshot,
            lastError: configurationError,
            status: 'error',
          } satisfies SyncSnapshot
        : restoredSnapshot ?? initialSyncSnapshot

      this.syncSnapshotIdentity = identity
      this.coordinator.restoreSnapshot(nextSnapshot, { emit: false })
      this.setState({
        hasLoadedSyncConfiguration: true,
        hasStoredSyncToken: hasToken,
        syncBranch: nextBranch,
        syncCredentialStatus: credentialsState.status,
        syncMessage: configurationError ?? '',
        syncRemoteUrl: nextRemoteUrl,
        syncSnapshot: nextSnapshot,
      })
      mobileDiagnosticLog.info('sync.configuration', 'Sync configuration loaded', {
        branch: nextBranch,
        credentialStatus: credentialsState.status,
        hasRemoteUrl: Boolean(nextRemoteUrl),
        hasToken,
        remoteHost: getRemoteHost(nextRemoteUrl),
        restoredSnapshot: Boolean(restoredSnapshot),
      })
      await this.startPullingIfConfigured()
    } catch (error) {
      mobileDiagnosticLog.error('sync.configuration', 'Sync configuration load failed', {
        error,
      })
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

  private async startPullingIfConfigured(options: { immediate?: boolean } = {}) {
    if (!this.hasCompleteConfiguration()) {
      this.coordinator.stopPulling()
      return
    }

    await this.restorePendingPathsForSync()
    this.coordinator.startPulling({ immediate: options.immediate })
  }

  private async restorePendingPathsForSync() {
    if (!this.hasCompleteConfiguration()) {
      return
    }

    try {
      const pendingPaths = await loadPendingMobileSyncPaths()

      this.coordinator.markDirtyWorktree(pendingPaths)
    } catch (error) {
      mobileDiagnosticLog.error('sync.pending-paths', 'Pending sync paths restore failed', {
        error,
      })
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
      const saveState = binding?.getSaveState()
      const hasPendingLocalChanges = this.coordinator.hasPendingLocalChanges()

      if (saveState === 'dirty' || saveState === 'saving' || hasPendingLocalChanges) {
        return {
          message: hasPendingLocalChanges
            ? '本地更改等待同步，稍后检查远端更新'
            : '正在编辑，稍后检查远端更新',
          skipped: true,
        }
      }

      const trustCleanWorktree = saveState !== undefined && canApplyRemoteUpdates(saveState)
      let result: Awaited<ReturnType<typeof pullMobileJournalUpdatesFromGitHub>>

      try {
        result = await this.traceStep(
          'mobile.pullCore',
          () => pullMobileJournalUpdatesFromGitHub({ branch, remoteUrl }, undefined, {
            collectDirtyPathsAfterSync: false,
            skipDirtyCheckBeforeMerge: trustCleanWorktree,
          }),
          {
            operation,
            skipDirtyCheckBeforeMerge: trustCleanWorktree,
            trigger,
          },
        )
      } catch (error) {
        const authResult = getAuthFailureOperationResult(error)

        if (authResult) {
          return authResult
        }

        throw error
      }
      let didReloadFromDisk = false

      if (result.dirtyPathsAfterPull.length > 0) {
        this.coordinator.markDirtyWorktree(result.dirtyPathsAfterPull)

        return {
          changed: false,
          message: '本地更改等待同步',
        }
      }

      if (binding && canApplyRemoteUpdates(binding.getSaveState())) {
        didReloadFromDisk = await this.traceStep(
          'mobile.reloadTodayIfChanged',
          () => binding.reloadTodayFromDiskIfChanged(),
          { operation, trigger },
        )
      }

      if (result.updatedWorktree || didReloadFromDisk) {
        binding?.onRemoteUpdatesApplied()
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

      const savedRecord = await this.traceStep(
        'mobile.saveCurrentJournal',
        () => binding.saveCurrentJournal({
          emitEvent: false,
          reason: 'sync',
          scheduleSync: false,
          showAlert: operation === 'full',
        }),
        {
          operation,
          trigger,
        },
      )

      if (!savedRecord) {
        return {
          message: '本地保存还没有完成，稍后同步',
          skipped: true,
        }
      }

      if (savedRecord.didWrite) {
        const changedPaths = await this.collectSavedJournalChangedPaths(
          binding,
          'sync',
          savedRecord,
        )

        operationChangedPaths = mergeChangedPaths(operationChangedPaths, changedPaths)
        this.coordinator.recordPendingChangedPaths(changedPaths)
      }
    }

    const saveStateBeforeSync = binding?.getSaveState()
    const trustCleanWorktree = operationChangedPaths.length === 0
      && saveStateBeforeSync !== undefined
      && canApplyRemoteUpdates(saveStateBeforeSync)
    const collectDirtyPathsAfterSync = operationChangedPaths.length === 0 && !trustCleanWorktree
    const changedPathsForSync = operationChangedPaths.length > 0
      ? operationChangedPaths
      : trustCleanWorktree
        ? []
        : undefined

    this.trace?.({
      details: {
        changedPathCount: operationChangedPaths.length,
        collectDirtyPathsAfterSync,
        operation,
        trustCleanWorktree,
        trigger,
      },
      durationMs: 0,
      name: 'mobile.operation',
      ok: true,
    })

    let result: Awaited<ReturnType<typeof syncMobileJournalWithGitHub>>

    try {
      result = await this.traceStep(
        'mobile.syncCore',
        () => syncMobileJournalWithGitHub({ branch, remoteUrl }, undefined, {
          changedPaths: changedPathsForSync,
          collectDirtyPathsAfterSync,
          skipDirtyCheckBeforeMerge: trustCleanWorktree,
        }),
        {
          changedPathCount: operationChangedPaths.length,
          collectDirtyPathsAfterSync,
          operation,
          skipDirtyCheckBeforeMerge: trustCleanWorktree,
          trigger,
        },
      )
    } catch (error) {
      const authResult = getAuthFailureOperationResult(error)

      if (authResult) {
        return authResult
      }

      throw error
    }

    if (binding && canApplyRemoteUpdates(binding.getSaveState())) {
      await this.traceStep('mobile.reloadToday', () => binding.reloadTodayFromDisk(), {
        operation,
        trigger,
      })
    }

    if (result.mergeCommitOid || result.mergeResult) {
      binding?.onRemoteUpdatesApplied()
    }

    return {
      changed: Boolean(result.localCommitOid || result.mergeResult || result.retriedPush),
    }
  }

  private hasCompleteConfiguration() {
    return Boolean(this.state.syncRemoteUrl.trim() && this.state.hasStoredSyncToken)
  }

  private persistSnapshot(snapshot: SyncSnapshot) {
    const identity = this.syncSnapshotIdentity

    if (!identity || !shouldPersistSyncSnapshot(snapshot)) {
      return
    }

    void saveMobileSyncSnapshot({
      identity,
      snapshot,
    }).catch((error) => {
      console.error(error)
    })
  }

  private async waitForSyncToSettle() {
    const timeoutMs = 30_000
    const startedAt = Date.now()

    while (this.state.syncSnapshot.status === 'syncing' && Date.now() - startedAt < timeoutMs) {
      await delay(250)
    }

    if (this.state.syncSnapshot.status === 'syncing') {
      throw new Error('同步仍在进行中，请稍后再准备冲突环境。')
    }
  }

  private async collectSavedJournalChangedPaths(
    binding: MobileSyncRuntimeBinding,
    reason: JournalSavedReason,
    record: SaveDailyJournalResult,
  ) {
    try {
      const effectChangedPaths = await this.traceStep(
        'mobile.collectChangedPaths',
        () => binding.refreshAfterJournalSaved({
          reason,
          record,
        }),
        {
          recordChangedPathCount: record.changedPaths.length,
          reason,
        },
      )

      return mergeChangedPaths(record.changedPaths, effectChangedPaths)
    } catch (error) {
      mobileDiagnosticLog.error('sync.changed-paths', 'Collecting saved journal changed paths failed', {
        error,
        recordChangedPathCount: record.changedPaths.length,
        reason,
      })
      console.error(error)
      return record.changedPaths
    }
  }

  private async traceStep<T>(
    name: string,
    operation: () => Promise<T>,
    details: MobileTraceDetails = {},
  ) {
    const startedAt = Date.now()

    try {
      const result = await operation()

      this.trace?.({
        details,
        durationMs: Date.now() - startedAt,
        name,
        ok: true,
      })

      return result
    } catch (error) {
      this.trace?.({
        details,
        durationMs: Date.now() - startedAt,
        errorMessage: getErrorMessage(error),
        name,
        ok: false,
      })

      throw error
    }
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

function getConflictResolutionSuccessMessage(strategy: JournalGitConflictResolutionStrategy) {
  if (strategy === 'keep-local') {
    return '已保留本机内容'
  }

  if (strategy === 'keep-remote') {
    return '已保留远端内容'
  }

  return '已保留两边内容'
}

function createDebugSyncBlock(reason: SyncBlockedReason) {
  if (reason === 'content-conflict') {
    return {
      conflicts: [
        {
          ours: '本机段落：移动端 blocked 验收。',
          path: 'entries/2026/06/2026-06-16.md',
          theirs: '远端段落：GitHub 同段修改。',
        },
      ],
      message: '本机和远端改到了同一段内容，同步已暂停。',
      paths: [
        'entries/2026/06/2026-06-16.md',
        'reviews/2026/06/2026-06-16.json',
      ],
      reason,
    }
  }

  if (reason === 'first-sync-needs-choice') {
    return {
      message: '本机和远端都已有内容，需要先选择首次同步方向。',
      paths: [
        'entries/2026/06/2026-06-16.md',
        'manifest.json',
      ],
      reason,
    }
  }

  if (reason === 'unrelated-histories') {
    return {
      message: '本机和远端不是同一条同步历史，同步已暂停。',
      paths: ['entries/2026/06/2026-06-16.md'],
      reason,
    }
  }

  return {
    message: '本地同步仓库暂时不可读，同步已暂停。',
    paths: ['.git/objects/pack'],
    reason,
    retryAfterMs: 300_000,
  }
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

function getAuthFailureOperationResult(error: unknown): SyncOperationResult | null {
  const message = getJournalGitAuthenticationErrorMessage(error)

  return message ? {
    message,
    needsAuth: true,
  } : null
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function getRemoteHost(remoteUrl: string) {
  if (!remoteUrl) {
    return ''
  }

  try {
    return new URL(remoteUrl).hostname
  } catch {
    const sshHost = /^[^@]+@([^:/]+)[:/]/.exec(remoteUrl)

    return sshHost?.[1] ?? 'unknown'
  }
}
