import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type JournalSettings = {
  syncBranch: string
  syncRemoteUrl: string
  version: 1
  weatherLocation: string
}

export type JournalSettingsFile = JournalSettings & {
  workingDirectory: string
  settingsPath: string
}

export type SaveJournalSettingsPayload = {
  syncBranch?: unknown
  syncRemoteUrl?: unknown
  weatherLocation?: unknown
}

const SETTINGS_VERSION = 1
const SETTINGS_FILE_NAME = 'settings.json'

export const defaultJournalSettings: JournalSettings = {
  syncBranch: 'main',
  syncRemoteUrl: '',
  version: SETTINGS_VERSION,
  weatherLocation: '',
}

export function getJournalSettingsPath(journalDirectory: string) {
  return path.join(journalDirectory, SETTINGS_FILE_NAME)
}

export async function loadJournalSettings(journalDirectory: string): Promise<JournalSettingsFile> {
  const settingsPath = getJournalSettingsPath(journalDirectory)
  const settings = normalizeJournalSettings(await readJsonFile(settingsPath))

  await mkdir(journalDirectory, { recursive: true })
  await writeJsonFile(settingsPath, settings)

  return {
    ...settings,
    workingDirectory: journalDirectory,
    settingsPath,
  }
}

export async function saveJournalSettings(
  journalDirectory: string,
  payload: unknown,
): Promise<JournalSettingsFile> {
  const settingsPath = getJournalSettingsPath(journalDirectory)
  const currentSettings = normalizeJournalSettings(await readJsonFile(settingsPath))
  const settings = normalizeSavePayload(payload, currentSettings)

  await mkdir(journalDirectory, { recursive: true })
  await writeJsonFile(settingsPath, settings)

  return {
    ...settings,
    workingDirectory: journalDirectory,
    settingsPath,
  }
}

function normalizeJournalSettings(value: unknown): JournalSettings {
  if (!isRecord(value)) {
    return defaultJournalSettings
  }

  return {
    version: SETTINGS_VERSION,
    syncBranch: normalizeSyncBranch(value.syncBranch) ?? defaultJournalSettings.syncBranch,
    syncRemoteUrl: normalizeSyncRemoteUrl(value.syncRemoteUrl) ?? defaultJournalSettings.syncRemoteUrl,
    weatherLocation: normalizeWeatherLocation(value.weatherLocation) ?? '',
  }
}

function normalizeSavePayload(payload: unknown, currentSettings: JournalSettings): JournalSettings {
  const payloadRecord = isRecord(payload) ? payload : {}
  const syncBranch = payloadRecord.syncBranch === undefined
    ? currentSettings.syncBranch
    : normalizeSyncBranch(payloadRecord.syncBranch)
  const syncRemoteUrl = payloadRecord.syncRemoteUrl === undefined
    ? currentSettings.syncRemoteUrl
    : normalizeSyncRemoteUrl(payloadRecord.syncRemoteUrl)
  const weatherLocation = payloadRecord.weatherLocation === undefined
    ? currentSettings.weatherLocation
    : normalizeWeatherLocation(payloadRecord.weatherLocation)

  if (syncBranch === null) {
    throw new Error('同步分支不能包含空白字符。')
  }

  if (syncRemoteUrl === null) {
    throw new Error('同步仓库地址不能包含换行。')
  }

  if (weatherLocation === null) {
    throw new Error('天气位置不能包含换行。')
  }

  return {
    syncBranch,
    syncRemoteUrl,
    version: SETTINGS_VERSION,
    weatherLocation: weatherLocation ?? '',
  }
}

function normalizeSyncBranch(value: unknown) {
  if (value === undefined || value === null) {
    return 'main'
  }

  if (typeof value !== 'string') {
    return null
  }

  const branch = value.trim()

  if (!branch || /\s/.test(branch)) {
    return null
  }

  return branch
}

function normalizeSyncRemoteUrl(value: unknown) {
  if (value === undefined || value === null) {
    return ''
  }

  if (typeof value !== 'string') {
    return null
  }

  const remoteUrl = value.trim()

  if (/[\r\n]/.test(remoteUrl)) {
    return null
  }

  return remoteUrl
}

function normalizeWeatherLocation(value: unknown) {
  if (value === undefined || value === null) {
    return ''
  }

  if (typeof value !== 'string') {
    return null
  }

  const weatherLocation = value.trim()

  if (/[\r\n]/.test(weatherLocation)) {
    return null
  }

  return weatherLocation
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const content = await readFile(filePath, 'utf8').catch((error: unknown) => {
    if (isNodeError(error, 'ENOENT')) {
      return null
    }

    throw error
  })

  if (content === null) {
    return null
  }

  try {
    return JSON.parse(content) as unknown
  } catch {
    return null
  }
}

async function writeJsonFile(filePath: string, value: JournalSettings) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`

  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, filePath)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNodeError(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code
}
