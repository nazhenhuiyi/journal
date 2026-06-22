import * as SecureStore from 'expo-secure-store'
import { appendMobileE2eSuffix } from './e2eEnvironment'

export type MobileHomeMode = 'long-entry' | 'murmur'
export type MobileAppearance = 'dark' | 'light' | 'system'

export type MobileUiSettings = {
  appearance: MobileAppearance
  homeMode: MobileHomeMode
}

const uiSettingsKey = 'journal.mobileUiSettings.v1'
export const defaultMobileHomeMode: MobileHomeMode = 'murmur'
const defaultMobileUiSettings: MobileUiSettings = {
  appearance: 'system',
  homeMode: defaultMobileHomeMode,
}
let saveQueue: Promise<unknown> = Promise.resolve()

export async function loadMobileUiSettings(): Promise<MobileUiSettings> {
  const rawSettings = await SecureStore.getItemAsync(getMobileUiSettingsKey())

  if (!rawSettings) {
    return defaultMobileUiSettings
  }

  return normalizeMobileUiSettings(rawSettings)
}

export async function saveMobileUiSettings(settings: Partial<MobileUiSettings>) {
  const saveOperation = saveQueue.then(async () => {
    const currentSettings = await loadMobileUiSettings()
    const normalizedSettings = normalizeMobileUiSettings({
      ...currentSettings,
      ...settings,
    })

    await SecureStore.setItemAsync(getMobileUiSettingsKey(), JSON.stringify(normalizedSettings))

    return normalizedSettings
  })

  saveQueue = saveOperation.catch(() => undefined)

  return saveOperation
}

export function getMobileUiSettingsStorageLabel() {
  return `SecureStore: ${getMobileUiSettingsKey()}`
}

function getMobileUiSettingsKey() {
  return appendMobileE2eSuffix(uiSettingsKey)
}

function normalizeMobileUiSettings(value: unknown): MobileUiSettings {
  if (typeof value === 'string') {
    try {
      return normalizeMobileUiSettings(JSON.parse(value) as unknown)
    } catch {
      return defaultMobileUiSettings
    }
  }

  if (!isRecord(value)) {
    return defaultMobileUiSettings
  }

  return {
    appearance: normalizeAppearance(value.appearance),
    homeMode: normalizeHomeMode(value.homeMode),
  }
}

function normalizeAppearance(value: unknown): MobileAppearance {
  return value === 'dark' || value === 'light' || value === 'system' ? value : 'system'
}

function normalizeHomeMode(value: unknown): MobileHomeMode {
  return value === 'long-entry' || value === 'murmur' ? value : defaultMobileHomeMode
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
