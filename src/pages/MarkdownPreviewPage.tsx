import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
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
type JournalFile = Awaited<ReturnType<NonNullable<Window['journalStore']>['loadToday']>>

const noAnnotations: typeof demoAnnotations = []
const AUTOSAVE_DELAY_MS = 700
const frontMatterFence = '---'

function getJournalStore() {
  return typeof window === 'undefined' ? undefined : window.journalStore
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function stripManagedFrontMatter(markdown: string) {
  if (!markdown.startsWith(`${frontMatterFence}\n`) && !markdown.startsWith(`${frontMatterFence}\r\n`)) {
    return markdown
  }

  const lines = markdown.split(/\r?\n/)
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === frontMatterFence)

  if (closingIndex === -1) {
    return markdown
  }

  return lines.slice(closingIndex + 1).join('\n').replace(/^\n/, '')
}

export function createManagedJournalMarkdown(markdown: string, date: string) {
  return `${frontMatterFence}\ndate: ${date}\n${frontMatterFence}\n\n${markdown}`
}

function MarkdownPreviewPage() {
  const [journalMode, setJournalMode] = useState<JournalMode>('write')
  const [journalMarkdown, setJournalMarkdown] = useState(annotationTargetsEntry)
  const [journalFile, setJournalFile] = useState<JournalFile | null>(null)
  const [activeAnnotationId, setActiveAnnotationId] = useState(demoAnnotations[0]?.id ?? '')
  const [activeOverlayRects, setActiveOverlayRects] = useState<AnnotationOverlayRect[]>([])
  const previewRef = useRef<HTMLDivElement>(null)
  const hasLoadedJournalRef = useRef(false)
  const lastSavedMarkdownRef = useRef(annotationTargetsEntry)
  const saveRequestIdRef = useRef(0)
  const isReviewing = journalMode === 'review'
  const journalStorageLabel = journalFile ? `~/.journal/${journalFile.fileName}` : '页边保持安静'
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
    const journalStore = getJournalStore()

    if (!journalStore) {
      hasLoadedJournalRef.current = true
      return
    }

    let isCancelled = false

    journalStore
      .loadToday()
      .then((file) => {
        if (isCancelled) {
          return
        }

        const editableMarkdown = stripManagedFrontMatter(file.content)

        lastSavedMarkdownRef.current = editableMarkdown
        hasLoadedJournalRef.current = true
        setJournalFile(file)
        setJournalMarkdown(editableMarkdown)
      })
      .catch(() => {
        if (isCancelled) {
          return
        }

        hasLoadedJournalRef.current = true
      })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    const journalStore = getJournalStore()

    if (!journalStore || !hasLoadedJournalRef.current || journalMarkdown === lastSavedMarkdownRef.current) {
      return
    }

    const requestId = saveRequestIdRef.current + 1
    saveRequestIdRef.current = requestId

    const timeoutId = window.setTimeout(() => {
      const date = journalFile?.date ?? getLocalDateKey()
      const fileMarkdown = createManagedJournalMarkdown(journalMarkdown, date)

      journalStore
        .saveToday(fileMarkdown)
        .then((file) => {
          if (saveRequestIdRef.current !== requestId) {
            return
          }

          lastSavedMarkdownRef.current = stripManagedFrontMatter(file.content)
          setJournalFile(file)
        })
        .catch(() => undefined)
    }, AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timeoutId)
  }, [journalFile?.date, journalMarkdown])

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

  function handleJournalMarkdownChange(nextMarkdown: string) {
    setJournalMarkdown(nextMarkdown)
  }

  return (
    <>
      <motion.header
        animate={{ opacity: 1, y: 0 }}
        className="journal-topbar flex min-h-14 items-center justify-between gap-3 px-7 py-2"
        initial={{ opacity: 0, y: -8 }}
        transition={{ ...panelTransition, delay: 0.05 }}
      >
        <h1 className="min-w-0 truncate font-display text-xl font-semibold text-ink">今日纸面</h1>
        <div className="flex shrink-0 items-center gap-2 text-sm text-ink/60">
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
                <span title={journalFile?.filePath}>{journalStorageLabel}</span>
              </div>
              <JournalMarkdownEditor onChange={handleJournalMarkdownChange} value={journalMarkdown} />
            </div>
          </motion.article>
        )}
      </section>
    </>
  )
}

export default MarkdownPreviewPage
