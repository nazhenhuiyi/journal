import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import {
  JournalSyncCoordinator,
  type SyncOperationRequest,
  type SyncOperationResult,
  type SyncSnapshot,
  type SyncTrigger,
} from '@journal/sync/scheduler'
import { getSyncStatusPresentation } from '../syncStatusPresentation'

type JournalFile = Awaited<ReturnType<NonNullable<Window['journalStore']>['loadToday']>>
type JournalSyncCredentialStatus = Awaited<
  ReturnType<NonNullable<Window['journalSync']>['loadStatus']>
>['credentialStatus']
type MarkLocalSave = (changedPaths: readonly string[]) => void

type UseDesktopJournalSyncInput = {
  automaticPushDelayMs: number
  coordinatorRef: MutableRefObject<JournalSyncCoordinator | null>
  flushPendingSave: (
    shouldUpdateState?: boolean,
    options?: { scheduleSync?: boolean },
  ) => Promise<boolean>
  hasUnsavedLocalChanges: boolean
  isEditorComposingRef: MutableRefObject<boolean>
  isJournalDirtyRef: MutableRefObject<boolean>
  journalFileRef: MutableRefObject<JournalFile | null>
  lastJournalEditedAtRef: MutableRefObject<number>
  loadJournalForDate: (date: string | null, shouldApply?: () => boolean) => Promise<void>
  markLocalSaveRef: MutableRefObject<MarkLocalSave | null>
}

const initialSyncSnapshot: SyncSnapshot = {
  lastError: null,
  lastSyncedAt: null,
  pendingReason: null,
  status: 'idle',
}

function getJournalSyncStore() {
  return typeof window === 'undefined' ? undefined : window.journalSync
}

