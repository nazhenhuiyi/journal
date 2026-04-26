import type { MouseEvent, ReactNode, RefObject } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { panelTransition } from './constants'
import type { AnnotationOverlayRect } from './types'

type MarkdownPreviewArticleProps = {
  activeAnnotationId: string
  activeOverlayRects: AnnotationOverlayRect[]
  onPreviewClick: (event: MouseEvent<HTMLDivElement>) => void
  previewRef: RefObject<HTMLDivElement | null>
  renderedMarkdown: ReactNode
}

function MarkdownPreviewArticle({
  activeAnnotationId,
  activeOverlayRects,
  onPreviewClick,
  previewRef,
  renderedMarkdown,
}: MarkdownPreviewArticleProps) {
  return (
    <motion.article
      animate={{ opacity: 1, x: 0 }}
      className="min-h-0 overflow-y-auto px-10 py-6"
      initial={{ opacity: 0, x: -14 }}
      transition={{ ...panelTransition, delay: 0.1 }}
    >
      <div
        ref={previewRef}
        className="markdown-preview mx-auto max-w-3xl"
        onClick={onPreviewClick}
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
  )
}

export default MarkdownPreviewArticle
