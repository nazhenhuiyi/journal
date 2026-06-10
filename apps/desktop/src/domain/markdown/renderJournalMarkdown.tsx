import type { ReactNode } from 'react'
import { Fragment } from 'react'
import rehypeReact from 'rehype-react'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import * as runtime from 'react/jsx-runtime'
import { unified } from 'unified'
import { parseJournalMarkdown, stripJournalFrontMatter } from '@journal/core'
import { rehypeAnnotationAttributes } from './plugins/rehypeAnnotationAttributes'
import { rehypeMurmurTimestamps } from './plugins/rehypeMurmurTimestamps'
import { remarkJournalDirectives } from './plugins/remarkJournalDirectives'
import type { ImageBlock, MurmurBlock } from '@journal/core'
import type { RenderJournalMarkdownOptions } from './types'
import { resolveJournalMediaSrc } from '../journalMedia'

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'figure'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...(defaultSchema.attributes?.['*'] ?? []),
      [
        'className',
        'contains-task-list',
        'footnotes',
        'journal-annotated-block',
        'journal-image',
        'journal-murmur',
        'sr-only',
        'task-list-item',
      ],
      'dataJournalDirective',
      'dataFootnoteBackref',
      'dataFootnotes',
      'dataAnnotationIds',
      'dataMurmurLabel',
      'dataMurmurTime',
    ],
    figure: [
      ...(defaultSchema.attributes?.figure ?? []),
      ['className', 'journal-murmur', 'journal-image'],
      'dataJournalDirective',
      'dataMurmurLabel',
      'dataMurmurTime',
    ],
    section: [
      ...(defaultSchema.attributes?.section ?? []),
      ['className', 'journal-murmur', 'journal-image'],
      'dataJournalDirective',
      'dataMurmurLabel',
      'dataMurmurTime',
    ],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), 'journal-media'],
  },
}

export function renderJournalMarkdown({
  markdown,
  annotations = [],
  sourceFilePath,
}: RenderJournalMarkdownOptions): ReactNode {
  const parsedEntry = parseJournalMarkdown(markdown)
  const content = createRenderableJournalMarkdown(markdown, parsedEntry.murmurs, sourceFilePath)
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkJournalDirectives)
    .use(remarkRehype, {
      footnoteBackLabel: '返回正文',
      footnoteLabel: '脚注',
    })
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeMurmurTimestamps)
    .use(rehypeAnnotationAttributes, { annotations, markdown: parsedEntry.longEntryMarkdown })
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

function createRenderableJournalMarkdown(
  markdown: string,
  murmurs: MurmurBlock[],
  sourceFilePath: string | undefined,
) {
  if (murmurs.length === 0) {
    return stripJournalFrontMatter(markdown)
  }

  const { longEntryMarkdown } = parseJournalMarkdown(markdown)
  const renderableMurmurs = murmurs.map((murmur) => ({
    ...murmur,
    images: murmur.images.map((image) => ({
      ...image,
      src: resolveJournalImageSrc(image.src, sourceFilePath),
    })),
  }))

  return [longEntryMarkdown.trimEnd(), ...renderableMurmurs.map(serializeRenderableMurmur)]
    .filter((chunk) => chunk.trim())
    .join('\n\n')
}

function serializeRenderableMurmur(murmur: MurmurBlock) {
  const imageMarkdown = murmur.images.map(serializeRenderableImage).join('\n\n')
  const body = murmur.body.trim()

  return [
    `:::murmur{murmurTime="${escapeDirectiveAttribute(murmur.time)}" murmurLabel="${escapeDirectiveAttribute(formatMurmurTimestamp(murmur.time))}"}`,
    body,
    imageMarkdown,
    ':::',
  ].filter((line) => line.trim()).join('\n\n')
}

function formatMurmurTimestamp(time: string) {
  const date = new Date(time)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')

  return `${hours}:${minutes}`
}

function escapeDirectiveAttribute(value: string) {
  return value.replace(/[\\"]/g, (match) => `\\${match}`)
}

function serializeRenderableImage(image: ImageBlock) {
  const alt = image.caption?.trim() || '碎碎念图片'
  const caption = image.caption?.trim()
  const imageMarkdown = `![${escapeImageLabel(alt)}](${encodeImageUrl(image.src)})`

  if (!caption) {
    return imageMarkdown
  }

  return `${imageMarkdown}\n\n${caption}`
}

function resolveJournalImageSrc(src: string, sourceFilePath: string | undefined) {
  if (!sourceFilePath) {
    return src
  }

  return resolveJournalMediaSrc(src)
}

function encodeImageUrl(src: string) {
  return src.replace(/[()]/g, (match) => `%${match.charCodeAt(0).toString(16).toUpperCase()}`)
}

function escapeImageLabel(value: string) {
  return value.replace(/[[\]\\]/g, '\\$&')
}
