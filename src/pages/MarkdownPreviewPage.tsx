import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { motion } from 'motion/react'
import SegmentedControl from '../components/SegmentedControl'
import {
  createAnnotationFromDraft,
  createDomRangesByAnnotation,
  resolveAnnotationRanges,
} from '../domain/annotations'
import type { Annotation } from '../domain/annotations'
import type { JournalIndexEntry } from '../domain/journalIndex/types'
import {
  parseJournalMarkdown,
  renderJournalMarkdown,
  serializeJournalFrontMatter,
  serializeJournalMarkdownBody,
  type DayFrontMatter,
  type ImageBlock,
  type MurmurBlock,
} from '../domain/markdown'
import {
  getAnnotationIds,
  registerAnnotationHighlights,
  sourceOffsetAtPoint,
  watchActiveOverlayRects,
} from './markdown-preview/annotationDom'
import AnnotationSidebar from './markdown-preview/AnnotationSidebar'
import { panelTransition } from './markdown-preview/constants'
import FloatingAiPanel from './markdown-preview/FloatingAiPanel'
import type { AiPanelDraft, AiPanelMessage } from './markdown-preview/FloatingAiPanel'
import JournalFrontMatterDialog from './markdown-preview/JournalFrontMatterDialog'
import type { EditableJournalFrontMatter } from './markdown-preview/JournalFrontMatterDialog'
import {
  annotationTargetsEntry,
  demoAnnotations,
} from './markdown-preview/demoAnnotations'
import JournalWeatherHeader, {
  type WeatherStatus,
} from './markdown-preview/JournalWeatherHeader'
import JournalMarkdownEditor from './markdown-preview/JournalMarkdownEditor'
import JournalMurmurPanel from './markdown-preview/JournalMurmurPanel'
import {
  createManagedJournalMarkdown,
  stripManagedFrontMatter,
} from './markdown-preview/managedJournalMarkdown'
import MarkdownPreviewArticle from './markdown-preview/MarkdownPreviewArticle'
import type { AnnotationOverlayRect } from './markdown-preview/types'
import { brand } from '../brand'
import { Sparkles } from '../components/HandDrawnIcons'

type JournalMode = 'write' | 'review'
type JournalFile = Awaited<ReturnType<NonNullable<Window['journalStore']>['loadToday']>>
type CurationLibrary = {
  collections: string[]
  tags: string[]
}
type FrontMatterDraftRequest = {
  currentFrontMatter: DayFrontMatter
  date: string
  journalMarkdown: string
}
type CurationValueScore = {
  dayCount: number
  firstIndex: number
  latestDate: string
  value: string
}
type JournalDayViewProps = {
  date?: string | null
  showDaySwitchNudge?: boolean
}
export type JournalDayViewHandle = {
  flushPendingSave: () => Promise<boolean>
}

const noAnnotations: Annotation[] = []
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

