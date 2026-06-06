import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import SegmentedControl from '../components/SegmentedControl'
import {
  parseJournalMarkdown,
  renderJournalMarkdown,
  serializeJournalFrontMatter,
  serializeJournalMarkdownBody,
  type DayFrontMatter,
  type MurmurBlock,
} from '../domain/markdown'
import { brand } from '../brand'
import { panelTransition } from './markdown-preview/constants'
import JournalMarkdownEditor from './markdown-preview/JournalMarkdownEditor'
import JournalWeatherHeader, {
  type WeatherStatus,
} from './markdown-preview/JournalWeatherHeader'
import JournalMurmurPanel from './markdown-preview/JournalMurmurPanel'
import MarkdownPreviewArticle from './markdown-preview/MarkdownPreviewArticle'
import {
  createManagedJournalMarkdown,
  stripManagedFrontMatter,
} from './markdown-preview/managedJournalMarkdown'

type JournalMode = 'write' | 'review'
type JournalFile = Awaited<ReturnType<NonNullable<Window['journalStore']>['loadToday']>>
type JournalDayViewProps = {
  date?: string | null
  showDaySwitchNudge?: boolean
}
export type JournalDayViewHandle = {
  flushPendingSave: () => Promise<boolean>
}

const AUTOSAVE_DELAY_MS = 700
const JOURNAL_MODE_STORAGE_KEY = 'journal.preview.mode'
const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const journalModeOptions: Array<{ value: JournalMode; label: string }> = [
  { value: 'write', label: '书写' },
  { value: 'review', label: '回看' },
]

function getJournalStore() {
  return typeof window === 'undefined' ? undefined : window.journalStore
}

