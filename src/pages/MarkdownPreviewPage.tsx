import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { motion } from 'motion/react'
import { createDomRangesByAnnotation, resolveAnnotationRanges } from '../domain/annotations'
import { renderJournalMarkdown } from '../domain/markdown'
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
  demoLongEntryMarkdown,
} from './markdown-preview/demoAnnotations'
import MarkdownPreviewArticle from './markdown-preview/MarkdownPreviewArticle'
import type { AnnotationOverlayRect } from './markdown-preview/types'

function MarkdownPreviewPage() {
  const [activeAnnotationId, setActiveAnnotationId] = useState(demoAnnotations[0]?.id ?? '')
  const [activeOverlayRects, setActiveOverlayRects] = useState<AnnotationOverlayRect[]>([])
  const previewRef = useRef<HTMLDivElement>(null)
  const annotationRanges = useMemo(
    () => resolveAnnotationRanges(demoLongEntryMarkdown, demoAnnotations),
    [],
  )
  const renderedMarkdown = useMemo(
    () => renderJournalMarkdown({ markdown: annotationTargetsEntry, annotations: demoAnnotations }),
    [],
  )

  useEffect(() => {
    const preview = previewRef.current

    if (!preview) {
      return
    }

    for (const block of preview.querySelectorAll<HTMLElement>('[data-annotation-ids]')) {
      const ids = getAnnotationIds(block)
      block.dataset.annotationActive = ids.includes(activeAnnotationId) ? 'true' : 'false'
    }
  }, [activeAnnotationId])

  useEffect(() => {
    const preview = previewRef.current

    if (!preview) {
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
  }, [activeAnnotationId, annotationRanges])

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

  return (
    <motion.main
      animate={{ opacity: 1 }}
      className="min-h-screen bg-[#f4efe2] px-4 py-5 font-sans text-ink sm:px-6 lg:px-8"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-7xl flex-col overflow-hidden border border-walnut/15 bg-[#fbf8ef] shadow-xl shadow-walnut/10"
        initial={{ opacity: 0, y: 12 }}
        transition={panelTransition}
      >
        <motion.header
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 border-b border-walnut/10 bg-white/65 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-7"
          initial={{ opacity: 0, y: -8 }}
          transition={{ ...panelTransition, delay: 0.05 }}
        >
          <div>
            <p className="text-xs font-semibold uppercase text-sage">Markdown Preview</p>
            <h1 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">2026-04-24 日记预览</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink/60">
            <span className="border border-sage/25 bg-sage/10 px-3 py-1 text-sage">精确高亮</span>
            <span className="border border-brass/30 bg-brass/15 px-3 py-1 text-walnut">
              {demoAnnotations.length} 条批注
            </span>
          </div>
        </motion.header>

        <section className="grid flex-1 min-h-0 gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
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
        </section>
      </motion.div>
    </motion.main>
  )
}

export default MarkdownPreviewPage
