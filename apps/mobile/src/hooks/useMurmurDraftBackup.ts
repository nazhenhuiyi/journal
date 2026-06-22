import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import {
  createMobileMurmurDraftBackup,
  deleteMobileMurmurDraftBackup,
  getRestorableMobileMurmurDraft,
  loadMobileMurmurDraftBackup,
  saveMobileMurmurDraftBackup,
} from '../services/mobileMurmurDraftBackup'

const murmurDraftBackupDebounceMs = 400

type UseMurmurDraftBackupOptions = {
  murmurDraft: string
  selectedMurmurThemeIds: readonly string[]
  setMurmurDraft: Dispatch<SetStateAction<string>>
  setSelectedMurmurThemeIds: Dispatch<SetStateAction<string[]>>
  today: string
}

export function useMurmurDraftBackup({
  murmurDraft,
  selectedMurmurThemeIds,
  setMurmurDraft,
  setSelectedMurmurThemeIds,
  today,
}: UseMurmurDraftBackupOptions) {
  const [hasLoadedMurmurDraftBackup, setHasLoadedMurmurDraftBackup] = useState(false)
  const murmurDraftRef = useRef(murmurDraft)
  const selectedMurmurThemeIdsRef = useRef(selectedMurmurThemeIds)
  const todayRef = useRef(today)
  const hasLoadedMurmurDraftBackupRef = useRef(false)
  const murmurDraftBackupSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPendingMurmurDraftBackupSave = useCallback(() => {
    if (!murmurDraftBackupSaveTimeoutRef.current) {
      return
    }

    clearTimeout(murmurDraftBackupSaveTimeoutRef.current)
    murmurDraftBackupSaveTimeoutRef.current = null
  }, [])

  const persistCurrentMurmurDraftBackup = useCallback(async () => {
    if (!hasLoadedMurmurDraftBackupRef.current) {
      return
    }

    const draftBackup = createMobileMurmurDraftBackup({
      body: murmurDraftRef.current,
      date: todayRef.current,
      themeIds: selectedMurmurThemeIdsRef.current,
    })

    try {
      if (draftBackup) {
        await saveMobileMurmurDraftBackup(draftBackup)
      } else {
        await deleteMobileMurmurDraftBackup()
      }
    } catch (error) {
      console.warn(error)
    }
  }, [])

  const clearStoredMurmurDraftBackup = useCallback(() => {
    clearPendingMurmurDraftBackupSave()
    void deleteMobileMurmurDraftBackup().catch((error) => {
      console.warn(error)
    })
  }, [clearPendingMurmurDraftBackupSave])

  useEffect(() => {
    murmurDraftRef.current = murmurDraft
    selectedMurmurThemeIdsRef.current = selectedMurmurThemeIds
    todayRef.current = today
  }, [murmurDraft, selectedMurmurThemeIds, today])

  useEffect(() => {
    let isMounted = true

    clearPendingMurmurDraftBackupSave()
    hasLoadedMurmurDraftBackupRef.current = false
    setHasLoadedMurmurDraftBackup(false)

    void loadMobileMurmurDraftBackup()
      .then((draftBackup) => {
        if (!isMounted) {
          return
        }

        const restorableDraft = getRestorableMobileMurmurDraft({
          backup: draftBackup,
          currentBody: murmurDraftRef.current,
          today,
        })

        if (restorableDraft) {
          setMurmurDraft(restorableDraft.body)
          setSelectedMurmurThemeIds(restorableDraft.themeIds)
        }
      })
      .catch((error) => {
        console.warn(error)
      })
      .finally(() => {
        if (!isMounted) {
          return
        }

        hasLoadedMurmurDraftBackupRef.current = true
        setHasLoadedMurmurDraftBackup(true)
      })

    return () => {
      isMounted = false
    }
  }, [
    clearPendingMurmurDraftBackupSave,
    setMurmurDraft,
    setSelectedMurmurThemeIds,
    today,
  ])

  useEffect(() => {
    if (!hasLoadedMurmurDraftBackup) {
      return undefined
    }

    clearPendingMurmurDraftBackupSave()

    if (!murmurDraft.trim()) {
      void persistCurrentMurmurDraftBackup()
      return undefined
    }

    const timeoutId = setTimeout(() => {
      murmurDraftBackupSaveTimeoutRef.current = null
      void persistCurrentMurmurDraftBackup()
    }, murmurDraftBackupDebounceMs)

    murmurDraftBackupSaveTimeoutRef.current = timeoutId

    return () => {
      if (murmurDraftBackupSaveTimeoutRef.current !== timeoutId) {
        return
      }

      clearTimeout(timeoutId)
      murmurDraftBackupSaveTimeoutRef.current = null
    }
  }, [
    clearPendingMurmurDraftBackupSave,
    hasLoadedMurmurDraftBackup,
    murmurDraft,
    persistCurrentMurmurDraftBackup,
    selectedMurmurThemeIds,
    today,
  ])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        clearPendingMurmurDraftBackupSave()
        void persistCurrentMurmurDraftBackup()
      }
    })

    return () => subscription.remove()
  }, [clearPendingMurmurDraftBackupSave, persistCurrentMurmurDraftBackup])

  return {
    clearStoredMurmurDraftBackup,
  }
}
