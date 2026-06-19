import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveCurrentMurmurLocation } from './mobileMurmurLocation'

const mockLocation = vi.hoisted(() => ({
  getCurrentPositionAsync: vi.fn(),
  getForegroundPermissionsAsync: vi.fn(),
  requestForegroundPermissionsAsync: vi.fn(),
}))

vi.mock('expo-location', () => ({
  Accuracy: {
    Balanced: 3,
  },
  getCurrentPositionAsync: mockLocation.getCurrentPositionAsync,
  getForegroundPermissionsAsync: mockLocation.getForegroundPermissionsAsync,
  requestForegroundPermissionsAsync: mockLocation.requestForegroundPermissionsAsync,
}))

describe('mobile murmur location', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses existing foreground location permission to resolve system coordinates', async () => {
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
      granted: true,
      status: 'granted',
    })
    mockLocation.getCurrentPositionAsync.mockResolvedValue({
      coords: {
        latitude: 30.657,
        longitude: 104.066,
      },
    })

    await expect(resolveCurrentMurmurLocation()).resolves.toEqual({
      latitude: 30.657,
      longitude: 104.066,
      source: 'system',
    })
    expect(mockLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
    expect(mockLocation.getCurrentPositionAsync).toHaveBeenCalledWith({
      accuracy: 3,
    })
  })

  it('requests foreground permission when the status is undetermined', async () => {
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
      granted: false,
      status: 'undetermined',
    })
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      granted: true,
      status: 'granted',
    })
    mockLocation.getCurrentPositionAsync.mockResolvedValue({
      coords: {
        latitude: 31.23,
        longitude: 121.47,
      },
    })

    await expect(resolveCurrentMurmurLocation()).resolves.toMatchObject({
      latitude: 31.23,
      longitude: 121.47,
      source: 'system',
    })
    expect(mockLocation.requestForegroundPermissionsAsync).toHaveBeenCalledOnce()
  })

  it('does not block murmur publishing when permission is denied', async () => {
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
      granted: false,
      status: 'denied',
    })

    await expect(resolveCurrentMurmurLocation()).resolves.toBeUndefined()
    expect(mockLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
    expect(mockLocation.getCurrentPositionAsync).not.toHaveBeenCalled()
  })
})
