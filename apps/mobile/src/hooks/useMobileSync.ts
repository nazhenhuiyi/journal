import { useCallback, useEffect, useSyncExternalStore, type MutableRefObject } from 'react'
import { Alert, AppState } from 'react-native'
import {
  mobileSyncManager,
  type MobileSyncManagerState,
} from '../services/sync/mobileSyncManager'
import type {
  SaveCurrentJournalRef,
  SaveState,
} from './useMobileJournal'

type UseMobileSyncOptions = {
  checkForDateRollover: () => Promise<boolean>
  isLongEntryInputUnstable: () => boolean
  reloadTodayFromDisk: () => Promise<void>
  reloadTodayFromDiskIfChanged: () => Promise<boolean>
  saveCurrentJournalRef: SaveCurrentJournalRef
  saveStateRef: MutableRefObject<SaveState>
}

export function useMobileSync({
  checkForDateRollover,
  isLongEntryInputUnstable,
  reloadTodayFromDisk,
  reloadTodayFromDiskIfChanged,
  saveCurrentJournalRef,
  saveStateRef,
}: UseMobileSyncOptions) {
  const state = useSyncExternalStore(
    mobileSyncManager.subscribe,
    mobileSyncManager.getState,
    mobileSyncManager.getState,
  )

  useEffect(() => {
    const unbind = mobileSyncManager.bindJournalRuntime({
      getSaveState: () => saveStateRef.current,
      isInputUnstable: isLongEntryInputUnstable,
      reloadTodayFromDisk,
      reloadTodayFromDiskIfChanged,
      saveCurrentJournal: async (options) => saveCurrentJournalRef.current?.(options) ?? null,
    })

    void mobileSyncManager.initialize()

    return unbind
  }, [
    isLongEntryInputUnstable,
    reloadTodayFromDisk,
    reloadTodayFromDiskIfChanged,
    saveCurrentJournalRef,
    saveStateRef,
  ])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void checkForDateRollover()
          .catch((error) => {
            console.error(error)
          })
          .finally(() => {
            void mobileSyncManager.resume()
          })
      } else if (nextState === 'background' || nextState === 'inactive') {
        void mobileSyncManager.flushBeforeLeave()
      }
    })

    return () => subscription.remove()
  }, [checkForDateRollover])

  const saveSyncConfiguration = useCallback(async () => {
    const result = await mobileSyncManager.saveConfiguration()

    if (!result.ok && result.alertTitle && result.alertMessage) {
      Alert.alert(result.alertTitle, result.alertMessage)
    }

    return result.ok
  }, [])

  const handleSyncNow = useCallback(async () => {
    const result = await mobileSyncManager.syncNow()

    if (!result.ok && result.alertTitle && result.alertMessage) {
      Alert.alert(result.alertTitle, result.alertMessage)
    }
  }, [])

  return {
    ...state,
    handleSyncNow,
    refreshMobileGitStatus: mobileSyncManager.refreshStatus,
    saveSyncConfiguration,
    setSyncBranch: mobileSyncManager.setSyncBranch,
    setSyncRemoteUrl: mobileSyncManager.setSyncRemoteUrl,
    setSyncTokenDraft: mobileSyncManager.setSyncTokenDraft,
  } satisfies MobileSyncManagerState & {
    handleSyncNow: () => Promise<void>
    refreshMobileGitStatus: typeof mobileSyncManager.refreshStatus
    saveSyncConfiguration: () => Promise<boolean>
    setSyncBranch: typeof mobileSyncManager.setSyncBranch
    setSyncRemoteUrl: typeof mobileSyncManager.setSyncRemoteUrl
    setSyncTokenDraft: typeof mobileSyncManager.setSyncTokenDraft
  }
}
