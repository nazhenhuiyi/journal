import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Transition } from 'motion/react'
import { createDomRangesByAnnotation, createTextSelector, resolveAnnotationRanges } from '../domain/annotations'
import type { Annotation } from '../domain/annotations'
import annotationTargetsEntry from '../domain/markdown/__fixtures__/annotation-targets.md?raw'
import { parseJournalMarkdown, renderJournalMarkdown } from '../domain/markdown'

const textHighlightKey = 'journal-annotation-text'
const activeHighlightKey = 'journal-annotation-active'
const panelTransition: Transition = { duration: 0.34, ease: [0.22, 1, 0.36, 1] }
const listTransition: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] }

const annotationKinds: Record<Annotation['kind'], string> = {
  observation: '观察',
  question: '追问',
  format: '结构',
  spelling: '校对',
}

type AnnotationOverlayRect = {
  key: string
  left: number
  top: number
  width: number
  height: number
}

const { longEntryMarkdown: demoLongEntryMarkdown } = parseJournalMarkdown(annotationTargetsEntry)

function buildDemoAnnotations(longEntryMarkdown: string): Annotation[] {
  const tiredText = '今天真的**很累**'
  const deskText = '桌面慢慢露出来'
  const pauseText = '不急着把今天解释清楚'
  const multiLineText = '台灯下面终于空出了一小块可以写字的地方。做这些的时候脑子还是有点钝，可是看到桌面慢慢露出来，心里也跟着松了一点'
  const repeatedText = '这句话会重复出现。'
  const linkText = '链接'
  const punctuationText = '中文标点：嗯，好'
  const tiredStart = longEntryMarkdown.indexOf(tiredText)
  const deskStart = longEntryMarkdown.indexOf(deskText)
  const pauseStart = longEntryMarkdown.indexOf(pauseText)
  const multiLineStart = longEntryMarkdown.indexOf(multiLineText)
  const repeatedStart = longEntryMarkdown.lastIndexOf(repeatedText)
  const linkStart = longEntryMarkdown.indexOf(linkText)
  const punctuationStart = longEntryMarkdown.indexOf(punctuationText)

  return [
    {
      id: 'ann_tired',
      author: 'ai',
      kind: 'observation',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(longEntryMarkdown, tiredStart, tiredStart + tiredText.length),
      },
      body: {
        content: '这里保留了疲惫，也保留了行动。可以不用急着把它解释成积极或消极。',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:40:00+08:00',
    },
    {
      id: 'ann_desk',
      author: 'ai',
      kind: 'observation',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(longEntryMarkdown, deskStart, deskStart + deskText.length),
      },
      body: {
        content: '这里的动作很小，但画面感很清楚：桌面露出来，也像是给自己腾出一点呼吸的位置。',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:41:00+08:00',
    },
    {
      id: 'ann_multiline',
      author: 'ai',
      kind: 'observation',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(
          longEntryMarkdown,
          multiLineStart,
          multiLineStart + multiLineText.length,
        ),
      },
      body: {
        content: '这条故意跨过视觉换行，用来检查高亮底色和选中轮廓是否能按每一行拆成连续区域。',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:41:15+08:00',
    },
    {
      id: 'ann_pause',
      author: 'ai',
      kind: 'question',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(longEntryMarkdown, pauseStart, pauseStart + pauseText.length),
      },
      body: {
        content: '“不急着解释清楚”很有力量。这里是在放过今天，还是在给明天留一个入口？',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:41:30+08:00',
    },
    {
      id: 'ann_repeat',
      author: 'ai',
      kind: 'question',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(longEntryMarkdown, repeatedStart, repeatedStart + repeatedText.length),
      },
      body: {
        content: '这句重复出现，像是在提醒某个还没说完的重点。要不要给它补一句原因？',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:42:00+08:00',
    },
    {
      id: 'ann_link',
      author: 'ai',
      kind: 'format',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(longEntryMarkdown, linkStart, linkStart + linkText.length),
      },
      body: {
        content: '链接文字可以被单独定位，高亮不会把 URL 或 Markdown 语法一起框进去。',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:43:00+08:00',
    },
    {
      id: 'ann_punctuation',
      author: 'ai',
      kind: 'spelling',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(
          longEntryMarkdown,
          punctuationStart,
          punctuationStart + punctuationText.length,
        ),
      },
      body: {
        content: '这段用来检查中文标点附近的范围边界，避免高亮多吞或少吞字符。',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:44:00+08:00',
    },
  ]
}

