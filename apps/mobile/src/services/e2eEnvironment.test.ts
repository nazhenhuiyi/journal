import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendMobileE2eSuffix,
  getMobileE2eRunId,
  getMobileE2eSyncConfiguration,
} from './e2eEnvironment'

describe('mobile E2E environment', () => {
  beforeEach(() => {
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', '')
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_SYNC_BRANCH', '')
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_SYNC_REMOTE_URL', '')
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_SYNC_TOKEN', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sanitizes the run id before appending it to persisted keys', () => {
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', ' sync/run:1 ')

    expect(getMobileE2eRunId()).toBe('sync-run-1')
    expect(appendMobileE2eSuffix('journal.key')).toBe('journal.key.sync-run-1')
  })

  it('only exposes sync configuration during an E2E run', () => {
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_SYNC_BRANCH', ' mobile-e2e/test ')
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_SYNC_REMOTE_URL', ' https://github.com/example/journal.git ')
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_SYNC_TOKEN', ' ghp_secret ')

    expect(getMobileE2eSyncConfiguration()).toBeNull()

    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', 'run-1')

    expect(getMobileE2eSyncConfiguration()).toEqual({
      branch: 'mobile-e2e/test',
      remoteUrl: 'https://github.com/example/journal.git',
      token: 'ghp_secret',
    })
  })
})
