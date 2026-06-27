import {
  hasUsableImageLocationCoordinates,
  type ImageLocation,
} from '@journal/core'

const reverseGeocodeTimeoutMs = 2200
const coordinateCachePrecision = 1_000
const reverseGeocodeCache = new Map<string, string | undefined>()

type ReverseGeocodeResult = {
  city?: string | null
  district?: string | null
  name?: string | null
  region?: string | null
  subregion?: string | null
}

export async function resolveMobileLocationName(
  location: ImageLocation | undefined,
): Promise<string | undefined> {
  if (!hasUsableImageLocationCoordinates(location)) {
    return undefined
  }

  const cacheKey = getReverseGeocodeCacheKey(location.latitude, location.longitude)

  if (reverseGeocodeCache.has(cacheKey)) {
    return reverseGeocodeCache.get(cacheKey)
  }

  try {
    const Location = await import('expo-location')
    const [result] = await withTimeout(
      Location.reverseGeocodeAsync({
        latitude: location.latitude,
        longitude: location.longitude,
      }),
      reverseGeocodeTimeoutMs,
    )
    const locationName = formatShortLocationName(result)

    reverseGeocodeCache.set(cacheKey, locationName)

    return locationName
  } catch {
    reverseGeocodeCache.set(cacheKey, undefined)

    return undefined
  }
}

export function clearMobileReverseGeocodeCacheForTests() {
  reverseGeocodeCache.clear()
}

function formatShortLocationName(location: ReverseGeocodeResult | undefined) {
  return [
    location?.name,
    location?.district,
    location?.city,
    location?.subregion,
    location?.region,
  ]
    .map((part) => part?.trim())
    .find((part): part is string => Boolean(part))
}

function getReverseGeocodeCacheKey(latitude: number, longitude: number) {
  const roundedLatitude = Math.round(latitude * coordinateCachePrecision) / coordinateCachePrecision
  const roundedLongitude = Math.round(longitude * coordinateCachePrecision) / coordinateCachePrecision

  return `${roundedLatitude},${roundedLongitude}`
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
