import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app, safeStorage } from 'electron'

export type JournalGitSyncCredentials = {
  token: string
  username?: string
}

export type JournalGitSyncCredentialStatus =
  | 'available'
  | 'corrupt'
  | 'encryption-unavailable'
  | 'missing'

export type JournalGitSyncCredentialState =
  | {
      credentials: JournalGitSyncCredentials
      status: 'available'
    }
  | {
      message?: string
      status: Exclude<JournalGitSyncCredentialStatus, 'available'>
    }

export type JournalGitSyncCredentialAvailabilityState =
  | {
      message?: undefined
      status: 'available'
    }
  | {
      message?: string
      status: 'corrupt' | 'encryption-unavailable' | 'missing'
    }

type StoredCredentialsFile = {
  encryptedPayload: string
  version: 1
}

type StoredCredentialsReadResult =
  | {
      status: 'available'
      storedCredentials: StoredCredentialsFile
    }
  | {
      message: string
      status: 'corrupt'
    }
  | {
      status: 'missing'
    }

const CREDENTIALS_FILE_NAME = 'sync-credentials.json'

export async function hasJournalGitSyncCredentials(journalDirectory: string) {
  return (await inspectJournalGitSyncCredentials(journalDirectory)).status === 'available'
}

export async function inspectJournalGitSyncCredentialAvailability(
  journalDirectory: string,
): Promise<JournalGitSyncCredentialAvailabilityState> {
  const storedCredentials = await readStoredCredentials(journalDirectory)

  if (storedCredentials.status === 'missing') {
    return { status: 'missing' }
  }

  if (storedCredentials.status === 'corrupt') {
    return {
      message: storedCredentials.message,
      status: 'corrupt',
    }
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return {
      message: '系统加密存储不可用，无法读取 GitHub token。',
      status: 'encryption-unavailable',
    }
  }

  return { status: 'available' }
}

export async function inspectJournalGitSyncCredentials(
  journalDirectory: string,
): Promise<JournalGitSyncCredentialState> {
  const storedCredentials = await readStoredCredentials(journalDirectory)

  if (storedCredentials.status === 'missing') {
    return { status: 'missing' }
  }

  if (storedCredentials.status === 'corrupt') {
    return {
      message: storedCredentials.message,
      status: 'corrupt',
    }
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return {
      message: '系统加密存储不可用，无法读取 GitHub token。',
      status: 'encryption-unavailable',
    }
  }

  try {
    const decryptedPayload = safeStorage.decryptString(
      Buffer.from(storedCredentials.storedCredentials.encryptedPayload, 'base64'),
    )
    const credentials = parseCredentials(decryptedPayload)

    if (!credentials) {
      return {
        message: 'GitHub token 文件内容无效，请重新保存 token。',
        status: 'corrupt',
      }
    }

    return {
      credentials,
      status: 'available',
    }
  } catch (error) {
    return {
      message: error instanceof Error
        ? `GitHub token 无法解密：${error.message}`
        : 'GitHub token 无法解密，请重新保存 token。',
      status: 'corrupt',
    }
  }
}

export async function loadJournalGitSyncCredentials(
  journalDirectory: string,
): Promise<JournalGitSyncCredentials | null> {
  const credentialState = await inspectJournalGitSyncCredentials(journalDirectory)

  if (credentialState.status === 'available') {
    return credentialState.credentials
  }

  if (credentialState.status === 'missing') {
    return null
  }

  throw new Error(credentialState.message ?? getCredentialStatusMessage(credentialState.status))
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

async function readStoredCredentials(journalDirectory: string): Promise<StoredCredentialsReadResult> {
  const currentCredentials = await readStoredCredentialsFile(getCredentialsPath(journalDirectory))

  if (currentCredentials.status !== 'missing') {
    return currentCredentials
  }

  const legacyCredentialsPath = getLegacyCredentialsPath(journalDirectory)
  const legacyCredentials = await readStoredCredentialsFile(legacyCredentialsPath)

  if (legacyCredentials.status !== 'available') {
    return legacyCredentials
  }

  await writeStoredCredentials(journalDirectory, legacyCredentials.storedCredentials)
  await unlink(legacyCredentialsPath).catch((error: unknown) => {
    if (isNodeError(error, 'ENOENT')) {
      return
    }

    throw error
  })

  return legacyCredentials
}

async function readStoredCredentialsFile(credentialsPath: string): Promise<StoredCredentialsReadResult> {
  const content = await readFile(credentialsPath, 'utf8').catch((error: unknown) => {
    if (isNodeError(error, 'ENOENT')) {
      return null
    }

    throw error
  })

  if (content === null) {
    return { status: 'missing' } satisfies StoredCredentialsReadResult
  }

  try {
    const parsed = JSON.parse(content) as Partial<StoredCredentialsFile>

    if (parsed.version !== 1 || typeof parsed.encryptedPayload !== 'string') {
      return {
        message: 'GitHub token 文件格式不正确，请重新保存 token。',
        status: 'corrupt',
      } satisfies StoredCredentialsReadResult
    }

    return {
      status: 'available',
      storedCredentials: {
        encryptedPayload: parsed.encryptedPayload,
        version: 1,
      },
    } satisfies StoredCredentialsReadResult
  } catch (error) {
    return {
      message: error instanceof Error
        ? `GitHub token 文件无法解析：${error.message}`
        : 'GitHub token 文件无法解析，请重新保存 token。',
      status: 'corrupt',
    } satisfies StoredCredentialsReadResult
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

function getCredentialStatusMessage(status: Exclude<JournalGitSyncCredentialStatus, 'available'>) {
  if (status === 'corrupt') {
    return 'GitHub token 已损坏，请重新保存 token。'
  }

  if (status === 'encryption-unavailable') {
    return '系统加密存储不可用，无法读取 GitHub token。'
  }

  return '请先保存 GitHub token。'
}

function isNodeError(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code
}
