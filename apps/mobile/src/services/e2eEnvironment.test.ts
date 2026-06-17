import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendMobileE2eSuffix,
  getMobileE2eRunId,
  isMobileE2eDebugLinkEnabled,
  setMobileE2eRuntimeConfig,
} from './e2eEnvironment'

describe('mobile E2E environment', () => {
  beforeEach(() => {
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', '')
    setMobileE2eRuntimeConfig(null)
  })

  afterEach(() => {
    setMobileE2eRuntimeConfig(null)
    vi.unstubAllEnvs()
  })

  it('sanitizes the run id before appending it to persisted keys', () => {
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', ' sync/run:1 ')

    expect(getMobileE2eRunId()).toBe('sync-run-1')
    expect(isMobileE2eDebugLinkEnabled()).toBe(true)
    expect(appendMobileE2eSuffix('journal.key')).toBe('journal.key.sync-run-1')
  })

  it('lets runtime config override build-time env without enabling debug links by default', () => {
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', ' build-run ')
    setMobileE2eRuntimeConfig({
      debugFixturesEnabled: false,
      runId: ' runtime/run:1 ',
    })

    expect(getMobileE2eRunId()).toBe('runtime-run-1')
    expect(isMobileE2eDebugLinkEnabled()).toBe(false)
    expect(appendMobileE2eSuffix('journal.key')).toBe('journal.key.runtime-run-1')
  })
})