export function useDesktopJournalSync({
  automaticPushDelayMs,
  coordinatorRef,
  flushPendingSave,
  hasUnsavedLocalChanges,
  isEditorComposingRef,
  isJournalDirtyRef,
  journalFileRef,
  lastJournalEditedAtRef,
  loadJournalForDate,
  markLocalSaveRef,
}: UseDesktopJournalSyncInput) {
  const [syncMessage, setSyncMessage] = useState('')
  const [syncRemoteUrl, setSyncRemoteUrl] = useState('')
  const [syncSnapshot, setSyncSnapshot] = useState<SyncSnapshot>(initialSyncSnapshot)
  const [hasStoredSyncToken, setHasStoredSyncToken] = useState(false)
  const finalizeAndSyncBeforeUnmountRef = useRef<() => Promise<void>>(async () => undefined)
  const runDesktopSyncOperationRef = useRef<(request: SyncOperationRequest) => Promise<SyncOperationResult>>(
    async () => ({
      message: '同步还没准备好。',
      skipped: true,
    }),
  )
  const syncConfigRef = useRef({
    branch: 'main',
    hasCredentials: false,
    remoteUrl: '',
  })

  const shouldDeferAutomaticPush = useCallback((trigger: SyncTrigger) => (
    trigger === 'save-idle' &&
      (isEditorComposingRef.current ||
        Date.now() - lastJournalEditedAtRef.current < automaticPushDelayMs)
  ), [automaticPushDelayMs, isEditorComposingRef, lastJournalEditedAtRef])

  const runDesktopSyncOperation = useCallback(async ({ changedPaths, operation, trigger }: SyncOperationRequest) => {
    const journalSync = getJournalSyncStore()

    if (!journalSync) {
      return {
        message: '当前环境还不能同步。',
        skipped: true,
      }
    }

    if (!syncConfigRef.current.remoteUrl.trim()) {
      return {
        message: '请先配置 GitHub 同步仓库地址。',
        needsAuth: true,
      }
    }

    if (!syncConfigRef.current.hasCredentials) {
      return {
        message: '请先保存 GitHub token。',
        needsAuth: true,
      }
    }

    if (operation === 'pull') {
      if (isJournalDirtyRef.current) {
        return {
          message: '正在编辑，稍后检查远端更新。',
          skipped: true,
        }
      }

      const result = await journalSync.pull()

      if (result.changed && !isJournalDirtyRef.current) {
        await loadJournalForDate(journalFileRef.current?.date ?? null, () => !isJournalDirtyRef.current)
      }

      return {
        changed: result.changed,
      }
    }

    let operationChangedPaths = changedPaths

    if (isJournalDirtyRef.current) {
      if (shouldDeferAutomaticPush(trigger)) {
        return {
          message: '正在编辑，稍后同步。',
          skipped: true,
        }
      }

      const didFlush = await flushPendingSave(true, { scheduleSync: false })

      if (!didFlush) {
        return {
          message: '本地保存还没有完成，稍后同步。',
          skipped: true,
        }
      }

      operationChangedPaths = undefined
    }

    const operationOptions = operationChangedPaths && operationChangedPaths.length > 0
      ? {
          changedPaths: operationChangedPaths,
          collectDirtyPathsAfterSync: false,
        }
      : undefined
    const result = operation === 'full'
      ? await journalSync.syncNow(operationOptions)
      : await journalSync.push(operationOptions)

    if (operation === 'full' && !isJournalDirtyRef.current) {
      await loadJournalForDate(journalFileRef.current?.date ?? null, () => !isJournalDirtyRef.current)
    }

    return {
      changed: result.changed,
    }
  }, [
    flushPendingSave,
    isJournalDirtyRef,
    journalFileRef,
    loadJournalForDate,
    shouldDeferAutomaticPush,
  ])

  useEffect(() => {
    runDesktopSyncOperationRef.current = runDesktopSyncOperation
  }, [runDesktopSyncOperation])

  const markDirtyWorktreeForSync = useCallback(async () => {
    const journalSync = getJournalSyncStore()

    if (
      !journalSync ||
      !syncConfigRef.current.remoteUrl.trim() ||
      !syncConfigRef.current.hasCredentials
    ) {
      return
    }

    try {
      const status = await journalSync.loadStatus()

      coordinatorRef.current?.markDirtyWorktree(status.dirtyPaths)
    } catch (error) {
      console.error(error)
    }
  }, [coordinatorRef])

  const resumeConfiguredSync = useCallback(async () => {
    if (!syncConfigRef.current.remoteUrl.trim() || !syncConfigRef.current.hasCredentials) {
      return
    }

    await markDirtyWorktreeForSync()
    await coordinatorRef.current?.notifyForeground()
  }, [coordinatorRef, markDirtyWorktreeForSync])

  const flushAndSyncBeforeLeaving = useCallback(async () => {
    const didSave = await flushPendingSave(false)

    if (didSave) {
      await coordinatorRef.current?.flushBeforeLeave()
    }
  }, [coordinatorRef, flushPendingSave])

  useEffect(() => {
    finalizeAndSyncBeforeUnmountRef.current = flushAndSyncBeforeLeaving
  }, [flushAndSyncBeforeLeaving])

  useEffect(() => {
    const coordinator = new JournalSyncCoordinator({
      onSnapshot: (snapshot) => {
        setSyncSnapshot(snapshot)

        if (snapshot.status !== 'synced') {
          setSyncMessage('')
        }
      },
      runOperation: (request) => runDesktopSyncOperationRef.current(request),
    })
    const markLocalSave = (changedPaths: readonly string[]) => {
      coordinator.markLocalSave(changedPaths)
    }

    coordinatorRef.current = coordinator
    markLocalSaveRef.current = markLocalSave

    return () => {
      void finalizeAndSyncBeforeUnmountRef.current()
        .finally(() => {
          coordinator.dispose()

          if (coordinatorRef.current === coordinator) {
            coordinatorRef.current = null
          }

          if (markLocalSaveRef.current === markLocalSave) {
            markLocalSaveRef.current = null
          }
        })
    }
  }, [coordinatorRef, markLocalSaveRef])

  useEffect(() => {
    let isCancelled = false

    getJournalSyncStore()?.loadStatus()
      .then((status) => {
        if (isCancelled || !status) {
          return
        }

        syncConfigRef.current = {
          branch: status.branch,
          hasCredentials: status.hasCredentials,
          remoteUrl: status.remoteUrl,
        }
        setHasStoredSyncToken(status.hasCredentials)
        setSyncRemoteUrl(status.remoteUrl)
        if (status.credentialStatus === 'corrupt' || status.credentialStatus === 'encryption-unavailable') {
          setSyncSnapshot({
            ...initialSyncSnapshot,
            lastError: status.credentialMessage ?? getCredentialStatusMessage(status.credentialStatus),
            status: 'error',
          })
        }

        if (status.remoteUrl && status.hasCredentials) {
          coordinatorRef.current?.markDirtyWorktree(status.dirtyPaths)
        }
      })
      .catch((error) => {
        if (isCancelled) {
          return
        }

        setSyncSnapshot((currentSnapshot) => ({
          ...currentSnapshot,
          lastError: getErrorMessage(error),
          status: 'error',
        }))
      })

    return () => {
      isCancelled = true
    }
  }, [coordinatorRef])

  useEffect(() => {
    const coordinator = coordinatorRef.current

    if (!coordinator) {
      return undefined
    }

    if (syncRemoteUrl.trim() && hasStoredSyncToken) {
      coordinator.startPulling()

      return () => coordinator.stopPulling()
    }

    coordinator.stopPulling()

    return undefined
  }, [coordinatorRef, hasStoredSyncToken, syncRemoteUrl])

  useEffect(() => {
    syncConfigRef.current = {
      ...syncConfigRef.current,
      hasCredentials: hasStoredSyncToken,
      remoteUrl: syncRemoteUrl,
    }
  }, [hasStoredSyncToken, syncRemoteUrl])

  useEffect(() => {
    function finalizeOpenJournal() {
      void flushAndSyncBeforeLeaving()
    }

    window.addEventListener('pagehide', finalizeOpenJournal)
    window.addEventListener('beforeunload', finalizeOpenJournal)

    return () => {
      window.removeEventListener('pagehide', finalizeOpenJournal)
      window.removeEventListener('beforeunload', finalizeOpenJournal)
    }
  }, [flushAndSyncBeforeLeaving])

  const syncStatus = useMemo(() => getSyncStatusPresentation(
    syncSnapshot,
    syncMessage,
    syncRemoteUrl,
    hasStoredSyncToken,
    {
      hasUnsavedLocalChanges,
    },
  ), [
    hasStoredSyncToken,
    hasUnsavedLocalChanges,
    syncMessage,
    syncRemoteUrl,
    syncSnapshot,
  ])

  return {
    flushAndSyncBeforeLeaving,
    resumeConfiguredSync,
    syncStatus,
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '同步过程中出现未知错误。'
}

function getCredentialStatusMessage(status: JournalSyncCredentialStatus) {
  if (status === 'corrupt') {
    return 'GitHub token 无法读取，请重新保存。'
  }

  if (status === 'encryption-unavailable') {
    return '系统加密存储不可用，无法读取 GitHub token。'
  }

  return '请先保存 GitHub token。'
}
