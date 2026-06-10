import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AppState } from 'react-native'
import {
  JournalSyncCoordinator,
  type SyncOperationRequest,
  type SyncOperationResult,
  type SyncSnapshot,
} from '@journal/sync'
import {
  getMobileGitSyncStatus,
  loadGitHubSyncCredentials,
  loadGitHubSyncSettings,
  loadPendingMobileSyncPaths,
  pullMobileJournalUpdatesFromGitHub,
  saveGitHubSyncCredentials,
  saveGitHubSyncSettings,
  savePendingMobileSyncPaths,
  syncMobileJournalWithGitHub,
  type GitHubSyncCredentialsState,
  type GitHubSyncSettingsState,
  type MobileGitSyncStatus,
} from '../services/sync'
import type {
  MobileLocalSaveHandlerRef,
  SaveCurrentJournalRef,
  SaveState,
} from './useMobileJournal'

const mobilePullIntervalMs = 30_000
const mobileRecentCommitLimit = 3

const initialSyncSnapshot: SyncSnapshot = {
  lastError: null,
  lastSyncedAt: null,
  pendingReason: null,
  status: 'idle',
}

type UseMobileSyncOptions = {
  checkForDateRollover: () => Promise<boolean>
  isLongEntryInputUnstable: () => boolean
  onLocalSaveRef: MobileLocalSaveHandlerRef
  reloadTodayFromDisk: () => Promise<void>
  reloadTodayFromDiskIfChanged: () => Promise<boolean>
  saveCurrentJournalRef: SaveCurrentJournalRef
  saveStateRef: React.MutableRefObject<SaveState>
}

