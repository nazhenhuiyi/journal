import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  MoreHorizontal,
  Play,
} from '../components/HandDrawnIcons'
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  SketchPlaybackCanvas,
  type SketchEvent,
  type StoredSketchDocument,
  useSketchSession,
} from '../domain/sketch'
import CardStyleShowcase from './all-pages/CardStyleShowcase'
import { panelTransition } from './markdown-preview/constants'
import { brand } from '../brand'
import type { JournalIndexEntry } from '../domain/journalIndex/types'

const memoryTones = ['rain', 'plant', 'night', 'spring']
const emptySketchEvents: SketchEvent[] = []

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
  const [sketchGallery, setSketchGallery] = useState<StoredSketchDocument[]>([])
  const [selectedSketchId, setSelectedSketchId] = useState<string | null>(null)
  const [sketchReplayRequest, setSketchReplayRequest] = useState<{ id: string; count: number } | null>(null)
  const recentMemories = useMemo(() => journalIndex.slice(0, 4).map(toMemoryRow), [journalIndex])
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
  const previewCanvasKey = `${previewDocument?.id ?? 'empty'}-${isPreviewReplayRequested ? sketchReplayRequest.count : 0}`
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

      <section aria-labelledby="old-pages-title" className="all-pages-memory-shelf">
        <div className="all-pages-memory-header">
          <BookOpen aria-hidden="true" size={19} strokeWidth={2.15} />
          <h2 id="old-pages-title">翻到几声回声</h2>
        </div>

        <div className="all-pages-memory-board">
          {recentMemories.length > 0 ? recentMemories.map((memory) => (
            <article
              className={`all-pages-memory-card is-${memory.variant} ${memory.image ? '' : 'is-text-only'}`}
              key={`${memory.date}-${memory.text}`}
            >
              {memory.image ? (
                <div aria-hidden="true" className={`all-pages-memory-thumb is-${memory.tone}`}>
                  <img alt="" draggable="false" src={memory.image} />
                </div>
              ) : null}
              <div className="all-pages-memory-copy">
                <time>{memory.date}</time>
                <p>{memory.text}</p>
              </div>
              <button aria-label={`打开 ${memory.date} 的回忆`} type="button">
                <MoreHorizontal aria-hidden="true" size={20} strokeWidth={2.1} />
              </button>
            </article>
          )) : (
            <article className="all-pages-memory-card is-feature is-text-only">
              <div className="all-pages-memory-copy">
                <time>{indexLoadStatus === 'failed' ? '暂时没翻到' : '还没有旧页'}</time>
                <p>{indexLoadStatus === 'failed' ? '索引没有读出来，但今天仍然可以继续写。' : '写下第一页以后，这里会开始出现回声。'}</p>
              </div>
            </article>
          )}
        </div>
      </section>

      <CardStyleShowcase />
    </motion.div>
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

function toMemoryRow(entry: JournalIndexEntry, index: number) {
  const image = entry.images[0]
  const text = entry.title ?? entry.excerpt ?? createIndexExcerpt(entry.searchableText) ?? '这一天留下了一点痕迹。'

  return {
    date: formatIndexDate(entry.date, entry.tags),
    image: image ? resolveJournalMemoryImageSrc(image.src) : undefined,
    text,
    tone: memoryTones[index % memoryTones.length],
    variant: index === 0 ? 'feature' : 'small',
  }
}

function formatIndexDate(dateKey: string, tags: string[]) {
  const dateLabel = dateKey.replace(/-/g, '.')
  const tagLabel = tags[0]

  return tagLabel ? `${dateLabel} · ${tagLabel}` : dateLabel
}

function createIndexExcerpt(text: string) {
  const excerpt = text.replace(/\s+/g, ' ').trim()

  if (!excerpt) {
    return ''
  }

  return excerpt.length > 34 ? `${excerpt.slice(0, 34).trimEnd()}...` : excerpt
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

export default AllPagesHomePage
