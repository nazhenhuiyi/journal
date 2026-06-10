import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchTodayMobileWeather } from './mobileWeather'

const mockLocation = vi.hoisted(() => ({
  getCurrentPositionAsync: vi.fn(),
  requestForegroundPermissionsAsync: vi.fn(),
}))

vi.mock('expo-location', () => ({
  Accuracy: {
    Balanced: 3,
  },
  getCurrentPositionAsync: mockLocation.getCurrentPositionAsync,
  requestForegroundPermissionsAsync: mockLocation.requestForegroundPermissionsAsync,
}))

describe('mobile weather', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches Open-Meteo weather when foreground location is available', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true })
    mockLocation.getCurrentPositionAsync.mockResolvedValue({
      coords: {
        latitude: 30.67,
        longitude: 104.07,
      },
    })
    vi.mocked(fetch).mockResolvedValue(createJsonResponse({
      current: {
        apparent_temperature: 26,
        relative_humidity_2m: 80,
        temperature_2m: 24,
        weather_code: 2,
        wind_speed_10m: 8,
      },
    }))

    await expect(fetchTodayMobileWeather()).resolves.toMatchObject({
      weather: {
        text: '多云',
        temperature: 24,
        feelsLike: 26,
        humidity: 80,
        windSpeed: 8,
      },
    })
    expect(vi.mocked(fetch).mock.calls[0]?.[0]?.toString()).toContain('api.open-meteo.com')
  })

  it('falls back to wttr when location permission is denied', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false })
    vi.mocked(fetch).mockResolvedValue(createJsonResponse({
      current_condition: [
        {
          FeelsLikeC: '24',
          humidity: '70',
          lang_zh: [{ value: '晴' }],
          temp_C: '22',
          windspeedKmph: '6',
        },
      ],
      nearest_area: [
        {
          areaName: [{ value: '上海' }],
          country: [{ value: '中国' }],
          region: [{ value: '上海' }],
        },
      ],
    }))

    await expect(fetchTodayMobileWeather()).resolves.toMatchObject({
      weather: {
        text: '晴',
        temperature: 22,
      },
      location: {
        name: '上海',
      },
    })
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('https://wttr.in/?format=j1&lang=zh')
  })
})

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  } as Response
}
