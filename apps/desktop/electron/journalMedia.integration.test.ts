import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { importJournalImagesForDate } from './journalMedia'

const temporaryDirectories: string[] = []

async function createTemporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'journal-media-'))

  temporaryDirectories.push(directory)

  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('journal media import', () => {
  it('returns an empty list when image selection is cancelled', async () => {
    const directory = await createTemporaryDirectory()

    await expect(importJournalImagesForDate('2026-04-29', directory, [])).resolves.toEqual([])
  })

  it('copies supported images into the date-adjacent media directory', async () => {
    const directory = await createTemporaryDirectory()
    const sourceImage = path.join(directory, 'source.jpg')

    await writeFile(sourceImage, 'image-bytes', 'utf8')

    const importedImages = await importJournalImagesForDate(
      '2026-04-29',
      directory,
      [sourceImage],
      new Date(2026, 3, 29, 21, 38, 0),
    )

    expect(importedImages).toEqual([
      {
        id: 'img_20260429_213800',
        src: 'media/2026/04/img_20260429_213800.jpg',
        fileName: 'img_20260429_213800.jpg',
        filePath: path.join(directory, 'media', '2026', '04', 'img_20260429_213800.jpg'),
      },
    ])
    await expect(readFile(importedImages[0].filePath, 'utf8')).resolves.toBe('image-bytes')
  })

  it('compresses valid still images into WebP files', async () => {
    const directory = await createTemporaryDirectory()
    const sourceImage = path.join(directory, 'source.png')

    await writeFile(sourceImage, createTinyPng())

    const importedImages = await importJournalImagesForDate(
      '2026-04-29',
      directory,
      [sourceImage],
      new Date(2026, 3, 29, 21, 38, 0),
    )

    expect(importedImages[0]).toMatchObject({
      id: 'img_20260429_213800',
      src: 'media/2026/04/img_20260429_213800.webp',
      fileName: 'img_20260429_213800.webp',
    })

    const compressedImage = await readFile(importedImages[0].filePath)

    expect(compressedImage.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(compressedImage.subarray(8, 12).toString('ascii')).toBe('WEBP')
  })

  it('reads GPS coordinates from JPEG EXIF while importing', async () => {
    const directory = await createTemporaryDirectory()
    const sourceImage = path.join(directory, 'source.jpg')

    await writeFile(sourceImage, createGpsExifJpeg())

    const importedImages = await importJournalImagesForDate(
      '2026-04-29',
      directory,
      [sourceImage],
      new Date(2026, 3, 29, 21, 38, 0),
    )

    expect(importedImages[0]).toMatchObject({
      location: {
        latitude: 39.992,
        longitude: 116.277,
        source: 'exif',
      },
    })
  })

  it('skips unsupported files and avoids existing file names', async () => {
    const directory = await createTemporaryDirectory()
    const mediaDirectory = path.join(directory, 'media', '2026', '04')
    const sourceImage = path.join(directory, 'source.PNG')
    const sourceText = path.join(directory, 'notes.txt')

    await writeFile(sourceImage, 'image-bytes', 'utf8')
    await writeFile(sourceText, 'not-image', 'utf8')
    await mkdir(mediaDirectory, { recursive: true })
    await writeFile(path.join(mediaDirectory, 'img_20260429_213800.png'), 'existing', 'utf8')

    const importedImages = await importJournalImagesForDate(
      '2026-04-29',
      directory,
      [sourceText, sourceImage],
      new Date(2026, 3, 29, 21, 38, 0),
    )

    expect(importedImages).toHaveLength(1)
    expect(importedImages[0].fileName).toBe('img_20260429_213800_2.png')
    expect(importedImages[0].id).toBe('img_20260429_213800_2')
  })

  it('creates unique image ids for same-timestamp multi-select sources', async () => {
    const directory = await createTemporaryDirectory()
    const firstImage = path.join(directory, 'first.heic')
    const secondImage = path.join(directory, 'second.jpeg')

    await writeFile(firstImage, 'first-image', 'utf8')
    await writeFile(secondImage, 'second-image', 'utf8')

    const importedImages = await importJournalImagesForDate(
      '2026-04-29',
      directory,
      [firstImage, secondImage],
      new Date(2026, 3, 29, 21, 38, 0),
    )

    expect(importedImages.map((image) => image.id)).toEqual([
      'img_20260429_213800',
      'img_20260429_213800_2',
    ])
    expect(importedImages.map((image) => image.src)).toEqual([
      'media/2026/04/img_20260429_213800.heic',
      'media/2026/04/img_20260429_213800.jpeg',
    ])
  })

  it('rejects invalid dates before touching files', async () => {
    const directory = await createTemporaryDirectory()
    const sourceImage = path.join(directory, 'source.jpg')

    await writeFile(sourceImage, 'image-bytes', 'utf8')

    await expect(importJournalImagesForDate('2026-4-29', directory, [sourceImage])).rejects.toThrow(
      'Journal date must use YYYY-MM-DD format.',
    )
  })
})

function createTinyPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64',
  )
}

