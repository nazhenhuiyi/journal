import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearMobileReverseGeocodeCacheForTests,
  resolveMobileLocationName,
} from './mobileReverseGeocode'

const mockLocation = vi.hoisted(() => ({
  reverseGeocodeAsync: vi.fn(),
}))

vi.mock('expo-location', () => ({
  reverseGeocodeAsync: mockLocation.reverseGeocodeAsync,
}))

describe('mobile reverse geocode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMobileReverseGeocodeCacheForTests()
  })

  it('resolves a short location name from usable coordinates', async () => {
    mockLocation.reverseGeocodeAsync.mockResolvedValueOnce([
      {
        city: '杭州',
        district: '西湖区',
        name: '',
        region: '浙江',
      },
    ])

    await expect(resolveMobileLocationName({
      latitude: 30.25,
      longitude: 120.13,
    })).resolves.toBe('西湖区')
    expect(mockLocation.reverseGeocodeAsync).toHaveBeenCalledWith({
      latitude: 30.25,
      longitude: 120.13,
    })
  })

  it('caches nearby coordinates on a coarse grid', async () => {
    mockLocation.reverseGeocodeAsync.mockResolvedValueOnce([
      { district: '武侯区' },
    ])

    await expect(resolveMobileLocationName({
      latitude: 30.65761,
      longitude: 104.06331,
    })).resolves.toBe('武侯区')
    await expect(resolveMobileLocationName({
      latitude: 30.65762,
      longitude: 104.06334,
    })).resolves.toBe('武侯区')
    expect(mockLocation.reverseGeocodeAsync).toHaveBeenCalledOnce()
  })

  it('returns undefined without throwing when reverse geocode fails', async () => {
    mockLocation.reverseGeocodeAsync.mockRejectedValueOnce(new Error('offline'))

    await expect(resolveMobileLocationName({
      latitude: 31.2,
      longitude: 121.5,
    })).resolves.toBeUndefined()
  })

  it('ignores unusable coordinates', async () => {
    await expect(resolveMobileLocationName({
      latitude: 0,
      longitude: 0,
    })).resolves.toBeUndefined()
    expect(mockLocation.reverseGeocodeAsync).not.toHaveBeenCalled()
  })
})
