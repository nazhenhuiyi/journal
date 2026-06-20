import { Buffer } from 'buffer'
import * as FileSystem from 'expo-file-system/legacy'
import * as ExifReader from 'exifreader'
import {
  hasUsableImageLocationCoordinates,
  type ImageLocation,
} from '@journal/core'

const supportedExifImageExtensions = new Set(['.heic', '.heif', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp'])
const jpegExifReadByteLimit = 512 * 1024

export type MobileImageExifLocationStatus =
  | 'failed'
  | 'no-usable-location'
  | 'unsupported-extension'
  | 'usable'

export async function readMobileImageExifLocation(
  fileUri: string,
  extension: string,
): Promise<{
  location?: ImageLocation
  status: MobileImageExifLocationStatus
}> {
  if (!supportedExifImageExtensions.has(extension)) {
    return { status: 'unsupported-extension' }
  }

  try {
    const contents = await FileSystem.readAsStringAsync(fileUri, createExifReadOptions(extension))
    const location = parseExifLocationFromBytes(Buffer.from(contents, 'base64'))

    return location
      ? { location, status: 'usable' }
      : { status: 'no-usable-location' }
  } catch (error) {
    return isMissingExifMetadataError(error)
      ? { status: 'no-usable-location' }
      : { status: 'failed' }
  }
}

function createExifReadOptions(extension: string) {
  if (extension === '.jpg' || extension === '.jpeg') {
    return {
      encoding: FileSystem.EncodingType.Base64,
      length: jpegExifReadByteLimit,
      position: 0,
    }
  }

  return {
    encoding: FileSystem.EncodingType.Base64,
  }
}

export function parseExifLocationFromBytes(bytes: Uint8Array): ImageLocation | undefined {
  const tags = ExifReader.load(Buffer.from(bytes), {
    expanded: true,
    includeTags: {
      gps: true,
    },
  })
  const location = {
    latitude: roundCoordinate(tags.gps?.Latitude),
    longitude: roundCoordinate(tags.gps?.Longitude),
    source: 'exif' as const,
  }

  return hasUsableImageLocationCoordinates(location) ? location : undefined
}

function isMissingExifMetadataError(error: unknown) {
  return error instanceof Error && error.name === 'MetadataMissingError'
}

function roundCoordinate(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 1_000_000) / 1_000_000
    : undefined
}
