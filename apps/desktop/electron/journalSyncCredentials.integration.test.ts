import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hasJournalGitSyncCredentials,
  inspectJournalGitSyncCredentials,
  loadJournalGitSyncCredentials,
  saveJournalGitSyncCredentials,
} from './journalSyncCredentials'

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

describe('journal sync credentials', () => {
  let journalDirectory = ''
  let userDataDirectory = ''

  beforeEach(async () => {
    vi.clearAllMocks()
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true)
    journalDirectory = await mkdtemp(path.join(os.tmpdir(), 'journal-sync-credentials-'))
    userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'journal-sync-user-data-'))
    mockElectronApp.getPath.mockReturnValue(userDataDirectory)
  })

  afterEach(async () => {
    await rm(journalDirectory, { force: true, recursive: true })
    await rm(userDataDirectory, { force: true, recursive: true })
  })

  it('stores the GitHub token encrypted and loads it back', async () => {
    await saveJournalGitSyncCredentials(journalDirectory, {
      token: 'secret-token',
    })

    const storedCredentialsPath = await findStoredCredentialsPath(userDataDirectory)
    const storedContent = await readFile(storedCredentialsPath, 'utf8')

    expect(storedContent).not.toContain('secret-token')
    await expect(readFile(path.join(journalDirectory, 'sync-credentials.json'), 'utf8'))
      .rejects.toThrow()
    expect(await hasJournalGitSyncCredentials(journalDirectory)).toBe(true)
    await expect(loadJournalGitSyncCredentials(journalDirectory)).resolves.toEqual({
      token: 'secret-token',
      username: undefined,
    })
  })

  it('does not report corrupted credentials as available or delete them', async () => {
    await saveJournalGitSyncCredentials(journalDirectory, {
      token: 'secret-token',
    })
    const storedCredentialsPath = await findStoredCredentialsPath(userDataDirectory)

    await writeFile(storedCredentialsPath, JSON.stringify({
      encryptedPayload: Buffer.from('not-json', 'utf8').toString('base64'),
      version: 1,
    }), 'utf8')

    expect(await hasJournalGitSyncCredentials(journalDirectory)).toBe(false)
    await expect(inspectJournalGitSyncCredentials(journalDirectory)).resolves.toMatchObject({
      status: 'corrupt',
    })
    await expect(loadJournalGitSyncCredentials(journalDirectory)).rejects.toThrow('GitHub token 文件内容无效')
    await expect(readFile(storedCredentialsPath, 'utf8')).resolves.toContain('encryptedPayload')
  })

  it('reports unavailable system encryption without deleting stored credentials', async () => {
    await saveJournalGitSyncCredentials(journalDirectory, {
      token: 'secret-token',
    })
    const storedCredentialsPath = await findStoredCredentialsPath(userDataDirectory)

    mockSafeStorage.isEncryptionAvailable.mockReturnValue(false)

    await expect(inspectJournalGitSyncCredentials(journalDirectory)).resolves.toMatchObject({
      status: 'encryption-unavailable',
    })
    await expect(loadJournalGitSyncCredentials(journalDirectory)).rejects.toThrow('系统加密存储不可用')
    await expect(readFile(storedCredentialsPath, 'utf8')).resolves.toContain('encryptedPayload')
  })

  it('migrates legacy credentials out of the journal worktree', async () => {
    await writeFile(path.join(journalDirectory, 'sync-credentials.json'), JSON.stringify({
      encryptedPayload: Buffer
        .from('encrypted:{"token":"legacy-token"}', 'utf8')
        .toString('base64'),
      version: 1,
    }), 'utf8')

    await expect(loadJournalGitSyncCredentials(journalDirectory)).resolves.toEqual({
      token: 'legacy-token',
      username: undefined,
    })

    const storedCredentialsPath = await findStoredCredentialsPath(userDataDirectory)

    await expect(readFile(storedCredentialsPath, 'utf8')).resolves.not.toContain('legacy-token')
    await expect(readFile(path.join(journalDirectory, 'sync-credentials.json'), 'utf8'))
      .rejects.toThrow()
  })


  it('refuses to save a token when system encryption is unavailable', async () => {
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(false)

    await expect(saveJournalGitSyncCredentials(journalDirectory, {
      token: 'secret-token',
    })).rejects.toThrow('系统加密存储不可用')
  })
})

async function findStoredCredentialsPath(userDataDirectory: string) {
  const credentialsDirectory = path.join(userDataDirectory, 'journal-sync-credentials')
  const files = await readdir(credentialsDirectory)

  expect(files).toHaveLength(1)

  return path.join(credentialsDirectory, files[0])
}
