import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { motion } from 'motion/react'
import SegmentedControl from '../components/SegmentedControl'
import { createDomRangesByAnnotation, resolveAnnotationRanges } from '../domain/annotations'
import type { Annotation } from '../domain/annotations'
import {
  parseJournalMarkdown,
  renderJournalMarkdown,
  type DayFrontMatter,
} from '../domain/markdown'
import {
  getAnnotationIds,
  registerAnnotationHighlights,
  sourceOffsetAtPoint,
  watchActiveOverlayRects,
} from './markdown-preview/annotationDom'
import AnnotationSidebar from './markdown-preview/AnnotationSidebar'
import { panelTransition } from './markdown-preview/constants'
import {
  annotationTargetsEntry,
  demoAnnotations,
} from './markdown-preview/demoAnnotations'
import JournalWeatherHeader, {
  type WeatherStatus,
} from './markdown-preview/JournalWeatherHeader'
import JournalMarkdownEditor from './markdown-preview/JournalMarkdownEditor'
import {
  createManagedJournalMarkdown,
  stripManagedFrontMatter,
} from './markdown-preview/managedJournalMarkdown'
import MarkdownPreviewArticle from './markdown-preview/MarkdownPreviewArticle'
import type { AnnotationOverlayRect } from './markdown-preview/types'

type JournalMode = 'write' | 'review'
type JournalFile = Awaited<ReturnType<NonNullable<Window['journalStore']>['loadToday']>>

const noAnnotations: Annotation[] = []
const AUTOSAVE_DELAY_MS = 700
const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const journalModeOptions: Array<{ value: JournalMode; label: string }> = [
  { value: 'write', label: '书写' },
  { value: 'review', label: '回看' },
]

