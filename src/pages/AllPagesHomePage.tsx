import {
  CalendarDays,
  Redo,
  Sparkles,
} from '../components/HandDrawnIcons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import {
  applyDailyCurationAiDraft,
  createDailyCuration,
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
        saveDailyCurationDraft(enhancedCuration)
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
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
        saveDailyCurationDraft(nextCuration)
        hasSavedDraftRef.current = true
      } else {
        hasSavedDraftRef.current = false
      }

      setSavedDailyCuration(nextCuration)
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
  onRegenerate,
}: {
  curation: DailyCuration | null
  dateLabel: string
  dailyCurationError: string
  entryCount: number
  indexLoadStatus: IndexLoadStatus
  onRegenerate: () => void
}) {
  const curationTags = curation ? formatCurationTags(curation) : []

  return (
    <section aria-labelledby="daily-curation-title" className="all-pages-daily-curation is-primary">
      <div className="all-pages-daily-curation-inner">
        <div className="all-pages-daily-curation-header">
          <div>
            <p>
              <CalendarDays aria-hidden="true" size={16} strokeWidth={2.15} />
              {brand.name} · {dateLabel} · {formatTodayWeather(curation?.today)} · 已安放 {entryCount} 页
            </p>
            <h1 id="daily-curation-title">今日回声</h1>
          </div>
          <button aria-label="重新生成今日策展" disabled={!curation} onClick={onRegenerate} type="button">
            <Redo aria-hidden="true" size={17} strokeWidth={2.2} />
          </button>
        </div>

        {dailyCurationError ? (
          <div className="all-pages-curation-empty is-error" role="alert">
            <p>{dailyCurationError}</p>
          </div>
        ) : curation ? (
          <>
            <article className={`echo-curation-exhibit is-${curation.hero.cardStyle}`}>
              <figure className="echo-curation-media">
                <div className="echo-curation-media-frame">
                  {curation.source.image ? (
                    <img
                      alt={curation.source.image.caption ?? curation.source.title}
                      src={resolveJournalMemoryImageSrc(curation.source.image.src)}
                    />
                  ) : (
                    <div className="echo-curation-text-artifact">
                      <span>ARCHIVE NOTE</span>
                      <h3>{curation.source.title}</h3>
                      <p>{curation.source.excerpt}</p>
                    </div>
                  )}
                </div>
                <figcaption>
                  <Sparkles aria-hidden="true" size={15} strokeWidth={2.15} />
                  <span>{curation.recall.label}</span>
                  <time dateTime={curation.source.date}>{curation.source.date.replace(/-/g, '.')}</time>
                </figcaption>
              </figure>

              <div className="echo-curation-copy">
                <p className="echo-curation-kicker">{formatCurationSubtitle(curation)}</p>
                <h2>{curation.source.title}</h2>
                <blockquote>{curation.source.excerpt}</blockquote>
                <p className="echo-curation-note">{curation.thesis.curatorVoice}</p>
                <p className="echo-curation-question">{curation.closingQuestion}</p>
                {curationTags.length > 0 ? (
                  <div className="echo-curation-tags" aria-label="策展标签">
                    {curationTags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
            {curation.supports.length > 0 ? (
              <div className="echo-support-grid" aria-label="辅助回声">
                {curation.supports.map((support) => (
                  <article className={`echo-support-card is-${support.cardStyle}`} key={support.id}>
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

function formatCurationSubtitle(curation: DailyCuration) {
  if (/今天先翻一页.*关于|再看它和此刻/.test(curation.thesis.subtitle)) {
    return curation.thesis.lens === 'season'
      ? '今天先翻到同一段季节里的一页旧日子。'
      : '今天先翻到一页旧日子，让它和此刻并排坐一会儿。'
  }

  return curation.thesis.subtitle
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

    if (cleanedItems.length > 0) {
      return cleanedItems
    }

    const todayLabel = curation.today.journal?.title ?? curation.curationDate.replace(/-/g, '.')
    const tags = [...(curation.today.journal?.tags ?? []), ...curation.source.tags, ...curation.source.collections]

    return [
      { label: '夹页', value: curation.source.title },
      { label: '今天', value: todayLabel },
      { label: '日期', value: curation.source.date.replace(/-/g, '.') },
      { label: '找零', value: tags[0] ? `一点${tags[0]}` : '一点普通日常' },
    ]
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

function formatCurationTags(curation: DailyCuration) {
  const tags = [...curation.source.tags, ...curation.source.collections]

  return tags.slice(0, 4)
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