function getCodexStore() {
  return typeof window === 'undefined' ? undefined : window.codex
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

function createCurationLibrary(entries: JournalIndexEntry[], currentDate: string): CurationLibrary {
  let order = 0
  const tagScores = new Map<string, CurationValueScore>()
  const collectionScores = new Map<string, CurationValueScore>()

  entries.forEach((entry) => {
    if (entry.date === currentDate) {
      return
    }

    collectUniqueCurationValues(entry.tags).forEach((tag) => {
      collectCurationValue(tagScores, tag, entry.date, order)
      order += 1
    })
    collectUniqueCurationValues(entry.collections).forEach((collection) => {
      collectCurationValue(collectionScores, collection, entry.date, order)
      order += 1
    })
  })

  return {
    collections: sortCurationValues(collectionScores).slice(0, 32),
    tags: sortCurationValues(tagScores).slice(0, 64),
  }
}

function collectCurationValue(
  scores: Map<string, CurationValueScore>,
  value: string,
  date: string,
  index: number,
) {
  const normalized = normalizeCurationValue(value)

  if (!normalized) {
    return
  }

  const key = createCurationKey(normalized)
  const current = scores.get(key)

  scores.set(key, {
    dayCount: (current?.dayCount ?? 0) + 1,
    firstIndex: current?.firstIndex ?? index,
    latestDate: current && current.latestDate > date ? current.latestDate : date,
    value: current?.value ?? normalized,
  })
}

function collectUniqueCurationValues(values: string[]) {
  const uniqueValues = new Map<string, string>()

  values.forEach((value) => {
    const normalized = normalizeCurationValue(value)

    if (!normalized) {
      return
    }

    const key = createCurationKey(normalized)

    if (!uniqueValues.has(key)) {
      uniqueValues.set(key, normalized)
    }
  })

  return Array.from(uniqueValues.values())
}

function sortCurationValues(scores: Map<string, CurationValueScore>) {
  return Array.from(scores.values())
    .sort((leftScore, rightScore) => {
      if (leftScore.dayCount !== rightScore.dayCount) {
        return rightScore.dayCount - leftScore.dayCount
      }

      if (leftScore.latestDate !== rightScore.latestDate) {
        return rightScore.latestDate.localeCompare(leftScore.latestDate)
      }

      return leftScore.firstIndex - rightScore.firstIndex ||
        leftScore.value.localeCompare(rightScore.value, 'zh-Hans-CN')
    })
    .map((score) => score.value)
}

function normalizeCurationValue(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function createCurationKey(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('zh-Hans-CN')
}

function getCurationSummary(frontMatter: DayFrontMatter) {
  const hasCuration = Boolean(
    frontMatter.title ||
      frontMatter.excerpt ||
      (frontMatter.tags && frontMatter.tags.length > 0) ||
      (frontMatter.collections && frontMatter.collections.length > 0),
  )
  const title = frontMatter.title ?? frontMatter.excerpt ?? '待整理'
  const detailItems = [
    ...(frontMatter.tags ?? []).slice(0, 3),
    ...(frontMatter.collections ?? []).slice(0, 2).map((collection) => `合集 ${collection}`),
  ]

  return {
    detail: detailItems.length > 0 ? detailItems.join(' / ') : '标题、标签、合集',
    hasCuration,
    title,
  }
}

function shouldAutoCurateJournal(frontMatter: DayFrontMatter, journalMarkdown: string) {
  if (!journalMarkdown.trim()) {
    return false
  }

  return Boolean(
    !frontMatter.title ||
      !frontMatter.excerpt ||
      !frontMatter.tags ||
      frontMatter.tags.length === 0,
  )
}

function shouldAutoCurateIndexEntry(entry: JournalIndexEntry) {
  return Boolean(!entry.title || !entry.excerpt || entry.tags.length === 0)
}

function mergeMissingFrontMatterFields(
  currentFrontMatter: DayFrontMatter,
  draft: EditableJournalFrontMatter,
) {
  const nextFrontMatter: DayFrontMatter = { ...currentFrontMatter }

  if (!nextFrontMatter.title && draft.title) {
    nextFrontMatter.title = draft.title
  }

  if (!nextFrontMatter.excerpt && draft.excerpt) {
    nextFrontMatter.excerpt = draft.excerpt
  }

  if ((!nextFrontMatter.tags || nextFrontMatter.tags.length === 0) && draft.tags && draft.tags.length > 0) {
    nextFrontMatter.tags = draft.tags
  }

  if (
    (!nextFrontMatter.collections || nextFrontMatter.collections.length === 0) &&
    draft.collections &&
    draft.collections.length > 0
  ) {
    nextFrontMatter.collections = draft.collections
  }

  return nextFrontMatter
}

export const JournalDayView = forwardRef<JournalDayViewHandle, JournalDayViewProps>(function JournalDayView(
  { date = null, showDaySwitchNudge = true },
  ref,
) {
  const [journalMode, setJournalMode] = useState<JournalMode>(() => readStoredJournalMode())
  const [journalMarkdown, setJournalMarkdown] = useState(annotationTargetsEntry)
  const [journalFile, setJournalFile] = useState<JournalFile | null>(null)
  const [journalFrontMatter, setJournalFrontMatter] = useState<DayFrontMatter>({})
  const [realTodayDate, setRealTodayDate] = useState(() => getLocalDateKey())
  const [daySwitchError, setDaySwitchError] = useState('')
  const [journalAnnotations, setJournalAnnotations] = useState<Annotation[]>(demoAnnotations)
  const [weatherStatus, setWeatherStatus] = useState<WeatherStatus>('idle')
  const [journalIndexEntries, setJournalIndexEntries] = useState<JournalIndexEntry[]>([])
  const [activeAnnotationId, setActiveAnnotationId] = useState(demoAnnotations[0]?.id ?? '')
  const [activeOverlayRects, setActiveOverlayRects] = useState<AnnotationOverlayRect[]>([])
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false)
  const [isFrontMatterDialogOpen, setIsFrontMatterDialogOpen] = useState(false)
  const [aiPanelMode, setAiPanelMode] = useState<'idle' | 'generating' | 'drafts' | 'chat'>('idle')
  const [aiPanelError, setAiPanelError] = useState('')
  const [aiDrafts, setAiDrafts] = useState<AiPanelDraft[]>([])
  const [chatAnnotationId, setChatAnnotationId] = useState('')
  const [chatMessages, setChatMessages] = useState<AiPanelMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatStatus, setChatStatus] = useState<'idle' | 'loading' | 'sending'>('idle')
  const previewRef = useRef<HTMLDivElement>(null)
  const hasLoadedJournalRef = useRef(false)
  const journalFileRef = useRef<JournalFile | null>(null)
  const lastSavedMarkdownRef = useRef(annotationTargetsEntry)
  const lastSavedFrontMatterRef = useRef<DayFrontMatter>({})
  const saveRequestIdRef = useRef(0)
  const chatLoadRequestIdRef = useRef(0)
  const finalizeJournalRef = useRef<((shouldUpdateState?: boolean) => Promise<boolean>) | null>(null)
  const autoCurationAttemptsRef = useRef(new Set<string>())
  const hasCheckedPastCurationRef = useRef(false)
  const isReviewing = journalMode === 'review'
  const journalStorageLabel = journalFile ? `~/.journal/${journalFile.fileName}` : brand.storageFallback
  const isViewingAnotherDay = Boolean(journalFile?.date && journalFile.date !== realTodayDate)
  const currentJournalDate = journalFile?.date ?? journalFrontMatter.date ?? realTodayDate
  const parsedJournalEntry = useMemo(() => parseJournalMarkdown(journalMarkdown), [journalMarkdown])
  const topbarTitle = formatJournalTopbarTitle(
    currentJournalDate,
    journalFrontMatter.weather?.text,
  )
  const visibleAnnotations = useMemo(
    () => (isReviewing ? journalAnnotations.filter((annotation) => annotation.status === 'visible') : noAnnotations),
    [isReviewing, journalAnnotations],
  )
  const chatAnnotation = useMemo(
    () => journalAnnotations.find((annotation) => annotation.id === chatAnnotationId) ?? null,
    [chatAnnotationId, journalAnnotations],
  )
  const hasGeneratedAiAnnotationsToday = useMemo(
    () =>
      currentJournalDate === realTodayDate &&
      journalAnnotations.some((annotation) => isAiAnnotationCreatedOnDate(annotation, currentJournalDate)),
    [currentJournalDate, journalAnnotations, realTodayDate],
  )
  const canGenerateAiAnnotations = !hasGeneratedAiAnnotationsToday
  const shouldShowAiPanel = canGenerateAiAnnotations || aiPanelMode === 'chat' || aiDrafts.length > 0
  const isAiPanelVisible = isAiPanelOpen && shouldShowAiPanel
  const curationLibrary = useMemo(
    () => createCurationLibrary(journalIndexEntries, currentJournalDate),
    [currentJournalDate, journalIndexEntries],
  )
  const curationSummary = useMemo(() => getCurationSummary(journalFrontMatter), [journalFrontMatter])
  const annotationRanges = useMemo(
    () => resolveAnnotationRanges(parsedJournalEntry.longEntryMarkdown, visibleAnnotations),
    [parsedJournalEntry.longEntryMarkdown, visibleAnnotations],
  )
  const renderedMarkdown = useMemo(
    () =>
      renderJournalMarkdown({
        markdown: journalMarkdown,
        annotations: visibleAnnotations,
        sourceFilePath: journalFile?.filePath,
      }),
    [journalFile?.filePath, journalMarkdown, visibleAnnotations],
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

  const loadCurationLibraryEntries = useCallback(async () => {
    const journalStore = getJournalStore()

    if (!journalStore?.listIndex) {
      setJournalIndexEntries([])
      return []
    }

    const entries = await journalStore.listIndex()

    setJournalIndexEntries(entries)

    return entries
  }, [])

  const refreshJournalIndex = useCallback(async () => {
    const journalStore = getJournalStore()

    if (!journalStore?.listIndex) {
      return
    }

    const entries = await journalStore.listIndex()

    setJournalIndexEntries(entries)
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
    void loadAnnotationsForDate(file.date)
    void refreshTodayWeather(file)
  }, [loadAnnotationsForDate, refreshTodayWeather])

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

  const requestFrontMatterDraft = useCallback(async ({
    currentFrontMatter,
    date,
    journalMarkdown,
  }: FrontMatterDraftRequest): Promise<EditableJournalFrontMatter> => {
    const codex = getCodexStore()

    if (!codex?.generateFrontMatterDraft) {
      throw new Error(`当前环境还没有接入${brand.assistantLabel}。`)
    }

    if (!journalMarkdown.trim()) {
      throw new Error('今天还没有可整理的内容。')
    }

    const libraryEntries = await loadCurationLibraryEntries().catch(() => journalIndexEntries)
    const library = createCurationLibrary(libraryEntries, date)
    const result = await codex.generateFrontMatterDraft({
      collectionLibrary: library.collections,
      currentFrontMatter: {
        collections: currentFrontMatter.collections,
        excerpt: currentFrontMatter.excerpt,
        tags: currentFrontMatter.tags,
        title: currentFrontMatter.title,
      },
      date,
      journalMarkdown,
      tagLibrary: library.tags,
    })

    return result.draft
  }, [journalIndexEntries, loadCurationLibraryEntries])

  const autoCurateJournalFile = useCallback(async (file: JournalFile, shouldUpdateState = true) => {
    const parsedFile = parseJournalMarkdown(file.content)
    const markdown = serializeJournalMarkdownBody(parsedFile.longEntryMarkdown, parsedFile.murmurs)
    const frontMatter = parsedFile.frontMatter
    const attemptKey = `${file.date}:${file.updatedAt ?? file.content.length}`

    if (
      autoCurationAttemptsRef.current.has(attemptKey) ||
      !shouldAutoCurateJournal(frontMatter, markdown)
    ) {
      return true
    }

    autoCurationAttemptsRef.current.add(attemptKey)

    try {
      const draft = await requestFrontMatterDraft({
        currentFrontMatter: frontMatter,
        date: file.date,
        journalMarkdown: markdown,
      })
      const nextFrontMatter = mergeMissingFrontMatterFields(frontMatter, draft)

      if (!hasFrontMatterChanged(nextFrontMatter, frontMatter)) {
        return true
      }

      const savedFile = await saveJournalFile(file.date, markdown, nextFrontMatter)

      if (!savedFile) {
        return true
      }

      const savedEntry = parseJournalMarkdown(savedFile.content)
      const isCurrentFile = journalFileRef.current?.date === savedFile.date

      if (isCurrentFile) {
        journalFileRef.current = savedFile
        lastSavedMarkdownRef.current = stripManagedFrontMatter(savedFile.content)
        lastSavedFrontMatterRef.current = savedEntry.frontMatter

        if (shouldUpdateState) {
          setJournalFile(savedFile)
          setJournalFrontMatter(savedEntry.frontMatter)
          setJournalMarkdown(stripManagedFrontMatter(savedFile.content))
        }
      }

      await refreshJournalIndex().catch(() => undefined)
    } catch {
      return true
    }

    return true
  }, [refreshJournalIndex, requestFrontMatterDraft, saveJournalFile])

  const autoCurateLatestPastJournal = useCallback(async () => {
    const journalStore = getJournalStore()

    if (!journalStore?.loadDate || hasCheckedPastCurationRef.current) {
      return
    }

    hasCheckedPastCurationRef.current = true

    const entries = await loadCurationLibraryEntries().catch(() => [])
    const targetEntry = entries.find((entry) =>
      entry.date < realTodayDate && shouldAutoCurateIndexEntry(entry)
    )

    if (!targetEntry) {
      return
    }

    const file = await journalStore.loadDate(targetEntry.date)

    await autoCurateJournalFile(file, false)
  }, [autoCurateJournalFile, loadCurationLibraryEntries, realTodayDate])

  const saveAnnotationsForDate = useCallback(async (date: string, nextAnnotations: Annotation[]) => {
    const journalStore = getJournalStore()

    if (!journalStore?.saveAnnotations) {
      replaceJournalAnnotations(nextAnnotations)
      return nextAnnotations
    }

    const annotationFile = await journalStore.saveAnnotations(date, nextAnnotations)

    if (journalFileRef.current?.date === date) {
      replaceJournalAnnotations(annotationFile.annotations)
    }

    return annotationFile.annotations
  }, [replaceJournalAnnotations])

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

  const finalizeJournalBeforeLeaving = useCallback(async (shouldUpdateState = true) => {
    const didSave = await flushPendingSave(shouldUpdateState)

    if (!didSave) {
      return false
    }

    const currentFile = journalFileRef.current

    if (currentFile) {
      await autoCurateJournalFile(currentFile, shouldUpdateState)
    }

    return true
  }, [autoCurateJournalFile, flushPendingSave])

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
    if (date !== null || !journalFile || journalFile.date !== realTodayDate) {
      return
    }

    void autoCurateLatestPastJournal().catch(() => undefined)
  }, [autoCurateLatestPastJournal, date, journalFile, realTodayDate])

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

  useEffect(() => {
    if (!isFrontMatterDialogOpen) {
      return
    }

    void loadCurationLibraryEntries().catch(() => setJournalIndexEntries([]))
  }, [isFrontMatterDialogOpen, loadCurationLibraryEntries])

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
    writeStoredJournalMode(nextMode)

    if (nextMode === 'write') {
      setActiveOverlayRects([])
    }
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

  function handleSaveFrontMatter(nextFrontMatter: EditableJournalFrontMatter) {
    setDaySwitchError('')
    setJournalFrontMatter((currentFrontMatter) => ({
      ...currentFrontMatter,
      collections: nextFrontMatter.collections && nextFrontMatter.collections.length > 0
        ? nextFrontMatter.collections
        : undefined,
      excerpt: nextFrontMatter.excerpt,
      favorite: nextFrontMatter.favorite,
      tags: nextFrontMatter.tags && nextFrontMatter.tags.length > 0 ? nextFrontMatter.tags : undefined,
      title: nextFrontMatter.title,
    }))
  }

  async function handleGenerateFrontMatterDraft(): Promise<EditableJournalFrontMatter> {
    const date = journalFile?.date ?? realTodayDate

    return requestFrontMatterDraft({
      currentFrontMatter: journalFrontMatter,
      date,
      journalMarkdown,
    })
  }

  async function handleImportMurmurImages() {
    const journalStore = getJournalStore()

    if (!journalStore?.importImages) {
      throw new Error('当前环境还不能导入图片。')
    }

    return journalStore.importImages(currentJournalDate)
  }

  async function handleGenerateImageMetadata(image: ImageBlock, murmur: MurmurBlock) {
    const codex = getCodexStore()

    if (!codex?.generateImageMetadataDraft) {
      throw new Error(`当前环境还没有接入${brand.assistantLabel}。`)
    }

    const libraryEntries = await loadCurationLibraryEntries().catch(() => journalIndexEntries)
    const library = createCurationLibrary(libraryEntries, currentJournalDate)
    const result = await codex.generateImageMetadataDraft({
      date: currentJournalDate,
      image: {
        caption: image.caption,
        id: image.id,
        location: image.location,
        src: image.src,
        tags: image.tags,
      },
      journalMarkdown,
      murmur: {
        body: murmur.body,
        id: murmur.id,
        time: murmur.time,
      },
      tagLibrary: library.tags,
    })

    return result.draft
  }

  async function handleGenerateAiAnnotations() {
    const codex = getCodexStore()
    const date = journalFile?.date ?? realTodayDate

    if (!codex?.generateAnnotationDrafts) {
      setAiPanelError(`当前环境还没有接入${brand.assistantLabel}。`)
      return
    }

    setIsAiPanelOpen(true)
    setAiPanelMode('generating')
    setAiPanelError('')

    try {
      saveRequestIdRef.current += 1
      const savedFile = await saveJournalFile(date, journalMarkdown, journalFrontMatter)
      const markdownForAi = savedFile ? stripManagedFrontMatter(savedFile.content) : journalMarkdown

      if (savedFile) {
        journalFileRef.current = savedFile
        lastSavedMarkdownRef.current = markdownForAi
        lastSavedFrontMatterRef.current = parseJournalMarkdown(savedFile.content).frontMatter
        setJournalFile(savedFile)
      }

      const { longEntryMarkdown } = parseJournalMarkdown(markdownForAi)

      if (!longEntryMarkdown.trim()) {
        setAiPanelMode('idle')
        setAiPanelError(`今天还没有可读取的长日记，${brand.assistantName}先不打扰。`)
        return
      }

      const result = await codex.generateAnnotationDrafts({ date, longEntryMarkdown })
      const createdAt = new Date().toISOString()
      const drafts = result.drafts.flatMap((draft): AiPanelDraft[] => {
        if (!draft.content.trim()) {
          return []
        }

        const annotation = createAnnotationFromDraft(draft, longEntryMarkdown, createdAt)

        return [
          {
            id: annotation.id,
            annotation,
            matchStatus: annotation.target.type === 'longEntryRange' ? 'anchored' : 'day',
          },
        ]
      })

      setAiDrafts(drafts)
      setAiPanelMode(drafts.length > 0 ? 'drafts' : 'idle')
      setAiPanelError(drafts.length > 0 ? '' : `${brand.assistantName}没有留下可用的页边话。`)
    } catch {
      setAiPanelMode('idle')
      setAiPanelError(`${brand.assistantName}刚才没有读完，稍后可以再试一次。`)
    }
  }

  function handleUpdateDraftContent(draftId: string, content: string) {
    setAiDrafts((currentDrafts) =>
      currentDrafts.map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              annotation: {
                ...draft.annotation,
                body: { content },
                updatedAt: new Date().toISOString(),
              },
            }
          : draft,
      ),
    )
  }

  function handleIgnoreDraft(draftId: string) {
    setAiDrafts((currentDrafts) => {
      const nextDrafts = currentDrafts.filter((draft) => draft.id !== draftId)

      if (nextDrafts.length === 0) {
        setAiPanelMode('idle')
      }

      return nextDrafts
    })
  }

  async function handleAcceptDraft(draftId: string) {
    const draft = aiDrafts.find((candidate) => candidate.id === draftId)

    if (!draft || !draft.annotation.body.content.trim()) {
      return
    }

    const date = journalFile?.date ?? realTodayDate
    const nextAnnotations = [
      ...journalAnnotations.filter((annotation) => annotation.id !== draft.annotation.id),
      draft.annotation,
    ]

    try {
      await saveAnnotationsForDate(date, nextAnnotations)
      setActiveAnnotationId(draft.annotation.id)
      handleIgnoreDraft(draftId)
      setAiPanelError('')
    } catch {
      setAiPanelError('刚才的页边话还没有写入。')
    }
  }

  async function handleChatWithAnnotation(annotationId: string) {
    const annotation = journalAnnotations.find((currentAnnotation) => currentAnnotation.id === annotationId) ?? null
    const threadId = annotation?.ai?.threadId
    const loadRequestId = chatLoadRequestIdRef.current + 1

    chatLoadRequestIdRef.current = loadRequestId
    selectAnnotation(annotationId, true)
    setChatAnnotationId(annotationId)
    setChatMessages([])
    setChatInput('')
    setChatStatus(threadId ? 'loading' : 'idle')
    setAiPanelError('')
    setAiPanelMode('chat')
    setIsAiPanelOpen(true)

    if (!threadId) {
      return
    }

    const codex = getCodexStore()

    if (!codex?.readAnnotationThread) {
      setChatStatus('idle')
      return
    }

    try {
      const result = await codex.readAnnotationThread(threadId)

      if (chatLoadRequestIdRef.current === loadRequestId) {
        setChatMessages(result.messages)
      }
    } catch {
      if (chatLoadRequestIdRef.current === loadRequestId) {
        setAiPanelError('之前的对话暂时没有读到，可以直接继续聊。')
      }
    } finally {
      if (chatLoadRequestIdRef.current === loadRequestId) {
        setChatStatus('idle')
      }
    }
  }

  async function handleSendAnnotationChat() {
    const codex = getCodexStore()
    const message = chatInput.trim()

    if (!message || !chatAnnotation || chatStatus !== 'idle') {
      return
    }

    if (!codex?.chatWithAnnotation) {
      setAiPanelError(`当前环境还没有接入${brand.assistantName}对话。`)
      return
    }

    const date = journalFile?.date ?? realTodayDate
    const userMessage: AiPanelMessage = {
      id: createAiPanelMessageId(),
      role: 'user',
      content: message,
    }

    setChatMessages((currentMessages) => [...currentMessages, userMessage])
    setChatInput('')
    setChatStatus('sending')
    setAiPanelError('')

    try {
      const result = await codex.chatWithAnnotation({
        date,
        journalMarkdown,
        annotation: chatAnnotation,
        message,
        threadId: chatAnnotation.ai?.threadId,
      })
      const assistantMessage: AiPanelMessage = {
        id: createAiPanelMessageId(),
        role: 'assistant',
        content: result.response,
      }

      setChatMessages((currentMessages) => [...currentMessages, assistantMessage])

      if (result.threadId) {
        const nextAnnotations = journalAnnotations.map((annotation) =>
          annotation.id === chatAnnotation.id
            ? {
                ...annotation,
                ai: {
                  ...annotation.ai,
                  threadId: result.threadId ?? undefined,
                },
                updatedAt: new Date().toISOString(),
              }
            : annotation,
        )

        await saveAnnotationsForDate(date, nextAnnotations)
        setActiveAnnotationId(chatAnnotation.id)
      }
    } catch {
      setAiPanelError('这句页边话暂时接不上，可以稍后重试。')
    } finally {
      setChatStatus('idle')
    }
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
          <button
            aria-label="策展信息"
            className={`journal-curation-button ${curationSummary.hasCuration ? 'is-filled' : ''}`}
            onClick={() => setIsFrontMatterDialogOpen(true)}
            type="button"
          >
            <Sparkles aria-hidden="true" size={15} strokeWidth={2.25} />
            <span className="journal-curation-copy">
              <span className="journal-curation-kicker">策展</span>
              <span className="journal-curation-title">{curationSummary.title}</span>
            </span>
            <span className="journal-curation-detail">{curationSummary.detail}</span>
          </button>
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
              onChatWithAnnotation={handleChatWithAnnotation}
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
              onGenerateImageMetadata={handleGenerateImageMetadata}
              onImportImages={handleImportMurmurImages}
            />
          </motion.article>
        )}
      </section>

      <FloatingAiPanel
        activeAnnotation={chatAnnotation}
        chatInput={chatInput}
        chatMessages={chatMessages}
        chatStatus={chatStatus}
        drafts={aiDrafts}
        error={aiPanelError}
        isGenerationAvailable={canGenerateAiAnnotations}
        isLauncherVisible={!isReviewing}
        isOpen={isAiPanelVisible}
        mode={aiPanelMode}
        onAcceptDraft={(draftId) => void handleAcceptDraft(draftId)}
        onCloseChat={() => {
          chatLoadRequestIdRef.current += 1
          setAiPanelMode(aiDrafts.length > 0 ? 'drafts' : 'idle')
          setChatAnnotationId('')
          setChatStatus('idle')
        }}
        onGenerate={() => void handleGenerateAiAnnotations()}
        onIgnoreDraft={handleIgnoreDraft}
        onOpen={() => setIsAiPanelOpen((isOpen) => !isOpen)}
        onSendChat={() => void handleSendAnnotationChat()}
        onUpdateChatInput={setChatInput}
        onUpdateDraftContent={handleUpdateDraftContent}
      />

      {isFrontMatterDialogOpen ? (
        <JournalFrontMatterDialog
          collectionLibrary={curationLibrary.collections}
          frontMatter={journalFrontMatter}
          onClose={() => setIsFrontMatterDialogOpen(false)}
          onGenerateDraft={handleGenerateFrontMatterDraft}
          onSave={handleSaveFrontMatter}
          tagLibrary={curationLibrary.tags}
        />
      ) : null}
    </>
  )
})

function MarkdownPreviewPage() {
  return <JournalDayView />
}

function createAiPanelMessageId() {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
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

function isAiAnnotationCreatedOnDate(annotation: Annotation, date: string) {
  if (annotation.author !== 'ai' || annotation.status !== 'visible') {
    return false
  }

  return getCreatedAtDateKey(annotation.createdAt) === date
}

function getCreatedAtDateKey(createdAt: string) {
  const parsedDate = new Date(createdAt)

  if (!Number.isNaN(parsedDate.getTime())) {
    return getLocalDateKey(parsedDate)
  }

  return /^(\d{4}-\d{2}-\d{2})/.exec(createdAt)?.[1] ?? ''
}

export default MarkdownPreviewPage
