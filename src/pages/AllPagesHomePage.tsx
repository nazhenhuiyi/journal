import {
  CalendarDays,
  Redo,
  Sparkles,
} from '../components/HandDrawnIcons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import {
  applyDailyCurationAiDraft,
  createDailyCuration,
  createDailyCurationDisplay,
  createDailyCurationReceiptItems,
  getLocalDateKey,
  type DailyCuration,
  type TodayContext,
} from '../domain/dailyCuration'
import { parseJournalMarkdown } from '../domain/markdown/parseJournalMarkdown'
import { panelTransition } from './markdown-preview/constants'
import { brand } from '../brand'
import type { JournalIndexEntry } from '../domain/journalIndex/types'

const DAILY_CURATION_STORAGE_KEY = 'journal:daily-curations:v6'

type IndexLoadStatus = 'loading' | 'ready' | 'failed'

function getJournalStore() {
  return typeof window === 'undefined' ? undefined : window.journalStore
}

function getCodexStore() {
  return typeof window === 'undefined' ? undefined : window.codex
}

function AllPagesHomePage() {
  const [journalIndex, setJournalIndex] = useState<JournalIndexEntry[]>([])
  const [indexLoadStatus, setIndexLoadStatus] = useState<IndexLoadStatus>(() =>
    getJournalStore()?.listIndex ? 'loading' : 'ready',
  )
  const todayDateKey = useMemo(() => getLocalDateKey(), [])
  const defaultTodayContext = useMemo(() => createTodayContext(todayDateKey), [todayDateKey])
  const [todayContext, setTodayContext] = useState<TodayContext>(defaultTodayContext)
  const [isTodayContextReady, setIsTodayContextReady] = useState(() => !getJournalStore()?.loadToday)
  const [savedDailyCuration, setSavedDailyCuration] = useState<DailyCuration | null>(() => {
    const journalStore = getJournalStore()

    return journalStore?.loadDailyCuration ? null : readFallbackDailyCuration(todayDateKey)
  })
  const [isSavedCurationReady, setIsSavedCurationReady] = useState(() => !getJournalStore()?.loadDailyCuration)
  const hasSavedDraftRef = useRef(Boolean(savedDailyCuration))
  const aiEnhancementRequestsRef = useRef(new Set<string>())
  const [dailyCurationError, setDailyCurationError] = useState('')
  const [isDailyCurationLoading, setIsDailyCurationLoading] = useState(false)
  const [curationGeneration, setCurationGeneration] = useState(() => savedDailyCuration?.generation ?? 0)
  const draftedDailyCuration = useMemo(
    () => createDailyCuration(journalIndex, new Date(`${todayDateKey}T12:00:00`), curationGeneration, todayContext),
    [curationGeneration, journalIndex, todayContext, todayDateKey],
  )
  const dailyCuration = savedDailyCuration ?? draftedDailyCuration
  const homeDateLabel = useMemo(() => formatHomeDate(new Date()), [])

  useEffect(() => {
    const journalStore = getJournalStore()

    if (!journalStore?.loadDailyCuration) {
      return
    }

    let isCancelled = false

    journalStore.loadDailyCuration(todayDateKey)
      .then((storedCuration) => {
        if (!isCancelled) {
          setSavedDailyCuration(storedCuration?.curation ?? null)
          setCurationGeneration(storedCuration?.curation.generation ?? 0)
          hasSavedDraftRef.current = Boolean(storedCuration?.curation)
          setIsSavedCurationReady(true)
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setSavedDailyCuration(null)
          hasSavedDraftRef.current = false
          setIsSavedCurationReady(true)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [todayDateKey])

  useEffect(() => {
    const journalStore = getJournalStore()

    if (!journalStore?.listIndex) {
      return
    }

    let isCancelled = false

    journalStore.listIndex()
      .then((entries) => {
        if (!isCancelled) {
          setJournalIndex(entries)
          setIndexLoadStatus('ready')
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setJournalIndex([])
          setIndexLoadStatus('failed')
        }
      })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    const journalStore = getJournalStore()

    if (!journalStore?.loadToday) {
      return
    }

    let isCancelled = false

    journalStore.loadToday()
      .then((file) => {
        if (!isCancelled) {
          setTodayContext(createTodayContext(todayDateKey, file.content))
          setIsTodayContextReady(true)
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setTodayContext(defaultTodayContext)
          setIsTodayContextReady(true)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [defaultTodayContext, todayDateKey])

  useEffect(() => {
    if (
      hasSavedDraftRef.current ||
      !draftedDailyCuration ||
      getCodexStore()?.generateDailyCurationDraft ||
      indexLoadStatus !== 'ready' ||
      !isTodayContextReady ||
      !isSavedCurationReady
    ) {
      return
    }

    saveDailyCurationDraft(draftedDailyCuration)
    hasSavedDraftRef.current = true
  }, [draftedDailyCuration, indexLoadStatus, isSavedCurationReady, isTodayContextReady])

  useEffect(() => {
    const codex = getCodexStore()

    if (
      !codex?.generateDailyCurationDraft ||
      !dailyCuration ||
      dailyCuration.ai?.provider === 'codex' ||
      indexLoadStatus !== 'ready' ||
      !isTodayContextReady ||
      !isSavedCurationReady
    ) {
      return
    }

    const requestKey = `${dailyCuration.id}:${dailyCuration.source.date}:${dailyCuration.generation}`

    if (aiEnhancementRequestsRef.current.has(requestKey)) {
      return
    }

    let isCancelled = false
    aiEnhancementRequestsRef.current.add(requestKey)
    setDailyCurationError('')

    codex.generateDailyCurationDraft({ curation: dailyCuration })
      .then((result) => {
        if (isCancelled) {
          return
        }

        const enhancedCuration = applyDailyCurationAiDraft(dailyCuration, result.draft, {
          generatedAt: new Date().toISOString(),
          provider: 'codex',
          threadId: result.threadId,
          usage: result.usage,
        })

        setSavedDailyCuration(enhancedCuration)
        hasSavedDraftRef.current = true
        setDailyCurationError('')
        setIsDailyCurationLoading(false)
        saveDailyCurationDraft(enhancedCuration)
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setIsDailyCurationLoading(false)
          setDailyCurationError(formatDailyCurationError(error))
        }
      })

    return () => {
      isCancelled = true
    }
  }, [dailyCuration, indexLoadStatus, isSavedCurationReady, isTodayContextReady])

  function regenerateDailyCuration() {
    const nextGeneration = curationGeneration + 1
    const codex = getCodexStore()
    const nextCuration = createDailyCuration(
      journalIndex,
      new Date(`${todayDateKey}T12:00:00`),
      nextGeneration,
      todayContext,
    )

    setCurationGeneration(nextGeneration)
    setDailyCurationError('')

    if (nextCuration) {
      if (!codex?.generateDailyCurationDraft) {
        setIsDailyCurationLoading(false)
        saveDailyCurationDraft(nextCuration)
        hasSavedDraftRef.current = true
      } else {
        setIsDailyCurationLoading(true)
        hasSavedDraftRef.current = false
      }

      setSavedDailyCuration(nextCuration)
    } else {
      setIsDailyCurationLoading(false)
    }
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="all-pages-home flex-1"
      initial={{ opacity: 0, y: 10 }}
      transition={panelTransition}
    >
      <DailyCurationSection
        dateLabel={homeDateLabel}
        curation={dailyCuration}
        dailyCurationError={dailyCurationError}
        entryCount={journalIndex.length}
        indexLoadStatus={indexLoadStatus}
        isDailyCurationLoading={isDailyCurationLoading}
        onRegenerate={regenerateDailyCuration}
      />
    </motion.div>
  )
}

function DailyCurationSection({
  curation,
  dateLabel,
  dailyCurationError,
  entryCount,
  indexLoadStatus,
  isDailyCurationLoading,
  onRegenerate,
}: {
  curation: DailyCuration | null
  dateLabel: string
  dailyCurationError: string
  entryCount: number
  indexLoadStatus: IndexLoadStatus
  isDailyCurationLoading: boolean
  onRegenerate: () => void
}) {
  const display = curation ? createDailyCurationDisplay(curation) : null

  return (
    <section
      aria-busy={isDailyCurationLoading}
      aria-labelledby="daily-curation-title"
      className="all-pages-daily-curation is-primary"
    >
      <div className="all-pages-daily-curation-inner">
        <div className="all-pages-daily-curation-header">
          <div>
            <p>
              <CalendarDays aria-hidden="true" size={16} strokeWidth={2.15} />
              {brand.name} · {dateLabel} · {formatTodayWeather(curation?.today)} · 已安放 {entryCount} 页
            </p>
            <div className="all-pages-daily-curation-titleline">
              <h1 id="daily-curation-title">今日回声</h1>
              <button
                aria-label="重新生成今日策展"
                disabled={!curation || isDailyCurationLoading}
                onClick={onRegenerate}
                title="重新生成今日策展"
                type="button"
              >
                <Redo aria-hidden="true" size={17} strokeWidth={2.2} />
                <span>{isDailyCurationLoading ? '翻页中' : '换一页'}</span>
              </button>
            </div>
          </div>
        </div>

        {isDailyCurationLoading ? (
          <article aria-live="polite" className="all-pages-curation-empty is-loading" role="status">
            <p>正在换一页...</p>
          </article>
        ) : dailyCurationError ? (
          <div className="all-pages-curation-empty is-error" role="alert">
            <p>{dailyCurationError}</p>
          </div>
        ) : curation && display ? (
          <>
            <article className={`echo-curation-exhibit is-${display.artifact.cardStyle}`}>
              <figure className="echo-curation-media">
                <div className="echo-curation-media-frame">
                  {display.artifact.image ? (
                    <img
                      alt={display.artifact.image.alt}
                      src={resolveJournalMemoryImageSrc(display.artifact.image.src)}
                    />
                  ) : (
                    <div className="echo-curation-text-artifact">
                      <span>{display.artifact.eyebrow}</span>
                      <Link
                        aria-label={`打开 ${curation.source.date} 的日记`}
                        className="echo-curation-date-link is-artifact"
                        to={`/calendar?date=${encodeURIComponent(curation.source.date)}`}
                      >
                        <strong>{display.artifact.dateLabel}</strong>
                      </Link>
                      <small>{display.artifact.badge}</small>
                    </div>
                  )}
                </div>
                {display.artifact.caption ? (
                  <figcaption>
                    <Sparkles aria-hidden="true" size={15} strokeWidth={2.15} />
                    <span>{display.artifact.caption.badge}</span>
                    <Link
                      aria-label={`打开 ${curation.source.date} 的日记`}
                      className="echo-curation-date-link"
                      to={`/calendar?date=${encodeURIComponent(curation.source.date)}`}
                    >
                      <time dateTime={curation.source.date}>{display.artifact.caption.date}</time>
                    </Link>
                  </figcaption>
                ) : null}
              </figure>

              <div className="echo-curation-copy">
                <p className="echo-curation-kicker">
                  <span>{display.main.kickerLabel}</span>
                  <span>{display.main.kicker}</span>
                </p>
                <h2>{display.main.title}</h2>
                <blockquote>{display.main.excerpt}</blockquote>
                <p className="echo-curation-note">{display.main.note}</p>
                <p className="echo-curation-question">
                  <span>留给今天的问题</span>
                  <span>{display.main.question}</span>
                </p>
                {display.main.tags.length > 0 ? (
                  <div className="echo-curation-tags" aria-label="策展标签">
                    {display.main.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
            {curation.supports.length > 0 ? (
              <div className="echo-support-grid" aria-label="辅助回声">
                {curation.supports.map((support) => (
                  <article className={`echo-support-card is-${support.cardStyle} is-${support.role}`} key={support.id}>
                    <span>{formatSupportRole(support.role)}</span>
                    <h3>{support.title}</h3>
                    {formatSupportItems(support, curation).length > 0 ? (
                      <dl>
                        {formatSupportItems(support, curation).map((item) => (
                          <div key={item.label}>
                            <dt>{item.label}</dt>
                            <dd>{item.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p>{support.body}</p>
                    )}
                    {support.connection ? <small>{formatSupportConnection(support.connection)}</small> : null}
                    {support.source ? (
                      <time dateTime={support.source.date}>{support.source.date.replace(/-/g, '.')}</time>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <article className="all-pages-curation-empty">
            <p>{indexLoadStatus === 'failed' ? '索引暂时没有读出来。' : '写下几页以后，策展人就有旧日可翻了。'}</p>
          </article>
        )}
      </div>
    </section>
  )
}

function formatHomeDate(date: Date) {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(date)

  return `${month}月${day}日 · ${weekday}`
}

function createTodayContext(dateKey: string, journalMarkdown?: string): TodayContext {
  const date = new Date(`${dateKey}T12:00:00`)
  const parsedEntry = journalMarkdown ? parseJournalMarkdown(journalMarkdown) : null
  const frontMatter = parsedEntry?.frontMatter
  const weatherText = frontMatter?.weather?.text?.trim()
  const locationName = frontMatter?.location?.name ?? frontMatter?.location?.query
  const longEntryExcerpt = parsedEntry?.longEntryMarkdown
    ? createTextExcerpt(parsedEntry.longEntryMarkdown, 54)
    : undefined

  return {
    date: dateKey,
    journal: {
      exists: Boolean(parsedEntry && (longEntryExcerpt || parsedEntry.murmurs.length > 0)),
      excerpt: frontMatter?.excerpt ?? longEntryExcerpt,
      tags: Array.isArray(frontMatter?.tags) ? frontMatter.tags : [],
      title: frontMatter?.title,
    },
    season: formatSeason(date),
    weather: weatherText
      ? {
          location: locationName,
          temperature:
            typeof frontMatter?.weather?.temperature === 'number'
              ? `${Math.round(frontMatter.weather.temperature)}°`
              : undefined,
          text: weatherText,
        }
      : undefined,
    weekday: new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(date),
  }
}

function formatTodayWeather(today?: TodayContext) {
  if (!today?.weather?.text) {
    return today?.season ?? '今日'
  }

  return [today.weather.text, today.weather.temperature, today.weather.location].filter(Boolean).join(' · ')
}

function formatDailyCurationError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return `今日回声没有生成好：${error.message}。请重新生成一次。`
  }

  return '今日回声没有生成好。请重新生成一次。'
}

function formatSupportRole(role: DailyCuration['supports'][number]['role']) {
  const labels: Record<DailyCuration['supports'][number]['role'], string> = {
    'contrast-memory': '对照',
    'parallel-memory': '旁证',
    receipt: '小票',
    'scene-memory': '场景',
    'theme-note': '便签',
  }

  return labels[role]
}

function formatSupportItems(support: DailyCuration['supports'][number], curation: DailyCuration) {
  if (support.role === 'receipt') {
    const cleanedItems = cleanReceiptItems(support.items)

    if (cleanedItems.length > 0 && !hasLegacyReceiptItems(cleanedItems)) {
      return cleanedItems
    }

    const existingByLabel = new Map(cleanedItems.map((item) => [item.label, item.value]))

    return createDailyCurationReceiptItems(curation).map((item) => ({
      ...item,
      value: existingByLabel.get(item.label) ?? item.value,
    }))
  }

  return support.items ?? []
}

function formatSupportConnection(connection: string) {
  return connection
    .replace(/^共同线索：.+$/, '相近余味：另一种日常回声')
    .replace(/^关系：/, '旁边也有：')
}

function cleanReceiptItems(items: DailyCuration['supports'][number]['items']) {
  if (!items) {
    return []
  }

  const blockedLabels = new Set(['主题线索', '时间线索', '旧页证据'])

  return items.filter((item) => !blockedLabels.has(item.label))
}

function hasLegacyReceiptItems(items: Array<{ label: string; value: string }>) {
  return items.some((item) => item.label === '夹页' || item.label === '日期')
}

function formatSeason(date: Date) {
  const month = date.getMonth() + 1

  if (month >= 3 && month <= 5) {
    return '春天'
  }

  if (month >= 6 && month <= 8) {
    return '夏天'
  }

  if (month >= 9 && month <= 11) {
    return '秋天'
  }

  return '冬天'
}

function createTextExcerpt(text: string, maxLength: number) {
  const excerpt = text.replace(/\s+/g, ' ').trim()

  if (excerpt.length <= maxLength) {
    return excerpt
  }

  return `${excerpt.slice(0, maxLength).trimEnd()}...`
}

function resolveJournalMemoryImageSrc(src: string) {
  if (isAbsoluteUrl(src) || src.startsWith('/')) {
    return src
  }

  return `journal-media://local/${src.split('/').map(encodeURIComponent).join('/')}`
}

function isAbsoluteUrl(src: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(src)
}

function readFallbackDailyCuration(dateKey: string): DailyCuration | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const saved = window.localStorage.getItem(DAILY_CURATION_STORAGE_KEY)

    if (!saved) {
      return null
    }

    const parsed = JSON.parse(saved) as Record<string, DailyCuration>
    const curation = parsed[dateKey]

    return curation?.version === 6 ? curation : null
  } catch {
    return null
  }
}

function saveDailyCurationDraft(curation: DailyCuration) {
  const journalStore = getJournalStore()

  if (journalStore?.saveDailyCuration) {
    void journalStore.saveDailyCuration(curation).catch(() => saveFallbackDailyCuration(curation))
    return
  }

  saveFallbackDailyCuration(curation)
}

function saveFallbackDailyCuration(curation: DailyCuration) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const saved = window.localStorage.getItem(DAILY_CURATION_STORAGE_KEY)
    const parsed = saved ? (JSON.parse(saved) as Record<string, DailyCuration>) : {}

    window.localStorage.setItem(
      DAILY_CURATION_STORAGE_KEY,
      JSON.stringify({
        ...parsed,
        [curation.curationDate]: curation,
      }),
    )
  } catch {
    // Local storage is only the first dev-facing persistence layer.
  }
}

export default AllPagesHomePage
