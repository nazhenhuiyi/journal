import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMurmur,
  getReviewRepositoryPath,
  getDailyJournalFileUri,
  importMobileJournalImagesForDate,
  listDailyJournals,
  loadDailyJournal,
  loadDailyReview,
  loadOrCreateDailyReview,
  saveDailyJournal,
  updateDailyJournalFrontMatter,
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
const mockImageManipulator = vi.hoisted(() => ({
  manipulateAsync: vi.fn(),
  SaveFormat: {
    JPEG: 'jpeg',
    PNG: 'png',
    WEBP: 'webp',
  },
}))

vi.mock('expo-file-system/legacy', () => mockFileSystem)
vi.mock('expo-image-manipulator', () => mockImageManipulator)

const entryPath = 'file:///app/journal-worktree/entries/2026/06/2026-06-08.md'
const reviewPath = 'file:///app/journal-worktree/reviews/2026/06/2026-06-10.json'

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
    mockImageManipulator.manipulateAsync.mockImplementation(async (uri: string) => {
      const content = mockFileSystem.files.get(uri)

      if (content === undefined) {
        throw new Error(`Missing test file: ${uri}`)
      }

      const resultUri = `${uri}.optimized.webp`

      mockFileSystem.files.set(resultUri, `webp:${content}`)

      return {
        height: 900,
        uri: resultUri,
        width: 1200,
      }
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

  it('reports the mobile journal file URI for diagnostics', () => {
    expect(getDailyJournalFileUri('2026-06-08')).toBe(entryPath)
  })

  it('creates themed text murmurs', () => {
    const murmur = createMurmur('2026-06-08', '傍晚的云有一点发紫。', {
      now: new Date(2026, 5, 8, 18, 30, 0),
      themes: ['sky-now', 'sky-now', 'light-shadow'],
    })

    expect(murmur).toMatchObject({
      body: '傍晚的云有一点发紫。',
      themes: ['sky-now', 'light-shadow'],
    })
  })

  it('compresses imported images into the mobile worktree media directory as WebP', async () => {
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
          height: 3024,
          mimeType: 'image/jpeg',
          type: 'image',
          uri: 'file:///picker/source.jpg',
          width: 4032,
        },
      ],
      new Date(2026, 5, 8, 21, 38, 0),
    )

    expect(importedImages).toEqual([
      {
        id: 'img_20260608_213800',
        src: 'media/2026/06/img_20260608_213800.webp',
        fileName: 'img_20260608_213800.webp',
        filePath: 'file:///app/journal-worktree/media/2026/06/img_20260608_213800.webp',
        repositoryPath: 'media/2026/06/img_20260608_213800.webp',
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
    expect(mockImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///picker/source.jpg',
      [{ resize: { width: 2560 } }],
      {
        compress: 0.85,
        format: 'webp',
      },
    )
    expect(mockFileSystem.files.get('file:///app/journal-worktree/media/2026/06/img_20260608_213800.webp'))
      .toBe('webp:image-bytes')
  })

  it('falls back to copying the original image when mobile WebP compression fails', async () => {
    mockFileSystem.files.set('file:///picker/source.jpg', 'image-bytes')
    mockImageManipulator.manipulateAsync.mockRejectedValueOnce(new Error('unsupported source image'))

    const importedImages = await importMobileJournalImagesForDate(
      '2026-06-08',
      [
        {
          fileName: 'source.JPG',
          mimeType: 'image/jpeg',
          type: 'image',
          uri: 'file:///picker/source.jpg',
        },
      ],
      new Date(2026, 5, 8, 21, 38, 0),
    )

    expect(importedImages[0]).toMatchObject({
      fileName: 'img_20260608_213800.jpg',
      repositoryPath: 'media/2026/06/img_20260608_213800.jpg',
    })
    expect(mockFileSystem.files.get('file:///app/journal-worktree/media/2026/06/img_20260608_213800.jpg'))
      .toBe('image-bytes')
  })

  it('skips invalid image picker assets and avoids existing media file names', async () => {
    mockFileSystem.files.set('file:///picker/first.png', 'first')
    mockFileSystem.files.set('file:///picker/video.mov', 'video')
    mockFileSystem.files.set(
      'file:///app/journal-worktree/media/2026/06/img_20260608_213800.webp',
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
      fileName: 'img_20260608_213800_2.webp',
      id: 'img_20260608_213800_2',
      repositoryPath: 'media/2026/06/img_20260608_213800_2.webp',
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
      'media/2026/06/img_20260608_213800.webp',
      'media/2026/06/img_20260608_213800_2.webp',
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
          themes: ['quick-photo'],
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
    expect(mockFileSystem.files.get(entryPath)).toContain('themes: [quick-photo]')
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

  it('loads parsed front matter for mobile records', async () => {
    mockFileSystem.files.set(entryPath, `---
date: 2026-06-08
weather:
  text: 小雨
  temperature: 18
---

今天写一点。`)

    await expect(loadDailyJournal('2026-06-08')).resolves.toMatchObject({
      frontMatter: {
        date: '2026-06-08',
        weather: {
          text: '小雨',
          temperature: 18,
        },
      },
      longEntryMarkdown: '今天写一点。',
    })
  })

  it('updates weather front matter without changing journal content', async () => {
    mockFileSystem.files.set(entryPath, `---
date: 2026-06-08
createdAt: 2026-06-08T08:00:00.000Z
updatedAt: 2026-06-08T08:00:00.000Z
---

今天写一点。

:::murmur
id: m_20260608_213800
time: 2026-06-08T21:38:00.000Z
---
窗边在下雨。
:::`)

    const savedRecord = await updateDailyJournalFrontMatter('2026-06-08', {
      weather: {
        text: '小雨',
        temperature: 18,
        updatedAt: '2026-06-08T09:00:00.000Z',
      },
      location: {
        name: '成都',
        region: '四川',
        country: '中国',
      },
    })

    expect(savedRecord.didWrite).toBe(true)
    expect(savedRecord.changedPaths).toEqual(['entries/2026/06/2026-06-08.md'])
    expect(savedRecord.longEntryMarkdown).toBe('今天写一点。')
    expect(savedRecord.murmurs[0]).toMatchObject({
      body: '窗边在下雨。',
      id: 'm_20260608_213800',
      themes: [],
    })
    expect(mockFileSystem.files.get(entryPath)).toContain('weather:')
    expect(mockFileSystem.files.get(entryPath)).toContain('location:')
  })

  it('keeps weather front matter in memory without writing an empty journal', async () => {
    const savedRecord = await updateDailyJournalFrontMatter('2026-06-08', {
      weather: {
        text: '晴',
        temperature: 24,
        updatedAt: '2026-06-08T09:00:00.000Z',
      },
    })

    expect(savedRecord.didWrite).toBe(false)
    expect(savedRecord.changedPaths).toEqual([])
    expect(savedRecord.frontMatter.weather).toMatchObject({
      text: '晴',
      temperature: 24,
    })
    expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled()
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

六月九日。

:::murmur
id: m_20260609_080000
time: 2026-06-09T08:00:00.000Z
themes: [small-thing]
---
早上想到一句话。
:::`,
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
      murmurs: [
        expect.objectContaining({
          themes: ['small-thing'],
        }),
      ],
      updatedAt: '2026-06-09T08:00:00.000Z',
    })
  })

  it('creates a sparse daily review when generated moments are non-empty', async () => {
    const result = await loadOrCreateDailyReview({
      date: '2026-06-10',
      sourceDays: [
        {
          date: '2025-06-10',
          frontMatter: {
            date: '2025-06-10',
            weather: { text: '阴天' },
          },
          longEntryMarkdown: '',
          murmurs: [
            {
              body: '风吹过树影很好。',
              id: 'm_20250610_183000',
              images: [],
              themes: ['sky-now'],
              time: '2025-06-10T18:30:00+08:00',
            },
          ],
        },
      ],
    })

    expect(result.didWrite).toBe(true)
    expect(result.changedPaths).toEqual(['reviews/2026/06/2026-06-10.json'])
    expect(result.review).toMatchObject({
      date: '2026-06-10',
      moments: [
        expect.objectContaining({
          sourceDays: ['2025-06-10'],
          title: '那年今日，阴天',
        }),
      ],
      version: 1,
    })
    expect(mockFileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
      'file:///app/journal-worktree/reviews/2026/06/',
      { intermediates: true },
    )
    expect(mockFileSystem.files.get(reviewPath)).toContain('"version": 1')
  })

  it('does not create an empty daily review file', async () => {
    const result = await loadOrCreateDailyReview({
      date: '2026-06-10',
      sourceDays: [],
    })

    expect(result).toEqual({
      changedPaths: [],
      didWrite: false,
      review: null,
    })
    expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled()
  })

  it('reuses an existing valid daily review file', async () => {
    const existingReview = {
      date: '2026-06-10',
      generatedAt: '2026-06-10T20:00:00.000Z',
      moments: [
        {
          anchors: [],
          id: 'single-2025-06-09',
          kind: 'single',
          sourceDays: ['2025-06-09'],
          themes: [],
          title: '6 月 9 日',
          widgetEligible: true,
        },
      ],
      version: 1,
    }

    mockFileSystem.files.set(reviewPath, JSON.stringify(existingReview))

    const result = await loadOrCreateDailyReview({
      date: '2026-06-10',
      sourceDays: [
        {
          date: '2025-06-10',
          frontMatter: { date: '2025-06-10' },
          longEntryMarkdown: '',
          murmurs: [
            {
              body: '云有一点发紫。',
              id: 'm_20250610_070000',
              images: [],
              themes: ['sky-now'],
              time: '2025-06-10T07:00:00+08:00',
            },
          ],
        },
      ],
    })

    expect(result).toEqual({
      changedPaths: [],
      didWrite: false,
      review: existingReview,
    })
    expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled()
    await expect(loadDailyReview('2026-06-10')).resolves.toEqual(existingReview)
  })

  it('regenerates a malformed daily review when moments are available', async () => {
    mockFileSystem.files.set(reviewPath, '{bad json')

    const result = await loadOrCreateDailyReview({
      date: '2026-06-10',
      sourceDays: [
        {
          date: '2025-06-10',
          frontMatter: { date: '2025-06-10' },
          longEntryMarkdown: '',
          murmurs: [
            {
              body: '云有一点发紫。',
              id: 'm_20250610_070000',
              images: [],
              themes: ['sky-now'],
              time: '2025-06-10T07:00:00+08:00',
            },
          ],
        },
      ],
    })

    expect(result.didWrite).toBe(true)
    expect(result.changedPaths).toEqual([getReviewRepositoryPath('2026-06-10')])
    expect(mockFileSystem.files.get(reviewPath)).toContain('"date": "2026-06-10"')
  })

  it('regenerates a review file whose stored moments normalize to empty', async () => {
    mockFileSystem.files.set(reviewPath, JSON.stringify({
      date: '2026-06-10',
      generatedAt: '2026-06-10T20:00:00.000Z',
      moments: [
        { id: '', kind: 'single', sourceDays: ['2025-06-10'], title: '坏数据' },
        { id: 'single-bad', kind: 'single', sourceDays: ['bad'], title: '坏来源' },
      ],
      version: 1,
    }))

    const result = await loadOrCreateDailyReview({
      date: '2026-06-10',
      sourceDays: [
        {
          date: '2025-06-10',
          frontMatter: { date: '2025-06-10' },
          longEntryMarkdown: '',
          murmurs: [
            {
              body: '云有一点发紫。',
              id: 'm_20250610_070000',
              images: [],
              themes: ['sky-now'],
              time: '2025-06-10T07:00:00+08:00',
            },
          ],
        },
      ],
    })

    expect(result.didWrite).toBe(true)
    expect(result.changedPaths).toEqual([getReviewRepositoryPath('2026-06-10')])
    expect(result.review?.moments).toHaveLength(1)
    expect(mockFileSystem.files.get(reviewPath)).toContain('"id": "anniversary-2025-06-10"')
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
