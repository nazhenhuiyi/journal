import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type JournalSettings = {
  appearance: JournalAppearance
  syncBranch: string
  syncRemoteUrl: string
  version: 1
  weatherLocation: string
}

export type JournalSettingsFile = JournalSettings & {
  settingsMessage?: string
  workingDirectory: string
  settingsStatus: JournalSettingsStatus
  settingsPath: string
}

export type SaveJournalSettingsPayload = {
  appearance?: unknown
  syncBranch?: unknown
  syncRemoteUrl?: unknown
  weatherLocation?: unknown
}

const SETTINGS_VERSION = 1
const SETTINGS_FILE_NAME = 'settings.json'
export type JournalSettingsStatus = 'corrupt' | 'created' | 'ready'
export type JournalAppearance = 'dark' | 'light' | 'system'

type ReadJsonFileResult =
  | {
      status: 'corrupt'
      message: string
    }
  | {
      status: 'missing'
    }
  | {
      status: 'ok'
      value: unknown
    }

export const defaultJournalSettings: JournalSettings = {
  appearance: 'system',
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
  const readResult = await readJsonFile(settingsPath)

  if (readResult.status === 'corrupt' || (readResult.status === 'ok' && !isRecord(readResult.value))) {
    return createJournalSettingsFile(
      journalDirectory,
      settingsPath,
      defaultJournalSettings,
      'corrupt',
      readResult.status === 'corrupt'
        ? readResult.message
        : '设置文件格式不正确，请重新保存设置。',
    )
  }

  const settings = readResult.status === 'ok'
    ? normalizeJournalSettings(readResult.value)
    : defaultJournalSettings

  await mkdir(journalDirectory, { recursive: true })
  await writeJsonFile(settingsPath, settings)

  return createJournalSettingsFile(
    journalDirectory,
    settingsPath,
    settings,
    readResult.status === 'missing' ? 'created' : 'ready',
  )
}

export async function saveJournalSettings(
  journalDirectory: string,
  payload: unknown,
): Promise<JournalSettingsFile> {
  const settingsPath = getJournalSettingsPath(journalDirectory)
  const readResult = await readJsonFile(settingsPath)
  const currentSettings = readResult.status === 'ok' && isRecord(readResult.value)
    ? normalizeJournalSettings(readResult.value)
    : defaultJournalSettings
  const settings = normalizeSavePayload(payload, currentSettings)

  await mkdir(journalDirectory, { recursive: true })
  await writeJsonFile(settingsPath, settings)

  return createJournalSettingsFile(journalDirectory, settingsPath, settings, 'ready')
}

function normalizeJournalSettings(value: unknown): JournalSettings {
  if (!isRecord(value)) {
    return defaultJournalSettings
  }

  return {
    appearance: normalizeAppearance(value.appearance),
    version: SETTINGS_VERSION,
    syncBranch: normalizeSyncBranch(value.syncBranch) ?? defaultJournalSettings.syncBranch,
    syncRemoteUrl: normalizeSyncRemoteUrl(value.syncRemoteUrl) ?? defaultJournalSettings.syncRemoteUrl,
    weatherLocation: normalizeWeatherLocation(value.weatherLocation) ?? '',
  }
}

function normalizeSavePayload(payload: unknown, currentSettings: JournalSettings): JournalSettings {
  const payloadRecord = isRecord(payload) ? payload : {}
  const appearance = payloadRecord.appearance === undefined
    ? currentSettings.appearance
    : normalizeAppearance(payloadRecord.appearance)
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
    appearance,
    syncBranch,
    syncRemoteUrl,
    version: SETTINGS_VERSION,
    weatherLocation: weatherLocation ?? '',
  }
}

function normalizeAppearance(value: unknown): JournalAppearance {
  return value === 'dark' || value === 'light' || value === 'system' ? value : 'system'
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

async function readJsonFile(filePath: string): Promise<ReadJsonFileResult> {
  const content = await readFile(filePath, 'utf8').catch((error: unknown) => {
    if (isNodeError(error, 'ENOENT')) {
      return null
    }

    throw error
  })

  if (content === null) {
    return { status: 'missing' }
  }

  try {
    return {
      status: 'ok',
      value: JSON.parse(content) as unknown,
    }
  } catch (error) {
    return {
      status: 'corrupt',
      message: error instanceof Error
        ? `设置文件无法解析：${error.message}`
        : '设置文件无法解析。',
    }
  }
}

function createJournalSettingsFile(
  journalDirectory: string,
  settingsPath: string,
  settings: JournalSettings,
  settingsStatus: JournalSettingsStatus,
  settingsMessage?: string,
): JournalSettingsFile {
  return {
    ...settings,
    settingsMessage,
    settingsPath,
    settingsStatus,
    workingDirectory: journalDirectory,
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
