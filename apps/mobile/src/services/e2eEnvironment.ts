declare const process: {
  env: {
    EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID?: string
    EXPO_PUBLIC_JOURNAL_MOBILE_E2E_SYNC_BRANCH?: string
    EXPO_PUBLIC_JOURNAL_MOBILE_E2E_SYNC_REMOTE_URL?: string
    EXPO_PUBLIC_JOURNAL_MOBILE_E2E_SYNC_TOKEN?: string
  }
}

export type MobileE2eSyncConfiguration = {
  branch: string
  remoteUrl: string
  token: string
}

export function getMobileE2eRunId() {
  const value = process.env.EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID?.trim() ?? ''

  if (!value) {
    return ''
  }

  return value
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .slice(0, 80)
}

export function appendMobileE2eSuffix(value: string) {
  const runId = getMobileE2eRunId()

  return runId ? `${value}.${runId}` : value
}

export function getMobileE2eSyncConfiguration(): MobileE2eSyncConfiguration | null {
  if (!getMobileE2eRunId()) {
    return null
  }

  const remoteUrl = process.env.EXPO_PUBLIC_JOURNAL_MOBILE_E2E_SYNC_REMOTE_URL?.trim() ?? ''
  const token = process.env.EXPO_PUBLIC_JOURNAL_MOBILE_E2E_SYNC_TOKEN?.trim() ?? ''

  if (!remoteUrl || !token) {
    return null
  }

  return {
    branch: process.env.EXPO_PUBLIC_JOURNAL_MOBILE_E2E_SYNC_BRANCH?.trim() || 'main',
    remoteUrl,
    token,
  }
}
