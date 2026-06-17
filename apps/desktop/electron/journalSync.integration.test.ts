import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadJournalGitSyncStatus,
  saveJournalGitSyncSnapshot,
  saveJournalGitSyncSettings,
} from './journalSync'

const mockSafeStorage = vi.hoisted(() => ({
  decryptString: vi.fn((buffer: Buffer) => buffer.toString('utf8').replace(/^encrypted:/, '')),
  encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`, 'utf8')),
  isEncryptionAvailable: vi.fn(() => true),
}))
const mockElectronApp = vi.hoisted(() => ({
  getPath: vi.fn(),
}))

vi.mock('electron', () => ({
  app: mockElectronApp,
  safeStorage: mockSafeStorage,
}))

describe('journal sync desktop adapter', () => {
  let journalDirectory = ''
  let userDataDirectory = ''

  beforeEach(async () => {
    vi.clearAllMocks()
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true)
    journalDirectory = await mkdtemp(path.join(os.tmpdir(), 'journal-sync-desktop-'))
    userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'journal-sync-user-data-'))
    mockElectronApp.getPath.mockReturnValue(userDataDirectory)
  })

  afterEach(async () => {
    await rm(journalDirectory, { force: true, recursive: true })
    await rm(userDataDirectory, { force: true, recursive: true })
  })

  it('saves sync settings with an encrypted token and reports credentials', async () => {
    const status = await saveJournalGitSyncSettings(journalDirectory, {
      syncBranch: 'main',
      syncRemoteUrl: 'https://github.com/example/journal-sync.git',
      syncToken: 'secret-token',
    })

    expect(status).toMatchObject({
      branch: 'main',
      credentialStatus: 'available',
      hasCredentials: true,
      hasRepository: true,
      remoteUrl: 'https://github.com/example/journal-sync.git',
    })
    expect(mockSafeStorage.decryptString).not.toHaveBeenCalled()

    await expect(loadJournalGitSyncStatus(journalDirectory)).resolves.toMatchObject({
      hasCredentials: true,
      credentialStatus: 'available',
      remoteUrl: 'https://github.com/example/journal-sync.git',
    })
    expect(mockSafeStorage.decryptString).not.toHaveBeenCalled()
  })

  it('rejects sync URLs that include credentials before saving settings', async () => {
    await expect(saveJournalGitSyncSettings(journalDirectory, {
      syncBranch: 'main',
      syncRemoteUrl: 'https://secret-token@github.com/example/journal-sync.git',
      syncToken: 'secret-token',
    })).rejects.toThrow('不能包含用户名或 token')

    await expect(loadJournalGitSyncStatus(journalDirectory)).resolves.toMatchObject({
      hasCredentials: false,
      credentialStatus: 'missing',
      remoteUrl: '',
    })
  })

  it('persists sync snapshot state for the current repository settings', async () => {
    await saveJournalGitSyncSettings(journalDirectory, {
      syncBranch: 'main',
      syncRemoteUrl: 'https://github.com/example/journal-sync.git',
      syncToken: 'secret-token',
    })
    await saveJournalGitSyncSnapshot(journalDirectory, {
      snapshot: {
        block: null,
        lastError: null,
        lastSyncedAt: '2026-06-14T12:00:00.000Z',
        pendingReason: null,
        status: 'synced',
      },
      syncBranch: 'main',
      syncRemoteUrl: 'https://github.com/example/journal-sync.git',
    })

    await expect(loadJournalGitSyncStatus(journalDirectory)).resolves.toMatchObject({
      syncSnapshot: {
        lastSyncedAt: '2026-06-14T12:00:00.000Z',
        status: 'synced',
      },
    })
  })

  it('does not restore persisted sync state for a different branch', async () => {
    await saveJournalGitSyncSettings(journalDirectory, {
      syncBranch: 'main',
      syncRemoteUrl: 'https://github.com/example/journal-sync.git',
      syncToken: 'secret-token',
    })
    await saveJournalGitSyncSnapshot(journalDirectory, {
      snapshot: {
        block: null,
        lastError: null,
        lastSyncedAt: '2026-06-14T12:00:00.000Z',
        pendingReason: null,
        status: 'synced',
      },
      syncBranch: 'main',
      syncRemoteUrl: 'https://github.com/example/journal-sync.git',
    })
    await saveJournalGitSyncSettings(journalDirectory, {
      syncBranch: 'preview',
      syncRemoteUrl: 'https://github.com/example/journal-sync.git',
    })

    await expect(loadJournalGitSyncStatus(journalDirectory)).resolves.toMatchObject({
      branch: 'preview',
      syncSnapshot: null,
    })
  })
})
