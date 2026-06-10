import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type MutableRefObject } from 'react'
import { desktopSyncManager } from '../../services/sync/desktopSyncManager'
import { getSyncStatusPresentation } from '../syncStatusPresentation'

type JournalFile = Awaited<ReturnType<NonNullable<Window['journalStore']>['loadToday']>>

type UseDesktopJournalSyncInput = {
  automaticPushDelayMs: number
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
}

export function useDesktopJournalSync({
  automaticPushDelayMs,
  flushPendingSave,
  hasUnsavedLocalChanges,
  isEditorComposingRef,
  isJournalDirtyRef,
  journalFileRef,
  lastJournalEditedAtRef,
  loadJournalForDate,
}: UseDesktopJournalSyncInput) {
  const runtimeRef = useRef({
    automaticPushDelayMs,
    flushPendingSave,
    isEditorComposingRef,
    isJournalDirtyRef,
    journalFileRef,
    lastJournalEditedAtRef,
    loadJournalForDate,
  })
  const state = useSyncExternalStore(
    desktopSyncManager.subscribe,
    desktopSyncManager.getState,
    desktopSyncManager.getState,
  )

  const flushAndSyncBeforeLeaving = useCallback(
    () => desktopSyncManager.flushBeforeLeave(),
    [],
  )
  const resumeConfiguredSync = useCallback(
    () => desktopSyncManager.resume(),
    [],
  )

  useEffect(() => {
    runtimeRef.current = {
      automaticPushDelayMs,
      flushPendingSave,
      isEditorComposingRef,
      isJournalDirtyRef,
      journalFileRef,
      lastJournalEditedAtRef,
      loadJournalForDate,
    }
  }, [
    automaticPushDelayMs,
    flushPendingSave,
    isEditorComposingRef,
    isJournalDirtyRef,
    journalFileRef,
    lastJournalEditedAtRef,
    loadJournalForDate,
  ])

  useEffect(() => {
    const unbind = desktopSyncManager.bindJournalRuntime({
      automaticPushDelayMs,
      flushPendingSave: (...args) => runtimeRef.current.flushPendingSave(...args),
      getCurrentJournalDate: () => runtimeRef.current.journalFileRef.current?.date ?? null,
      getIsEditorComposing: () => runtimeRef.current.isEditorComposingRef.current,
      getIsJournalDirty: () => runtimeRef.current.isJournalDirtyRef.current,
      getLastJournalEditedAt: () => runtimeRef.current.lastJournalEditedAtRef.current,
      loadJournalForDate: (...args) => runtimeRef.current.loadJournalForDate(...args),
    })

    void desktopSyncManager.initialize()

    return unbind
  }, [automaticPushDelayMs])

  useEffect(() => {
    function finalizeOpenJournal() {
      void desktopSyncManager.flushBeforeLeave()
    }

    window.addEventListener('pagehide', finalizeOpenJournal)
    window.addEventListener('beforeunload', finalizeOpenJournal)

    return () => {
      window.removeEventListener('pagehide', finalizeOpenJournal)
      window.removeEventListener('beforeunload', finalizeOpenJournal)
    }
  }, [])

  const syncStatus = useMemo(() => getSyncStatusPresentation(
    state.snapshot,
    state.message,
    state.remoteUrl,
    state.hasCredentials,
    {
      hasUnsavedLocalChanges,
    },
  ), [
    hasUnsavedLocalChanges,
    state.hasCredentials,
    state.message,
    state.remoteUrl,
    state.snapshot,
  ])

  return {
    flushAndSyncBeforeLeaving,
    resumeConfiguredSync,
    syncStatus,
  }
}
