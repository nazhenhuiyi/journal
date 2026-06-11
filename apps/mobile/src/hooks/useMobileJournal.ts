import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Alert } from 'react-native'
import {
  normalizeThemeIds,
  type DayFrontMatter,
  type ImageBlock,
  type MurmurBlock,
} from '@journal/core'
import { shouldDeferBackgroundSyncForInput } from '../services/inputStability'
import { mobileSyncManager } from '../services/sync/mobileSyncManager'
import {
  createMurmur,
  getLocalDateKey,
  loadDailyJournal,
  saveDailyJournal,
  type ImportedMobileJournalImage,
  type MobileJournalRecord,
  type SaveDailyJournalResult,
  updateDailyJournalFrontMatter,
} from '../services/mobileJournalStore'

export type SaveState = 'dirty' | 'idle' | 'loading' | 'saving' | 'saved' | 'error'

export type SaveCurrentJournalOptions = {
  additionalChangedPaths?: readonly string[]
  scheduleSync?: boolean
  showAlert?: boolean
}

export type SaveCurrentJournalRef = MutableRefObject<(
  (options?: SaveCurrentJournalOptions) => Promise<SaveDailyJournalResult | null>
) | null>

const dateRolloverCheckMs = 60_000
const localSaveDebounceMs = 5_000

