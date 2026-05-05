import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseJournalMarkdown } from '../src/domain/markdown/parseJournalMarkdown'
import type { DayFrontMatter } from '../src/domain/markdown/types'
import type { JournalIndexEntry } from '../src/domain/journalIndex/types'

export async function listJournalIndex(journalDirectory: string): Promise<JournalIndexEntry[]> {
  const fileNames = await readdir(journalDirectory).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return []
    }

    throw error
  })
  const journalFileNames = fileNames.filter((fileName) => /^\d{4}-\d{2}-\d{2}\.md$/.test(fileName))
  const entries = await Promise.all(
    journalFileNames.map(async (fileName) => {
      const date = fileName.slice(0, -3)
      const filePath = path.join(journalDirectory, fileName)
      const content = await readFile(filePath, 'utf8').catch(() => null)

      if (!content) {
        return null
      }

      const parsedEntry = parseJournalMarkdown(content)

      if (!hasJournalContent(parsedEntry)) {
        return null
      }

      const fileStat = await stat(filePath).catch(() => null)

      return createJournalIndexEntry({
        content,
        date,
        fileName,
        filePath,
        updatedAt: fileStat?.mtime.toISOString() ?? null,
      })
    }),
  )

  return entries
    .filter((entry): entry is JournalIndexEntry => entry !== null)
    .sort((left, right) => right.date.localeCompare(left.date))
}

function createJournalIndexEntry({
  content,
  date,
  fileName,
  filePath,
  updatedAt,
}: {
  content: string
  date: string
  fileName: string
  filePath: string
  updatedAt: string | null
}): JournalIndexEntry {
  const parsedEntry = parseJournalMarkdown(content)
  const frontMatter = parsedEntry.frontMatter
  const tags = normalizeStringArray(frontMatter.tags)
  const collections = normalizeStringArray(frontMatter.collections)
  const murmurs = parsedEntry.murmurs.map((murmur) => ({
    excerpt: createExcerpt(murmur.body, 36),
    id: murmur.id,
    imageCount: murmur.images.length,
    time: murmur.time,
  }))
  const images = parsedEntry.murmurs.flatMap((murmur) =>
    murmur.images.map((image) => ({
      caption: image.caption,
      id: image.id,
      murmurId: murmur.id,
      src: image.src,
      tags: image.tags,
    })),
  )
  const searchableText = buildSearchableText(frontMatter, parsedEntry.longEntryMarkdown, parsedEntry.murmurs)

  return {
    collections,
    date,
    excerpt: normalizeOptionalString(frontMatter.excerpt),
    favorite: frontMatter.favorite === true,
    fileName,
    filePath,
    images,
    murmurs,
    searchableText,
    stats: {
      imageCount: images.length,
      murmurCount: parsedEntry.murmurs.length,
      wordCount: countWords([parsedEntry.longEntryMarkdown, ...parsedEntry.murmurs.map((murmur) => murmur.body)].join('\n')),
    },
    tags,
    title: normalizeOptionalString(frontMatter.title),
    updatedAt,
  }
}

function hasJournalContent(parsedEntry: ReturnType<typeof parseJournalMarkdown>) {
  return Boolean(
    parsedEntry.longEntryMarkdown.trim() ||
      parsedEntry.murmurs.some((murmur) => murmur.body.trim() || murmur.images.length > 0),
  )
}

function buildSearchableText(
  frontMatter: DayFrontMatter,
  longEntryMarkdown: string,
  murmurs: ReturnType<typeof parseJournalMarkdown>['murmurs'],
) {
  const chunks = [
    frontMatter.title,
    frontMatter.excerpt,
    ...normalizeStringArray(frontMatter.tags),
    longEntryMarkdown,
    ...murmurs.flatMap((murmur) => [
      murmur.body,
      ...murmur.images.flatMap((image) => [image.caption, ...image.tags]),
    ]),
  ]

  return chunks
    .filter((chunk): chunk is string => typeof chunk === 'string' && chunk.trim().length > 0)
    .map((chunk) => normalizeWhitespace(stripMarkdownSyntax(chunk)))
    .filter(Boolean)
    .join('\n')
}

function countWords(text: string) {
  return stripMarkdownSyntax(text).match(/[\u4e00-\u9fff]|[A-Za-z0-9]+/g)?.length ?? 0
}

function createExcerpt(text: string, maxLength: number) {
  const excerpt = normalizeWhitespace(stripMarkdownSyntax(text))

  if (excerpt.length <= maxLength) {
    return excerpt
  }

  return `${excerpt.slice(0, maxLength).trimEnd()}...`
}

function stripMarkdownSyntax(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~-]+/g, ' ')
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : []
}
