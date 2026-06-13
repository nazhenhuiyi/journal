import * as SecureStore from 'expo-secure-store'
import { appendMobileE2eSuffix } from './e2eEnvironment'

export type MobileHomeMode = 'long-entry' | 'murmur'

export type MobileUiSettings = {
  homeMode: MobileHomeMode
}

const uiSettingsKey = 'journal.mobileUiSettings.v1'
const defaultMobileUiSettings: MobileUiSettings = {
  homeMode: 'long-entry',
}

export async function loadMobileUiSettings(): Promise<MobileUiSettings> {
  const rawSettings = await SecureStore.getItemAsync(getMobileUiSettingsKey())

  if (!rawSettings) {
    return defaultMobileUiSettings
  }

  return normalizeMobileUiSettings(rawSettings)
}

export async function saveMobileUiSettings(settings: MobileUiSettings) {
  const normalizedSettings = normalizeMobileUiSettings(settings)

  await SecureStore.setItemAsync(getMobileUiSettingsKey(), JSON.stringify(normalizedSettings))

  return normalizedSettings
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
    homeMode: value.homeMode === 'murmur' ? 'murmur' : 'long-entry',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
