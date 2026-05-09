import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Play,
  Redo,
  Sparkles,
  StickyNote,
} from '../components/HandDrawnIcons'
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  SketchPlaybackCanvas,
  type SketchEvent,
  type StoredSketchDocument,
  useSketchSession,
} from '../domain/sketch'
import {
  createDailyCuration,
  getLocalDateKey,
  type DailyCuration,
} from '../domain/dailyCuration'
import { panelTransition } from './markdown-preview/constants'
import { brand } from '../brand'
import type { JournalIndexEntry } from '../domain/journalIndex/types'
import foundPostmarkImage from '../assets/postmarks/found.png'
import riverMotifImage from '../assets/postcard-motifs/river-light.png'
import stickyPinImage from '../assets/sticky-pin.svg'

const emptySketchEvents: SketchEvent[] = []
const DAILY_CURATION_STORAGE_KEY = 'journal:daily-curations:v1'

type IndexLoadStatus = 'loading' | 'ready' | 'failed'

function getJournalStore() {
  return typeof window === 'undefined' ? undefined : window.journalStore
}

function AllPagesHomePage() {
  const { currentDocument, documents, state } = useSketchSession()
  const [journalIndex, setJournalIndex] = useState<JournalIndexEntry[]>([])
  const [indexLoadStatus, setIndexLoadStatus] = useState<IndexLoadStatus>(() =>
    getJournalStore()?.listIndex ? 'loading' : 'ready',
  )
  const todayDateKey = useMemo(() => getLocalDateKey(), [])
  const [savedDailyCuration, setSavedDailyCuration] = useState<DailyCuration | null>(() =>
    readSavedDailyCuration(todayDateKey),
  )
  const [curationGeneration, setCurationGeneration] = useState(() => savedDailyCuration?.generation ?? 0)
  const [sketchGallery, setSketchGallery] = useState<StoredSketchDocument[]>([])
  const [selectedSketchId, setSelectedSketchId] = useState<string | null>(null)
  const [sketchReplayRequest, setSketchReplayRequest] = useState<{ id: string; count: number } | null>(null)
  const draftedDailyCuration = useMemo(
    () => createDailyCuration(journalIndex, new Date(`${todayDateKey}T12:00:00`), curationGeneration),
    [curationGeneration, journalIndex, todayDateKey],
  )
  const dailyCuration = savedDailyCuration ?? draftedDailyCuration
  const homeDateLabel = useMemo(() => formatHomeDate(new Date()), [])
  const selectedSketchIndex = Math.max(
    sketchGallery.findIndex((document) => document.id === selectedSketchId),
    0,
  )
  const selectedGallerySketch = sketchGallery[selectedSketchIndex] ?? null
  const previewDocument = selectedGallerySketch ?? (state.events.length > 0 ? currentDocument : null)
  const previewEvents = useMemo(
    () =>
      previewDocument?.id === currentDocument?.id
        ? state.events
        : previewDocument?.events ?? emptySketchEvents,
    [currentDocument?.id, previewDocument, state.events],
  )
  const isPreviewReplayRequested = Boolean(
    previewDocument && sketchReplayRequest?.id === previewDocument.id,
  )
  const previewCanvasKey = `${previewDocument?.id ?? 'empty'}-${isPreviewReplayRequested ? (sketchReplayRequest?.count ?? 0) : 0}`
  const hasPreviousSketch = selectedSketchIndex > 0
  const hasNextSketch = selectedSketchIndex < sketchGallery.length - 1
  const sketchTimeLabel = formatSketchTime(previewDocument?.updatedAt)

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
    if (savedDailyCuration || !draftedDailyCuration || indexLoadStatus !== 'ready') {
      return
    }

    saveDailyCuration(draftedDailyCuration)
    setSavedDailyCuration(draftedDailyCuration)
  }, [draftedDailyCuration, indexLoadStatus, savedDailyCuration])

  useEffect(() => {
    if (!window.sketchStore?.list || !window.sketchStore.load) {
      return
    }

    let isCancelled = false

    async function loadDrawableSketches() {
      const summaries = await window.sketchStore!.list()
      const sortedSummaries = [...summaries].sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      )
      const drawableDocuments: StoredSketchDocument[] = []

      for (const summary of sortedSummaries) {
        const document = await window.sketchStore!.load(summary.id)

        if (document.events.length > 0) {
          drawableDocuments.push(document)
        }
      }

      return drawableDocuments
    }

    loadDrawableSketches()
      .then((sketches) => {
        if (!isCancelled) {
          setSketchGallery(sketches)
          setSelectedSketchId((currentId) =>
            sketches.some((sketch) => sketch.id === currentId) ? currentId : sketches[0]?.id ?? null,
          )
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setSketchGallery([])
          setSelectedSketchId(null)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [currentDocument?.id, documents])

  function playPreviewSketch() {
    if (!previewDocument || previewEvents.length === 0) {
      return
    }

    setSketchReplayRequest((request) => ({
      id: previewDocument.id,
      count: request?.id === previewDocument.id ? request.count + 1 : 1,
    }))
  }

  function selectPreviousSketch() {
    if (!hasPreviousSketch) {
      return
    }

    const sketch = sketchGallery[selectedSketchIndex - 1]

    setSelectedSketchId(sketch.id)
    setSketchReplayRequest(null)
  }

  function selectNextSketch() {
    if (!hasNextSketch) {
      return
    }

    const sketch = sketchGallery[selectedSketchIndex + 1]

    setSelectedSketchId(sketch.id)
    setSketchReplayRequest(null)
  }

  function regenerateDailyCuration() {
    const nextGeneration = curationGeneration + 1
    const nextCuration = createDailyCuration(journalIndex, new Date(`${todayDateKey}T12:00:00`), nextGeneration)

    setCurationGeneration(nextGeneration)

    if (nextCuration) {
      saveDailyCuration(nextCuration)
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
      <div className="all-pages-upper">
        <section aria-labelledby="all-pages-quote" className="all-pages-quote-card">
          <p className="all-pages-date">
            <CalendarDays aria-hidden="true" size={16} strokeWidth={2.15} />
            {brand.name} · {homeDateLabel} · 已安放 {journalIndex.length} 页
          </p>
          <h1 id="all-pages-quote">{brand.tagline}</h1>
          <p className="all-pages-subtitle">{brand.promise}</p>
        </section>
      </div>

      <section aria-labelledby="recent-sketch-title" className="all-pages-sketch-shelf">
        <div className="all-pages-sketch-copy">
          <h2 id="recent-sketch-title">这一幅</h2>
          <span>
            {previewEvents.length > 0
              ? '一张旧画，正在这里慢慢浮出来。'
              : '还没有落笔，先留一小页。'}
          </span>
          {previewEvents.length > 0 && sketchTimeLabel ? (
            <time className="all-pages-sketch-time">{sketchTimeLabel}</time>
          ) : null}
          <div className="all-pages-sketch-actions">
            <button disabled={!hasPreviousSketch} onClick={selectPreviousSketch} type="button">
              <ArrowRight aria-hidden="true" className="is-previous" size={18} strokeWidth={2.3} />
              <span>上一幅</span>
            </button>
            <button disabled={previewEvents.length === 0} onClick={playPreviewSketch} type="button">
              <Play aria-hidden="true" size={18} strokeWidth={2.3} />
              <span>播放</span>
            </button>
            <button disabled={!hasNextSketch} onClick={selectNextSketch} type="button">
              <span>下一幅</span>
              <ArrowRight aria-hidden="true" size={18} strokeWidth={2.3} />
            </button>
          </div>
        </div>
        <div className="all-pages-sketch-preview">
          {previewDocument ? (
            <SketchPlaybackCanvas
              autoPlay={isPreviewReplayRequested}
              canvas={previewDocument.canvas}
              className="is-thumbnail"
              controls={false}
              emptyLabel="空白画纸"
              events={previewEvents}
              key={previewCanvasKey}
              label="最近随画预览"
              maxDisplayHeight={280}
              maxDisplayWidth={420}
            />
          ) : (
            <span>空白画纸</span>
          )}
        </div>
      </section>

      <DailyCurationSection
        curation={dailyCuration}
        indexLoadStatus={indexLoadStatus}
        onRegenerate={regenerateDailyCuration}
      />
    </motion.div>
  )
}

function DailyCurationSection({
  curation,
  indexLoadStatus,
  onRegenerate,
}: {
  curation: DailyCuration | null
  indexLoadStatus: IndexLoadStatus
  onRegenerate: () => void
}) {
  return (
    <section aria-labelledby="daily-curation-title" className="all-pages-daily-curation">
      <div className="all-pages-daily-curation-inner">
        <div className="all-pages-daily-curation-header">
          <div>
            <p>
              <Sparkles aria-hidden="true" size={16} strokeWidth={2.15} />
              今日策展 · 已保存
            </p>
            <h2 id="daily-curation-title">{curation?.title ?? '今天还没有可翻出的旧页'}</h2>
          </div>
          <button disabled={!curation} onClick={onRegenerate} type="button">
            <Redo aria-hidden="true" size={17} strokeWidth={2.2} />
            <span>重新生成</span>
          </button>
        </div>

        {curation ? (
          <div className="all-pages-curation-board">
            <article className="journal-postcard all-pages-curation-postcard">
              <img alt="" aria-hidden="true" className="journal-postcard-motif" src={riverMotifImage} />
              <div className="journal-postcard-photo">
                {curation.source.image ? (
                  <img
                    alt={curation.source.image.caption ?? curation.source.title}
                    className="journal-postcard-image"
                    src={resolveJournalMemoryImageSrc(curation.source.image.src)}
                  />
                ) : (
                  <div className="all-pages-curation-photo-placeholder" aria-hidden="true">
                    {curation.artifact === 'receipt' ? 'RECEIPT' : 'ARCHIVE'}
                  </div>
                )}
                <span aria-hidden="true">ECHO</span>
              </div>
              <div className="journal-postcard-divider" aria-hidden="true" />
              <div className="journal-postcard-copy">
                <div className="journal-postcard-topline">
                  <div>
                    <div className="journal-postcard-place">
                      <BookOpen aria-hidden="true" size={16} strokeWidth={2.1} />
                      <span>{curation.recall.label}</span>
                    </div>
                    <time dateTime={curation.source.date}>{curation.source.date.replace(/-/g, '.')}</time>
                  </div>
                  <img alt="" aria-hidden="true" className="journal-postcard-stamp" src={foundPostmarkImage} />
                </div>
                <span className="journal-postcard-kicker">DAILY CURATION</span>
                <h3>{curation.source.title}</h3>
                <p>{curation.source.excerpt}</p>
                <div className="journal-postcard-address" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="journal-postcard-code" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </article>

            <article className="journal-sticky-card is-mist all-pages-curation-note">
              <span className="journal-sticky-pin" aria-hidden="true">
                <img alt="" src={stickyPinImage} />
              </span>
              <div className="journal-sticky-meta">
                <StickyNote aria-hidden="true" size={17} strokeWidth={2.12} />
                <span>策展人旁白</span>
              </div>
              <h3>朋友式翻页</h3>
              <p>{curation.curatorNote}</p>
            </article>

            <article className="journal-library-card all-pages-curation-library">
              <div className="journal-library-card-header">
                <div>
                  <span>回声借阅卡</span>
                  <h4>为什么今天</h4>
                  <p>{curation.reason}</p>
                </div>
                <strong>{curation.recall.rule}</strong>
              </div>

              <div className="journal-library-card-meta">
                <span>来源 {curation.source.date}</span>
                <span>第 {curation.generation + 1} 版</span>
              </div>

              <div className="journal-library-ledger" role="table" aria-label="策展线索">
                <div className="journal-library-ledger-head" role="row">
                  <span role="columnheader">线索</span>
                  <span role="columnheader">内容</span>
                  <span role="columnheader">说明</span>
                </div>
                <div className="journal-library-ledger-row" role="row">
                  <time dateTime={curation.source.date} role="cell">
                    日期
                  </time>
                  <span role="cell">{curation.source.date.replace(/-/g, '.')}</span>
                  <span role="cell">{curation.recall.label}</span>
                </div>
                <div className="journal-library-ledger-row" role="row">
                  <span role="cell">标签</span>
                  <span role="cell">{formatCurationTags(curation)}</span>
                  <span role="cell">标签与归档一起作证</span>
                </div>
                <div className="journal-library-ledger-row" role="row">
                  <span role="cell">问题</span>
                  <span role="cell">{curation.question}</span>
                  <span role="cell">只留一个入口</span>
                </div>
              </div>
            </article>
          </div>
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

function formatSketchTime(value: string | undefined) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')

  return `${date.getMonth() + 1}月${date.getDate()}日 ${hour}:${minute} 留下`
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

  return tags.length > 0 ? tags.slice(0, 3).join(' / ') : '未标注'
}

function readSavedDailyCuration(dateKey: string): DailyCuration | null {
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

    return curation?.version === 1 ? curation : null
  } catch {
    return null
  }
}

function saveDailyCuration(curation: DailyCuration) {
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
