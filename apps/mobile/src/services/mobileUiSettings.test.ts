import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getMobileUiSettingsStorageLabel,
  loadMobileUiSettings,
  saveMobileUiSettings,
} from './mobileUiSettings'

const mockSecureStore = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))

vi.mock('expo-secure-store', () => mockSecureStore)

describe('mobile UI settings', () => {
  beforeEach(() => {
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', '')
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to long-entry mode when no local preference is stored', async () => {
    mockSecureStore.getItemAsync.mockResolvedValueOnce(null)

    await expect(loadMobileUiSettings()).resolves.toEqual({
      homeMode: 'long-entry',
    })
  })

  it('stores murmur mode as a local SecureStore preference', async () => {
    await expect(saveMobileUiSettings({ homeMode: 'murmur' })).resolves.toEqual({
      homeMode: 'murmur',
    })

    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'journal.mobileUiSettings.v1',
      JSON.stringify({ homeMode: 'murmur' }),
    )
  })

  it('normalizes corrupt values and includes the E2E suffix in diagnostics labels', async () => {
    mockSecureStore.getItemAsync
      .mockResolvedValueOnce('{broken')
      .mockResolvedValueOnce(JSON.stringify({ homeMode: 'murmur' }))

    await expect(loadMobileUiSettings()).resolves.toEqual({
      homeMode: 'long-entry',
    })
    await expect(loadMobileUiSettings()).resolves.toEqual({
      homeMode: 'murmur',
    })

    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', ' run/1 ')

    expect(getMobileUiSettingsStorageLabel()).toBe('SecureStore: journal.mobileUiSettings.v1.run-1')
  })
})
