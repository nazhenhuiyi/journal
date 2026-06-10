import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Settings2 } from 'lucide-react'
import type { JournalSyncCoordinator } from '@journal/sync/scheduler'
import SegmentedControl from '../components/SegmentedControl'
import {
  parseJournalMarkdown,
  serializeJournalMarkdownBody,
  type DayFrontMatter,
  type MurmurBlock,
} from '@journal/core'
import {
  renderJournalMarkdown,
} from '../domain/markdown'
import { panelTransition } from './markdown-preview/constants'
import JournalMarkdownEditor from './markdown-preview/JournalMarkdownEditor'
import JournalWeatherHeader from './markdown-preview/JournalWeatherHeader'
import JournalMurmurPanel from './markdown-preview/JournalMurmurPanel'
import MarkdownPreviewArticle from './markdown-preview/MarkdownPreviewArticle'
import JournalDiagnosticsBanner from './markdown-preview/JournalDiagnosticsBanner'
import {
  createManagedJournalMarkdown,
  stripManagedFrontMatter,
} from './markdown-preview/managedJournalMarkdown'
import {
  hasFrontMatterChanged,
  useJournalFile,
} from './markdown-preview/useJournalFile'
import { useTodayWeather } from './markdown-preview/useTodayWeather'
import { useDesktopJournalSync } from './markdown-preview/useDesktopJournalSync'

type JournalMode = 'write' | 'review'
type JournalFile = Awaited<ReturnType<NonNullable<Window['journalStore']>['loadToday']>>
type JournalDayViewProps = {
  date?: string | null
  showDaySwitchNudge?: boolean
}
export type JournalDayViewHandle = {
  flushPendingSave: () => Promise<boolean>
}

const AUTOSAVE_DELAY_MS = 5_000
const JOURNAL_MODE_STORAGE_KEY = 'journal.preview.mode'
const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const journalModeOptions: Array<{ value: JournalMode; label: string }> = [
  { value: 'write', label: '书写' },
  { value: 'review', label: '回看' },
]

function getJournalStore() {
  return typeof window === 'undefined' ? undefined : window.journalStore
}

function readStoredJournalMode(): JournalMode {
  if (typeof window === 'undefined') {
    return 'write'
  }

  try {
    const storedMode = window.localStorage.getItem(JOURNAL_MODE_STORAGE_KEY)

    return storedMode === 'review' ? 'review' : 'write'
  } catch {
    return 'write'
  }
}

function writeStoredJournalMode(mode: JournalMode) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(JOURNAL_MODE_STORAGE_KEY, mode)
  } catch {
    // localStorage can be unavailable in constrained browser contexts.
  }
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function millisecondsUntilNextLocalDay(date = new Date()) {
  const nextDay = new Date(date)
  nextDay.setHours(24, 0, 0, 0)

  return Math.max(1, nextDay.getTime() - date.getTime())
}

function formatJournalTopbarTitle(dateKey: string, weatherText?: string) {
  const date = parseLocalDateKey(dateKey) ?? new Date()
  const dateLabel = `${date.getMonth() + 1}月${date.getDate()}日`
  const weekdayLabel = weekdayLabels[date.getDay()]
  const weatherLabel = formatTopbarWeatherLabel(weatherText)

  return [dateLabel, weekdayLabel, weatherLabel].filter(Boolean).join(' · ')
}

function formatDateNudgeLabel(dateKey: string) {
  const date = parseLocalDateKey(dateKey)

  if (!date) {
    return dateKey
  }

  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function parseLocalDateKey(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)

  if (!match) {
    return null
  }

  const [, year, month, day] = match

  return new Date(Number(year), Number(month) - 1, Number(day))
}

function formatTopbarWeatherLabel(weatherText: string | undefined) {
  if (!weatherText) {
    return ''
  }

  if (/雷|暴/.test(weatherText)) {
    return '雷雨'
  }

  if (/雨|淋|阵雨/.test(weatherText)) {
    return '雨天'
  }

  if (/雪|冰/.test(weatherText)) {
    return '雪天'
  }

  if (/雾|霾/.test(weatherText)) {
    return '雾天'
  }

  if (/阴|云/.test(weatherText)) {
    return '阴天'
  }

  if (/风/.test(weatherText)) {
    return '有风'
  }

  if (/晴|阳/.test(weatherText)) {
    return '晴天'
  }

  return weatherText
}

