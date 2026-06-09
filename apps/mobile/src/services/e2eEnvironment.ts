declare const process: {
  env: {
    EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID?: string
  }
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
