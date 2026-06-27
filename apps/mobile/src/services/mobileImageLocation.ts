import {
  hasUsableImageLocationCoordinates,
  type ImageLocation,
} from '@journal/core'
import { mobileDiagnosticLog } from './diagnostics/log'
import { readMobileImageExifLocation } from './mobileImageExif'
import { resolveMobileLocationName } from './mobileReverseGeocode'

export type MobileImageLocationAsset = {
  assetId: string | null
  exif: Record<string, unknown> | null
  extension: string
  uri: string
}

type MediaLibraryAssetLocationStatus =
  | 'failed'
  | 'no-usable-location'
  | 'permission-denied'
  | 'resolved'

type ImagePickerExifStatus =
  | 'missing'
  | 'no-gps-keys'
  | 'unparseable'
  | 'unusable'
  | 'usable'

type ImageImportLocationResult =
  | 'image-picker-exif'
  | 'media-library'
  | 'source-file-exif'
  | 'unavailable'

export async function resolveMobileImageLocation(
  imageAsset: MobileImageLocationAsset,
  options: { platform?: string } = {},
): Promise<ImageLocation | undefined> {
  const platform = normalizeDiagnosticPlatform(options.platform)
  const imagePickerLocation = parseExifLocation(imageAsset.exif)
  const imagePickerExifStatus = summarizeExifLocationStatus(imageAsset.exif)

  if (imagePickerLocation) {
    const location = await withResolvedLocationName(imagePickerLocation)

    logImageImportLocationResolution({
      assetIdStatus: imageAsset.assetId ? 'present' : 'missing',
      imagePickerExifStatus,
      platform,
      result: 'image-picker-exif',
    })

    return location
  }

  const sourceFileLocation = await readMobileImageExifLocation(imageAsset.uri, imageAsset.extension)

  if (sourceFileLocation.location) {
    const location = await withResolvedLocationName(sourceFileLocation.location)

    logImageImportLocationResolution({
      assetIdStatus: imageAsset.assetId ? 'present' : 'missing',
      imagePickerExifStatus,
      platform,
      result: 'source-file-exif',
      sourceFileExifStatus: sourceFileLocation.status,
    })

    return location
  }

  if (!imageAsset.assetId) {
    logImageImportLocationResolution({
      assetIdStatus: 'missing',
      imagePickerExifStatus,
      platform,
      result: 'unavailable',
      sourceFileExifStatus: sourceFileLocation.status,
    })

    return undefined
  }

  const mediaLibraryLocation = await readMediaLibraryAssetLocation(imageAsset.assetId)

  logImageImportLocationResolution({
    assetIdStatus: 'present',
    imagePickerExifStatus,
    mediaLibraryStatus: mediaLibraryLocation.status,
    platform,
    result: mediaLibraryLocation.location ? 'media-library' : 'unavailable',
    sourceFileExifStatus: sourceFileLocation.status,
  })

  return withResolvedLocationName(mediaLibraryLocation.location)
}

async function withResolvedLocationName(location: ImageLocation | undefined) {
  if (!location || location.name?.trim()) {
    return location
  }

  const locationName = await resolveMobileLocationName(location)

  return locationName
    ? { ...location, name: locationName }
    : location
}

function parseExifLocation(exif: Record<string, unknown> | null | undefined): ImageLocation | undefined {
  if (!exif) {
    return undefined
  }

  const latitude = parseExifCoordinate(exif, [
    'GPSLatitude',
    'latitude',
    'Latitude',
  ], [
    'GPSLatitudeRef',
    'latitudeRef',
    'LatitudeRef',
  ])
  const longitude = parseExifCoordinate(exif, [
    'GPSLongitude',
    'longitude',
    'Longitude',
  ], [
    'GPSLongitudeRef',
    'longitudeRef',
    'LongitudeRef',
  ])

  if (latitude === undefined || longitude === undefined) {
    return undefined
  }

  const location = {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
    source: 'exif' as const,
  }

  return hasUsableImageLocationCoordinates(location) ? location : undefined
}

