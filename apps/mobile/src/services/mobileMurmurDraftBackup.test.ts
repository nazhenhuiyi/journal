import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMobileMurmurDraftBackup,
  deleteMobileMurmurDraftBackup,
  getMobileMurmurDraftBackupStorageLabel,
  getRestorableMobileMurmurDraft,
  loadMobileMurmurDraftBackup,
  saveMobileMurmurDraftBackup,
} from './mobileMurmurDraftBackup'

const mockFileSystem = vi.hoisted(() => ({
  deleteAsync: vi.fn(),
  documentDirectory: 'file:///app/',
  files: new Map<string, string>(),
  getInfoAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
}))

vi.mock('expo-file-system/legacy', () => mockFileSystem)

const draftPath = 'file:///app/journal-mobile-murmur-draft.v1.json'

describe('mobile murmur draft backup', () => {
  beforeEach(() => {
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', '')
    vi.clearAllMocks()
    mockFileSystem.files.clear()
    mockFileSystem.deleteAsync.mockImplementation(async (path: string) => {
      mockFileSystem.files.delete(path)
    })
    mockFileSystem.getInfoAsync.mockImplementation(async (path: string) => ({
      exists: mockFileSystem.files.has(path),
      isDirectory: false,
      modificationTime: 0,
      size: mockFileSystem.files.get(path)?.length ?? 0,
      uri: path,
    }))
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

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('saves, loads, and deletes a draft outside the journal worktree', async () => {
    const draft = createMobileMurmurDraftBackup({
      body: '一点没有保存的碎碎念',
      date: '2026-06-22',
      now: new Date('2026-06-22T03:30:00.000Z'),
      themeIds: ['thought-maybe', 'thought-maybe', ''],
    })

    expect(draft).toEqual({
      body: '一点没有保存的碎碎念',
      date: '2026-06-22',
      themeIds: ['thought-maybe'],
      updatedAt: '2026-06-22T03:30:00.000Z',
      version: 1,
    })

    await saveMobileMurmurDraftBackup(draft!)

    expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      draftPath,
      `${JSON.stringify(draft)}\n`,
    )
    await expect(loadMobileMurmurDraftBackup()).resolves.toEqual(draft)

    await deleteMobileMurmurDraftBackup()

    expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(draftPath, {
      idempotent: true,
    })
    await expect(loadMobileMurmurDraftBackup()).resolves.toBeNull()
  })

  it('returns null for corrupt or incomplete stored drafts', async () => {
    const invalidDrafts = [
      '{broken',
      JSON.stringify({ version: 2, date: '2026-06-22', body: 'hello', themeIds: [], updatedAt: 'now' }),
      JSON.stringify({ version: 1, date: '2026-06-22', body: 'hello', updatedAt: 'now' }),
      JSON.stringify({ version: 1, date: '2026-06-22', body: 12, themeIds: [], updatedAt: 'now' }),
      JSON.stringify({ version: 1, date: '2026-06-22', body: '   ', themeIds: [], updatedAt: 'now' }),
      JSON.stringify({ version: 1, date: 'today', body: 'hello', themeIds: [], updatedAt: 'now' }),
    ]

    for (const contents of invalidDrafts) {
      mockFileSystem.files.set(draftPath, contents)

      await expect(loadMobileMurmurDraftBackup()).resolves.toBeNull()
    }
  })

  it('uses the E2E run suffix in the draft path', async () => {
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', ' run/1 ')
    const draft = createMobileMurmurDraftBackup({
      body: 'E2E 草稿',
      date: '2026-06-22',
      now: new Date('2026-06-22T03:30:00.000Z'),
      themeIds: [],
    })

    await saveMobileMurmurDraftBackup(draft!)

    expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///app/journal-mobile-murmur-draft.v1.json.run-1',
      expect.stringContaining('"body":"E2E 草稿"'),
    )
    expect(getMobileMurmurDraftBackupStorageLabel()).toBe(
      'FileSystem: file:///app/journal-mobile-murmur-draft.v1.json.run-1',
    )
  })

  it('serializes save and delete operations so clearing a submitted draft wins', async () => {
    const draft = createMobileMurmurDraftBackup({
      body: '马上要提交的草稿',
      date: '2026-06-22',
      now: new Date('2026-06-22T03:30:00.000Z'),
      themeIds: [],
    })

    await Promise.all([
      saveMobileMurmurDraftBackup(draft!),
      deleteMobileMurmurDraftBackup(),
    ])

    await expect(loadMobileMurmurDraftBackup()).resolves.toBeNull()
  })

  it('restores only today drafts into an empty editor', () => {
    const draft = createMobileMurmurDraftBackup({
      body: '今天的草稿',
      date: '2026-06-22',
      now: new Date('2026-06-22T03:30:00.000Z'),
      themeIds: ['thought-maybe'],
    })

    expect(getRestorableMobileMurmurDraft({
      backup: draft,
      currentBody: '',
      today: '2026-06-22',
    })).toEqual({
      body: '今天的草稿',
      themeIds: ['thought-maybe'],
    })
    expect(getRestorableMobileMurmurDraft({
      backup: draft,
      currentBody: '',
      today: '2026-06-23',
    })).toBeNull()
    expect(getRestorableMobileMurmurDraft({
      backup: draft,
      currentBody: '已经开始写新的了',
      today: '2026-06-22',
    })).toBeNull()
  })

  it('does not create a backup for blank body text', () => {
    expect(createMobileMurmurDraftBackup({
      body: '   ',
      date: '2026-06-22',
      themeIds: ['thought-maybe'],
    })).toBeNull()
  })
})