export const JournalDayView = forwardRef<JournalDayViewHandle, JournalDayViewProps>(function JournalDayView(
  { date = null, showDaySwitchNudge = true },
  ref,
) {
  const [journalMode, setJournalMode] = useState<JournalMode>(() => readStoredJournalMode())
  const [journalMarkdown, setJournalMarkdown] = useState('')
  const [journalFile, setJournalFile] = useState<JournalFile | null>(null)
  const [journalFrontMatter, setJournalFrontMatter] = useState<DayFrontMatter>({})
  const [realTodayDate, setRealTodayDate] = useState(() => getLocalDateKey())
  const [daySwitchError, setDaySwitchError] = useState('')
  const [isEditorComposing, setIsEditorComposing] = useState(false)
  const [hasLoadedJournal, setHasLoadedJournal] = useState(false)
  const [hasPendingJournalEdit, setHasPendingJournalEditState] = useState(false)
  const coordinatorRef = useRef<JournalSyncCoordinator | null>(null)
  const markLocalSaveRef = useRef<((changedPaths: readonly string[]) => void) | null>(null)
  const pendingImportedMediaPathsRef = useRef<string[]>([])
  const isEditorComposingRef = useRef(false)
  const isJournalDirtyRef = useRef(false)
  const hasPendingJournalEditRef = useRef(false)
  const journalFileRef = useRef<JournalFile | null>(null)
  const lastJournalEditedAtRef = useRef(0)
  const saveRequestIdRef = useRef(0)
  const finalizeJournalRef = useRef<((shouldUpdateState?: boolean) => Promise<boolean>) | null>(null)
  const {
    hasUnsavedJournalChanges,
    lastSavedFrontMatterRef,
    lastSavedMarkdownRef,
    updateLastSavedJournalSnapshot,
  } = useJournalFile({
    hasLoadedJournal,
    journalFrontMatter,
    journalMarkdown,
  })
  const {
    refreshTodayWeather,
    weatherStatus,
  } = useTodayWeather({
    coordinatorRef,
    journalFileRef,
    saveRequestIdRef,
    setJournalFile,
    setJournalFrontMatter,
    updateLastSavedJournalSnapshot,
  })
  const isReviewing = journalMode === 'review'
  const isViewingAnotherDay = Boolean(journalFile?.date && journalFile.date !== realTodayDate)
  const currentJournalDate = journalFile?.date ?? journalFrontMatter.date ?? realTodayDate
  const parsedJournalEntry = useMemo(() => parseJournalMarkdown(journalMarkdown), [journalMarkdown])
  const topbarTitle = formatJournalTopbarTitle(
    currentJournalDate,
    journalFrontMatter.weather?.text,
  )
  const hasPendingUnsavedJournalChanges = hasPendingJournalEdit && hasUnsavedJournalChanges
  const renderedMarkdown = useMemo(
    () =>
      renderJournalMarkdown({
        markdown: journalMarkdown,
        sourceFilePath: journalFile?.filePath,
      }),
    [journalFile?.filePath, journalMarkdown],
  )

  const setHasPendingJournalEdit = useCallback((nextValue: boolean) => {
    hasPendingJournalEditRef.current = nextValue
    setHasPendingJournalEditState(nextValue)
  }, [])

  const applyLoadedJournalFile = useCallback((file: JournalFile) => {
    const parsedFile = parseJournalMarkdown(file.content)
    const editableMarkdown = serializeJournalMarkdownBody(parsedFile.longEntryMarkdown, parsedFile.murmurs)
    const frontMatter = parsedFile.frontMatter
    const initialJournalMode = isBlankJournalMarkdown(editableMarkdown) ? 'write' : readStoredJournalMode()

    saveRequestIdRef.current += 1
    setHasPendingJournalEdit(false)
    setDaySwitchError('')
    setRealTodayDate(getLocalDateKey())
    journalFileRef.current = file
    updateLastSavedJournalSnapshot({
      frontMatter,
      markdown: editableMarkdown,
    })
    setJournalFrontMatter(frontMatter)
    setJournalFile(file)
    setJournalMarkdown(editableMarkdown)
    setJournalMode(initialJournalMode)
    setHasLoadedJournal(true)
    void refreshTodayWeather(file)
  }, [refreshTodayWeather, setHasPendingJournalEdit, updateLastSavedJournalSnapshot])

  const loadTodayJournal = useCallback(async (shouldApply: () => boolean = () => true) => {
    const journalStore = getJournalStore()

    if (!journalStore) {
      setHasLoadedJournal(true)
      return
    }

    const file = await journalStore.loadToday()

    if (shouldApply()) {
      applyLoadedJournalFile(file)
    }
  }, [applyLoadedJournalFile])

  const loadJournalForDate = useCallback(async (date: string | null, shouldApply: () => boolean = () => true) => {
    const journalStore = getJournalStore()

    if (!date || date === getLocalDateKey() || !journalStore?.loadDate) {
      await loadTodayJournal(shouldApply)
      return
    }

    const file = await journalStore.loadDate(date)

    if (!shouldApply()) {
      return
    }

    applyLoadedJournalFile(file)
  }, [applyLoadedJournalFile, loadTodayJournal])

  const saveJournalFile = useCallback(async (
    date: string,
    markdown: string,
    frontMatter: DayFrontMatter,
  ) => {
    const journalStore = getJournalStore()

    if (!journalStore) {
      return null
    }

    const fileMarkdown = createManagedJournalMarkdown(markdown, date, frontMatter)

    if (journalStore.saveDate) {
      return journalStore.saveDate(date, fileMarkdown)
    }

    if (date === getLocalDateKey()) {
      return journalStore.saveToday(fileMarkdown)
    }

    return null
  }, [])

  const flushPendingSave = useCallback(async (
    shouldUpdateState = true,
    options: { scheduleSync?: boolean } = {},
  ) => {
    const currentDate = journalFileRef.current?.date ?? realTodayDate

    if (
      !getJournalStore() ||
      !hasLoadedJournal ||
      !hasPendingJournalEditRef.current ||
      (journalMarkdown === lastSavedMarkdownRef.current &&
        !hasFrontMatterChanged(journalFrontMatter, lastSavedFrontMatterRef.current))
    ) {
      return true
    }

    saveRequestIdRef.current += 1

    try {
      const savedFile = await saveJournalFile(currentDate, journalMarkdown, journalFrontMatter)

      if (!savedFile) {
        return false
      }

      const savedEntry = parseJournalMarkdown(savedFile.content)

      updateLastSavedJournalSnapshot({
        frontMatter: savedEntry.frontMatter,
        markdown: stripManagedFrontMatter(savedFile.content),
      }, { updateState: shouldUpdateState })
      journalFileRef.current = savedFile

      if (shouldUpdateState) {
        setJournalFile(savedFile)
      }

      const pendingImportedMediaPaths = pendingImportedMediaPathsRef.current

      if ((options.scheduleSync ?? true) && (didJournalFileWrite(savedFile) || pendingImportedMediaPaths.length > 0)) {
        markLocalSaveRef.current?.(getJournalFileTrackedPaths(savedFile, pendingImportedMediaPaths))
        pendingImportedMediaPathsRef.current = []
      }

      if (shouldUpdateState) {
        setHasPendingJournalEdit(false)
      } else {
        hasPendingJournalEditRef.current = false
      }

      return true
    } catch {
      return false
    }
  }, [hasLoadedJournal, journalFrontMatter, journalMarkdown, realTodayDate, saveJournalFile, setHasPendingJournalEdit, updateLastSavedJournalSnapshot])

  const finalizeJournalBeforeLeaving = useCallback(
    async (shouldUpdateState = true) => flushPendingSave(shouldUpdateState),
    [flushPendingSave],
  )

  const {
    resumeConfiguredSync,
    syncStatus,
  } = useDesktopJournalSync({
    automaticPushDelayMs: AUTOSAVE_DELAY_MS,
    coordinatorRef,
    flushPendingSave,
    hasUnsavedLocalChanges: hasPendingUnsavedJournalChanges || isEditorComposing,
    isEditorComposingRef,
    isJournalDirtyRef,
    journalFileRef,
    lastJournalEditedAtRef,
    loadJournalForDate,
    markLocalSaveRef,
  })
  const SyncStatusIcon = syncStatus.icon

  useEffect(() => {
    finalizeJournalRef.current = finalizeJournalBeforeLeaving
  }, [finalizeJournalBeforeLeaving])

  useImperativeHandle(ref, () => ({
    flushPendingSave: () => finalizeJournalBeforeLeaving(),
  }), [finalizeJournalBeforeLeaving])

  useEffect(() => {
    let isCancelled = false

    void Promise.resolve()
      .then(() => loadJournalForDate(date, () => !isCancelled))
      .catch(() => {
        if (isCancelled) {
          return
        }

        setHasLoadedJournal(true)
      })

    return () => {
      isCancelled = true
    }
  }, [date, loadJournalForDate])

  useEffect(() => {
    journalFileRef.current = journalFile
  }, [journalFile])

  useEffect(() => {
    isJournalDirtyRef.current = Boolean(hasPendingUnsavedJournalChanges)
  }, [hasPendingUnsavedJournalChanges])

  useEffect(() => {
    let timeoutId: number | undefined

    function updateRealTodayDate() {
      setRealTodayDate(getLocalDateKey())
    }

    function scheduleNextDayCheck() {
      timeoutId = window.setTimeout(() => {
        updateRealTodayDate()
        scheduleNextDayCheck()
      }, millisecondsUntilNextLocalDay())
    }

    function handleVisibilityChange() {
      if (!document.hidden) {
        updateRealTodayDate()
        void resumeConfiguredSync()
      }
    }

    function handleWindowFocus() {
      updateRealTodayDate()
      void resumeConfiguredSync()
    }

    scheduleNextDayCheck()
    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [resumeConfiguredSync])

  useEffect(() => {
    const journalStore = getJournalStore()

    if (
      !journalStore ||
      !hasLoadedJournal ||
      !hasPendingJournalEdit ||
      isEditorComposingRef.current ||
      isEditorComposing ||
      (journalMarkdown === lastSavedMarkdownRef.current &&
        !hasFrontMatterChanged(journalFrontMatter, lastSavedFrontMatterRef.current))
    ) {
      return
    }

    const requestId = saveRequestIdRef.current + 1
    saveRequestIdRef.current = requestId

    const timeoutId = window.setTimeout(() => {
      if (saveRequestIdRef.current !== requestId) {
        return
      }

      const date = journalFile?.date ?? realTodayDate

      saveJournalFile(date, journalMarkdown, journalFrontMatter)
        .then((file) => {
          if (!file || saveRequestIdRef.current !== requestId) {
            return
          }

          const savedEntry = parseJournalMarkdown(file.content)
          const pendingImportedMediaPaths = pendingImportedMediaPathsRef.current

          updateLastSavedJournalSnapshot({
            frontMatter: savedEntry.frontMatter,
            markdown: stripManagedFrontMatter(file.content),
          })
          journalFileRef.current = file
          setJournalFile(file)
          if (didJournalFileWrite(file) || pendingImportedMediaPaths.length > 0) {
            markLocalSaveRef.current?.(getJournalFileTrackedPaths(file, pendingImportedMediaPaths))
            pendingImportedMediaPathsRef.current = []
          }
          setHasPendingJournalEdit(false)
        })
        .catch(() => undefined)
    }, AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timeoutId)
  }, [hasLoadedJournal, hasPendingJournalEdit, isEditorComposing, journalFile?.date, journalFrontMatter, journalMarkdown, realTodayDate, saveJournalFile, setHasPendingJournalEdit, updateLastSavedJournalSnapshot])

  function handleModeChange(nextMode: JournalMode) {
    setJournalMode(nextMode)
    writeStoredJournalMode(nextMode)
  }

  async function handleGoToToday() {
    saveRequestIdRef.current += 1

    if (!(await finalizeJournalBeforeLeaving(true))) {
      setDaySwitchError('刚才的内容还没有保存成功，先留在这一天。')
      return
    }

    setDaySwitchError('')
    await loadTodayJournal().catch(() => undefined)
  }

  function handleJournalMarkdownChange(nextMarkdown: string) {
    if (isEditorComposingRef.current) {
      return
    }

    lastJournalEditedAtRef.current = getCurrentTimestamp()
    setHasPendingJournalEdit(true)
    updateJournalMarkdownBody(nextMarkdown)
  }

  function updateJournalMarkdownBody(nextMarkdown: string) {
    setDaySwitchError('')
    setJournalMarkdown((currentMarkdown) => {
      const currentEntry = parseJournalMarkdown(currentMarkdown)

      return serializeJournalMarkdownBody(nextMarkdown, currentEntry.murmurs)
    })
  }

  function handleEditorCompositionChange(isComposing: boolean, composedMarkdown: string) {
    isEditorComposingRef.current = isComposing
    setIsEditorComposing(isComposing)

    if (!isComposing) {
      lastJournalEditedAtRef.current = getCurrentTimestamp()
      setHasPendingJournalEdit(true)
      updateJournalMarkdownBody(composedMarkdown)
    }
  }

  function handleJournalMurmursChange(nextMurmurs: MurmurBlock[]) {
    lastJournalEditedAtRef.current = getCurrentTimestamp()
    setHasPendingJournalEdit(true)
    setDaySwitchError('')
    setJournalMarkdown((currentMarkdown) => {
      const currentEntry = parseJournalMarkdown(currentMarkdown)

      return serializeJournalMarkdownBody(currentEntry.longEntryMarkdown, nextMurmurs)
    })
  }

  async function handleImportMurmurImages() {
    const journalStore = getJournalStore()

    if (!journalStore?.importImages) {
      throw new Error('当前环境还不能导入图片。')
    }

    const importedImages = await journalStore.importImages(currentJournalDate)

    pendingImportedMediaPathsRef.current = mergeTrackedPaths([
      ...pendingImportedMediaPathsRef.current,
      ...importedImages.map((image) => image.src),
    ])

    return importedImages
  }

  return (
    <>
      <motion.header
        animate={{ opacity: 1, y: 0 }}
        className="journal-topbar flex min-h-14 items-center justify-between gap-3 px-7 py-2"
        initial={{ opacity: 0, y: -8 }}
        transition={{ ...panelTransition, delay: 0.05 }}
      >
        <h1 className="min-w-0 truncate font-display text-xl font-semibold text-foreground">{topbarTitle}</h1>
        {showDaySwitchNudge && isViewingAnotherDay ? (
          <div className="journal-day-nudge" role="status">
            <span>
              {daySwitchError ||
                `现在是 ${formatDateNudgeLabel(realTodayDate)}，你还在写 ${formatDateNudgeLabel(journalFile?.date ?? '')}`}
            </span>
            <button onClick={() => void handleGoToToday()} type="button">
              去今天
            </button>
          </div>
        ) : null}
        <div className="journal-topbar-actions">
          <a
            aria-label={`同步状态：${syncStatus.label}，打开设置`}
            className={`journal-sync-button is-${syncStatus.tone}`}
            href="#/settings"
            title={syncStatus.detail}
          >
            <SyncStatusIcon aria-hidden="true" size={16} strokeWidth={2.2} />
            <span>{syncStatus.label}</span>
            <Settings2 aria-hidden="true" size={14} strokeWidth={2.25} />
          </a>
          <SegmentedControl
            ariaLabel="纸面状态"
            onChange={handleModeChange}
            options={journalModeOptions}
            value={journalMode}
          />
        </div>
      </motion.header>

      <section className="journal-stage flex-1 min-h-0">
        <JournalDiagnosticsBanner diagnostics={parsedJournalEntry.diagnostics} />
        {isReviewing ? (
          <MarkdownPreviewArticle renderedMarkdown={renderedMarkdown} />
        ) : (
          <motion.article
            animate={{ opacity: 1, y: 0 }}
            className="journal-writing-panel"
            initial={{ opacity: 0, y: 10 }}
            transition={{ ...panelTransition, delay: 0.08 }}
          >
            <div className="journal-paper">
              <div className="journal-paper-meta">
                <JournalWeatherHeader frontMatter={journalFrontMatter} status={weatherStatus} variant="writing" />
              </div>
              <JournalMarkdownEditor
                onChange={handleJournalMarkdownChange}
                onCompositionChange={handleEditorCompositionChange}
                value={parsedJournalEntry.longEntryMarkdown}
              />
            </div>
            <JournalMurmurPanel
              date={currentJournalDate}
              murmurs={parsedJournalEntry.murmurs}
              onChange={handleJournalMurmursChange}
              onImportImages={handleImportMurmurImages}
            />
          </motion.article>
        )}
      </section>
    </>
  )
})

function MarkdownPreviewPage() {
  return <JournalDayView />
}

function isBlankJournalMarkdown(markdown: string) {
  return markdown.trim() === ''
}

function getCurrentTimestamp() {
  return Date.now()
}

function didJournalFileWrite(file: JournalFile) {
  return file.didWrite === true
}

function getJournalFileTrackedPaths(file: JournalFile, additionalPaths: readonly string[] = []) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(file.date)

  if (!match) {
    return mergeTrackedPaths(additionalPaths)
  }

  const [, year, month] = match

  return mergeTrackedPaths([`entries/${year}/${month}/${file.date}.md`, ...additionalPaths])
}

function mergeTrackedPaths(paths: readonly string[]) {
  return [...new Set(
    paths
      .map((trackedPath) => trackedPath.trim().replace(/\\/g, '/').replace(/^\.?\//, ''))
      .filter(Boolean),
  )].sort()
}

export default MarkdownPreviewPage