function createGpsExifJpeg() {
  const tiff = createGpsTiff()
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff])
  const segmentLength = Buffer.alloc(2)

  segmentLength.writeUInt16BE(exif.length + 2)

  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
    segmentLength,
    exif,
    Buffer.from([0xff, 0xd9]),
  ])
}

function createGpsTiff() {
  const headerLength = 8
  const ifd0Offset = headerLength
  const ifd0Length = 2 + 12 + 4
  const gpsIfdOffset = ifd0Offset + ifd0Length
  const gpsEntryCount = 4
  const gpsIfdLength = 2 + gpsEntryCount * 12 + 4
  const latitudeOffset = gpsIfdOffset + gpsIfdLength
  const longitudeOffset = latitudeOffset + 24
  const buffer = Buffer.alloc(longitudeOffset + 24)

  buffer.write('II', 0, 'ascii')
  buffer.writeUInt16LE(42, 2)
  buffer.writeUInt32LE(ifd0Offset, 4)
  buffer.writeUInt16LE(1, ifd0Offset)
  writeIfdEntry(buffer, ifd0Offset + 2, 0x8825, 4, 1, gpsIfdOffset)
  buffer.writeUInt32LE(0, ifd0Offset + 14)

  buffer.writeUInt16LE(gpsEntryCount, gpsIfdOffset)
  writeAsciiIfdEntry(buffer, gpsIfdOffset + 2, 0x0001, 'N')
  writeIfdEntry(buffer, gpsIfdOffset + 14, 0x0002, 5, 3, latitudeOffset)
  writeAsciiIfdEntry(buffer, gpsIfdOffset + 26, 0x0003, 'E')
  writeIfdEntry(buffer, gpsIfdOffset + 38, 0x0004, 5, 3, longitudeOffset)
  buffer.writeUInt32LE(0, gpsIfdOffset + 50)

  writeRationalTriplet(buffer, latitudeOffset, [
    [39, 1],
    [59, 1],
    [312, 10],
  ])
  writeRationalTriplet(buffer, longitudeOffset, [
    [116, 1],
    [16, 1],
    [372, 10],
  ])

  return buffer
}

function writeIfdEntry(
  buffer: Buffer,
  offset: number,
  tag: number,
  fieldType: number,
  count: number,
  value: number,
) {
  buffer.writeUInt16LE(tag, offset)
  buffer.writeUInt16LE(fieldType, offset + 2)
  buffer.writeUInt32LE(count, offset + 4)
  buffer.writeUInt32LE(value, offset + 8)
}

function writeAsciiIfdEntry(buffer: Buffer, offset: number, tag: number, value: string) {
  buffer.writeUInt16LE(tag, offset)
  buffer.writeUInt16LE(2, offset + 2)
  buffer.writeUInt32LE(2, offset + 4)
  buffer.write(value, offset + 8, 'ascii')
}

function writeRationalTriplet(buffer: Buffer, offset: number, values: [number, number][]) {
  values.forEach(([numerator, denominator], index) => {
    buffer.writeUInt32LE(numerator, offset + index * 8)
    buffer.writeUInt32LE(denominator, offset + index * 8 + 4)
  })
}
