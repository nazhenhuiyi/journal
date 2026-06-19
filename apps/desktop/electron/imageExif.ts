import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  hasUsableImageLocationCoordinates,
  type ImageLocation,
} from '@journal/core'

const jpegStartOfImage = 0xffd8
const jpegStartOfScan = 0xda
const jpegEndOfImage = 0xd9
const jpegApp1 = 0xe1
const exifHeader = Buffer.from('Exif\0\0', 'binary')
const tiffLittleEndian = 0x4949
const tiffBigEndian = 0x4d4d
const tiffMagic = 42
const gpsIfdPointerTag = 0x8825
const gpsLatitudeRefTag = 0x0001
const gpsLatitudeTag = 0x0002
const gpsLongitudeRefTag = 0x0003
const gpsLongitudeTag = 0x0004

type TiffReader = {
  readUInt16: (offset: number) => number
  readUInt32: (offset: number) => number
}

type IfdEntry = {
  count: number
  fieldType: number
  tag: number
  valueOffset: number
}

export async function readImageExifLocation(filePath: string): Promise<ImageLocation | undefined> {
  const extension = path.extname(filePath).toLowerCase()

  if (['.jpg', '.jpeg', '.tif', '.tiff'].includes(extension)) {
    const buffer = await readFile(filePath)
    const location = parseExifLocationFromBuffer(buffer)

    if (location) {
      return location
    }
  }

  return readSharpExifLocation(filePath)
}

export function parseExifLocationFromBuffer(buffer: Buffer): ImageLocation | undefined {
  if (buffer.subarray(0, exifHeader.length).equals(exifHeader)) {
    return parseTiffLocation(buffer, exifHeader.length, buffer.length)
  }

  const tiffRange = findExifTiffRange(buffer)

  if (!tiffRange) {
    return parseTiffLocation(buffer, 0, buffer.length)
  }

  return parseTiffLocation(buffer, tiffRange.start, tiffRange.end)
}

function findExifTiffRange(buffer: Buffer) {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== jpegStartOfImage) {
    return null
  }

  let offset = 2

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      return null
    }

    const marker = buffer[offset + 1]
    offset += 2

    if (marker === jpegStartOfScan || marker === jpegEndOfImage) {
      return null
    }

    const segmentLength = buffer.readUInt16BE(offset)
    const segmentStart = offset + 2
    const segmentEnd = offset + segmentLength

    if (segmentLength < 2 || segmentEnd > buffer.length) {
      return null
    }

    if (
      marker === jpegApp1 &&
      segmentStart + exifHeader.length < segmentEnd &&
      buffer.subarray(segmentStart, segmentStart + exifHeader.length).equals(exifHeader)
    ) {
      return {
        end: segmentEnd,
        start: segmentStart + exifHeader.length,
      }
    }

    offset = segmentEnd
  }

  return null
}