function getJournalSettingsStore() {
  return typeof window === 'undefined' ? undefined : window.journalSettings
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
  const [weatherStatus, setWeatherStatus] = useState<WeatherStatus>('idle')
  const hasLoadedJournalRef = useRef(false)
  const journalFileRef = useRef<JournalFile | null>(null)
  const lastSavedMarkdownRef = useRef('')
  const lastSavedFrontMatterRef = useRef<DayFrontMatter>({})
  const saveRequestIdRef = useRef(0)
  const finalizeJournalRef = useRef<((shouldUpdateState?: boolean) => Promise<boolean>) | null>(null)
  const isReviewing = journalMode === 'review'
  const journalStorageLabel = journalFile ? `~/.journal/${journalFile.fileName}` : brand.storageFallback
  const isViewingAnotherDay = Boolean(journalFile?.date && journalFile.date !== realTodayDate)
  const currentJournalDate = journalFile?.date ?? journalFrontMatter.date ?? realTodayDate
  const parsedJournalEntry = useMemo(() => parseJournalMarkdown(journalMarkdown), [journalMarkdown])
  const topbarTitle = formatJournalTopbarTitle(
    currentJournalDate,
    journalFrontMatter.weather?.text,
  )
  const renderedMarkdown = useMemo(
    () =>
      renderJournalMarkdown({
        markdown: journalMarkdown,
        sourceFilePath: journalFile?.filePath,
      }),
    [journalFile?.filePath, journalMarkdown],
  )

  const refreshTodayWeather = useCallback(async (loadedFile: JournalFile) => {
    const journalStore = getJournalStore()

    if (!journalStore?.refreshTodayWeather) {
      const frontMatter = parseJournalMarkdown(loadedFile.content).frontMatter

      if (journalFileRef.current?.date === loadedFile.date) {
        setWeatherStatus(frontMatter.weather?.text ? 'ready' : 'failed')
      }
      return
    }

    const loadedFrontMatter = parseJournalMarkdown(loadedFile.content).frontMatter

    if (loadedFile.date !== getLocalDateKey()) {
      setWeatherStatus(loadedFrontMatter.weather?.text ? 'ready' : 'failed')
      return
    }

    const weatherLocation = await loadConfiguredWeatherLocation()

    if (isFreshWeatherForLocation(loadedFrontMatter, loadedFile.date, weatherLocation)) {
      setWeatherStatus('ready')
      return
    }

    setWeatherStatus('loading')

    try {
      const location = weatherLocation ? undefined : await resolveBrowserWeatherLocation()

      if (journalFileRef.current?.date !== loadedFile.date || loadedFile.date !== getLocalDateKey()) {
        if (journalFileRef.current?.date === loadedFile.date) {
          setWeatherStatus(loadedFrontMatter.weather?.text ? 'ready' : 'failed')
        }
        return
      }

      const refreshedFile = await journalStore.refreshTodayWeather(location)
      const refreshedFrontMatter = parseJournalMarkdown(refreshedFile.content).frontMatter

      if (journalFileRef.current?.date !== loadedFile.date || refreshedFile.date !== loadedFile.date) {
        if (journalFileRef.current?.date === loadedFile.date) {
          setWeatherStatus(loadedFrontMatter.weather?.text ? 'ready' : 'failed')
        }
        return
      }

      journalFileRef.current = refreshedFile
      lastSavedFrontMatterRef.current = refreshedFrontMatter
      setJournalFrontMatter(refreshedFrontMatter)
      setJournalFile(refreshedFile)
      setWeatherStatus(refreshedFrontMatter.weather?.text ? 'ready' : 'failed')
    } catch {
      if (journalFileRef.current?.date === loadedFile.date) {
        setWeatherStatus('failed')
      }
    }
  }, [])

  const applyLoadedJournalFile = useCallback((file: JournalFile) => {
    const parsedFile = parseJournalMarkdown(file.content)
    const editableMarkdown = serializeJournalMarkdownBody(parsedFile.longEntryMarkdown, parsedFile.murmurs)
    const frontMatter = parsedFile.frontMatter
    const initialJournalMode = isBlankJournalMarkdown(editableMarkdown) ? 'write' : readStoredJournalMode()

    setDaySwitchError('')
    setRealTodayDate(getLocalDateKey())
    journalFileRef.current = file
    lastSavedMarkdownRef.current = editableMarkdown
    lastSavedFrontMatterRef.current = frontMatter
    hasLoadedJournalRef.current = true
    setJournalFrontMatter(frontMatter)
    setJournalFile(file)
    setJournalMarkdown(editableMarkdown)
    setJournalMode(initialJournalMode)
    void refreshTodayWeather(file)
  }, [refreshTodayWeather])

  const loadTodayJournal = useCallback(async (shouldApply: () => boolean = () => true) => {
    const journalStore = getJournalStore()

    if (!journalStore) {
      hasLoadedJournalRef.current = true
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

  const flushPendingSave = useCallback(async (shouldUpdateState = true) => {
    const currentDate = journalFileRef.current?.date ?? realTodayDate

    if (
      !getJournalStore() ||
      !hasLoadedJournalRef.current ||
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

      lastSavedMarkdownRef.current = stripManagedFrontMatter(savedFile.content)
      lastSavedFrontMatterRef.current = savedEntry.frontMatter
      journalFileRef.current = savedFile

      if (shouldUpdateState) {
        setJournalFile(savedFile)
      }

      return true
    } catch {
      return false
    }
  }, [journalFrontMatter, journalMarkdown, realTodayDate, saveJournalFile])

  const finalizeJournalBeforeLeaving = useCallback(
    async (shouldUpdateState = true) => flushPendingSave(shouldUpdateState),
    [flushPendingSave],
  )

  useEffect(() => {
    finalizeJournalRef.current = finalizeJournalBeforeLeaving
  }, [finalizeJournalBeforeLeaving])

  useImperativeHandle(ref, () => ({
    flushPendingSave: () => finalizeJournalBeforeLeaving(),
  }), [finalizeJournalBeforeLeaving])

  useEffect(() => () => {
    void finalizeJournalRef.current?.(false)
  }, [])

  useEffect(() => {
    function finalizeOpenJournal() {
      void finalizeJournalRef.current?.(false)
    }

    window.addEventListener('pagehide', finalizeOpenJournal)
    window.addEventListener('beforeunload', finalizeOpenJournal)

    return () => {
      window.removeEventListener('pagehide', finalizeOpenJournal)
      window.removeEventListener('beforeunload', finalizeOpenJournal)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    void Promise.resolve()
      .then(() => loadJournalForDate(date, () => !isCancelled))
      .catch(() => {
        if (isCancelled) {
          return
        }

        hasLoadedJournalRef.current = true
      })

    return () => {
      isCancelled = true
    }
  }, [date, loadJournalForDate])

  useEffect(() => {
    journalFileRef.current = journalFile
  }, [journalFile])

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
      }
    }

    scheduleNextDayCheck()
    window.addEventListener('focus', updateRealTodayDate)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener('focus', updateRealTodayDate)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    const journalStore = getJournalStore()

    if (
      !journalStore ||
      !hasLoadedJournalRef.current ||
      (journalMarkdown === lastSavedMarkdownRef.current &&
        !hasFrontMatterChanged(journalFrontMatter, lastSavedFrontMatterRef.current))
    ) {
      return
    }

    const requestId = saveRequestIdRef.current + 1
    saveRequestIdRef.current = requestId

    const timeoutId = window.setTimeout(() => {
      const date = journalFile?.date ?? realTodayDate

      saveJournalFile(date, journalMarkdown, journalFrontMatter)
        .then((file) => {
          if (!file || saveRequestIdRef.current !== requestId) {
            return
          }

          const savedEntry = parseJournalMarkdown(file.content)

          lastSavedMarkdownRef.current = stripManagedFrontMatter(file.content)
          lastSavedFrontMatterRef.current = savedEntry.frontMatter
          journalFileRef.current = file
          setJournalFile(file)
        })
        .catch(() => undefined)
    }, AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timeoutId)
  }, [journalFile?.date, journalFrontMatter, journalMarkdown, realTodayDate, saveJournalFile])

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
    setDaySwitchError('')
    setJournalMarkdown((currentMarkdown) => {
      const currentEntry = parseJournalMarkdown(currentMarkdown)

      return serializeJournalMarkdownBody(nextMarkdown, currentEntry.murmurs)
    })
  }

  function handleJournalMurmursChange(nextMurmurs: MurmurBlock[]) {
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

    return journalStore.importImages(currentJournalDate)
  }

  return (
    <>
      <motion.header
        animate={{ opacity: 1, y: 0 }}
        className="journal-topbar flex min-h-14 items-center justify-between gap-3 px-7 py-2"
        initial={{ opacity: 0, y: -8 }}
        transition={{ ...panelTransition, delay: 0.05 }}
      >
        <h1 className="min-w-0 truncate font-display text-xl font-semibold text-ink">{topbarTitle}</h1>
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
          <SegmentedControl
            ariaLabel="纸面状态"
            onChange={handleModeChange}
            options={journalModeOptions}
            value={journalMode}
          />
        </div>
      </motion.header>

      <section className="journal-stage flex-1 min-h-0">
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
                <span className="journal-storage-label" title={journalFile?.filePath}>
                  {journalStorageLabel}
                </span>
              </div>
              <JournalMarkdownEditor
                onChange={handleJournalMarkdownChange}
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

function resolveBrowserWeatherLocation(): Promise<{ latitude: number; longitude: number } | undefined> {
  if (!navigator.geolocation) {
    return Promise.resolve(undefined)
  }

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(undefined), 5000)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timeoutId)
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      () => {
        window.clearTimeout(timeoutId)
        resolve(undefined)
      },
      {
        enableHighAccuracy: false,
        maximumAge: 1000 * 60 * 60,
        timeout: 4500,
      },
    )
  })
}

function isFreshWeather(weather: DayFrontMatter['weather'], date: string) {
  return Boolean(weather?.text && weather.updatedAt?.startsWith(date))
}

function isFreshWeatherForLocation(frontMatter: DayFrontMatter, date: string, weatherLocation: string) {
  if (!isFreshWeather(frontMatter.weather, date)) {
    return false
  }

  const query = weatherLocation.trim()

  return !query || (frontMatter.location?.query === query && frontMatter.location?.name === query)
}

async function loadConfiguredWeatherLocation() {
  try {
    return (await getJournalSettingsStore()?.load())?.weatherLocation.trim() ?? ''
  } catch {
    return ''
  }
}

function isBlankJournalMarkdown(markdown: string) {
  return markdown.trim() === ''
}

function hasFrontMatterChanged(currentFrontMatter: DayFrontMatter, savedFrontMatter: DayFrontMatter) {
  return serializeJournalFrontMatter(currentFrontMatter) !== serializeJournalFrontMatter(savedFrontMatter)
}

export default MarkdownPreviewPage
