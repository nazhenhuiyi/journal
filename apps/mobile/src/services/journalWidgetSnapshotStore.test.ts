import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getLegacyJournalWidgetSnapshotFilePath,
  getJournalWidgetSnapshotFilePath,
  loadJournalWidgetSnapshot,
  refreshJournalWidgetSnapshot,
} from './journalWidgetSnapshotStore'

const mockUpdateNativeJournalWidgets = vi.hoisted(() => vi.fn())
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
vi.mock('expo-widgets/build/ExpoWidgets', () => ({
  default: {
    widgetsDirectory: 'file:///widgets/',
  },
}))
vi.mock('../widgets/journalWidgetNative', () => ({
  updateNativeJournalWidgets: mockUpdateNativeJournalWidgets,
}))

const entryPath = 'file:///app/journal-worktree/entries/2025/06/2025-06-10.md'
const reviewPath = 'file:///app/journal-worktree/reviews/2026/06/2026-06-10.json'
const snapshotPath = 'file:///app/journal-widget-snapshot-v2.json'
const legacySnapshotPath = 'file:///app/journal-widget-snapshot-v1.json'

describe('journalWidgetSnapshotStore', () => {
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
    mockImageManipulator.manipulateAsync.mockImplementation(async (uri: string) => {
      const content = mockFileSystem.files.get(uri)

      if (content === undefined) {
        throw new Error(`Missing test file: ${uri}`)
      }

      const resultUri = `${uri}.widget.jpg`

      mockFileSystem.files.set(resultUri, `widget:${content}`)

      return {
        height: 675,
        uri: resultUri,
        width: 900,
      }
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

  it('creates a review through the shared review path and writes the snapshot outside the worktree', async () => {
    addDirectory('file:///app/journal-worktree/entries/')
    addDirectory('file:///app/journal-worktree/entries/2025/')
    addDirectory('file:///app/journal-worktree/entries/2025/06/')
    mockFileSystem.files.set(entryPath, `---
date: 2025-06-10
---

:::murmur
id: m_20250610_070000
time: 2025-06-10T07:00:00+08:00
themes: [sky-now]
---
云有一点发紫。
:::`)

    const result = await refreshJournalWidgetSnapshot({
      date: '2026-06-10',
    })
    const { snapshot } = result

    expect(result.reviewResult.didWrite).toBe(true)
    expect(snapshot.review.mode).toBe('daily-review')
    expect(getJournalWidgetSnapshotFilePath()).toBe(snapshotPath)
    expect(getLegacyJournalWidgetSnapshotFilePath()).toBe(legacySnapshotPath)
    expect(mockFileSystem.files.get(reviewPath)).toContain('"version": 1')
    expect(mockFileSystem.files.get(snapshotPath)).toContain('"version": 2')
    expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledTimes(2)
    expect(mockUpdateNativeJournalWidgets).toHaveBeenCalledWith(snapshot, result.timeline)
  })

  it('keeps the widget snapshot isolated during mobile E2E runs', () => {
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', ' widget/run:1 ')

    expect(getJournalWidgetSnapshotFilePath()).toBe(
      'file:///app/journal-widget-snapshot-v2.json.widget-run-1',
    )
    expect(getLegacyJournalWidgetSnapshotFilePath()).toBe(
      'file:///app/journal-widget-snapshot-v1.json.widget-run-1',
    )
  })

  it('can refresh the snapshot without requesting native widget updates', async () => {
    addDirectory('file:///app/journal-worktree/entries/')
    addDirectory('file:///app/journal-worktree/entries/2025/')
    addDirectory('file:///app/journal-worktree/entries/2025/06/')
    mockFileSystem.files.set(entryPath, `---
date: 2025-06-10
---

:::murmur
id: m_20250610_070000
time: 2025-06-10T07:00:00+08:00
themes: [sky-now]
---
云有一点发紫。
:::`)

    const result = await refreshJournalWidgetSnapshot({
      date: '2026-06-10',
    }, {
      updateNativeWidgets: false,
    })

    expect(result.snapshot.review.mode).toBe('daily-review')
    expect(mockFileSystem.files.get(reviewPath)).toContain('"version": 1')
    expect(mockFileSystem.files.get(snapshotPath)).toContain('"version": 2')
    expect(mockUpdateNativeJournalWidgets).not.toHaveBeenCalled()
  })

  it('builds a compact widget timeline for the remaining local moment windows', async () => {
    const result = await refreshJournalWidgetSnapshot({
      date: '2026-06-23',
      now: new Date(2026, 5, 23, 9, 30),
    }, {
      updateNativeWidgets: false,
    })

    expect(result.timeline.map((entry) => entry.date.getHours())).toEqual([
      9,
      10,
      14,
      17,
      20,
      21,
    ])
    expect(result.timeline.map((entry) => entry.snapshot.moment.action.themeId)).toEqual([
      'sky-now',
      'food-today',
      'small-thing',
      'light-shadow',
      'small-thing',
      'thought-maybe',
    ])
    expect(mockFileSystem.files.get(snapshotPath)).toContain('"themeId": "sky-now"')
  })

  it('uses existing persisted review moments when present', async () => {
    mockFileSystem.files.set(reviewPath, JSON.stringify({
      date: '2026-06-10',
      generatedAt: '2026-06-10T08:00:00.000Z',
      moments: [
        {
          anchors: [],
          id: 'single-2025-06-09',
          kind: 'single',
          sourceDays: ['2025-06-09'],
          themes: [],
          title: '既有浮现',
          widgetEligible: true,
        },
      ],
      version: 1,
    }))

    const result = await refreshJournalWidgetSnapshot({
      date: '2026-06-10',
      currentDay: {
        date: '2026-06-10',
        frontMatter: { date: '2026-06-10' },
        longEntryMarkdown: '今天也写了一点。',
        murmurs: [],
      },
    })

    expect(result.reviewResult.didWrite).toBe(false)
    expect(result.snapshot.review).toMatchObject({
      action: {
        date: '2025-06-09',
        type: 'reviewDay',
      },
      mode: 'daily-review',
      title: '既有浮现',
    })
  })

  it('adds an App Group image URI only for native daily review photo widgets', async () => {
    const mediaPath = 'file:///app/journal-worktree/media/2025/06/lake.webp'

    mockFileSystem.files.set(mediaPath, 'image-bytes')
    mockFileSystem.files.set(reviewPath, JSON.stringify({
      date: '2026-06-10',
      generatedAt: '2026-06-10T08:00:00.000Z',
      moments: [
        {
          anchors: [],
          displayImage: {
            src: 'media/2025/06/lake.webp',
          },
          displayLabel: '上周的今天，阴。西湖边',
          id: 'single-2025-06-09',
          kind: 'single',
          sourceDays: ['2025-06-09'],
          themes: [],
          title: '上周的今天，阴',
          widgetEligible: true,
        },
      ],
      version: 1,
    }))

    const result = await refreshJournalWidgetSnapshot({
      date: '2026-06-10',
      currentDay: {
        date: '2026-06-10',
        frontMatter: { date: '2026-06-10' },
        longEntryMarkdown: '',
        murmurs: [],
      },
    })
    const nativeSnapshot = mockUpdateNativeJournalWidgets.mock.calls[0]?.[0]
    const copiedImageUri = [...mockFileSystem.files.keys()]
      .find((path) => path.startsWith('file:///widgets/journal-review-images/'))

    expect(result.snapshot.review).toMatchObject({
      backgroundImageSrc: 'media/2025/06/lake.webp',
      displayLabel: '上周的今天，阴。西湖边',
      mode: 'daily-review',
    })
    expect(mockFileSystem.files.get(snapshotPath)).toContain('"backgroundImageSrc": "media/2025/06/lake.webp"')
    expect(mockFileSystem.files.get(snapshotPath)).not.toContain('backgroundImageUri')
    expect(copiedImageUri).toMatch(/^file:\/\/\/widgets\/journal-review-images\/.+\.jpg$/)
    expect(mockImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      mediaPath,
      [{ resize: { width: 900 } }],
      {
        compress: 0.82,
        format: 'jpeg',
      },
    )
    expect(mockFileSystem.files.get(copiedImageUri ?? '')).toBe('widget:image-bytes')
    expect(nativeSnapshot.review).toMatchObject({
      backgroundImageUri: copiedImageUri,
      backgroundImageSrc: 'media/2025/06/lake.webp',
      displayLabel: '上周的今天，阴。西湖边',
      mode: 'daily-review',
    })
  })

  it('keeps the review result when native widget updates fail', async () => {
    const error = new Error('native widget unavailable')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    addDirectory('file:///app/journal-worktree/entries/')
    addDirectory('file:///app/journal-worktree/entries/2025/')
    addDirectory('file:///app/journal-worktree/entries/2025/06/')
    mockFileSystem.files.set(entryPath, `---
date: 2025-06-10
---

:::murmur
id: m_20250610_070000
time: 2025-06-10T07:00:00+08:00
themes: [sky-now]
---
云有一点发紫。
:::`)
    mockUpdateNativeJournalWidgets.mockRejectedValueOnce(error)

    try {
      const result = await refreshJournalWidgetSnapshot({
        date: '2026-06-10',
      })

      expect(result.reviewResult).toMatchObject({
        changedPaths: ['reviews/2026/06/2026-06-10.json'],
        didWrite: true,
      })
      expect(mockFileSystem.files.get(reviewPath)).toContain('"version": 1')
      expect(mockFileSystem.files.get(snapshotPath)).toContain('"version": 2')
      expect(consoleError).toHaveBeenCalledWith(error)
    } finally {
      consoleError.mockRestore()
    }
  })

  it('returns null for malformed local snapshots', async () => {
    mockFileSystem.files.set(snapshotPath, '{bad json')

    await expect(loadJournalWidgetSnapshot()).resolves.toBeNull()
  })

  it('loads legacy v1 snapshots as a v2 bundle fallback when no v2 snapshot exists', async () => {
    mockFileSystem.files.set(legacySnapshotPath, JSON.stringify({
      action: {
        date: '2025-06-10',
        type: 'reviewDay',
      },
      date: '2026-06-10',
      footnote: '此刻的天空',
      generatedAt: '2026-06-10T08:00:00.000Z',
      mode: 'review-moment',
      subtitle: '你写过一句：云有一点发紫',
      title: '那年今日',
      version: 1,
    }))

    await expect(loadJournalWidgetSnapshot()).resolves.toMatchObject({
      review: {
        action: {
          date: '2025-06-10',
          type: 'reviewDay',
        },
        mode: 'daily-review',
        summary: '你写过一句：云有一点发紫',
        subtitle: '此刻的天空',
        title: '那年今日',
      },
      version: 2,
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
