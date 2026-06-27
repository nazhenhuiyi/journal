import * as Location from 'expo-location'
import type { ImageLocation } from '@journal/core'
import { resolveMobileLocationName } from './mobileReverseGeocode'

const murmurLocationTimeoutMs = 3500

export async function resolveCurrentMurmurLocation(): Promise<ImageLocation | undefined> {
  try {
    const hasPermission = await resolveForegroundLocationPermission()

    if (!hasPermission) {
      return undefined
    }

    const position = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      murmurLocationTimeoutMs,
    )
    const latitude = position.coords.latitude
    const longitude = position.coords.longitude

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return undefined
    }

    const location: ImageLocation = {
      latitude,
      longitude,
      source: 'system',
    }
    const locationName = await resolveMobileLocationName(location)

    return locationName
      ? { ...location, name: locationName }
      : location
  } catch {
    return undefined
  }
}

async function resolveForegroundLocationPermission() {
  const existingPermission = await Location.getForegroundPermissionsAsync()

  if (existingPermission.granted) {
    return true
  }

  if (existingPermission.status === 'denied') {
    return false
  }

  const requestedPermission = await Location.requestForegroundPermissionsAsync()

  return requestedPermission.granted
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Timed out.')), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}
