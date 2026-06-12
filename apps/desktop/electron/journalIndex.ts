import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  getThemeLabel,
  parseJournalMarkdown,
  type DayFrontMatter,
  type JournalIndexEntry,
  type JournalIndexFile,
} from '@journal/core'

export async function listJournalIndex(journalDirectory: string): Promise<JournalIndexEntry[]> {
  const journalFiles = await collectJournalMarkdownFiles(journalDirectory)
  const entries = await Promise.all(
    journalFiles.map(async ({ date, fileName, filePath }) => {
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

  const indexEntries = entries
    .filter((entry): entry is JournalIndexEntry => entry !== null)
    .sort((left, right) => right.date.localeCompare(left.date))

  await writeJournalIndexFile(journalDirectory, indexEntries)

  return indexEntries
}

async function collectJournalMarkdownFiles(journalDirectory: string) {
  return collectNestedJournalMarkdownFiles(
    path.join(journalDirectory, 'entries'),
    journalDirectory,
  )
}

async function collectNestedJournalMarkdownFiles(directory: string, journalDirectory: string) {
  const dirents = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return []
    }

    throw error
  })
  const files: Array<{
    date: string
    fileName: string
    filePath: string
  }> = []

  for (const dirent of dirents) {
    const filePath = path.join(directory, dirent.name)

    if (dirent.isDirectory()) {
      files.push(...await collectNestedJournalMarkdownFiles(filePath, journalDirectory))
      continue
    }

    if (!dirent.isFile() || !/^\d{4}-\d{2}-\d{2}\.md$/.test(dirent.name)) {
      continue
    }

    files.push({
      date: dirent.name.slice(0, -3),
      fileName: path.relative(journalDirectory, filePath),
      filePath,
    })
  }

  return files
}

function getJournalIndexPath(journalDirectory: string) {
  const directory = path.join(journalDirectory, 'index')

  return {
    directory,
    filePath: path.join(directory, 'journal-index.json'),
  }
}

async function writeJournalIndexFile(journalDirectory: string, entries: JournalIndexEntry[]) {
  const { directory, filePath } = getJournalIndexPath(journalDirectory)
  const indexFile: JournalIndexFile = {
    entries,
    generatedAt: new Date().toISOString(),
    version: 1,
  }

  await mkdir(directory, { recursive: true })
  await writeFile(filePath, `${JSON.stringify(indexFile, null, 2)}\n`, 'utf8')
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
    excerpt: murmur.body,
    id: murmur.id,
    imageCount: murmur.images.length,
    themes: murmur.themes,
    time: murmur.time,
  }))
  const images = parsedEntry.murmurs.flatMap((murmur) =>
    murmur.images.map((image) => ({
      caption: image.caption,
      id: image.id,
      location: image.location,
      murmurId: murmur.id,
      src: image.src,
      tags: image.tags,
    })),
  )
  const searchableText = buildSearchableText(frontMatter, parsedEntry.longEntryMarkdown, parsedEntry.murmurs)

  return {
    collections,
    date,
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
    longEntryMarkdown,
    ...murmurs.flatMap((murmur) => [
      murmur.body,
      ...murmur.themes.map(getThemeLabel),
      ...murmur.images.flatMap((image) => [image.caption, image.location?.name, ...image.tags]),
    ]),
    frontMatter.title,
    ...normalizeStringArray(frontMatter.tags),
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
