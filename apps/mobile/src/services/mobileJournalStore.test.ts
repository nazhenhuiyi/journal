import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadDailyJournal,
  saveDailyJournal,
} from './mobileJournalStore'

const mockFileSystem = vi.hoisted(() => ({
  documentDirectory: 'file:///app/',
  files: new Map<string, string>(),
  getInfoAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
}))

vi.mock('expo-file-system/legacy', () => mockFileSystem)

const entryPath = 'file:///app/journal-worktree/entries/2026/06/2026-06-08.md'

describe('mobileJournalStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFileSystem.files.clear()
    mockFileSystem.getInfoAsync.mockImplementation(async (path: string) => ({
      exists: mockFileSystem.files.has(path),
      isDirectory: false,
      modificationTime: 0,
      size: mockFileSystem.files.get(path)?.length ?? 0,
      uri: path,
    }))
    mockFileSystem.makeDirectoryAsync.mockResolvedValue(undefined)
    mockFileSystem.readAsStringAsync.mockImplementation(async (path: string) => {
      const content = mockFileSystem.files.get(path)

      if (content === undefined) {
        throw new Error(`Missing test file: ${path}`)
      }

      return content
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
    expect(savedRecord.updatedAt).toBe('2026-06-08T08:00:00.000Z')
    expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled()
    await expect(loadDailyJournal('2026-06-08')).resolves.toMatchObject({
      longEntryMarkdown: '今天写一点。',
      updatedAt: '2026-06-08T08:00:00.000Z',
    })
  })
})