function getJournalStore() {
  return typeof window === 'undefined' ? undefined : window.journalStore
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

function MarkdownPreviewPage() {
  const [journalMode, setJournalMode] = useState<JournalMode>('write')
  const [journalMarkdown, setJournalMarkdown] = useState(annotationTargetsEntry)
  const [journalFile, setJournalFile] = useState<JournalFile | null>(null)
  const [journalFrontMatter, setJournalFrontMatter] = useState<DayFrontMatter>({})
  const [realTodayDate, setRealTodayDate] = useState(() => getLocalDateKey())
  const [daySwitchError, setDaySwitchError] = useState('')
  const [journalAnnotations, setJournalAnnotations] = useState<Annotation[]>(demoAnnotations)
  const [weatherStatus, setWeatherStatus] = useState<WeatherStatus>('idle')
  const [activeAnnotationId, setActiveAnnotationId] = useState(demoAnnotations[0]?.id ?? '')
  const [activeOverlayRects, setActiveOverlayRects] = useState<AnnotationOverlayRect[]>([])
  const previewRef = useRef<HTMLDivElement>(null)
  const hasLoadedJournalRef = useRef(false)
  const journalFileRef = useRef<JournalFile | null>(null)
  const lastSavedMarkdownRef = useRef(annotationTargetsEntry)
  const saveRequestIdRef = useRef(0)
  const isReviewing = journalMode === 'review'
  const journalStorageLabel = journalFile ? `~/.journal/${journalFile.fileName}` : '页边保持安静'
  const isViewingAnotherDay = Boolean(journalFile?.date && journalFile.date !== realTodayDate)
  const topbarTitle = formatJournalTopbarTitle(
    journalFile?.date ?? journalFrontMatter.date ?? getLocalDateKey(),
    journalFrontMatter.weather?.text,
  )
  const visibleAnnotations = useMemo(
    () => (isReviewing ? journalAnnotations.filter((annotation) => annotation.status === 'visible') : noAnnotations),
    [isReviewing, journalAnnotations],
  )
  const annotationRanges = useMemo(
    () => resolveAnnotationRanges(parseJournalMarkdown(journalMarkdown).longEntryMarkdown, visibleAnnotations),
    [journalMarkdown, visibleAnnotations],
  )
  const renderedMarkdown = useMemo(
    () => renderJournalMarkdown({ markdown: journalMarkdown, annotations: visibleAnnotations }),
    [journalMarkdown, visibleAnnotations],
  )

  const replaceJournalAnnotations = useCallback((nextAnnotations: Annotation[]) => {
    setJournalAnnotations(nextAnnotations)
    setActiveAnnotationId(
      nextAnnotations.find((annotation) => annotation.status === 'visible')?.id ?? '',
    )
  }, [])

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

    if (isFreshWeather(loadedFrontMatter.weather, loadedFile.date)) {
      setWeatherStatus('ready')
      return
    }

    if (loadedFile.date !== getLocalDateKey()) {
      setWeatherStatus(loadedFrontMatter.weather?.text ? 'ready' : 'failed')
      return
    }

    setWeatherStatus('loading')

    try {
      const location = await resolveBrowserWeatherLocation()

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
      setJournalFrontMatter(refreshedFrontMatter)
      setJournalFile(refreshedFile)
      setWeatherStatus(refreshedFrontMatter.weather?.text ? 'ready' : 'failed')
    } catch {
      if (journalFileRef.current?.date === loadedFile.date) {
        setWeatherStatus('failed')
      }
    }
  }, [])

  const loadAnnotationsForDate = useCallback(async (date: string) => {
    const journalStore = getJournalStore()

    if (!journalStore?.readAnnotations) {
      if (journalFileRef.current?.date === date) {
        replaceJournalAnnotations(noAnnotations)
      }
      return
    }

    try {
      const annotationFile = await journalStore.readAnnotations(date)

      if (journalFileRef.current?.date === date) {
        replaceJournalAnnotations(annotationFile.annotations)
      }
    } catch {
      if (journalFileRef.current?.date === date) {
        replaceJournalAnnotations(noAnnotations)
      }
    }
  }, [replaceJournalAnnotations])

  const loadTodayJournal = useCallback(async (shouldApply: () => boolean = () => true) => {
    const journalStore = getJournalStore()

    if (!journalStore) {
      hasLoadedJournalRef.current = true
      return
    }

    const file = await journalStore.loadToday()

    if (!shouldApply()) {
      return
    }

    const editableMarkdown = stripManagedFrontMatter(file.content)
    const frontMatter = parseJournalMarkdown(file.content).frontMatter

    setDaySwitchError('')
    setRealTodayDate(getLocalDateKey())
    journalFileRef.current = file
    lastSavedMarkdownRef.current = editableMarkdown
    hasLoadedJournalRef.current = true
    setJournalFrontMatter(frontMatter)
    setJournalFile(file)
    setJournalMarkdown(editableMarkdown)
    void loadAnnotationsForDate(file.date)
    void refreshTodayWeather(file)
  }, [loadAnnotationsForDate, refreshTodayWeather])

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

  useEffect(() => {
    let isCancelled = false

    void Promise.resolve()
      .then(() => loadTodayJournal(() => !isCancelled))
      .catch(() => {
        if (isCancelled) {
          return
        }

        hasLoadedJournalRef.current = true
      })

    return () => {
      isCancelled = true
    }
  }, [loadTodayJournal])

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

    if (!journalStore || !hasLoadedJournalRef.current || journalMarkdown === lastSavedMarkdownRef.current) {
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

          lastSavedMarkdownRef.current = stripManagedFrontMatter(file.content)
          journalFileRef.current = file
          setJournalFile(file)
        })
        .catch(() => undefined)
    }, AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timeoutId)
  }, [journalFile?.date, journalFrontMatter, journalMarkdown, realTodayDate, saveJournalFile])

  useEffect(() => {
    const preview = previewRef.current

    if (!preview || !isReviewing) {
      return
    }

    for (const block of preview.querySelectorAll<HTMLElement>('[data-annotation-ids]')) {
      const ids = getAnnotationIds(block)
      block.dataset.annotationActive = ids.includes(activeAnnotationId) ? 'true' : 'false'
    }
  }, [activeAnnotationId, isReviewing, renderedMarkdown])

  useEffect(() => {
    const preview = previewRef.current

    if (!preview || !isReviewing) {
      setActiveOverlayRects([])
      return
    }

    const rangesByAnnotation = createDomRangesByAnnotation(preview, annotationRanges)
    const cleanupHighlights = registerAnnotationHighlights(rangesByAnnotation, activeAnnotationId)
    const cleanupOverlay = watchActiveOverlayRects(
      preview,
      rangesByAnnotation.get(activeAnnotationId) ?? [],
      setActiveOverlayRects,
    )

    return () => {
      cleanupHighlights()
      cleanupOverlay()
    }
  }, [activeAnnotationId, annotationRanges, isReviewing])

  function selectAnnotation(annotationId: string, shouldScroll: boolean) {
    setActiveAnnotationId(annotationId)

    if (!shouldScroll) {
      return
    }

    const targetBlock = findBlockForAnnotation(annotationId)
    targetBlock?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function handlePreviewClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null
    const annotatedBlock = target?.closest<HTMLElement>('[data-annotation-ids]')
    const clickedAnnotationId = findAnnotationIdAtPoint(event.clientX, event.clientY)
    const firstAnnotationId = annotatedBlock ? getAnnotationIds(annotatedBlock)[0] : undefined
    const nextAnnotationId = clickedAnnotationId ?? firstAnnotationId

    if (nextAnnotationId) {
      selectAnnotation(nextAnnotationId, false)
    }
  }

  function findBlockForAnnotation(annotationId: string): HTMLElement | null {
    const preview = previewRef.current

    if (!preview) {
      return null
    }

    return Array.from(preview.querySelectorAll<HTMLElement>('[data-annotation-ids]')).find((block) =>
      getAnnotationIds(block).includes(annotationId),
    ) ?? null
  }

  function findAnnotationIdAtPoint(clientX: number, clientY: number): string | null {
    const preview = previewRef.current
    const sourceOffset = preview ? sourceOffsetAtPoint(preview, clientX, clientY) : null

    if (sourceOffset === null) {
      return null
    }

    const range = annotationRanges.find((annotationRange) =>
      annotationRange.start <= sourceOffset && sourceOffset < annotationRange.end,
    )

    return range?.annotationId ?? null
  }

  function handleModeChange(nextMode: JournalMode) {
    setJournalMode(nextMode)

    if (nextMode === 'write') {
      setActiveOverlayRects([])
    }
  }

  async function handleGoToToday() {
    const currentDate = journalFile?.date

    saveRequestIdRef.current += 1

    if (currentDate && journalMarkdown !== lastSavedMarkdownRef.current) {
      const savedFile = await saveJournalFile(currentDate, journalMarkdown, journalFrontMatter).catch(() => null)

      if (!savedFile) {
        setDaySwitchError('刚才的内容还没有保存成功，先留在这一天。')
        return
      }

      setDaySwitchError('')
      journalFileRef.current = savedFile
      lastSavedMarkdownRef.current = stripManagedFrontMatter(savedFile.content)
      setJournalFile(savedFile)
    }

    await loadTodayJournal().catch(() => undefined)
  }

  function handleJournalMarkdownChange(nextMarkdown: string) {
    setDaySwitchError('')
    setJournalMarkdown(nextMarkdown)
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
        {isViewingAnotherDay ? (
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
        <div className="flex shrink-0 items-center gap-2 text-sm text-ink/60">
          <SegmentedControl
            ariaLabel="纸面状态"
            onChange={handleModeChange}
            options={journalModeOptions}
            value={journalMode}
          />
        </div>
      </motion.header>

      <section
        className={`journal-stage grid flex-1 min-h-0 gap-0 ${
          isReviewing ? 'grid-cols-[minmax(0,1fr)_360px]' : ''
        }`}
      >
        {isReviewing ? (
          <>
            <MarkdownPreviewArticle
              activeAnnotationId={activeAnnotationId}
              activeOverlayRects={activeOverlayRects}
              onPreviewClick={handlePreviewClick}
              previewRef={previewRef}
              renderedMarkdown={renderedMarkdown}
            />

            <AnnotationSidebar
              activeAnnotationId={activeAnnotationId}
              annotations={visibleAnnotations}
              onSelectAnnotation={(annotationId) => selectAnnotation(annotationId, true)}
            />
          </>
        ) : (
          <motion.article
            animate={{ opacity: 1, y: 0 }}
            className="journal-writing-panel"
            initial={{ opacity: 0, y: 10 }}
            transition={{ ...panelTransition, delay: 0.08 }}
          >
            <div className="journal-paper">
              <div className="journal-paper-meta">
                <span>正文</span>
                <span title={journalFile?.filePath}>{journalStorageLabel}</span>
              </div>
              <JournalWeatherHeader frontMatter={journalFrontMatter} status={weatherStatus} variant="writing" />
              <JournalMarkdownEditor onChange={handleJournalMarkdownChange} value={journalMarkdown} />
            </div>
          </motion.article>
        )}
      </section>
    </>
  )
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

export default MarkdownPreviewPage
