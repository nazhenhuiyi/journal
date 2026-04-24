import matter from 'gray-matter'
import type {
  DayFrontMatter,
  ImageBlock,
  MarkdownDiagnostic,
  MurmurBlock,
  ParsedJournalEntry,
} from './types'

const murmurStartPattern = /^:::murmur\s*$/m

export function parseJournalMarkdown(markdown: string): ParsedJournalEntry {
  const diagnostics: MarkdownDiagnostic[] = []
  const parsed = parseFrontMatter(markdown, diagnostics)
  const firstMurmurMatch = murmurStartPattern.exec(parsed.content)

  return {
    frontMatter: parsed.frontMatter,
    longEntryMarkdown: firstMurmurMatch
      ? parsed.content.slice(0, firstMurmurMatch.index).trimEnd()
      : parsed.content.trimEnd(),
    murmurs: parseMurmurs(parsed.content, diagnostics),
    diagnostics,
  }
}

function parseFrontMatter(
  markdown: string,
  diagnostics: MarkdownDiagnostic[],
): { frontMatter: DayFrontMatter; content: string } {
  try {
    const parsed = matter(markdown)

    return {
      frontMatter: normalizeFrontMatter(parsed.data as DayFrontMatter),
      content: parsed.content,
    }
  } catch (error) {
    diagnostics.push({
      severity: 'error',
      message: `Front Matter 解析失败：${getErrorMessage(error)}`,
    })

    return {
      frontMatter: {},
      content: markdown,
    }
  }
}

function normalizeFrontMatter(frontMatter: DayFrontMatter): DayFrontMatter {
  return Object.fromEntries(
    Object.entries(frontMatter).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString().slice(0, 10) : value,
    ]),
  ) as DayFrontMatter
}

function parseMurmurs(content: string, diagnostics: MarkdownDiagnostic[]): MurmurBlock[] {
  const lines = content.split(/\r?\n/)
  const murmurs: MurmurBlock[] = []

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== ':::murmur') {
      continue
    }

    const startLine = index + 1
    const endIndex = findClosingLine(lines, index + 1, ':::')
    const blockEndIndex = endIndex === -1 ? lines.length : endIndex

    if (endIndex === -1) {
      diagnostics.push({
        severity: 'error',
        message: '碎碎念 block 缺少结束标记 :::。',
        line: startLine,
        column: 1,
      })
    }

    const blockLines = lines.slice(index + 1, blockEndIndex)
    murmurs.push(parseMurmurBlock(blockLines, startLine + 1, diagnostics))
    index = blockEndIndex
  }

  return murmurs
}

function parseMurmurBlock(
  blockLines: string[],
  firstContentLine: number,
  diagnostics: MarkdownDiagnostic[],
): MurmurBlock {
  const separatorIndex = blockLines.findIndex((line) => line.trim() === '---')
  const metadataLines = separatorIndex === -1 ? blockLines : blockLines.slice(0, separatorIndex)
  const bodyLines = separatorIndex === -1 ? [] : blockLines.slice(separatorIndex + 1)
  const metadata = parseFlatMetadata(metadataLines)
  const extracted = extractImages(bodyLines, firstContentLine + separatorIndex + 1, diagnostics)

  if (!metadata.id) {
    diagnostics.push({
      severity: 'warning',
      message: '碎碎念缺少 id 字段。',
      line: firstContentLine,
      column: 1,
    })
  }

  if (!metadata.time) {
    diagnostics.push({
      severity: 'warning',
      message: '碎碎念缺少 time 字段。',
      line: firstContentLine,
      column: 1,
    })
  }

  return {
    id: metadata.id ?? '',
    time: metadata.time ?? '',
    body: extracted.body,
    images: extracted.images,
  }
}

function extractImages(
  bodyLines: string[],
  firstBodyLine: number,
  diagnostics: MarkdownDiagnostic[],
): { body: string; images: ImageBlock[] } {
  const remainingBodyLines: string[] = []
  const images: ImageBlock[] = []

  for (let index = 0; index < bodyLines.length; index += 1) {
    if (bodyLines[index].trim() !== '::image') {
      remainingBodyLines.push(bodyLines[index])
      continue
    }

    const imageStartLine = firstBodyLine + index
    const endIndex = findClosingLine(bodyLines, index + 1, '::')
    const blockEndIndex = endIndex === -1 ? bodyLines.length : endIndex

    if (endIndex === -1) {
      diagnostics.push({
        severity: 'error',
        message: '图片 block 缺少结束标记 ::。',
        line: imageStartLine,
        column: 1,
      })
    }

    images.push(parseImageBlock(bodyLines.slice(index + 1, blockEndIndex), imageStartLine, diagnostics))
    index = blockEndIndex
  }

  return {
    body: remainingBodyLines.join('\n').trim(),
    images,
  }
}

function parseImageBlock(
  metadataLines: string[],
  startLine: number,
  diagnostics: MarkdownDiagnostic[],
): ImageBlock {
  const metadata = parseFlatMetadata(metadataLines)

  if (!metadata.id) {
    diagnostics.push({
      severity: 'warning',
      message: '图片 block 缺少 id 字段。',
      line: startLine,
      column: 1,
    })
  }

  if (!metadata.src) {
    diagnostics.push({
      severity: 'warning',
      message: '图片 block 缺少 src 字段。',
      line: startLine,
      column: 1,
    })
  }

  return {
    id: metadata.id ?? '',
    src: metadata.src ?? '',
    caption: metadata.caption,
    tags: parseTags(metadata.tags),
  }
}

function parseFlatMetadata(lines: string[]): Record<string, string> {
  const metadata: Record<string, string> = {}

  for (const line of lines) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim())

    if (!match) {
      continue
    }

    metadata[match[1]] = stripWrappingQuotes(match[2].trim())
  }

  return metadata
}

function parseTags(value: string | undefined): string[] {
  if (!value) {
    return []
  }

  const trimmed = value.trim()

  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return [stripWrappingQuotes(trimmed)].filter(Boolean)
  }

  return trimmed
    .slice(1, -1)
    .split(',')
    .map((tag) => stripWrappingQuotes(tag.trim()))
    .filter(Boolean)
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function findClosingLine(lines: string[], startIndex: number, marker: string): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index].trim() === marker) {
      return index
    }
  }

  return -1
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
