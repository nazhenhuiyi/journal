import * as FileSystem from 'expo-file-system/legacy'
import {
  createJournalMarkdownWithFrontMatter,
  hasMeaningfulJournalChange,
  parseJournalMarkdown,
  serializeJournalMarkdownBody,
  type DayFrontMatter,
  type MurmurBlock,
} from '@journal/core'

export type MobileJournalRecord = {
  date: string
  longEntryMarkdown: string
  murmurs: MurmurBlock[]
  markdown: string
  updatedAt: string | null
}

export type SaveDailyJournalResult = MobileJournalRecord & {
  changedPaths: string[]
  didWrite: boolean
}

type SaveJournalInput = {
  date: string
  longEntryMarkdown: string
  murmurs: MurmurBlock[]
}

const worktreeDirectoryName = 'journal-worktree'

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function createMurmur(date: string, body: string, now = new Date()): MurmurBlock {
  const timestamp = now.toISOString()

  return {
    id: createMurmurId(date, now),
    time: timestamp,
    body: body.trim(),
    images: [],
  }
}

export async function loadDailyJournal(date: string): Promise<MobileJournalRecord> {
  const filePath = await getEntryFilePath(date)
  const fileInfo = await FileSystem.getInfoAsync(filePath)

  if (!fileInfo.exists) {
    return {
      date,
      longEntryMarkdown: '',
      murmurs: [],
      markdown: '',
      updatedAt: null,
    }
  }

  const markdown = await FileSystem.readAsStringAsync(filePath)
  const parsed = parseJournalMarkdown(markdown)

  return {
    date,
    longEntryMarkdown: parsed.longEntryMarkdown,
    murmurs: parsed.murmurs,
    markdown,
    updatedAt: parsed.frontMatter.updatedAt ?? null,
  }
}

export async function listDailyJournals(): Promise<MobileJournalRecord[]> {
  const entriesDirectory = `${getJournalWorktreeDirectory()}entries/`
  const years = await readDirectoryIfExists(entriesDirectory)
  const records: MobileJournalRecord[] = []

  for (const year of years.filter(isYearDirectoryName)) {
    const yearDirectory = `${entriesDirectory}${year}/`
    const months = await readDirectoryIfExists(yearDirectory)

    for (const month of months.filter(isMonthDirectoryName)) {
      const monthDirectory = `${yearDirectory}${month}/`
      const fileNames = await readDirectoryIfExists(monthDirectory)

      for (const fileName of fileNames.filter(isDailyJournalFileName)) {
        const filePath = `${monthDirectory}${fileName}`
        const markdown = await FileSystem.readAsStringAsync(filePath)
        const parsed = parseJournalMarkdown(markdown)
        const date = fileName.slice(0, -'.md'.length)

        records.push({
          date,
          longEntryMarkdown: parsed.longEntryMarkdown,
          markdown,
          murmurs: parsed.murmurs,
          updatedAt: parsed.frontMatter.updatedAt ?? null,
        })
      }
    }
  }

  return records.sort((first, second) => second.date.localeCompare(first.date))
}

export async function saveDailyJournal(input: SaveJournalInput): Promise<SaveDailyJournalResult> {
  const existingRecord = await loadDailyJournal(input.date)
  const previous = existingRecord.markdown
    ? parseJournalMarkdown(existingRecord.markdown).frontMatter
    : {}
  const updatedAt = new Date().toISOString()
  const frontMatter: DayFrontMatter = {
    ...previous,
    date: input.date,
    createdAt: previous.createdAt ?? updatedAt,
    updatedAt,
  }
  const body = serializeJournalMarkdownBody(input.longEntryMarkdown, input.murmurs)
  const markdown = createJournalMarkdownWithFrontMatter(body, frontMatter)

  if (!hasMeaningfulJournalChange(existingRecord.markdown, markdown)) {
    return {
      ...existingRecord,
      changedPaths: [],
      didWrite: false,
    }
  }

  const filePath = await getEntryFilePath(input.date)

  await FileSystem.writeAsStringAsync(filePath, markdown)

  const parsed = parseJournalMarkdown(markdown)

  return {
    date: input.date,
    longEntryMarkdown: parsed.longEntryMarkdown,
    murmurs: parsed.murmurs,
    markdown,
    updatedAt,
    changedPaths: [getEntryRepositoryPath(input.date)],
    didWrite: true,
  }
}

export function getEntryRepositoryPath(date: string) {
  const [year, month] = date.split('-')

  return `entries/${year}/${month}/${date}.md`
}

async function getEntryFilePath(date: string) {
  const [year, month] = date.split('-')
  const entriesDirectory = `${getJournalWorktreeDirectory()}entries/${year}/${month}/`

  await FileSystem.makeDirectoryAsync(entriesDirectory, { intermediates: true })

  return `${entriesDirectory}${date}.md`
}

export async function ensureJournalWorktreeDirectory() {
  const worktreeDirectory = getJournalWorktreeDirectory()

  await FileSystem.makeDirectoryAsync(worktreeDirectory, { intermediates: true })

  return worktreeDirectory
}

export function getJournalWorktreeDirectory() {
  if (!FileSystem.documentDirectory) {
    throw new Error('File system document directory is unavailable.')
  }

  return `${FileSystem.documentDirectory}${worktreeDirectoryName}/`
}

async function readDirectoryIfExists(path: string) {
  const info = await FileSystem.getInfoAsync(path)

  if (!info.exists || !info.isDirectory) {
    return []
  }

  return FileSystem.readDirectoryAsync(path)
}

function isYearDirectoryName(value: string) {
  return /^\d{4}$/.test(value)
}

function isMonthDirectoryName(value: string) {
  return /^\d{2}$/.test(value)
}

function isDailyJournalFileName(value: string) {
  return /^\d{4}-\d{2}-\d{2}\.md$/.test(value)
}

function createMurmurId(date: string, now: Date) {
  const compactDate = date.replaceAll('-', '')
  const time = [
    `${now.getHours()}`.padStart(2, '0'),
    `${now.getMinutes()}`.padStart(2, '0'),
    `${now.getSeconds()}`.padStart(2, '0'),
    `${now.getMilliseconds()}`.padStart(3, '0'),
  ].join('')
  const suffix = Math.random().toString(36).slice(2, 8)

  return `m_${compactDate}_${time}_${suffix}`
}
