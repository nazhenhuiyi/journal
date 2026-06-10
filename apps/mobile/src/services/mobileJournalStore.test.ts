import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  importMobileJournalImagesForDate,
  listDailyJournals,
  loadDailyJournal,
  saveDailyJournal,
} from './mobileJournalStore'

const mockFileSystem = vi.hoisted(() => ({
  copyAsync: vi.fn(),
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
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', '')
    vi.clearAllMocks()
    mockFileSystem.directories.clear()
    mockFileSystem.files.clear()
    mockFileSystem.copyAsync.mockImplementation(async ({ from, to }: { from: string; to: string }) => {
      const content = mockFileSystem.files.get(from)

      if (content === undefined) {
        throw new Error(`Missing test file: ${from}`)
      }

      mockFileSystem.files.set(to, content)
    })
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

  afterEach(() => {
    vi.unstubAllEnvs()
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

  it('copies imported images into the mobile worktree media directory', async () => {
    mockFileSystem.files.set('file:///picker/source.jpg', 'image-bytes')

    const importedImages = await importMobileJournalImagesForDate(
      '2026-06-08',
      [
        {
          exif: {
            GPSLatitude: 39.992,
            GPSLongitude: 116.277,
          },
          fileName: 'source.JPG',
          mimeType: 'image/jpeg',
          type: 'image',
          uri: 'file:///picker/source.jpg',
        },
      ],
      new Date(2026, 5, 8, 21, 38, 0),
    )

    expect(importedImages).toEqual([
      {
        id: 'img_20260608_213800',
        src: 'media/2026/06/img_20260608_213800.jpg',
        fileName: 'img_20260608_213800.jpg',
        filePath: 'file:///app/journal-worktree/media/2026/06/img_20260608_213800.jpg',
        repositoryPath: 'media/2026/06/img_20260608_213800.jpg',
        location: {
          latitude: 39.992,
          longitude: 116.277,
          source: 'exif',
        },
      },
    ])
    expect(mockFileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
      'file:///app/journal-worktree/media/2026/06/',
      { intermediates: true },
    )
    expect(mockFileSystem.files.get('file:///app/journal-worktree/media/2026/06/img_20260608_213800.jpg'))
      .toBe('image-bytes')
  })

  it('skips invalid image picker assets and avoids existing media file names', async () => {
    mockFileSystem.files.set('file:///picker/first.png', 'first')
    mockFileSystem.files.set('file:///picker/video.mov', 'video')
    mockFileSystem.files.set(
      'file:///app/journal-worktree/media/2026/06/img_20260608_213800.png',
      'existing',
    )

    const importedImages = await importMobileJournalImagesForDate(
      '2026-06-08',
      [
        { fileName: 'video.mov', mimeType: 'video/quicktime', type: 'video', uri: 'file:///picker/video.mov' },
        { fileName: 'missing.jpg', type: 'image', uri: '' },
        { fileName: null, mimeType: 'image/png', type: 'image', uri: 'file:///picker/first.png' },
      ],
      new Date(2026, 5, 8, 21, 38, 0),
    )

    expect(importedImages).toHaveLength(1)
    expect(importedImages[0]).toMatchObject({
      fileName: 'img_20260608_213800_2.png',
      id: 'img_20260608_213800_2',
      repositoryPath: 'media/2026/06/img_20260608_213800_2.png',
    })
    expect(mockFileSystem.copyAsync).toHaveBeenCalledOnce()
  })

  it('creates unique image ids for same-timestamp multi-select assets', async () => {
    mockFileSystem.files.set('file:///picker/first.heic', 'first')
    mockFileSystem.files.set('file:///picker/second.jpeg', 'second')

    const importedImages = await importMobileJournalImagesForDate(
      '2026-06-08',
      [
        { fileName: 'first.HEIC', mimeType: 'image/heic', type: 'image', uri: 'file:///picker/first.heic' },
        { fileName: 'second.jpeg', mimeType: 'image/jpeg', type: 'image', uri: 'file:///picker/second.jpeg' },
      ],
      new Date(2026, 5, 8, 21, 38, 0),
    )

    expect(importedImages.map((image) => image.id)).toEqual([
      'img_20260608_213800',
      'img_20260608_213800_2',
    ])
    expect(importedImages.map((image) => image.repositoryPath)).toEqual([
      'media/2026/06/img_20260608_213800.heic',
      'media/2026/06/img_20260608_213800.jpeg',
    ])
  })

  it('includes imported media paths when saving an image murmur', async () => {
    const savedRecord = await saveDailyJournal({
      additionalChangedPaths: ['media/2026/06/img_20260608_213800.jpg'],
      date: '2026-06-08',
      longEntryMarkdown: '',
      murmurs: [
        {
          id: 'm_20260608_213800',
          time: '2026-06-08T21:38:00.000Z',
          body: '',
          images: [
            {
              id: 'img_20260608_213800',
              src: 'media/2026/06/img_20260608_213800.jpg',
              caption: '雨窗',
              tags: [],
            },
          ],
        },
      ],
    })

    expect(savedRecord.didWrite).toBe(true)
    expect(savedRecord.changedPaths).toEqual([
      'entries/2026/06/2026-06-08.md',
      'media/2026/06/img_20260608_213800.jpg',
    ])
    expect(mockFileSystem.files.get(entryPath)).toContain('caption: 雨窗')
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
