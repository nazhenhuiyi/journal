import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatMobileLocationLabel,
  getMobileDiagnosticPaths,
  getMobileLocationPermissionDiagnostic,
  getMobileWeatherDiagnostic,
  requestMobileLocationDiagnostic,
} from './mobileDiagnostics'

const mockFileSystem = vi.hoisted(() => ({
  documentDirectory: 'file:///app/',
}))
const mockLocation = vi.hoisted(() => ({
  getCurrentPositionAsync: vi.fn(),
  getForegroundPermissionsAsync: vi.fn(),
  requestForegroundPermissionsAsync: vi.fn(),
  reverseGeocodeAsync: vi.fn(),
}))

vi.mock('expo-file-system/legacy', () => mockFileSystem)
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))
vi.mock('expo-location', () => ({
  Accuracy: {
    Balanced: 3,
  },
  getCurrentPositionAsync: mockLocation.getCurrentPositionAsync,
  getForegroundPermissionsAsync: mockLocation.getForegroundPermissionsAsync,
  requestForegroundPermissionsAsync: mockLocation.requestForegroundPermissionsAsync,
  reverseGeocodeAsync: mockLocation.reverseGeocodeAsync,
}))

describe('mobile diagnostics', () => {
  beforeEach(() => {
    vi.stubEnv('EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID', '')
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reports mobile data paths without touching tracked journal data', () => {
    expect(getMobileDiagnosticPaths('2026-06-08')).toEqual({
      todayEntryPath: 'file:///app/journal-worktree/entries/2026/06/2026-06-08.md',
      uiSettingsStorage: 'SecureStore: journal.mobileUiSettings.v1',
      worktreeDirectory: 'file:///app/journal-worktree/',
    })
  })

  it('reads location permission without requesting a prompt', async () => {
    mockLocation.getForegroundPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      status: 'undetermined',
    })

    await expect(getMobileLocationPermissionDiagnostic()).resolves.toEqual({
      canGetLocation: false,
      permissionStatus: 'undetermined',
    })
    expect(mockLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
  })

  it('requests location only for the explicit manual diagnostic and hides coordinates', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValueOnce({
      granted: true,
      status: 'granted',
    })
    mockLocation.getCurrentPositionAsync.mockResolvedValueOnce({
      coords: {
        latitude: 30.67,
        longitude: 104.07,
      },
    })
    mockLocation.reverseGeocodeAsync.mockResolvedValueOnce([
      {
        city: '成都',
        country: '中国',
        district: '武侯区',
        region: '四川',
      },
    ])

    await expect(requestMobileLocationDiagnostic()).resolves.toEqual({
      canGetLocation: true,
      locationLabel: '成都 · 四川 · 中国',
      permissionStatus: 'granted',
    })
    expect(mockLocation.reverseGeocodeAsync).toHaveBeenCalledWith({
      latitude: 30.67,
      longitude: 104.07,
    })
  })

  it('formats recorded location and weather status', () => {
    expect(formatMobileLocationLabel({
      country: '中国',
      name: '成都',
      region: '四川',
    })).toBe('成都 · 四川 · 中国')
    expect(getMobileWeatherDiagnostic({
      weather: {
        temperature: 24.2,
        text: '多云',
        updatedAt: '2026-06-08T09:00:00.000Z',
      },
    })).toMatchObject({
      label: '多云 24℃',
    })
  })
})
