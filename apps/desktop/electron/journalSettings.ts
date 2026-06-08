import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type JournalSettings = {
  version: 1
  weatherLocation: string
}

export type JournalSettingsFile = JournalSettings & {
  workingDirectory: string
  settingsPath: string
}

export type SaveJournalSettingsPayload = {
  weatherLocation?: unknown
}

const SETTINGS_VERSION = 1
const SETTINGS_FILE_NAME = 'settings.json'

export const defaultJournalSettings: JournalSettings = {
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
  const settings = normalizeSavePayload(payload)

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
    weatherLocation: normalizeWeatherLocation(value.weatherLocation) ?? '',
  }
}

function normalizeSavePayload(payload: unknown): JournalSettings {
  const payloadRecord = isRecord(payload) ? payload : {}
  const weatherLocation = normalizeWeatherLocation(payloadRecord.weatherLocation)

  if (weatherLocation === null) {
    throw new Error('天气位置不能包含换行。')
  }

  return {
    version: SETTINGS_VERSION,
    weatherLocation: weatherLocation ?? '',
  }
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
