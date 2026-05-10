import { copyFile, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { ImageLocation } from '../src/domain/markdown/types'
import { readImageExifLocation } from './imageExif'

const supportedImageExtensions = new Set([
  '.bmp',
  '.gif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
])

export type ImportedJournalImage = {
  id: string
  src: string
  fileName: string
  filePath: string
  location?: ImageLocation
}

export async function importJournalImagesForDate(
  date: unknown,
  journalDirectory: string,
  sourceFilePaths: string[],
  now = new Date(),
): Promise<ImportedJournalImage[]> {
  assertDateKey(date)

  const imagePaths = sourceFilePaths.filter(isSupportedImagePath)

  if (imagePaths.length === 0) {
    return []
  }

  const mediaDirectoryName = `${date}.media`
  const mediaDirectory = path.join(journalDirectory, mediaDirectoryName)
  const timestamp = formatImageTimestamp(now)
  const usedFileNames = new Set<string>()
  const importedImages: ImportedJournalImage[] = []

  await mkdir(mediaDirectory, { recursive: true })

  for (const sourcePath of imagePaths) {
    const extension = path.extname(sourcePath).toLowerCase()
    const fileStem = `img_${date.split('-').join('')}_${timestamp}`
    const fileName = await createAvailableImageFileName(mediaDirectory, fileStem, extension, usedFileNames)
    const filePath = path.join(mediaDirectory, fileName)

    await copyFile(sourcePath, filePath)
    const location = await readImageExifLocation(filePath).catch(() => undefined)

    usedFileNames.add(fileName)

    const importedImage: ImportedJournalImage = {
      id: path.basename(fileName, extension),
      src: `${mediaDirectoryName}/${fileName}`,
      fileName,
      filePath,
    }

    if (location) {
      importedImage.location = location
    }

    importedImages.push(importedImage)
  }

  return importedImages
}

function isSupportedImagePath(filePath: string) {
  return supportedImageExtensions.has(path.extname(filePath).toLowerCase())
}

async function createAvailableImageFileName(
  directory: string,
  fileStem: string,
  extension: string,
  usedFileNames: Set<string>,
) {
  for (let index = 0; index < 10_000; index += 1) {
    const suffix = index === 0 ? '' : `_${index + 1}`
    const fileName = `${fileStem}${suffix}${extension}`

    if (usedFileNames.has(fileName)) {
      continue
    }

    const exists = await stat(path.join(directory, fileName))
      .then(() => true)
      .catch((error: unknown) => {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          return false
        }

        throw error
      })

    if (!exists) {
      return fileName
    }
  }

  throw new Error('Could not create a unique journal image file name.')
}

function formatImageTimestamp(date: Date) {
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  const seconds = `${date.getSeconds()}`.padStart(2, '0')

  return `${hours}${minutes}${seconds}`
}

function assertDateKey(date: unknown): asserts date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError('Journal date must use YYYY-MM-DD format.')
  }
}
