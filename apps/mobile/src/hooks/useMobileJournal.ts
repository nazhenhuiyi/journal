import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Alert } from 'react-native'
import {
  normalizeThemeIds,
  type DayFrontMatter,
  type ImageBlock,
  type MurmurBlock,
} from '@journal/core'
import { shouldDeferBackgroundSyncForInput } from '../services/inputStability'
import {
  journalEffects,
  type JournalSavedReason,
} from '../services/journalEffects'
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
import { mobileDiagnosticLog } from '../services/diagnostics/log'

export type SaveState = 'dirty' | 'idle' | 'loading' | 'saving' | 'saved' | 'error'

export type SaveCurrentJournalOptions = {
  additionalChangedPaths?: readonly string[]
  emitEvent?: boolean
  reason?: JournalSavedReason
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

  const updateSaveState = useCallback((nextSaveState: SaveState) => {
    saveStateRef.current = nextSaveState
    setSaveState(nextSaveState)
  }, [])

  const applyLoadedRecord = useCallback((
    loadedRecord: MobileJournalRecord,
    nextSaveState: SaveState,
  ) => {
    journalContentRef.current = {
      longEntryMarkdown: loadedRecord.longEntryMarkdown,
      murmurs: loadedRecord.murmurs,
    }
    saveStateRef.current = nextSaveState
    setRecord(loadedRecord)
    setLongEntryMarkdown(loadedRecord.longEntryMarkdown)
    setMurmurs(loadedRecord.murmurs)
    setSaveState(nextSaveState)
  }, [])

  useEffect(() => {
    let isMounted = true
    const loadingVersion = journalVersionRef.current

    updateSaveState('loading')

    loadDailyJournal(today)
      .then((loadedRecord) => {
        if (!isMounted) {
          return
        }

        mobileDiagnosticLog.info('journal.load', 'Daily journal loaded', {
          date: today,
          diagnosticCount: loadedRecord.diagnostics.length,
          murmurCount: loadedRecord.murmurs.length,
        })

        if (journalVersionRef.current === loadingVersion) {
          applyLoadedRecord(loadedRecord, 'idle')
        } else {
          updateSaveState('dirty')
        }
      })
      .catch((error) => {
        mobileDiagnosticLog.error('journal.load', 'Daily journal load failed', {
          date: today,
          error,
        })
        console.error(error)

        if (isMounted) {
          updateSaveState('error')
        }
      })

    return () => {
      isMounted = false
    }
  }, [applyLoadedRecord, today, updateSaveState])

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
    const currentSaveState = saveStateRef.current

    updateSaveState(
      currentSaveState === 'loading' || currentSaveState === 'saving'
        ? currentSaveState
        : 'dirty',
    )
  }, [updateSaveState])

  const handleLongEntryChange = useCallback((value: string) => {
    if (!isLongEntryFocusedRef.current) {
      mobileDiagnosticLog.info('journal.input', 'Ignored long entry change while input is not focused', {
        date: todayRef.current,
      })
      return
    }

    if (value === journalContentRef.current.longEntryMarkdown) {
      return
    }

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
    const reason = options.reason ?? 'auto-save'
    const shouldEmitEvent = options.emitEvent ?? true
    const shouldScheduleSync = options.scheduleSync ?? true
    const shouldShowAlert = options.showAlert ?? true

    updateSaveState('saving')

    try {
      const savedRecord = await saveDailyJournal({
        additionalChangedPaths: options.additionalChangedPaths,
        date: today,
        longEntryMarkdown: nextLongEntryMarkdown,
        murmurs: nextMurmurs,
      })

      mobileDiagnosticLog.info('journal.save', 'Daily journal saved', {
        changedPathCount: savedRecord.changedPaths.length,
        date: today,
        didWrite: savedRecord.didWrite,
        murmurCount: savedRecord.murmurs.length,
        reason,
      })
      setRecord(savedRecord)

      if (journalVersionRef.current === savingVersion) {
        journalContentRef.current = {
          longEntryMarkdown: nextLongEntryMarkdown,
          murmurs: savedRecord.murmurs,
        }
        // Keep the editor draft exactly as typed; persisted Markdown trims trailing blank lines.
        if (nextMurmurs !== journalContentRef.current.murmurs) {
          setMurmurs(savedRecord.murmurs)
        }

        updateSaveState('saved')
      } else {
        updateSaveState('dirty')
      }

      if (shouldEmitEvent && savedRecord.didWrite) {
        void journalEffects.afterJournalSaved({
          reason,
          record: savedRecord,
          scheduleSync: shouldScheduleSync,
        })
      }

      return savedRecord
    } catch (error) {
      mobileDiagnosticLog.error('journal.save', 'Daily journal save failed', {
        date: today,
        error,
        reason,
      })
      console.error(error)
      updateSaveState('error')

      if (shouldShowAlert) {
        Alert.alert('保存失败', '本地日记没有写入成功。')
      }

      return null
    }
  }, [longEntryMarkdown, murmurs, today, updateSaveState])

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
        reason: 'date-rollover',
        showAlert: false,
      })

      if (!savedRecord) {
        return false
      }
    }

    updateSaveState('loading')
    const previousDate = todayRef.current
    todayRef.current = nextToday
    setToday(nextToday)
    mobileDiagnosticLog.info('journal.date-rollover', 'Journal date rolled over', {
      date: nextToday,
      previousDate,
    })
    void journalEffects.afterDateRollover({
      date: nextToday,
      previousDate,
    })

    return true
  }, [updateSaveState])

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
    const savedRecord = await saveCurrentJournal(longEntryMarkdown, nextMurmurs, {
      reason: 'add-murmur',
    })

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
      reason: 'import-image',
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

  const updateMurmurBody = useCallback((murmurId: string, body: string) => {
    markJournalDirty()
    setMurmurs((currentMurmurs) => currentMurmurs.map((murmur) => (
      murmur.id === murmurId
        ? { ...murmur, body }
        : murmur
    )))
  }, [markJournalDirty])

  const reloadTodayFromDisk = useCallback(async () => {
    const loadedRecord = await loadDailyJournal(today)

    journalVersionRef.current += 1
    applyLoadedRecord(loadedRecord, 'idle')
  }, [applyLoadedRecord, today])

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
    applyLoadedRecord(loadedRecord, 'idle')

    return true
  }, [applyLoadedRecord, today])

  const updateTodayFrontMatter = useCallback(async (frontMatterPatch: DayFrontMatter) => {
    const updatedRecord = await updateDailyJournalFrontMatter(today, frontMatterPatch)

    setRecord(updatedRecord)

    if (updatedRecord.didWrite) {
      void journalEffects.afterJournalSaved({
        reason: 'front-matter',
        record: updatedRecord,
        scheduleSync: true,
      })
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
    updateMurmurBody,
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
