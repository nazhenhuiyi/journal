declare const process: {
  env: {
    EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID?: string
  }
}

export type MobileE2eRuntimeConfig = {
  debugFixturesEnabled?: boolean
  runId?: string
}

let runtimeConfig: {
  debugFixturesEnabled: boolean
  runId: string
} | null = null

export function setMobileE2eRuntimeConfig(config: MobileE2eRuntimeConfig | null) {
  runtimeConfig = config
    ? {
        debugFixturesEnabled: config.debugFixturesEnabled === true,
        runId: sanitizeMobileE2eRunId(config.runId ?? ''),
      }
    : null
}

export function getMobileE2eRunId() {
  const value = runtimeConfig?.runId ||
    process.env.EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID?.trim() ||
    ''

  return sanitizeMobileE2eRunId(value)
}

export function isMobileE2eDebugLinkEnabled() {
  const hasRunId = Boolean(getMobileE2eRunId())

  if (!hasRunId) {
    return false
  }

  if (runtimeConfig) {
    return runtimeConfig.debugFixturesEnabled
  }

  return true
}

export function appendMobileE2eSuffix(value: string) {
  const runId = getMobileE2eRunId()

  return runId ? `${value}.${runId}` : value
}

function sanitizeMobileE2eRunId(value: string) {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    return ''
  }

  return normalizedValue
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .slice(0, 80)
}
