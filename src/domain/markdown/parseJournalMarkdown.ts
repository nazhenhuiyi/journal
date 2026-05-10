import type {
  DayFrontMatter,
  ImageBlock,
  ImageLocation,
  MarkdownDiagnostic,
  MurmurBlock,
  ParsedJournalEntry,
} from './types'

const murmurStartPattern = /^:::murmur\s*$/m
const frontMatterFence = '---'

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
  if (!markdown.startsWith(`${frontMatterFence}\n`) && !markdown.startsWith(`${frontMatterFence}\r\n`)) {
    return {
      frontMatter: {},
      content: markdown,
    }
  }

  const lines = markdown.split(/\r?\n/)
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === frontMatterFence)

  if (closingIndex === -1) {
    diagnostics.push({
      severity: 'error',
      message: 'Front Matter 缺少结束标记 ---。',
      line: 1,
      column: 1,
    })

    return {
      frontMatter: {},
      content: markdown,
    }
  }

  const frontMatterLines = lines.slice(1, closingIndex)
  const previousDiagnosticCount = diagnostics.length
  const frontMatter = parseFrontMatterFields(frontMatterLines, diagnostics)

  return {
    frontMatter: diagnostics.length > previousDiagnosticCount ? {} : frontMatter,
    content: lines.slice(closingIndex + 1).join('\n').replace(/^\n/, ''),
  }
}

function parseFrontMatterFields(
  lines: string[],
  diagnostics: MarkdownDiagnostic[],
): DayFrontMatter {
  const frontMatter: DayFrontMatter = {}
  let currentObjectKey: string | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (!line.trim()) {
      continue
    }

    const nestedMatch = /^ {2}([A-Za-z][\w-]*):\s*(.*)$/.exec(line)

    if (nestedMatch && currentObjectKey) {
      const currentObject = frontMatter[currentObjectKey]

      if (isRecord(currentObject)) {
        currentObject[nestedMatch[1]] = parseFrontMatterValue(nestedMatch[2], diagnostics, index + 2)
      }

      continue
    }

    const topLevelMatch = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)

    if (!topLevelMatch) {
      diagnostics.push({
        severity: 'error',
        message: `Front Matter 无法解析第 ${index + 2} 行。`,
        line: index + 2,
        column: 1,
      })
      continue
    }

    const [, key, rawValue] = topLevelMatch

    if (!rawValue.trim()) {
      frontMatter[key] = {}
      currentObjectKey = key
    } else {
      frontMatter[key] = parseFrontMatterValue(rawValue, diagnostics, index + 2)
      currentObjectKey = null
    }
  }

  return frontMatter
}

function parseFrontMatterValue(
  rawValue: string,
  diagnostics: MarkdownDiagnostic[],
  line: number,
): string | number | boolean | string[] {
  const value = stripWrappingQuotes(rawValue.trim())

  if (value.startsWith('[') && !value.endsWith(']')) {
    diagnostics.push({
      severity: 'error',
      message: `Front Matter 第 ${line} 行数组语法不完整。`,
      line,
      column: 1,
    })
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    return parseTags(value)
  }

  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value)
  }

  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

  const image: ImageBlock = {
    id: metadata.id ?? '',
    src: metadata.src ?? '',
    caption: metadata.caption,
    tags: parseTags(metadata.tags),
  }
  const location = parseImageLocation(metadata)

  if (location) {
    image.location = location
  }

  return image
}

function parseImageLocation(metadata: Record<string, string>): ImageLocation | undefined {
  const name = metadata.location || metadata.locationName
  const latitude = parseFiniteCoordinate(metadata.latitude)
  const longitude = parseFiniteCoordinate(metadata.longitude)
  const source = parseImageLocationSource(metadata.locationSource || metadata['location-source'])

  if (!name && latitude === undefined && longitude === undefined && !source) {
    return undefined
  }

  return {
    latitude,
    longitude,
    name: name || undefined,
    source,
  }
}

function parseFiniteCoordinate(value: string | undefined) {
  if (!value) {
    return undefined
  }

  const coordinate = Number(value)

  return Number.isFinite(coordinate) ? coordinate : undefined
}

function parseImageLocationSource(value: string | undefined) {
  return value === 'exif' || value === 'manual' || value === 'system' ? value : undefined
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

export function stripJournalFrontMatter(markdown: string): string {
  return parseFrontMatter(markdown, []).content
}
