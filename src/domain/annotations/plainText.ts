import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

type MarkdownNode = {
  type: string
  value?: string
  position?: {
    start?: {
      offset?: number
    }
    end?: {
      offset?: number
    }
  }
  children?: MarkdownNode[]
}

export type PlainTextSnapshot = {
  text: string
  sourceOffsets: number[]
}

export function markdownToPlainText(markdown: string): string {
  return createPlainTextSnapshot(markdown).text
}

export function createPlainTextSnapshot(markdown: string): PlainTextSnapshot {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .parse(markdown) as MarkdownNode
  const chunks: string[] = []
  const sourceOffsets: number[] = []

  collectPlainText(tree, chunks, sourceOffsets)

  return {
    text: chunks.join(''),
    sourceOffsets,
  }
}

function collectPlainText(node: MarkdownNode, chunks: string[], sourceOffsets: number[]) {
  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') {
    appendTextNode(node, chunks, sourceOffsets)
    return
  }

  if (node.type === 'break') {
    chunks.push('\n')
    sourceOffsets.push(node.position?.start?.offset ?? -1)
    return
  }

  for (const child of node.children ?? []) {
    collectPlainText(child, chunks, sourceOffsets)
  }

  if (isBlockNode(node) && chunks.length > 0 && chunks[chunks.length - 1] !== '\n') {
    chunks.push('\n')
    sourceOffsets.push(node.position?.end?.offset ?? -1)
  }
}

function appendTextNode(node: MarkdownNode, chunks: string[], sourceOffsets: number[]) {
  const value = node.value ?? ''
  const startOffset = node.position?.start?.offset

  chunks.push(value)

  for (let index = 0; index < value.length; index += 1) {
    sourceOffsets.push(typeof startOffset === 'number' ? startOffset + index : -1)
  }
}

function isBlockNode(node: MarkdownNode): boolean {
  return [
    'blockquote',
    'code',
    'definition',
    'footnoteDefinition',
    'heading',
    'html',
    'list',
    'listItem',
    'paragraph',
    'table',
    'thematicBreak',
  ].includes(node.type)
}
