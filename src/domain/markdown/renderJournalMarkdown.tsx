import type { ReactNode } from 'react'
import { Fragment } from 'react'
import matter from 'gray-matter'
import rehypeReact from 'rehype-react'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import * as runtime from 'react/jsx-runtime'
import { unified } from 'unified'
import { rehypeAnnotationAttributes } from './plugins/rehypeAnnotationAttributes'
import { remarkJournalDirectives } from './plugins/remarkJournalDirectives'
import type { RenderJournalMarkdownOptions } from './types'

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'figure'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...(defaultSchema.attributes?.['*'] ?? []),
      ['className', 'journal-murmur', 'journal-image'],
      'dataJournalDirective',
    ],
    figure: [
      ...(defaultSchema.attributes?.figure ?? []),
      ['className', 'journal-murmur', 'journal-image'],
      'dataJournalDirective',
    ],
    section: [
      ...(defaultSchema.attributes?.section ?? []),
      ['className', 'journal-murmur', 'journal-image'],
      'dataJournalDirective',
    ],
  },
}

export function renderJournalMarkdown({
  markdown,
  annotations = [],
}: RenderJournalMarkdownOptions): ReactNode {
  const content = stripFrontMatter(markdown)
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkJournalDirectives)
    .use(remarkRehype)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeAnnotationAttributes, { annotations })
    .use(rehypeReact, {
      Fragment,
      jsx: runtime.jsx,
      jsxs: runtime.jsxs,
      elementAttributeNameCase: 'react',
      stylePropertyNameCase: 'dom',
    })
    .processSync(content)

  return file.result as ReactNode
}

function stripFrontMatter(markdown: string): string {
  try {
    return matter(markdown).content
  } catch {
    return markdown
  }
}