function parseTiffLocation(buffer: Buffer, tiffStart: number, tiffEnd: number): ImageLocation | undefined {
  if (tiffStart + 8 > tiffEnd) {
    return undefined
  }

  const reader = createTiffReader(buffer, tiffStart)

  if (!reader || reader.readUInt16(tiffStart + 2) !== tiffMagic) {
    return undefined
  }

  const firstIfdOffset = reader.readUInt32(tiffStart + 4)
  const firstIfd = parseIfd(reader, tiffStart + firstIfdOffset, tiffStart, tiffEnd)
  const gpsPointer = firstIfd.find((entry) => entry.tag === gpsIfdPointerTag)

  if (!gpsPointer) {
    return undefined
  }

  const gpsIfdOffset = readLongEntryValue(reader, gpsPointer, tiffStart, tiffEnd)

  if (gpsIfdOffset === undefined) {
    return undefined
  }

  const gpsEntries = parseIfd(reader, tiffStart + gpsIfdOffset, tiffStart, tiffEnd)
  const latitude = parseGpsCoordinate(buffer, reader, gpsEntries, gpsLatitudeRefTag, gpsLatitudeTag, tiffStart, tiffEnd)
  const longitude = parseGpsCoordinate(buffer, reader, gpsEntries, gpsLongitudeRefTag, gpsLongitudeTag, tiffStart, tiffEnd)

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

async function readSharpExifLocation(filePath: string): Promise<ImageLocation | undefined> {
  const metadata = await sharp(filePath).metadata()
  const exifBuffer = metadata.exif

  if (!exifBuffer) {
    return undefined
  }

  return parseExifLocationFromBuffer(exifBuffer)
}

function createTiffReader(buffer: Buffer, tiffStart: number): TiffReader | null {
  const byteOrder = buffer.readUInt16BE(tiffStart)

  if (byteOrder === tiffLittleEndian) {
    return {
      readUInt16: (offset) => buffer.readUInt16LE(offset),
      readUInt32: (offset) => buffer.readUInt32LE(offset),
    }
  }

  if (byteOrder === tiffBigEndian) {
    return {
      readUInt16: (offset) => buffer.readUInt16BE(offset),
      readUInt32: (offset) => buffer.readUInt32BE(offset),
    }
  }

  return null
}

function parseIfd(reader: TiffReader, ifdOffset: number, tiffStart: number, tiffEnd: number): IfdEntry[] {
  if (ifdOffset < tiffStart || ifdOffset + 2 > tiffEnd) {
    return []
  }

  const count = reader.readUInt16(ifdOffset)
  const entriesStart = ifdOffset + 2
  const entriesEnd = entriesStart + count * 12

  if (entriesEnd > tiffEnd) {
    return []
  }

  const entries: IfdEntry[] = []

  for (let index = 0; index < count; index += 1) {
    const entryOffset = entriesStart + index * 12

    entries.push({
      count: reader.readUInt32(entryOffset + 4),
      fieldType: reader.readUInt16(entryOffset + 2),
      tag: reader.readUInt16(entryOffset),
      valueOffset: entryOffset + 8,
    })
  }

  return entries
}

function readLongEntryValue(reader: TiffReader, entry: IfdEntry, tiffStart: number, tiffEnd: number) {
  if (entry.fieldType !== 4 || entry.count !== 1 || entry.valueOffset + 4 > tiffEnd) {
    return undefined
  }

  const value = reader.readUInt32(entry.valueOffset)

  return tiffStart + value < tiffEnd ? value : undefined
}

function parseGpsCoordinate(
  buffer: Buffer,
  reader: TiffReader,
  entries: IfdEntry[],
  refTag: number,
  coordinateTag: number,
  tiffStart: number,
  tiffEnd: number,
) {
  const ref = readAsciiEntryValue(buffer, reader, entries.find((entry) => entry.tag === refTag), tiffStart, tiffEnd)
  const coordinate = readRationalTriplet(
    reader,
    entries.find((entry) => entry.tag === coordinateTag),
    tiffStart,
    tiffEnd,
  )

  if (!ref || !coordinate) {
    return undefined
  }

  const value = coordinate[0] + coordinate[1] / 60 + coordinate[2] / 3600
  const signedValue = ref === 'S' || ref === 'W' ? -value : value

  return Number.isFinite(signedValue) ? signedValue : undefined
}

function readAsciiEntryValue(
  buffer: Buffer,
  reader: TiffReader,
  entry: IfdEntry | undefined,
  tiffStart: number,
  tiffEnd: number,
) {
  if (!entry || entry.fieldType !== 2 || entry.count === 0) {
    return undefined
  }

  const valueBytes = readEntryValueBytes(buffer, reader, entry, tiffStart, tiffEnd)

  return valueBytes?.toString('ascii').replace(/\0.*$/, '').trim()
}

function readRationalTriplet(
  reader: TiffReader,
  entry: IfdEntry | undefined,
  tiffStart: number,
  tiffEnd: number,
) {
  if (!entry || entry.fieldType !== 5 || entry.count < 3) {
    return undefined
  }

  const valueOffset = reader.readUInt32(entry.valueOffset)
  const absoluteOffset = tiffStart + valueOffset

  if (absoluteOffset < tiffStart || absoluteOffset + 24 > tiffEnd) {
    return undefined
  }

  const values: number[] = []

  for (let index = 0; index < 3; index += 1) {
    const numerator = reader.readUInt32(absoluteOffset + index * 8)
    const denominator = reader.readUInt32(absoluteOffset + index * 8 + 4)

    if (denominator === 0) {
      return undefined
    }

    values.push(numerator / denominator)
  }

  return values
}

function readEntryValueBytes(
  buffer: Buffer,
  reader: TiffReader,
  entry: IfdEntry,
  tiffStart: number,
  tiffEnd: number,
) {
  const valueByteLength = getTiffFieldTypeSize(entry.fieldType) * entry.count

  if (valueByteLength <= 0) {
    return undefined
  }

  if (valueByteLength <= 4) {
    return buffer.subarray(entry.valueOffset, entry.valueOffset + valueByteLength)
  }

  const valueOffset = reader.readUInt32(entry.valueOffset)
  const absoluteOffset = tiffStart + valueOffset

  if (absoluteOffset < tiffStart || absoluteOffset + valueByteLength > tiffEnd) {
    return undefined
  }

  return buffer.subarray(absoluteOffset, absoluteOffset + valueByteLength)
}

function getTiffFieldTypeSize(fieldType: number) {
  switch (fieldType) {
    case 1:
    case 2:
    case 7:
      return 1
    case 3:
      return 2
    case 4:
    case 9:
      return 4
    case 5:
    case 10:
      return 8
    default:
      return 0
  }
}

function roundCoordinate(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000
}
