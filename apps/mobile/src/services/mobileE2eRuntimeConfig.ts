import * as FileSystem from 'expo-file-system/legacy'
import {
  setMobileE2eRuntimeConfig,
  type MobileE2eRuntimeConfig,
} from './e2eEnvironment'

export const mobileE2eRuntimeConfigFileName = 'journal-mobile-e2e-config.json'

export async function loadMobileE2eRuntimeConfig() {
  const config = await readMobileE2eRuntimeConfig()

  setMobileE2eRuntimeConfig(config)

  return config
}

async function readMobileE2eRuntimeConfig(): Promise<MobileE2eRuntimeConfig | null> {
  if (!FileSystem.documentDirectory) {
    return null
  }

  const filePath = `${FileSystem.documentDirectory}${mobileE2eRuntimeConfigFileName}`

  try {
    const info = await FileSystem.getInfoAsync(filePath)

    if (!info.exists) {
      return null
    }

    const contents = await FileSystem.readAsStringAsync(filePath)
    const parsed = JSON.parse(contents) as unknown

    return normalizeMobileE2eRuntimeConfig(parsed)
  } catch {
    return null
  }
}

function normalizeMobileE2eRuntimeConfig(value: unknown): MobileE2eRuntimeConfig | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    debugFixturesEnabled: value.debugFixturesEnabled === true,
    runId: typeof value.runId === 'string' ? value.runId : '',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
