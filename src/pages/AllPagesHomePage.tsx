import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Camera,
  MessageSquareText,
  MoreHorizontal,
  PenLine,
  type HandDrawnIcon,
} from '../components/HandDrawnIcons'
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import {
  formatSketchDuration,
  SketchPlaybackCanvas,
  useSketchSession,
} from '../domain/sketch'
import CardStyleShowcase from './all-pages/CardStyleShowcase'
import { panelTransition } from './markdown-preview/constants'
import { brand } from '../brand'
import type { JournalIndexEntry } from '../domain/journalIndex/types'

const quickActions: Array<{
  title: string
  description: string
  icon: HandDrawnIcon
  className: string
}> = [
  {
    title: '写一页',
    description: '把今天慢慢放下',
    icon: PenLine,
    className: 'all-pages-action all-pages-action-primary',
  },
  {
    title: '留一句',
    description: '不用解释完整',
    icon: MessageSquareText,
    className: 'all-pages-action all-pages-action-note',
  },
  {
    title: '收照片',
    description: '让画面替你说',
    icon: Camera,
    className: 'all-pages-action all-pages-action-photo',
  },
]

const memoryTones = ['rain', 'plant', 'night', 'spring']

type IndexLoadStatus = 'loading' | 'ready' | 'failed'

function getJournalStore() {
  return typeof window === 'undefined' ? undefined : window.journalStore
}

function AllPagesHomePage() {
  const { currentDocument, state, eventCount, originalDuration, replayDuration } = useSketchSession()
  const [journalIndex, setJournalIndex] = useState<JournalIndexEntry[]>([])
  const [indexLoadStatus, setIndexLoadStatus] = useState<IndexLoadStatus>(() =>
    getJournalStore()?.listIndex ? 'loading' : 'ready',
  )
  const recentMemories = useMemo(() => journalIndex.slice(0, 4).map(toMemoryRow), [journalIndex])

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
            {brand.name} · 4月25日 · 星期六 · 已安放 {journalIndex.length} 页
          </p>
          <h1 id="all-pages-quote">{brand.tagline}</h1>
          <p className="all-pages-subtitle">{brand.promise}</p>
        </section>

        <section aria-label="快捷入口" className="all-pages-action-cluster">
          {quickActions.map((action) => {
            const Icon = action.icon

            return (
              <Link className={action.className} key={action.title} to="/preview">
                <span className="all-pages-action-icon">
                  <Icon aria-hidden="true" size={30} strokeWidth={2.35} />
                </span>
                <span className="all-pages-action-copy">
                  <strong>{action.title}</strong>
                  <small>{action.description}</small>
                </span>
                <span aria-hidden="true" className="all-pages-action-arrow">
                  <ArrowRight size={18} strokeWidth={2.3} />
                </span>
              </Link>
            )
          })}
        </section>
      </div>

      <section aria-labelledby="recent-sketch-title" className="all-pages-sketch-shelf">
        <div className="all-pages-sketch-copy">
          <p>落笔回放</p>
          <h2 id="recent-sketch-title">最近随画</h2>
          <span>
            {eventCount > 0
              ? `${eventCount} 个事件 · 原始 ${formatSketchDuration(originalDuration)} · 回放 ${formatSketchDuration(replayDuration)}`
              : '还没有落笔，先留一小页。'}
          </span>
          <div className="all-pages-sketch-actions">
            <Link to="/sketch">留一笔</Link>
            <Link aria-disabled={eventCount === 0} className={eventCount === 0 ? 'is-disabled' : ''} to="/sketch?replay=1">
              看回放
            </Link>
          </div>
        </div>
        <div className="all-pages-sketch-preview">
          {currentDocument ? (
            <SketchPlaybackCanvas
              canvas={currentDocument.canvas}
              className="is-thumbnail"
              controls={false}
              emptyLabel="空白画纸"
              events={state.events}
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
              <button aria-label="去写一页" type="button">
                <ArrowRight aria-hidden="true" size={20} strokeWidth={2.1} />
              </button>
            </article>
          )}
        </div>
      </section>

      <CardStyleShowcase />
    </motion.div>
  )
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
