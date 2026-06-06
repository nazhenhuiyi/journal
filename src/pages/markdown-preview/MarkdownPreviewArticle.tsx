import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { panelTransition } from './constants'

type MarkdownPreviewArticleProps = {
  renderedMarkdown: ReactNode
}

function MarkdownPreviewArticle({
  renderedMarkdown,
}: MarkdownPreviewArticleProps) {
  return (
    <motion.article
      animate={{ opacity: 1, x: 0 }}
      className="min-h-0 overflow-y-auto px-10 py-6"
      initial={{ opacity: 0, x: -14 }}
      transition={{ ...panelTransition, delay: 0.1 }}
    >
      <div className="markdown-preview mx-auto max-w-3xl">
        {renderedMarkdown}
      </div>
    </motion.article>
  )
}

export default MarkdownPreviewArticle
