import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import { BookOpen, CalendarDays, Image, PenLine, Settings, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { createDomRangesByAnnotation, resolveAnnotationRanges } from '../domain/annotations'
import { parseJournalMarkdown, renderJournalMarkdown } from '../domain/markdown'
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
import JournalMarkdownEditor from './markdown-preview/JournalMarkdownEditor'
import MarkdownPreviewArticle from './markdown-preview/MarkdownPreviewArticle'
import type { AnnotationOverlayRect } from './markdown-preview/types'

type JournalMode = 'write' | 'review'

const noAnnotations: typeof demoAnnotations = []
const menuItems: Array<{
  label: string
  description: string
  icon: LucideIcon
  isActive?: boolean
}> = [
  { label: '今日', description: '4月25日', icon: PenLine, isActive: true },
  { label: '日记', description: '全部纸页', icon: BookOpen },
  { label: '回声', description: '旧日重现', icon: Sparkles },
  { label: '相册', description: '照片记录', icon: Image },
  { label: '日历', description: '时间索引', icon: CalendarDays },
  { label: '设置', description: '外观与边界', icon: Settings },
]

function MarkdownPreviewPage() {
  const [journalMode, setJournalMode] = useState<JournalMode>('write')
  const [journalMarkdown, setJournalMarkdown] = useState(annotationTargetsEntry)
  const [activeAnnotationId, setActiveAnnotationId] = useState(demoAnnotations[0]?.id ?? '')
  const [activeOverlayRects, setActiveOverlayRects] = useState<AnnotationOverlayRect[]>([])
  const previewRef = useRef<HTMLDivElement>(null)
  const isReviewing = journalMode === 'review'
  const visibleAnnotations = isReviewing ? demoAnnotations : noAnnotations
  const annotationRanges = useMemo(
    () => resolveAnnotationRanges(parseJournalMarkdown(journalMarkdown).longEntryMarkdown, visibleAnnotations),
    [journalMarkdown, visibleAnnotations],
  )
  const renderedMarkdown = useMemo(
    () => renderJournalMarkdown({ markdown: journalMarkdown, annotations: visibleAnnotations }),
    [journalMarkdown, visibleAnnotations],
  )

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

  return (
    <motion.main
      animate={{ opacity: 1 }}
      className="journal-workspace min-h-screen px-4 py-5 font-sans text-ink sm:px-6 lg:px-8"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="journal-shell mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-7xl flex-col overflow-hidden"
        initial={{ opacity: 0, y: 12 }}
        transition={panelTransition}
      >
        <motion.header
          animate={{ opacity: 1, y: 0 }}
          className="journal-topbar flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-7"
          initial={{ opacity: 0, y: -8 }}
          transition={{ ...panelTransition, delay: 0.05 }}
        >
          <div>
            <p className="text-xs font-semibold text-sage">4月25日 周六 小雨</p>
            <h1 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">今日纸面</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink/60">
            <div aria-label="纸面状态" className="mode-switch" role="group">
              <button
                aria-pressed={journalMode === 'write'}
                className={journalMode === 'write' ? 'is-active' : ''}
                onClick={() => handleModeChange('write')}
                type="button"
              >
                书写
              </button>
              <button
                aria-pressed={journalMode === 'review'}
                className={journalMode === 'review' ? 'is-active' : ''}
                onClick={() => handleModeChange('review')}
                type="button"
              >
                回看
              </button>
            </div>
            <span className="save-state">已安放</span>
          </div>
        </motion.header>

        <div className="journal-body grid flex-1 min-h-0 gap-0 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="主菜单" className="journal-menu">
            <div className="journal-menu-title">
              <span>Journal</span>
              <span>私人记录</span>
            </div>
            <div className="journal-menu-list">
              {menuItems.map((item) => {
                const Icon = item.icon

                return (
                  <button
                    key={item.label}
                    aria-current={item.isActive ? 'page' : undefined}
                    className={item.isActive ? 'is-active' : ''}
                    type="button"
                  >
                    <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          </nav>

          <section
            className={`journal-stage grid flex-1 min-h-0 gap-0 ${
              isReviewing ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''
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
                  annotations={demoAnnotations}
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
                    <span>页边保持安静</span>
                  </div>
                  <JournalMarkdownEditor onChange={setJournalMarkdown} value={journalMarkdown} />
                  <div className="journal-paper-footer">
                    <span>写的时候不出现正式批注</span>
                    <button onClick={() => handleModeChange('review')} type="button">
                      回看一下
                    </button>
                  </div>
                </div>
              </motion.article>
            )}
          </section>
        </div>
      </motion.div>
    </motion.main>
  )
}

export default MarkdownPreviewPage