const demoAnnotations = buildDemoAnnotations(demoLongEntryMarkdown)

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
          <motion.article
            animate={{ opacity: 1, x: 0 }}
            className="min-h-0 overflow-y-auto px-5 py-6 sm:px-8 lg:px-10"
            initial={{ opacity: 0, x: -14 }}
            transition={{ ...panelTransition, delay: 0.1 }}
          >
            <div
              ref={previewRef}
              className="markdown-preview mx-auto max-w-3xl"
              onClick={handlePreviewClick}
            >
              {renderedMarkdown}
              <div aria-hidden="true" className="annotation-overlay">
                <AnimatePresence initial={false}>
                  {activeOverlayRects.map((rect) => (
                    <motion.span
                      key={`${activeAnnotationId}-${rect.key}`}
                      animate={{ opacity: 1, scaleX: 1 }}
                      className="annotation-overlay-rect"
                      exit={{ opacity: 0, scaleX: 0.96 }}
                      initial={{ opacity: 0, scaleX: 0.96 }}
                      style={{
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height,
                        transformOrigin: 'left center',
                      }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </motion.article>

          <motion.aside
            animate={{ opacity: 1, x: 0 }}
            className="border-t border-walnut/10 bg-white/70 px-4 py-5 lg:border-l lg:border-t-0"
            initial={{ opacity: 0, x: 14 }}
            transition={{ ...panelTransition, delay: 0.14 }}
          >
            <div className="sticky top-5">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase text-sage">Annotations</p>
                <h2 className="mt-2 font-display text-xl font-semibold text-ink">批注</h2>
              </div>

              <motion.div
                animate="visible"
                className="space-y-3"
                initial="hidden"
                variants={{
                  hidden: {},
                  visible: {
                    transition: {
                      delayChildren: 0.18,
                      staggerChildren: 0.035,
                    },
                  },
                }}
              >
                {demoAnnotations.map((annotation) => {
                  const isActive = annotation.id === activeAnnotationId

                  return (
                    <motion.button
                      key={annotation.id}
                      animate={{ opacity: 1, scale: isActive ? 1.012 : 1, y: 0 }}
                      aria-pressed={isActive}
                      className={`w-full border px-4 py-3 text-left transition ${
                        isActive
                          ? 'border-sage bg-sage/10 shadow-sm'
                          : 'border-walnut/10 bg-[#fbf8ef] hover:border-sage/40 hover:bg-white'
                      }`}
                      initial={{ opacity: 0, y: 8 }}
                      layout
                      onClick={() => selectAnnotation(annotation.id, true)}
                      transition={listTransition}
                      type="button"
                      variants={{
                        hidden: { opacity: 0, y: 8 },
                        visible: { opacity: 1, y: 0 },
                      }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <span className="text-xs font-semibold text-sage">{annotationKinds[annotation.kind]}</span>
                      <span className="mt-2 block text-sm leading-6 text-ink/75">{annotation.body.content}</span>
                    </motion.button>
                  )
                })}
              </motion.div>
            </div>
          </motion.aside>
        </section>
      </motion.div>
    </motion.main>
  )
}

function getAnnotationIds(element: HTMLElement): string[] {
  return (element.dataset.annotationIds ?? '').split(/\s+/).filter(Boolean)
}

function sourceOffsetAtPoint(root: ParentNode, clientX: number, clientY: number): number | null {
  const textPoint = textPointAt(clientX, clientY)
  const sourceElement = textPoint?.node.parentElement?.closest<HTMLElement>(
    '[data-source-start][data-source-end]',
  )

  if (!textPoint || !sourceElement || !root.contains(sourceElement)) {
    return null
  }

  const sourceStart = Number(sourceElement.dataset.sourceStart)

  return Number.isFinite(sourceStart) ? sourceStart + textPoint.offset : null
}

function textPointAt(clientX: number, clientY: number): { node: Text; offset: number } | null {
  if ('caretPositionFromPoint' in document) {
    const position = document.caretPositionFromPoint(clientX, clientY)

    if (position?.offsetNode.nodeType === Node.TEXT_NODE) {
      return {
        node: position.offsetNode as Text,
        offset: position.offset,
      }
    }
  }

  if ('caretRangeFromPoint' in document) {
    const range = document.caretRangeFromPoint(clientX, clientY)

    if (range?.startContainer.nodeType === Node.TEXT_NODE) {
      return {
        node: range.startContainer as Text,
        offset: range.startOffset,
      }
    }
  }

  return null
}

function registerAnnotationHighlights(
  rangesByAnnotation: Map<string, Range[]>,
  activeAnnotationId: string,
): () => void {
  const registry = getHighlightRegistry()

  if (!registry || typeof Highlight === 'undefined') {
    return () => undefined
  }

  const ranges = Array.from(rangesByAnnotation.values()).flat()
  const activeRanges = rangesByAnnotation.get(activeAnnotationId) ?? []

  registry.delete(textHighlightKey)
  registry.delete(activeHighlightKey)

  if (ranges.length > 0) {
    registry.set(textHighlightKey, new Highlight(...ranges))
  }

  if (activeRanges.length > 0) {
    registry.set(activeHighlightKey, new Highlight(...activeRanges))
  }

  return () => {
    registry.delete(textHighlightKey)
    registry.delete(activeHighlightKey)
  }
}

function watchActiveOverlayRects(
  preview: HTMLElement,
  ranges: Range[],
  setRects: (rects: AnnotationOverlayRect[]) => void,
): () => void {
  let cancelled = false
  const update = () => {
    if (!cancelled) {
      setRects(createOverlayRects(preview, ranges))
    }
  }

  update()

  const animationFrame = window.requestAnimationFrame(update)
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)

  resizeObserver?.observe(preview)
  window.addEventListener('resize', update)
  void document.fonts?.ready.then(update)

  return () => {
    cancelled = true
    window.cancelAnimationFrame(animationFrame)
    window.removeEventListener('resize', update)
    resizeObserver?.disconnect()
  }
}

function createOverlayRects(preview: HTMLElement, ranges: Range[]): AnnotationOverlayRect[] {
  const previewRect = preview.getBoundingClientRect()

  return ranges.flatMap((range, rangeIndex) => {
    if (typeof range.getClientRects !== 'function') {
      return []
    }

    return Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect, rectIndex) => ({
        key: `${rangeIndex}-${rectIndex}`,
        left: rect.left - previewRect.left,
        top: rect.top - previewRect.top,
        width: rect.width,
        height: rect.height,
      }))
  })
}

function getHighlightRegistry(): HighlightRegistry | null {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) {
    return null
  }

  return CSS.highlights
}

export default MarkdownPreviewPage
