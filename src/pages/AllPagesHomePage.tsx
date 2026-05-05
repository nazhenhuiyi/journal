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
import { motion } from 'motion/react'
import { Link } from 'react-router'
import {
  formatSketchDuration,
  SketchPlaybackCanvas,
  useSketchSession,
} from '../domain/sketch'
import nightLampPhoto from '../assets/memory-photos/night-lamp.jpg'
import openBookPhoto from '../assets/memory-photos/open-book.jpg'
import rainyNightPhoto from '../assets/memory-photos/rainy-night.jpg'
import windowPlantPhoto from '../assets/memory-photos/window-plant.jpg'
import CardStyleShowcase from './all-pages/CardStyleShowcase'
import { panelTransition } from './markdown-preview/constants'
import { brand } from '../brand'

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

const memoryRows = [
  {
    date: '2025.04.25 · 小雨',
    text: '便利店门口的灯很亮，伞面一直滴水。',
    tone: 'rain',
    variant: 'feature',
    image: rainyNightPhoto,
  },
  {
    date: '三月末',
    text: '窗边那盆植物又长出一点新叶。',
    tone: 'plant',
    variant: 'small',
    image: windowPlantPhoto,
  },
  {
    date: '上周六 · 夜',
    text: '桌上只剩杯子和台灯，房间安静下来。',
    tone: 'night',
    variant: 'small',
    image: nightLampPhoto,
  },
  {
    date: '去年春天',
    text: '那张照片里，风把纸页吹起来。',
    tone: 'spring',
    variant: 'small',
    image: openBookPhoto,
  },
]

function AllPagesHomePage() {
  const { currentDocument, state, eventCount, originalDuration, replayDuration } = useSketchSession()

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
            {brand.name} · 4月25日 · 星期六 · 已安放 18 页
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
          {memoryRows.map((memory) => (
            <article className={`all-pages-memory-card is-${memory.variant}`} key={`${memory.date}-${memory.text}`}>
              <div aria-hidden="true" className={`all-pages-memory-thumb is-${memory.tone}`}>
                <img alt="" draggable="false" src={memory.image} />
              </div>
              <div className="all-pages-memory-copy">
                <time>{memory.date}</time>
                <p>{memory.text}</p>
              </div>
              <button aria-label={`打开 ${memory.date} 的回忆`} type="button">
                <MoreHorizontal aria-hidden="true" size={20} strokeWidth={2.1} />
              </button>
            </article>
          ))}
        </div>
      </section>

      <CardStyleShowcase />
    </motion.div>
  )
}

export default AllPagesHomePage