export function useMobileJournal() {
  const [today, setToday] = useState(() => getLocalDateKey())
  const [record, setRecord] = useState<MobileJournalRecord | null>(null)
  const [longEntryMarkdown, setLongEntryMarkdown] = useState('')
  const [murmurs, setMurmurs] = useState<MurmurBlock[]>([])
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const isLongEntryFocusedRef = useRef(false)
  const journalContentRef = useRef({ longEntryMarkdown: '', murmurs: [] as MurmurBlock[] })
  const journalVersionRef = useRef(0)
  const lastLongEntryEditedAtRef = useRef(0)
  const saveCurrentJournalRef: SaveCurrentJournalRef = useRef(null)
  const saveStateRef = useRef<SaveState>('loading')
  const todayRef = useRef(today)

  useEffect(() => {
    let isMounted = true
    const loadingVersion = journalVersionRef.current

    setSaveState('loading')

    loadDailyJournal(today)
      .then((loadedRecord) => {
        if (!isMounted) {
          return
        }

        setRecord(loadedRecord)

        if (journalVersionRef.current === loadingVersion) {
          setLongEntryMarkdown(loadedRecord.longEntryMarkdown)
          setMurmurs(loadedRecord.murmurs)
          setSaveState('idle')
        } else {
          setSaveState('dirty')
        }
      })
      .catch((error) => {
        console.error(error)

        if (isMounted) {
          setSaveState('error')
        }
      })

    return () => {
      isMounted = false
    }
  }, [today])

  useEffect(() => {
    todayRef.current = today
  }, [today])

  useEffect(() => {
    journalContentRef.current = {
      longEntryMarkdown,
      murmurs,
    }
  }, [longEntryMarkdown, murmurs])

  useEffect(() => {
    saveStateRef.current = saveState
  }, [saveState])

  const markJournalDirty = useCallback(() => {
    journalVersionRef.current += 1
    setSaveState((currentSaveState) => {
      if (currentSaveState === 'loading' || currentSaveState === 'saving') {
        return currentSaveState
      }

      return 'dirty'
    })
  }, [])

  const handleLongEntryChange = useCallback((value: string) => {
    lastLongEntryEditedAtRef.current = Date.now()
    markJournalDirty()
    setLongEntryMarkdown(value)
  }, [markJournalDirty])

  const saveCurrentJournal = useCallback(async (
    nextLongEntryMarkdown = longEntryMarkdown,
    nextMurmurs = murmurs,
    options: SaveCurrentJournalOptions = {},
  ) => {
    const savingVersion = journalVersionRef.current
    const shouldScheduleSync = options.scheduleSync ?? true
    const shouldShowAlert = options.showAlert ?? true

    setSaveState('saving')

    try {
      const savedRecord = await saveDailyJournal({
        additionalChangedPaths: options.additionalChangedPaths,
        date: today,
        longEntryMarkdown: nextLongEntryMarkdown,
        murmurs: nextMurmurs,
      })

      setRecord(savedRecord)

      if (journalVersionRef.current === savingVersion) {
        if (savedRecord.longEntryMarkdown !== journalContentRef.current.longEntryMarkdown) {
          setLongEntryMarkdown(savedRecord.longEntryMarkdown)
        }

        if (nextMurmurs !== journalContentRef.current.murmurs) {
          setMurmurs(savedRecord.murmurs)
        }

        setSaveState('saved')
      } else {
        setSaveState('dirty')
      }

      if (shouldScheduleSync && savedRecord.didWrite) {
        mobileSyncManager.markLocalSave(savedRecord.changedPaths)
      }

      return savedRecord
    } catch (error) {
      console.error(error)
      setSaveState('error')

      if (shouldShowAlert) {
        Alert.alert('保存失败', '本地日记没有写入成功。')
      }

      return null
    }
  }, [longEntryMarkdown, murmurs, today])

  useEffect(() => {
    saveCurrentJournalRef.current = (options?: SaveCurrentJournalOptions) => {
      const latestContent = journalContentRef.current

      return saveCurrentJournal(
        latestContent.longEntryMarkdown,
        latestContent.murmurs,
        options,
      )
    }
  }, [saveCurrentJournal])

  const checkForDateRollover = useCallback(async () => {
    const nextToday = getLocalDateKey()

    if (nextToday === todayRef.current || saveStateRef.current === 'saving') {
      return false
    }

    if (saveStateRef.current === 'dirty') {
      const savedRecord = await saveCurrentJournalRef.current?.({
        showAlert: false,
      })

      if (!savedRecord) {
        return false
      }
    }

    setSaveState('loading')
    todayRef.current = nextToday
    setToday(nextToday)

    return true
  }, [])

  useEffect(() => {
    if (saveState !== 'dirty') {
      return undefined
    }

    const timeoutId = setTimeout(() => {
      void saveCurrentJournal()
    }, localSaveDebounceMs)

    return () => clearTimeout(timeoutId)
  }, [saveCurrentJournal, saveState])

  const isLongEntryInputUnstable = useCallback(() => (
    shouldDeferBackgroundSyncForInput({
      isFocused: isLongEntryFocusedRef.current,
      lastEditedAt: lastLongEntryEditedAtRef.current,
      now: Date.now(),
      stableWindowMs: localSaveDebounceMs,
    })
  ), [])

  const addMurmur = useCallback(async (draft: string, themes: readonly string[] = []) => {
    const body = draft.trim()

    if (!body) {
      return false
    }

    const previousMurmurs = murmurs
    const nextMurmurs = [...previousMurmurs, createMurmur(today, body, {
      themes: normalizeThemeIds(themes),
    })]

    journalVersionRef.current += 1
    setMurmurs(nextMurmurs)
    const savedRecord = await saveCurrentJournal(longEntryMarkdown, nextMurmurs)

    if (savedRecord) {
      return true
    }

    journalVersionRef.current += 1
    setMurmurs(previousMurmurs)
    return false
  }, [longEntryMarkdown, murmurs, saveCurrentJournal, today])

  const addImagesToMurmur = useCallback(async ({
    body = '',
    images,
    murmurId,
    themes = [],
  }: {
    body?: string
    images: readonly ImportedMobileJournalImage[]
    murmurId?: string | null
    themes?: readonly string[]
  }) => {
    if (images.length === 0) {
      return false
    }

    const previousMurmurs = murmurs
    const imageBlocks = images.map(importedImageToBlock)
    const existingMurmur = murmurId
      ? previousMurmurs.find((murmur) => murmur.id === murmurId)
      : null
    const nextMurmurs = existingMurmur
      ? previousMurmurs.map((murmur) => (
          murmur.id === existingMurmur.id
            ? { ...murmur, images: [...murmur.images, ...imageBlocks] }
            : murmur
        ))
      : [
          ...previousMurmurs,
          {
            ...createMurmur(today, body, {
              themes: normalizeThemeIds(themes),
            }),
            images: imageBlocks,
          },
        ]

    journalVersionRef.current += 1
    setMurmurs(nextMurmurs)

    const savedRecord = await saveCurrentJournal(longEntryMarkdown, nextMurmurs, {
      additionalChangedPaths: images.map((image) => image.repositoryPath),
    })

    if (savedRecord) {
      return true
    }

    journalVersionRef.current += 1
    setMurmurs(previousMurmurs)
    return false
  }, [longEntryMarkdown, murmurs, saveCurrentJournal, today])

  const updateMurmurImageCaption = useCallback((murmurId: string, imageId: string, caption: string) => {
    markJournalDirty()
    setMurmurs((currentMurmurs) => currentMurmurs.map((murmur) => (
      murmur.id === murmurId
        ? {
            ...murmur,
            images: murmur.images.map((image) => (
              image.id === imageId
                ? { ...image, caption }
                : image
            )),
          }
        : murmur
    )))
  }, [markJournalDirty])

  const removeMurmurImage = useCallback((murmurId: string, imageId: string) => {
    markJournalDirty()
    setMurmurs((currentMurmurs) => currentMurmurs.map((murmur) => (
      murmur.id === murmurId
        ? {
            ...murmur,
            images: murmur.images.filter((image) => image.id !== imageId),
          }
        : murmur
    )))
  }, [markJournalDirty])

  const reloadTodayFromDisk = useCallback(async () => {
    const loadedRecord = await loadDailyJournal(today)

    journalVersionRef.current += 1
    setRecord(loadedRecord)
    setLongEntryMarkdown(loadedRecord.longEntryMarkdown)
    setMurmurs(loadedRecord.murmurs)
    setSaveState('idle')
  }, [today])

  const reloadTodayFromDiskIfChanged = useCallback(async () => {
    const loadedRecord = await loadDailyJournal(today)
    const currentContent = journalContentRef.current

    if (
      loadedRecord.longEntryMarkdown === currentContent.longEntryMarkdown &&
      JSON.stringify(loadedRecord.murmurs) === JSON.stringify(currentContent.murmurs)
    ) {
      return false
    }

    journalVersionRef.current += 1
    setRecord(loadedRecord)
    setLongEntryMarkdown(loadedRecord.longEntryMarkdown)
    setMurmurs(loadedRecord.murmurs)
    setSaveState('idle')

    return true
  }, [today])

  const updateTodayFrontMatter = useCallback(async (frontMatterPatch: DayFrontMatter) => {
    const updatedRecord = await updateDailyJournalFrontMatter(today, frontMatterPatch)

    setRecord(updatedRecord)

    if (updatedRecord.didWrite) {
      mobileSyncManager.markLocalSave(updatedRecord.changedPaths)
    }

    return updatedRecord
  }, [today])

  useEffect(() => {
    const intervalId = setInterval(() => {
      void checkForDateRollover().catch((error) => {
        console.error(error)
      })
    }, dateRolloverCheckMs)

    return () => clearInterval(intervalId)
  }, [checkForDateRollover])

  return {
    addMurmur,
    addImagesToMurmur,
    checkForDateRollover,
    handleLongEntryChange,
    isLongEntryFocusedRef,
    isLongEntryInputUnstable,
    longEntryMarkdown,
    murmurs,
    record,
    reloadTodayFromDisk,
    reloadTodayFromDiskIfChanged,
    saveCurrentJournal,
    saveCurrentJournalRef,
    saveState,
    saveStateRef,
    removeMurmurImage,
    today,
    updateTodayFrontMatter,
    updateMurmurImageCaption,
  }
}

function importedImageToBlock(importedImage: ImportedMobileJournalImage): ImageBlock {
  return {
    id: importedImage.id,
    location: importedImage.location,
    src: importedImage.src,
    tags: [],
  }
}
