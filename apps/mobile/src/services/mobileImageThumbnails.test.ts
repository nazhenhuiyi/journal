import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveJournalImageThumbnailUri } from './mobileImageThumbnails'

const mockFileSystem = vi.hoisted(() => ({
  cacheDirectory: 'file:///cache/',
  copyAsync: vi.fn(),
  directories: new Set<string>(),
  files: new Map<string, string>(),
  getInfoAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
}))
const mockImageManipulator = vi.hoisted(() => ({
  manipulateAsync: vi.fn(),
  SaveFormat: {
    WEBP: 'webp',
  },
}))
const mockMobileJournalStore = vi.hoisted(() => ({
  resolveJournalMediaFileUri: vi.fn((src: string) => (
    src.startsWith('media/')
      ? `file:///app/journal-worktree/${src}`
      : null
  )),
}))

vi.mock('expo-file-system/legacy', () => mockFileSystem)
vi.mock('expo-image-manipulator', () => mockImageManipulator)
vi.mock('./mobileJournalStore', () => mockMobileJournalStore)

describe('mobileImageThumbnails', () => {
  beforeEach(() => {
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
      const isDirectory = mockFileSystem.directories.has(normalizeDirectoryPath(path))
      const content = mockFileSystem.files.get(path)

      return {
        exists: isDirectory || content !== undefined,
        isDirectory,
        modificationTime: content === undefined ? 0 : 1234,
        size: content?.length ?? 0,
        uri: path,
      }
    })
    mockFileSystem.makeDirectoryAsync.mockImplementation(async (path: string) => {
      mockFileSystem.directories.add(normalizeDirectoryPath(path))
    })
    mockImageManipulator.manipulateAsync.mockImplementation(async (uri: string) => {
      const content = mockFileSystem.files.get(uri)

      if (content === undefined) {
        throw new Error(`Missing test file: ${uri}`)
      }

      const thumbnailUri = `${uri}.thumbnail.webp`

      mockFileSystem.files.set(thumbnailUri, `thumbnail:${content}`)

      return {
        height: 384,
        uri: thumbnailUri,
        width: 512,
      }
    })
  })

  it('generates and reuses a cache thumbnail for journal media images', async () => {
    mockFileSystem.files.set('file:///app/journal-worktree/media/2026/06/photo.jpg', 'image-bytes')

    const firstUri = await resolveJournalImageThumbnailUri('media/2026/06/photo.jpg', 512)
    const secondUri = await resolveJournalImageThumbnailUri('media/2026/06/photo.jpg', 512)

    expect(firstUri).toBe(secondUri)
    expect(firstUri).toMatch(/^file:\/\/\/cache\/journal-image-thumbnails\/.+\.webp$/)
    expect(mockFileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
      'file:///cache/journal-image-thumbnails/',
      { intermediates: true },
    )
    expect(mockImageManipulator.manipulateAsync).toHaveBeenCalledOnce()
    expect(mockImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///app/journal-worktree/media/2026/06/photo.jpg',
      [{ resize: { width: 512 } }],
      {
        compress: 0.72,
        format: 'webp',
      },
    )
    expect(mockFileSystem.files.get(firstUri)).toBe('thumbnail:image-bytes')
    expect(firstUri).not.toContain('journal-worktree/entries/')
  })

  it('falls back to the original image URI when thumbnail generation fails', async () => {
    mockFileSystem.files.set('file:///app/journal-worktree/media/2026/06/photo.jpg', 'image-bytes')
    mockImageManipulator.manipulateAsync.mockRejectedValueOnce(new Error('unsupported source'))

    await expect(resolveJournalImageThumbnailUri('media/2026/06/photo.jpg', 512))
      .resolves.toBe('file:///app/journal-worktree/media/2026/06/photo.jpg')
  })

  it('returns the original URI when the source image is unavailable', async () => {
    await expect(resolveJournalImageThumbnailUri('media/2026/06/missing.jpg', 512))
      .resolves.toBe('file:///app/journal-worktree/media/2026/06/missing.jpg')
    expect(mockImageManipulator.manipulateAsync).not.toHaveBeenCalled()
  })
})

function normalizeDirectoryPath(path: string) {
  return path.endsWith('/') ? path : `${path}/`
}
