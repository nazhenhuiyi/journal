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
    mockSecureStore.getItemAsync.mockReset()
    mockSecureStore.setItemAsync.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to long-entry mode when no local preference is stored', async () => {
    mockSecureStore.getItemAsync.mockResolvedValueOnce(null)

    await expect(loadMobileUiSettings()).resolves.toEqual({
      appearance: 'system',
      homeMode: 'long-entry',
    })
  })

  it('stores murmur mode as a local SecureStore preference', async () => {
    mockSecureStore.getItemAsync.mockResolvedValueOnce(null)

    await expect(saveMobileUiSettings({ homeMode: 'murmur' })).resolves.toEqual({
      appearance: 'system',
      homeMode: 'murmur',
    })

    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'journal.mobileUiSettings.v1',
      JSON.stringify({ appearance: 'system', homeMode: 'murmur' }),
    )
  })

  it('preserves appearance when only home mode changes', async () => {
    mockSecureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({
      appearance: 'dark',
      homeMode: 'long-entry',
    }))

    await expect(saveMobileUiSettings({ homeMode: 'murmur' })).resolves.toEqual({
      appearance: 'dark',
      homeMode: 'murmur',
    })

    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'journal.mobileUiSettings.v1',
      JSON.stringify({ appearance: 'dark', homeMode: 'murmur' }),
    )
  })

  it('preserves home mode when only appearance changes', async () => {
    mockSecureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({
      appearance: 'system',
      homeMode: 'murmur',
    }))

    await expect(saveMobileUiSettings({ appearance: 'dark' })).resolves.toEqual({
      appearance: 'dark',
      homeMode: 'murmur',
    })

    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'journal.mobileUiSettings.v1',
      JSON.stringify({ appearance: 'dark', homeMode: 'murmur' }),
    )
  })

  it('serializes partial saves so concurrent updates do not overwrite each other', async () => {
    let storedSettings = JSON.stringify({
      appearance: 'system',
      homeMode: 'long-entry',
    })

    mockSecureStore.getItemAsync.mockImplementation(async () => storedSettings)
    mockSecureStore.setItemAsync.mockImplementation(async (_key, value) => {
      storedSettings = value
    })

    await Promise.all([
      saveMobileUiSettings({ appearance: 'dark' }),
      saveMobileUiSettings({ homeMode: 'murmur' }),
    ])

    expect(JSON.parse(storedSettings) as unknown).toEqual({
      appearance: 'dark',
      homeMode: 'murmur',
    })
  })

  it('normalizes corrupt values and includes the E2E suffix in diagnostics labels', async () => {
    mockSecureStore.getItemAsync
      .mockResolvedValueOnce('{broken')
      .mockResolvedValueOnce(JSON.stringify({ homeMode: 'murmur' }))

    await expect(loadMobileUiSettings()).resolves.toEqual({
      appearance: 'system',
      homeMode: 'long-entry',
    })
    await expect(loadMobileUiSettings()).resolves.toEqual({
      appearance: 'system',
      homeMode: 'murmur',
    })

    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', ' run/1 ')

    expect(getMobileUiSettingsStorageLabel()).toBe('SecureStore: journal.mobileUiSettings.v1.run-1')
  })
})
