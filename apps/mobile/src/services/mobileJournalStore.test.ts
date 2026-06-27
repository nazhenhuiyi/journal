import { Buffer } from 'buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMurmur,
  getReviewRepositoryPath,
  getDailyJournalFileUri,
  importMobileJournalImagesForDate,
  listDailyJournals,
  listWeeklyReviews,
  loadDailyJournal,
  loadDailyReview,
  loadWeeklyReview,
  loadOrCreateDailyReview,
  saveDailyJournal,
  updateDailyJournalFrontMatter,
} from './mobileJournalStore'

const mockFileSystem = vi.hoisted(() => ({
  copyAsync: vi.fn(),
  directories: new Set<string>(),
  documentDirectory: 'file:///app/',
  EncodingType: {
    Base64: 'base64',
    UTF8: 'utf8',
  },
  files: new Map<string, string | Uint8Array>(),
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
const mockMediaLibrary = vi.hoisted(() => ({
  getAssetInfoAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}))
const mockDiagnosticLog = vi.hoisted(() => ({
  info: vi.fn(),
}))
const mockReverseGeocode = vi.hoisted(() => ({
  resolveMobileLocationName: vi.fn(),
}))

vi.mock('expo-file-system/legacy', () => mockFileSystem)
vi.mock('expo-image-manipulator', () => mockImageManipulator)
vi.mock('expo-media-library/legacy', () => mockMediaLibrary)
vi.mock('./diagnostics/log', () => ({
  mobileDiagnosticLog: mockDiagnosticLog,
}))
vi.mock('./mobileReverseGeocode', () => mockReverseGeocode)

const entryPath = 'file:///app/journal-worktree/entries/2026/06/2026-06-08.md'
const reviewPath = 'file:///app/journal-worktree/reviews/2026/06/2026-06-10.json'

describe('mobileJournalStore', () => {
  beforeEach(() => {
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', '')
    vi.clearAllMocks()
    mockReverseGeocode.resolveMobileLocationName.mockResolvedValue(undefined)
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
    mockFileSystem.readAsStringAsync.mockImplementation(async (
      path: string,
      options?: { encoding?: string; length?: number; position?: number },
    ) => {
      const content = mockFileSystem.files.get(path)

      if (content === undefined) {
        throw new Error(`Missing test file: ${path}`)
      }

      if (options?.encoding === mockFileSystem.EncodingType.Base64) {
        const buffer = typeof content === 'string'
          ? Buffer.from(content, 'utf8')
          : Buffer.from(content)
        const position = options.position ?? 0
        const end = options.length === undefined ? undefined : position + options.length

        return Buffer.from(buffer.subarray(position, end)).toString('base64')
      }

      return typeof content === 'string'
        ? content
        : Buffer.from(content).toString('utf8')
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
    mockMediaLibrary.requestPermissionsAsync.mockResolvedValue({ granted: true })
    mockMediaLibrary.getAssetInfoAsync.mockResolvedValue({})
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

  it('returns normalized long-entry markdown after trimming trailing blank lines', async () => {
    const savedRecord = await saveDailyJournal({
      date: '2026-06-08',
      longEntryMarkdown: '第一段。\n\n',
      murmurs: [],
    })

    expect(savedRecord.longEntryMarkdown).toBe('第一段。')
    const normalizedMarkdown = mockFileSystem.files.get(entryPath)

    expect(typeof normalizedMarkdown === 'string' && normalizedMarkdown.endsWith('第一段。')).toBe(true)
  })

  it('reports the mobile journal file URI for diagnostics', () => {
    expect(getDailyJournalFileUri('2026-06-08')).toBe(entryPath)
  })

  it('creates themed text murmurs', () => {
    const murmur = createMurmur('2026-06-08', '傍晚的云有一点发紫。', {
      location: {
        latitude: 30.657,
        longitude: 104.066,
        source: 'system',
      },
      now: new Date(2026, 5, 8, 18, 30, 0),
      themes: ['sky-now', 'sky-now', 'light-shadow'],
    })

    expect(murmur).toMatchObject({
      body: '傍晚的云有一点发紫。',
      location: {
        latitude: 30.657,
        longitude: 104.066,
        source: 'system',
      },
      themes: ['sky-now', 'light-shadow'],
    })
  })

  it('compresses imported images into the mobile worktree media directory as WebP', async () => {
    mockFileSystem.files.set('file:///picker/source.jpg', 'image-bytes')
    mockReverseGeocode.resolveMobileLocationName.mockResolvedValueOnce('颐和园')

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
          name: '颐和园',
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
      [],
      {
        compress: 0.92,
        format: 'webp',
      },
    )
    expect(mockFileSystem.files.get('file:///app/journal-worktree/media/2026/06/img_20260608_213800.webp'))
      .toBe('webp:image-bytes')
  })

  it('reads GPS from the source JPEG when ImagePicker omits EXIF location fields', async () => {
    mockFileSystem.files.set('file:///picker/source.jpg', createGpsExifJpeg())

    const importedImages = await importMobileJournalImagesForDate(
      '2026-06-08',
      [
        {
          assetId: null,
          exif: {},
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

    expect(importedImages[0].location).toEqual({
      latitude: 39.992,
      longitude: 116.277,
      source: 'exif',
    })
    expect(mockFileSystem.readAsStringAsync).toHaveBeenCalledWith('file:///picker/source.jpg', {
      encoding: 'base64',
      length: 524288,
      position: 0,
    })
    expect(mockMediaLibrary.getAssetInfoAsync).not.toHaveBeenCalled()
    expect(mockDiagnosticLog.info).toHaveBeenCalledWith(
      'journal.imageImport',
      'Imported image location metadata resolved',
      expect.objectContaining({
        assetIdStatus: 'missing',
        imagePickerExifStatus: 'no-gps-keys',
        result: 'source-file-exif',
        sourceFileExifStatus: 'usable',
      }),
    )
    expect(JSON.stringify(mockDiagnosticLog.info.mock.calls)).not.toContain('GPSLatitude')
  })

  it('recovers Android gallery GPS from MediaLibrary when ImagePicker returns zero-zero', async () => {
    mockFileSystem.files.set('file:///picker/source.jpg', 'image-bytes')
    mockMediaLibrary.getAssetInfoAsync.mockResolvedValueOnce({
      location: {
        latitude: 30.6576,
        longitude: 104.0633,
      },
    })

    const importedImages = await importMobileJournalImagesForDate(
      '2026-06-08',
      [
        {
          assetId: 'asset-1',
          exif: {
            GPSLatitude: 0,
            GPSLongitude: 0,
          },
          fileName: 'source.JPG',
          mimeType: 'image/jpeg',
          type: 'image',
          uri: 'file:///picker/source.jpg',
        },
      ],
      new Date(2026, 5, 8, 21, 38, 0),
    )

    expect(importedImages[0].location).toEqual({
      latitude: 30.6576,
      longitude: 104.0633,
      source: 'exif',
    })
    expect(mockMediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(false, ['photo'])
    expect(mockMediaLibrary.getAssetInfoAsync).toHaveBeenCalledWith('asset-1', {
      shouldDownloadFromNetwork: true,
    })
    expect(mockDiagnosticLog.info).toHaveBeenCalledWith(
      'journal.imageImport',
      'Imported image location metadata resolved',
      expect.objectContaining({
        assetIdStatus: 'present',
        imagePickerExifStatus: 'unusable',
        mediaLibraryStatus: 'resolved',
        result: 'media-library',
      }),
    )
    expect(JSON.stringify(mockDiagnosticLog.info.mock.calls)).not.toContain('GPSLatitude')
  })

  it('does not write image location when ImagePicker GPS is unusable and assetId is missing', async () => {
    mockFileSystem.files.set('file:///picker/source.jpg', 'image-bytes')

    const importedImages = await importMobileJournalImagesForDate(
      '2026-06-08',
      [
        {
          exif: {
            GPSLatitude: 0,
            GPSLongitude: 0,
          },
          fileName: 'source.JPG',
          mimeType: 'image/jpeg',
          type: 'image',
          uri: 'file:///picker/source.jpg',
        },
      ],
      new Date(2026, 5, 8, 21, 38, 0),
    )

    expect(importedImages[0].location).toBeUndefined()
    expect(mockMediaLibrary.getAssetInfoAsync).not.toHaveBeenCalled()
    expect(mockDiagnosticLog.info).toHaveBeenCalledWith(
      'journal.imageImport',
      'Imported image location metadata resolved',
      expect.objectContaining({
        assetIdStatus: 'missing',
        imagePickerExifStatus: 'unusable',
        result: 'unavailable',
      }),
    )
  })

  it('does not write image location when MediaLibrary fallback has no usable GPS', async () => {
    mockFileSystem.files.set('file:///picker/source.jpg', 'image-bytes')
    mockMediaLibrary.getAssetInfoAsync.mockResolvedValueOnce({
      location: {
        latitude: 0,
        longitude: 0,
      },
    })

    const importedImages = await importMobileJournalImagesForDate(
      '2026-06-08',
      [
        {
          assetId: 'asset-1',
          exif: null,
          fileName: 'source.JPG',
          mimeType: 'image/jpeg',
          type: 'image',
          uri: 'file:///picker/source.jpg',
        },
      ],
      new Date(2026, 5, 8, 21, 38, 0),
    )

    expect(importedImages[0].location).toBeUndefined()
    expect(mockDiagnosticLog.info).toHaveBeenCalledWith(
      'journal.imageImport',
      'Imported image location metadata resolved',
      expect.objectContaining({
        assetIdStatus: 'present',
        imagePickerExifStatus: 'missing',
        mediaLibraryStatus: 'no-usable-location',
        result: 'unavailable',
      }),
    )
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

  it('lists weekly reviews newest first and extracts the question', async () => {
    addDirectory('file:///app/journal-worktree/reviews/weekly/')
    mockFileSystem.files.set(
      'file:///app/journal-worktree/reviews/weekly/2026-W24.md',
      createWeeklyReviewMarkdown({
        body: '第一周正文。',
        endDate: '2026-06-14',
        summary: '苔藓和慢。',
        title: '苔藓上的那一点慢',
        week: '2026-W24',
      }),
    )
    mockFileSystem.files.set(
      'file:///app/journal-worktree/reviews/weekly/2026-W25.md',
      createWeeklyReviewMarkdown({
        body: '第一段。\n\n第二段。\n\n## 问题\n\n留一扇漏窗吗？',
        coverImage: 'media/2026/06/img_20260620_210717.webp',
        endDate: '2026-06-21',
        startDate: '2026-06-15',
        summary: '留一扇漏窗。',
        title: '漏窗外的一点绿',
        week: '2026-W25',
      }),
    )

    const records = await listWeeklyReviews()

    expect(records.map((record) => record.week)).toEqual(['2026-W25', '2026-W24'])
    expect(records[0]).toMatchObject({
      bodyMarkdown: '第一段。\n\n第二段。',
      coverImage: 'media/2026/06/img_20260620_210717.webp',
      endDate: '2026-06-21',
      question: '留一扇漏窗吗？',
      repositoryPath: 'reviews/weekly/2026-W25.md',
      startDate: '2026-06-15',
      summary: '留一扇漏窗。',
      title: '漏窗外的一点绿',
      week: '2026-W25',
    })
  })

  it('returns null for malformed weekly reviews', async () => {
    addDirectory('file:///app/journal-worktree/reviews/weekly/')
    mockFileSystem.files.set(
      'file:///app/journal-worktree/reviews/weekly/2026-W24.md',
      '# Missing frontmatter',
    )
    mockFileSystem.files.set(
      'file:///app/journal-worktree/reviews/weekly/2026-W25.md',
      createWeeklyReviewMarkdown({
        body: '正文。',
        endDate: '2026-06-21',
        summary: '',
        title: '漏窗外的一点绿',
        week: '2026-W25',
      }),
    )

    await expect(loadWeeklyReview('2026-W24')).resolves.toBeNull()
    await expect(loadWeeklyReview('not-a-week')).resolves.toBeNull()
    await expect(listWeeklyReviews()).resolves.toEqual([])
  })
})

function addDirectory(path: string) {
  mockFileSystem.directories.add(normalizeDirectoryPath(path))
}

function createWeeklyReviewMarkdown({
  body,
  coverImage,
  endDate,
  startDate = '2026-06-08',
  summary,
  title,
  week,
}: {
  body: string
  coverImage?: string
  endDate: string
  startDate?: string
  summary: string
  title: string
  week: string
}) {
  return `---
week: ${week}
startDate: ${startDate}
endDate: ${endDate}
title: ${title}
summary: ${summary}
${coverImage ? `coverImage: ${coverImage}\n` : ''}---

# ${week} 周回顾：${title}

${startDate} 至 ${endDate}

${body}`
}

function normalizeDirectoryPath(path: string) {
  return path.endsWith('/') ? path : `${path}/`
}

type GpsExifOptions = {
  latitude?: [number, number][]
  latitudeRef?: string
  longitude?: [number, number][]
  longitudeRef?: string
}

function createGpsExifJpeg(options: GpsExifOptions = {}) {
  const tiff = createGpsTiff(options)
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff])
  const segmentLength = Buffer.alloc(2)

  segmentLength.writeUInt16BE(exif.length + 2, 0)

  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
    segmentLength,
    exif,
    Buffer.from([0xff, 0xd9]),
  ])
}

function createGpsTiff({
  latitude = [
    [39, 1],
    [59, 1],
    [312, 10],
  ],
  latitudeRef = 'N',
  longitude = [
    [116, 1],
    [16, 1],
    [372, 10],
  ],
  longitudeRef = 'E',
}: GpsExifOptions = {}) {
  const headerLength = 8
  const ifd0Offset = headerLength
  const ifd0Length = 2 + 12 + 4
  const gpsIfdOffset = ifd0Offset + ifd0Length
  const gpsEntryCount = 4
  const gpsIfdLength = 2 + gpsEntryCount * 12 + 4
  const latitudeOffset = gpsIfdOffset + gpsIfdLength
  const longitudeOffset = latitudeOffset + 24
  const buffer = Buffer.alloc(longitudeOffset + 24)

  buffer.write('II', 0, 2, 'ascii')
  buffer.writeUInt16LE(42, 2)
  buffer.writeUInt32LE(ifd0Offset, 4)
  buffer.writeUInt16LE(1, ifd0Offset)
  writeIfdEntry(buffer, ifd0Offset + 2, 0x8825, 4, 1, gpsIfdOffset)
  buffer.writeUInt32LE(0, ifd0Offset + 14)

  buffer.writeUInt16LE(gpsEntryCount, gpsIfdOffset)
  writeAsciiIfdEntry(buffer, gpsIfdOffset + 2, 0x0001, latitudeRef)
  writeIfdEntry(buffer, gpsIfdOffset + 14, 0x0002, 5, 3, latitudeOffset)
  writeAsciiIfdEntry(buffer, gpsIfdOffset + 26, 0x0003, longitudeRef)
  writeIfdEntry(buffer, gpsIfdOffset + 38, 0x0004, 5, 3, longitudeOffset)
  buffer.writeUInt32LE(0, gpsIfdOffset + 50)

  writeRationalTriplet(buffer, latitudeOffset, latitude)
  writeRationalTriplet(buffer, longitudeOffset, longitude)

  return buffer
}

function writeIfdEntry(
  buffer: Buffer,
  offset: number,
  tag: number,
  fieldType: number,
  count: number,
  value: number,
) {
  buffer.writeUInt16LE(tag, offset)
  buffer.writeUInt16LE(fieldType, offset + 2)
  buffer.writeUInt32LE(count, offset + 4)
  buffer.writeUInt32LE(value, offset + 8)
}

function writeAsciiIfdEntry(buffer: Buffer, offset: number, tag: number, value: string) {
  buffer.writeUInt16LE(tag, offset)
  buffer.writeUInt16LE(2, offset + 2)
  buffer.writeUInt32LE(2, offset + 4)
  buffer.write(value, offset + 8, 1, 'ascii')
  buffer.writeUInt8(0, offset + 9)
}

function writeRationalTriplet(buffer: Buffer, offset: number, values: [number, number][]) {
  values.forEach(([numerator, denominator], index) => {
    buffer.writeUInt32LE(numerator, offset + index * 8)
    buffer.writeUInt32LE(denominator, offset + index * 8 + 4)
  })
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
