import * as FileSystem from 'expo-file-system/legacy'
import { normalizeThemeIds } from '@journal/core'
import { appendMobileE2eSuffix } from './e2eEnvironment'

export type MobileMurmurDraftBackup = {
  body: string
  date: string
  themeIds: string[]
  updatedAt: string
  version: 1
}

export type RestoredMobileMurmurDraft = {
  body: string
  themeIds: string[]
}

const draftBackupFileName = 'journal-mobile-murmur-draft.v1.json'
const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/
let writeQueue: Promise<unknown> = Promise.resolve()

export async function loadMobileMurmurDraftBackup(): Promise<MobileMurmurDraftBackup | null> {
  const filePath = getMobileMurmurDraftBackupFilePath()
  const info = await FileSystem.getInfoAsync(filePath)

  if (!info.exists) {
    return null
  }

  try {
    return normalizeMobileMurmurDraftBackup(await FileSystem.readAsStringAsync(filePath))
  } catch {
    return null
  }
}

export async function saveMobileMurmurDraftBackup(draft: MobileMurmurDraftBackup) {
  const normalizedDraft = normalizeMobileMurmurDraftBackup(draft)

  if (!normalizedDraft) {
    await deleteMobileMurmurDraftBackup()
    return null
  }

  const saveOperation = writeQueue.then(async () => {
    await FileSystem.writeAsStringAsync(
      getMobileMurmurDraftBackupFilePath(),
      `${JSON.stringify(normalizedDraft)}\n`,
    )

    return normalizedDraft
  })

  writeQueue = saveOperation.catch(() => undefined)

  return saveOperation
}

export async function deleteMobileMurmurDraftBackup() {
  const deleteOperation = writeQueue.then(async () => {
    await FileSystem.deleteAsync(getMobileMurmurDraftBackupFilePath(), {
      idempotent: true,
    })
  })

  writeQueue = deleteOperation.catch(() => undefined)

  return deleteOperation
}

export function createMobileMurmurDraftBackup({
  body,
  date,
  now = new Date(),
  themeIds,
}: {
  body: string
  date: string
  now?: Date
  themeIds: readonly string[]
}): MobileMurmurDraftBackup | null {
  if (!body.trim() || !dateKeyPattern.test(date)) {
    return null
  }

  return {
    body,
    date,
    themeIds: normalizeThemeIds(themeIds),
    updatedAt: now.toISOString(),
    version: 1,
  }
}

export function getRestorableMobileMurmurDraft({
  backup,
  currentBody,
  today,
}: {
  backup: MobileMurmurDraftBackup | null
  currentBody: string
  today: string
}): RestoredMobileMurmurDraft | null {
  if (!backup || backup.date !== today || currentBody.trim()) {
    return null
  }

  return {
    body: backup.body,
    themeIds: backup.themeIds,
  }
}

export function getMobileMurmurDraftBackupStorageLabel() {
  return `FileSystem: ${getMobileMurmurDraftBackupFilePath()}`
}

function normalizeMobileMurmurDraftBackup(value: unknown): MobileMurmurDraftBackup | null {
  if (typeof value === 'string') {
    try {
      return normalizeMobileMurmurDraftBackup(JSON.parse(value) as unknown)
    } catch {
      return null
    }
  }

  if (!isRecord(value) ||
    value.version !== 1 ||
    typeof value.date !== 'string' ||
    !dateKeyPattern.test(value.date) ||
    typeof value.body !== 'string' ||
    !value.body.trim() ||
    !Array.isArray(value.themeIds) ||
    typeof value.updatedAt !== 'string' ||
    !value.updatedAt.trim()) {
    return null
  }

  return {
    body: value.body,
    date: value.date,
    themeIds: normalizeThemeIds(value.themeIds.filter((themeId): themeId is string => typeof themeId === 'string')),
    updatedAt: value.updatedAt,
    version: 1,
  }
}

function getMobileMurmurDraftBackupFilePath() {
  if (!FileSystem.documentDirectory) {
    throw new Error('File system document directory is unavailable.')
  }

  return `${FileSystem.documentDirectory}${appendMobileE2eSuffix(draftBackupFileName)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
