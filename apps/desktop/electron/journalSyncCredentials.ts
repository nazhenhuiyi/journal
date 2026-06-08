import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app, safeStorage } from 'electron'

export type JournalGitSyncCredentials = {
  token: string
  username?: string
}

type StoredCredentialsFile = {
  encryptedPayload: string
  version: 1
}

const CREDENTIALS_FILE_NAME = 'sync-credentials.json'

export async function hasJournalGitSyncCredentials(journalDirectory: string) {
  return (await loadJournalGitSyncCredentials(journalDirectory).catch(() => null)) !== null
}

export async function loadJournalGitSyncCredentials(
  journalDirectory: string,
): Promise<JournalGitSyncCredentials | null> {
  const storedCredentials = await readStoredCredentials(journalDirectory)

  if (!storedCredentials) {
    return null
  }

  assertSafeStorageAvailable()

  let credentials: JournalGitSyncCredentials | null = null

  try {
    const decryptedPayload = safeStorage.decryptString(
      Buffer.from(storedCredentials.encryptedPayload, 'base64'),
    )

    credentials = parseCredentials(decryptedPayload)
  } catch {
    credentials = null
  }

  if (!credentials) {
    await clearJournalGitSyncCredentials(journalDirectory)
  }

  return credentials
}

export async function saveJournalGitSyncCredentials(
  journalDirectory: string,
  credentials: JournalGitSyncCredentials,
) {
  const normalizedCredentials = normalizeCredentials(credentials)

  if (!normalizedCredentials) {
    throw new Error('GitHub token 不能为空。')
  }

  assertSafeStorageAvailable()

  const encryptedPayload = safeStorage
    .encryptString(JSON.stringify(normalizedCredentials))
    .toString('base64')

  await writeStoredCredentials(journalDirectory, {
    encryptedPayload,
    version: 1,
  })
}

export async function clearJournalGitSyncCredentials(journalDirectory: string) {
  await unlink(getCredentialsPath(journalDirectory)).catch((error: unknown) => {
    if (!isNodeError(error, 'ENOENT')) {
      throw error
    }
  })
  await unlink(getLegacyCredentialsPath(journalDirectory)).catch((error: unknown) => {
    if (!isNodeError(error, 'ENOENT')) {
      throw error
    }
  })
}

function getCredentialsPath(journalDirectory: string) {
  return path.join(getCredentialsDirectory(), getCredentialsFileName(journalDirectory))
}

function getLegacyCredentialsPath(journalDirectory: string) {
  return path.join(journalDirectory, CREDENTIALS_FILE_NAME)
}

function getCredentialsDirectory() {
  return path.join(app.getPath('userData'), 'journal-sync-credentials')
}

function getCredentialsFileName(journalDirectory: string) {
  const journalKey = createHash('sha256')
    .update(path.resolve(journalDirectory))
    .digest('hex')

  return `${journalKey}-${CREDENTIALS_FILE_NAME}`
}

async function readStoredCredentials(journalDirectory: string) {
  const currentCredentials = await readStoredCredentialsFile(getCredentialsPath(journalDirectory))

  if (currentCredentials) {
    return currentCredentials
  }

  const legacyCredentialsPath = getLegacyCredentialsPath(journalDirectory)
  const legacyCredentials = await readStoredCredentialsFile(legacyCredentialsPath)

  if (!legacyCredentials) {
    return null
  }

  await writeStoredCredentials(journalDirectory, legacyCredentials)
  await unlink(legacyCredentialsPath).catch((error: unknown) => {
    if (isNodeError(error, 'ENOENT')) {
      return
    }

    throw error
  })

  return legacyCredentials
}

async function readStoredCredentialsFile(credentialsPath: string) {
  const content = await readFile(credentialsPath, 'utf8').catch((error: unknown) => {
    if (isNodeError(error, 'ENOENT')) {
      return null
    }

    throw error
  })

  if (content === null) {
    return null
  }

  try {
    const parsed = JSON.parse(content) as Partial<StoredCredentialsFile>

    if (parsed.version !== 1 || typeof parsed.encryptedPayload !== 'string') {
      return null
    }

    return {
      encryptedPayload: parsed.encryptedPayload,
      version: 1,
    } satisfies StoredCredentialsFile
  } catch {
    return null
  }
}

async function writeStoredCredentials(
  journalDirectory: string,
  storedCredentials: StoredCredentialsFile,
) {
  const credentialsPath = getCredentialsPath(journalDirectory)
  const temporaryPath = `${credentialsPath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`

  await mkdir(path.dirname(credentialsPath), { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(storedCredentials, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, credentialsPath)
}

function normalizeCredentials(credentials: JournalGitSyncCredentials) {
  const token = credentials.token.trim()
  const username = credentials.username?.trim()

  if (!token) {
    return null
  }

  return {
    token,
    username: username || undefined,
  }
}

function parseCredentials(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<JournalGitSyncCredentials>

    if (typeof parsed.token !== 'string' || parsed.token.trim().length === 0) {
      return null
    }

    return {
      token: parsed.token.trim(),
      username: typeof parsed.username === 'string' && parsed.username.trim()
        ? parsed.username.trim()
        : undefined,
    } satisfies JournalGitSyncCredentials
  } catch {
    return null
  }
}

function assertSafeStorageAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统加密存储不可用，无法安全保存 GitHub token。')
  }
}

function isNodeError(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code
}