async function readMediaLibraryAssetLocation(assetId: string): Promise<{
  location?: ImageLocation
  status: MediaLibraryAssetLocationStatus
}> {
  try {
    const MediaLibrary = await import('expo-media-library/legacy')
    const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo'])

    if (!permission.granted) {
      return { status: 'permission-denied' }
    }

    const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId, {
      shouldDownloadFromNetwork: true,
    })
    const location = parseMediaLibraryAssetInfoLocation(assetInfo)

    return location ? { location, status: 'resolved' } : { status: 'no-usable-location' }
  } catch {
    return { status: 'failed' }
  }
}

function parseMediaLibraryAssetInfoLocation(assetInfo: unknown): ImageLocation | undefined {
  const record = asRecord(assetInfo)
  const location = parseLocationObject(record.location)

  if (location) {
    return location
  }

  return parseExifLocation(asRecord(record.exif))
}

function parseLocationObject(value: unknown): ImageLocation | undefined {
  const record = asRecord(value)
  const latitude = numberFromRecord(record, 'latitude')
  const longitude = numberFromRecord(record, 'longitude')

  if (latitude === undefined || longitude === undefined) {
    return undefined
  }

  const location = {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
    source: 'exif' as const,
  }

  return hasUsableImageLocationCoordinates(location) ? location : undefined
}

function summarizeExifLocationStatus(exif: Record<string, unknown> | null | undefined): ImagePickerExifStatus {
  if (!exif) {
    return 'missing'
  }

  const latitudeValue = firstExifValue(exif, [
    'GPSLatitude',
    'latitude',
    'Latitude',
  ])
  const longitudeValue = firstExifValue(exif, [
    'GPSLongitude',
    'longitude',
    'Longitude',
  ])
  const latitude = parseCoordinateValue(latitudeValue)
  const longitude = parseCoordinateValue(longitudeValue)

  if (latitude === undefined || longitude === undefined) {
    return latitudeValue === undefined && longitudeValue === undefined
      ? 'no-gps-keys'
      : 'unparseable'
  }

  return hasUsableImageLocationCoordinates({ latitude, longitude })
    ? 'usable'
    : 'unusable'
}

function logImageImportLocationResolution(details: {
  assetIdStatus: 'missing' | 'present'
  imagePickerExifStatus: ImagePickerExifStatus
  mediaLibraryStatus?: MediaLibraryAssetLocationStatus
  platform: string
  result: ImageImportLocationResult
  sourceFileExifStatus?: string
}) {
  mobileDiagnosticLog.info('journal.imageImport', 'Imported image location metadata resolved', details)
}

function parseExifCoordinate(
  exif: Record<string, unknown>,
  valueKeys: readonly string[],
  referenceKeys: readonly string[],
) {
  const value = firstExifValue(exif, valueKeys)
  const coordinate = parseCoordinateValue(value)

  if (coordinate === undefined) {
    return undefined
  }

  const reference = firstExifValue(exif, referenceKeys)

  return typeof reference === 'string' && /^[SW]$/i.test(reference)
    ? -Math.abs(coordinate)
    : coordinate
}

function firstExifValue(exif: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    if (exif[key] !== undefined && exif[key] !== null) {
      return exif[key]
    }
  }

  return undefined
}

function parseCoordinateValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const numberValue = Number(value)

    if (Number.isFinite(numberValue)) {
      return numberValue
    }
  }

  if (Array.isArray(value) && value.length >= 3) {
    const parts = value.slice(0, 3).map(parseCoordinatePart)

    if (parts.every((part): part is number => part !== undefined)) {
      return parts[0] + parts[1] / 60 + parts[2] / 3600
    }
  }

  return undefined
}

function parseCoordinatePart(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const rationalMatch = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(value.trim())

    if (rationalMatch) {
      const numerator = Number(rationalMatch[1])
      const denominator = Number(rationalMatch[2])

      return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0
        ? numerator / denominator
        : undefined
    }

    const numberValue = Number(value)

    return Number.isFinite(numberValue) ? numberValue : undefined
  }

  return undefined
}

function roundCoordinate(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function numberFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key]
  const numberValue = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(numberValue) ? numberValue : undefined
}

function normalizeDiagnosticPlatform(value: string | undefined) {
  const normalizedValue = value?.trim()

  return normalizedValue || 'unknown'
}
