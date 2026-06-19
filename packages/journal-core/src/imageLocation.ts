import type { ImageLocation } from './types'

export function isUsableImageCoordinatePair(latitude: unknown, longitude: unknown) {
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude)
  ) {
    return false
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return false
  }

  return latitude !== 0 || longitude !== 0
}

export function hasUsableImageLocationCoordinates(
  location: ImageLocation | undefined,
): location is ImageLocation & { latitude: number; longitude: number } {
  return isUsableImageCoordinatePair(location?.latitude, location?.longitude)
}