export function useMobileSync({
  checkForDateRollover,
  isLongEntryInputUnstable,
  onLocalSaveRef,
  reloadTodayFromDisk,
  reloadTodayFromDiskIfChanged,
  saveCurrentJournalRef,
  saveStateRef,
}: UseMobileSyncOptions) {
  const [hasLoadedSyncConfiguration, setHasLoadedSyncConfiguration] = useState(false)
  const [syncBranch, setSyncBranch] = useState('main')
  const [isSavingSyncConfiguration, setIsSavingSyncConfiguration] = useState(false)
  const [isLoadingGitStatus, setIsLoadingGitStatus] = useState(false)
  const [gitStatusError, setGitStatusError] = useState<string | null>(null)
  const [mobileGitStatus, setMobileGitStatus] = useState<MobileGitSyncStatus | null>(null)
  const [syncMessage, setSyncMessage] = useState('')
  const [syncRemoteUrl, setSyncRemoteUrl] = useState('')
  const [syncSnapshot, setSyncSnapshot] = useState<SyncSnapshot>(initialSyncSnapshot)
  const [syncTokenDraft, setSyncTokenDraft] = useState('')
  const [hasStoredSyncToken, setHasStoredSyncToken] = useState(false)
  const [syncCredentialStatus, setSyncCredentialStatus] = useState<GitHubSyncCredentialsState['status']>('missing')
  const coordinatorRef = useRef<JournalSyncCoordinator | null>(null)
  const runMobileSyncOperationRef = useRef<(request: SyncOperationRequest) => Promise<SyncOperationResult>>(
    async () => ({
      message: '同步还没准备好',
      skipped: true,
    }),
  )
  const syncConfigRef = useRef({
    branch: 'main',
    hasStoredSyncToken: false,
    remoteUrl: '',
  })

  const refreshMobileGitStatus = useCallback(async (input?: {
    branch?: string
    includeDirtyPaths?: boolean
    remoteUrl?: string
  }) => {
    const branch = input?.branch ?? syncConfigRef.current.branch
    const includeDirtyPaths = input?.includeDirtyPaths ?? false
    const remoteUrl = input?.remoteUrl ?? syncConfigRef.current.remoteUrl

    setIsLoadingGitStatus(true)
    setGitStatusError(null)

    try {
      const status = await getMobileGitSyncStatus({
        branch: branch.trim() || 'main',
        remoteUrl: remoteUrl.trim(),
      }, {
        includeDirtyPaths,
        recentCommitLimit: mobileRecentCommitLimit,
      })

      setMobileGitStatus(status)
      return status
    } catch (error) {
      console.error(error)
      setGitStatusError(getErrorMessage(error))
      return null
    } finally {
      setIsLoadingGitStatus(false)
    }
  }, [])

  useEffect(() => {
    syncConfigRef.current = {
      branch: syncBranch,
      hasStoredSyncToken,
      remoteUrl: syncRemoteUrl,
    }
  }, [hasStoredSyncToken, syncBranch, syncRemoteUrl])

  const restorePendingPathsForSync = useCallback(async (input?: {
    branch?: string
    hasStoredSyncToken?: boolean
    remoteUrl?: string
  }) => {
    const hasToken = input?.hasStoredSyncToken ?? syncConfigRef.current.hasStoredSyncToken
    const remoteUrl = input?.remoteUrl ?? syncConfigRef.current.remoteUrl

    if (!remoteUrl.trim() || !hasToken) {
      return
    }

    try {
      const pendingPaths = await loadPendingMobileSyncPaths()

      coordinatorRef.current?.markDirtyWorktree(pendingPaths)
    } catch (error) {
      console.error(error)
    }
  }, [])

  const resumeConfiguredSync = useCallback(async () => {
    if (!syncConfigRef.current.remoteUrl.trim() || !syncConfigRef.current.hasStoredSyncToken) {
      return
    }

    await restorePendingPathsForSync()
    await coordinatorRef.current?.notifyForeground()
  }, [restorePendingPathsForSync])

  useEffect(() => {
    let isMounted = true

    Promise.all([
      loadGitHubSyncSettings(),
      loadGitHubSyncCredentials(),
    ])
      .then(([settingsState, credentialsState]) => {
        if (!isMounted) {
          return
        }

        const nextBranch = settingsState.status === 'available' ? settingsState.settings.branch : 'main'
        const nextRemoteUrl = settingsState.status === 'available' ? settingsState.settings.remoteUrl : ''
        const hasToken = credentialsState.status === 'available'
        const configurationError = getSyncConfigurationError(settingsState, credentialsState)

        syncConfigRef.current = {
          branch: nextBranch,
          hasStoredSyncToken: hasToken,
          remoteUrl: nextRemoteUrl,
        }

        setSyncBranch(nextBranch)
        setSyncRemoteUrl(nextRemoteUrl)
        setHasStoredSyncToken(hasToken)
        setSyncCredentialStatus(credentialsState.status)
        setSyncSnapshot((currentSnapshot) => ({
          ...currentSnapshot,
          lastError: configurationError,
          status: configurationError ? 'error' : 'idle',
        }))
        setSyncMessage(configurationError ?? '')
        setHasLoadedSyncConfiguration(true)
      })
      .catch((error) => {
        console.error(error)

        if (isMounted) {
          setSyncSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            lastError: '同步配置读取失败',
            status: 'error',
          }))
          setSyncMessage('同步配置读取失败')
          setHasLoadedSyncConfiguration(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const saveSyncConfiguration = useCallback(async () => {
    const remoteUrl = syncRemoteUrl.trim()
    const branch = syncBranch.trim() || 'main'
    const token = syncTokenDraft.trim()

    if (!remoteUrl) {
      Alert.alert('缺少仓库地址', '请先填写 GitHub 私有仓库地址。')
      return false
    }

    setIsSavingSyncConfiguration(true)

    try {
      await saveGitHubSyncSettings({ branch, remoteUrl })

      if (token) {
        await saveGitHubSyncCredentials({ token })
        setSyncTokenDraft('')
        setHasStoredSyncToken(true)
        setSyncCredentialStatus('available')
      }

      const hasTokenAfterSave = token ? true : hasStoredSyncToken
      const nextCredentialStatus = token ? 'available' : syncCredentialStatus
      const nextConfigurationError = nextCredentialStatus === 'corrupt'
        ? 'GitHub token 无法读取，请重新保存。'
        : null

      syncConfigRef.current = {
        branch,
        hasStoredSyncToken: hasTokenAfterSave,
        remoteUrl,
      }
      setSyncBranch(branch)
      setSyncRemoteUrl(remoteUrl)
      setSyncMessage(
        nextConfigurationError
          ?? (hasTokenAfterSave ? '同步配置已保存' : '仓库已保存，继续保存 GitHub token'),
      )
      setSyncSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        lastError: nextConfigurationError,
        status: nextConfigurationError ? 'error' : 'idle',
      }))
      await refreshMobileGitStatus({ branch, remoteUrl })
      void resumeConfiguredSync()
      return true
    } catch (error) {
      console.error(error)
      setSyncSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        lastError: '同步配置保存失败',
        status: 'error',
      }))
      setSyncMessage('同步配置保存失败')
      Alert.alert('保存失败', '同步配置没有保存成功。')
      return false
    } finally {
      setIsSavingSyncConfiguration(false)
    }
  }, [
    hasStoredSyncToken,
    refreshMobileGitStatus,
    resumeConfiguredSync,
    syncBranch,
    syncCredentialStatus,
    syncRemoteUrl,
    syncTokenDraft,
  ])

  const runMobileSyncOperation = useCallback(async ({ changedPaths, operation, trigger }: SyncOperationRequest) => {
    const branch = syncConfigRef.current.branch.trim() || 'main'
    const remoteUrl = syncConfigRef.current.remoteUrl.trim()
    let operationChangedPaths = [...(changedPaths ?? [])]

    if (!remoteUrl) {
      return {
        message: '还没有配置同步仓库',
        needsAuth: true,
      }
    }

    if (!syncConfigRef.current.hasStoredSyncToken) {
      return {
        message: '还没有保存 GitHub token',
        needsAuth: true,
      }
    }

    if (operation === 'pull') {
      if (saveStateRef.current === 'dirty' || saveStateRef.current === 'saving') {
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
        coordinatorRef.current?.markDirtyWorktree(result.dirtyPathsAfterPull)

        return {
          changed: false,
          message: '本地更改等待同步',
        }
      }

      if (canApplyRemoteUpdates(saveStateRef.current)) {
        didReloadFromDisk = await reloadTodayFromDiskIfChanged()
      }

      return {
        changed: result.updatedWorktree || didReloadFromDisk,
      }
    }

    if (saveStateRef.current === 'saving') {
      return {
        message: '本地保存还没有完成，稍后同步',
        skipped: true,
      }
    }

    if (saveStateRef.current === 'dirty') {
      if (trigger === 'save-idle' && isLongEntryInputUnstable()) {
        return {
          message: '正在编辑，稍后同步',
          skipped: true,
        }
      }

      const savedRecord = await saveCurrentJournalRef.current?.({
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
        coordinatorRef.current?.recordPendingChangedPaths(savedRecord.changedPaths)
      }
    }

    const collectDirtyPathsAfterSync = operationChangedPaths.length === 0
    logMobileSyncOperation({
      changedPathCount: operationChangedPaths.length,
      collectDirtyPathsAfterSync,
      operation,
      trigger,
    })
    const result = await syncMobileJournalWithGitHub({ branch, remoteUrl }, undefined, {
      changedPaths: operationChangedPaths.length > 0 ? operationChangedPaths : undefined,
      collectDirtyPathsAfterSync,
    })

    if (canApplyRemoteUpdates(saveStateRef.current)) {
      await reloadTodayFromDisk()
    }

    return {
      changed: Boolean(result.localCommitOid || result.mergeResult || result.retriedPush),
    }
  }, [
    isLongEntryInputUnstable,
    reloadTodayFromDisk,
    reloadTodayFromDiskIfChanged,
    saveCurrentJournalRef,
    saveStateRef,
  ])

  useEffect(() => {
    runMobileSyncOperationRef.current = runMobileSyncOperation
  }, [runMobileSyncOperation])

  useEffect(() => {
    const coordinator = new JournalSyncCoordinator({
      onSnapshot: (snapshot) => {
        setSyncSnapshot(snapshot)

        if (snapshot.status !== 'synced') {
          setSyncMessage('')
        }
      },
      onPendingChangedPathsChange: (pendingPaths) => {
        void savePendingMobileSyncPaths(pendingPaths).catch((error) => {
          console.error(error)
        })
      },
      pullIntervalMs: mobilePullIntervalMs,
      runOperation: (request) => runMobileSyncOperationRef.current(request),
    })
    const markLocalSave = (changedPaths: readonly string[]) => {
      coordinator.markLocalSave(changedPaths)
    }

    coordinatorRef.current = coordinator
    onLocalSaveRef.current = markLocalSave

    return () => {
      coordinator.dispose()

      if (coordinatorRef.current === coordinator) {
        coordinatorRef.current = null
      }

      if (onLocalSaveRef.current === markLocalSave) {
        onLocalSaveRef.current = null
      }
    }
  }, [onLocalSaveRef])

  useEffect(() => {
    const coordinator = coordinatorRef.current

    if (!coordinator || !hasLoadedSyncConfiguration) {
      return undefined
    }

    if (syncRemoteUrl.trim() && hasStoredSyncToken) {
      let isCancelled = false

      void restorePendingPathsForSync().then(() => {
        if (!isCancelled) {
          coordinator.startPulling()
        }
      })

      return () => {
        isCancelled = true
        coordinator.stopPulling()
      }
    }

    coordinator.stopPulling()

    return undefined
  }, [hasLoadedSyncConfiguration, hasStoredSyncToken, restorePendingPathsForSync, syncRemoteUrl])

  const flushBeforeLeavingApp = useCallback(async () => {
    if (saveStateRef.current === 'dirty') {
      const savedRecord = await saveCurrentJournalRef.current?.({
        scheduleSync: false,
        showAlert: false,
      })

      if (savedRecord?.didWrite) {
        coordinatorRef.current?.markLocalSave(savedRecord.changedPaths)
      }
    }

    if (isLongEntryInputUnstable()) {
      return
    }

    await coordinatorRef.current?.flushBeforeLeave()
  }, [isLongEntryInputUnstable, saveCurrentJournalRef, saveStateRef])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void checkForDateRollover()
          .catch((error) => {
            console.error(error)
          })
          .finally(() => {
            void resumeConfiguredSync()
          })
      } else if (nextState === 'background' || nextState === 'inactive') {
        void flushBeforeLeavingApp()
      }
    })

    return () => subscription.remove()
  }, [checkForDateRollover, flushBeforeLeavingApp, resumeConfiguredSync])

  const handleSyncNow = useCallback(async () => {
    const remoteUrl = syncRemoteUrl.trim()
    const branch = syncBranch.trim() || 'main'
    const token = syncTokenDraft.trim()

    if (!remoteUrl) {
      Alert.alert('缺少仓库地址', '请先填写 GitHub 私有仓库地址。')
      return
    }

    if (!token && !hasStoredSyncToken) {
      Alert.alert(
        syncCredentialStatus === 'corrupt' ? 'Token 无法读取' : '缺少 GitHub token',
        syncCredentialStatus === 'corrupt'
          ? '请重新填写并保存 GitHub token。'
          : '请先填写并保存 GitHub token。',
      )
      return
    }

    try {
      await saveGitHubSyncSettings({ branch, remoteUrl })

      if (token) {
        await saveGitHubSyncCredentials({ token })
        setSyncTokenDraft('')
        setHasStoredSyncToken(true)
        setSyncCredentialStatus('available')
      }

      const nextCredentialStatus = token ? 'available' : syncCredentialStatus
      const nextConfigurationError = nextCredentialStatus === 'corrupt'
        ? 'GitHub token 无法读取，请重新保存。'
        : null

      syncConfigRef.current = {
        remoteUrl,
        branch,
        hasStoredSyncToken: token ? true : hasStoredSyncToken,
      }

      setSyncBranch(branch)
      setSyncRemoteUrl(remoteUrl)
      if (nextConfigurationError) {
        setSyncSnapshot((currentSnapshot) => ({
          ...currentSnapshot,
          lastError: nextConfigurationError,
          status: 'error',
        }))
        setSyncMessage(nextConfigurationError)
        return
      }

      setSyncMessage('')

      const snapshot = await coordinatorRef.current?.syncNow()

      if (snapshot?.status === 'error' || snapshot?.status === 'retrying' || snapshot?.status === 'needs-auth') {
        Alert.alert('同步失败', snapshot.lastError ?? '同步过程中出现未知错误。')
      } else {
        setSyncMessage('同步完成')
      }

      await refreshMobileGitStatus({ branch, remoteUrl })
    } catch (error) {
      console.error(error)
      setSyncSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        lastError: getErrorMessage(error),
        status: 'error',
      }))
      setSyncMessage('同步失败')
      Alert.alert('同步失败', getErrorMessage(error))
    }
  }, [
    hasStoredSyncToken,
    refreshMobileGitStatus,
    syncBranch,
    syncCredentialStatus,
    syncRemoteUrl,
    syncTokenDraft,
  ])

  return {
    gitStatusError,
    handleSyncNow,
    hasLoadedSyncConfiguration,
    hasStoredSyncToken,
    isLoadingGitStatus,
    isSavingSyncConfiguration,
    mobileGitStatus,
    refreshMobileGitStatus,
    saveSyncConfiguration,
    setSyncBranch,
    setSyncRemoteUrl,
    setSyncTokenDraft,
    syncBranch,
    syncMessage,
    syncRemoteUrl,
    syncSnapshot,
    syncTokenDraft,
  }
}

function mergeChangedPaths(
  first: readonly string[],
  second: readonly string[],
) {
  return [...new Set([...first, ...second])].sort()
}

function logMobileSyncOperation(details: {
  changedPathCount: number
  collectDirtyPathsAfterSync: boolean
  operation: SyncOperationRequest['operation']
  trigger: SyncOperationRequest['trigger']
}) {
  console.info(`[journal-sync] mobile.operation ok 0ms ${JSON.stringify(details)}`)
}

function canApplyRemoteUpdates(saveState: SaveState) {
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
