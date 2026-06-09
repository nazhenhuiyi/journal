import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listDailyJournals,
  loadDailyJournal,
  saveDailyJournal,
} from './mobileJournalStore'

const mockFileSystem = vi.hoisted(() => ({
  directories: new Set<string>(),
  documentDirectory: 'file:///app/',
  files: new Map<string, string>(),
  getInfoAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  readDirectoryAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
}))

vi.mock('expo-file-system/legacy', () => mockFileSystem)

const entryPath = 'file:///app/journal-worktree/entries/2026/06/2026-06-08.md'

describe('mobileJournalStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFileSystem.directories.clear()
    mockFileSystem.files.clear()
    mockFileSystem.getInfoAsync.mockImplementation(async (path: string) => {
      const directoryPath = normalizeDirectoryPath(path)
      const isDirectory = mockFileSystem.directories.has(directoryPath)
      const content = mockFileSystem.files.get(path)

      return {
        exists: isDirectory || content !== undefined,
        isDirectory,
        modificationTime: 0,
        size: content?.length ?? 0,
        uri: path,
      }
    })
    mockFileSystem.makeDirectoryAsync.mockImplementation(async (path: string) => {
      mockFileSystem.directories.add(normalizeDirectoryPath(path))
    })
    mockFileSystem.readAsStringAsync.mockImplementation(async (path: string) => {
      const content = mockFileSystem.files.get(path)

      if (content === undefined) {
        throw new Error(`Missing test file: ${path}`)
      }

      return content
    })
    mockFileSystem.readDirectoryAsync.mockImplementation(async (path: string) => {
      const directoryPath = normalizeDirectoryPath(path)
      const names = new Set<string>()

      for (const childPath of mockFileSystem.directories) {
        const childName = getDirectChildName(directoryPath, childPath)

        if (childName) {
          names.add(childName)
        }
      }

      for (const childPath of mockFileSystem.files.keys()) {
        const childName = getDirectChildName(directoryPath, childPath)

        if (childName) {
          names.add(childName)
        }
      }

      return [...names].sort()
    })
    mockFileSystem.writeAsStringAsync.mockImplementation(async (path: string, content: string) => {
      mockFileSystem.files.set(path, content)
    })
  })

  it('does not create a file for an empty save', async () => {
    const savedRecord = await saveDailyJournal({
      date: '2026-06-08',
      longEntryMarkdown: '',
      murmurs: [],
    })

    expect(savedRecord.changedPaths).toEqual([])
    expect(savedRecord.didWrite).toBe(false)
    expect(savedRecord.updatedAt).toBeNull()
    expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled()
  })

  it('writes the journal when meaningful content changes', async () => {
    const savedRecord = await saveDailyJournal({
      date: '2026-06-08',
      longEntryMarkdown: '今天写一点。',
      murmurs: [],
    })

    expect(savedRecord.didWrite).toBe(true)
    expect(savedRecord.changedPaths).toEqual(['entries/2026/06/2026-06-08.md'])
    expect(savedRecord.updatedAt).not.toBeNull()
    expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledOnce()
    expect(mockFileSystem.files.get(entryPath)).toContain('今天写一点。')
  })

  it('does not rewrite when only managed timestamps would change', async () => {
    const existingMarkdown = `---
date: 2026-06-08
createdAt: 2026-06-08T08:00:00.000Z
updatedAt: 2026-06-08T08:00:00.000Z
---

今天写一点。`

    mockFileSystem.files.set(entryPath, existingMarkdown)

    const savedRecord = await saveDailyJournal({
      date: '2026-06-08',
      longEntryMarkdown: '今天写一点。',
      murmurs: [],
    })

    expect(savedRecord.didWrite).toBe(false)
    expect(savedRecord.changedPaths).toEqual([])
    expect(savedRecord.updatedAt).toBe('2026-06-08T08:00:00.000Z')
    expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled()
    await expect(loadDailyJournal('2026-06-08')).resolves.toMatchObject({
      longEntryMarkdown: '今天写一点。',
      updatedAt: '2026-06-08T08:00:00.000Z',
    })
  })

  it('returns markdown diagnostics for malformed journal files', async () => {
    mockFileSystem.files.set(entryPath, `---
date: 2026-06-08

# 没有结束标记`)

    const record = await loadDailyJournal('2026-06-08')

    expect(record.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Front Matter 缺少结束标记 ---。',
          severity: 'error',
        }),
      ]),
    )
  })

  it('lists saved journal files in reverse chronological order', async () => {
    addDirectory('file:///app/journal-worktree/entries/')
    addDirectory('file:///app/journal-worktree/entries/2026/')
    addDirectory('file:///app/journal-worktree/entries/2026/05/')
    addDirectory('file:///app/journal-worktree/entries/2026/06/')
    mockFileSystem.files.set(
      'file:///app/journal-worktree/entries/2026/05/2026-05-31.md',
      `---
date: 2026-05-31
updatedAt: 2026-05-31T08:00:00.000Z
---

五月最后一天。`,
    )
    mockFileSystem.files.set(
      'file:///app/journal-worktree/entries/2026/06/2026-06-09.md',
      `---
date: 2026-06-08
updatedAt: 2026-06-09T08:00:00.000Z
---

六月九日。`,
    )
    mockFileSystem.files.set(
      'file:///app/journal-worktree/entries/2026/06/not-a-journal.txt',
      'ignored',
    )

    const records = await listDailyJournals()

    expect(records.map((record) => record.date)).toEqual([
      '2026-06-09',
      '2026-05-31',
    ])
    expect(records[0]).toMatchObject({
      longEntryMarkdown: '六月九日。',
      updatedAt: '2026-06-09T08:00:00.000Z',
    })
  })
})

function addDirectory(path: string) {
  mockFileSystem.directories.add(normalizeDirectoryPath(path))
}

function normalizeDirectoryPath(path: string) {
  return path.endsWith('/') ? path : `${path}/`
}

function getDirectChildName(parentPath: string, childPath: string) {
  if (childPath === parentPath || !childPath.startsWith(parentPath)) {
    return null
  }

  const relativePath = childPath.slice(parentPath.length).replace(/\/$/, '')

  if (!relativePath || relativePath.includes('/')) {
    return null
  }

  return relativePath
}
