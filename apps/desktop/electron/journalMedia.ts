import { copyFile, mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type { ImageLocation } from '@journal/core'
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

const compressedImageExtension = '.webp'
const compressedImageMaxLongEdge = 2560
const compressedImageQuality = 85
const passthroughImageExtensions = new Set(['.gif'])

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

  const [year, month] = date.split('-')
  const mediaDirectoryName = `media/${year}/${month}`
  const mediaDirectory = path.join(journalDirectory, mediaDirectoryName)
  const timestamp = formatImageTimestamp(now)
  const usedFileNames = new Set<string>()
  const usedImageIds = new Set<string>()
  const importedImages: ImportedJournalImage[] = []

  await mkdir(mediaDirectory, { recursive: true })

  for (const sourcePath of imagePaths) {
    const extension = path.extname(sourcePath).toLowerCase()
    const preferredExtension = getPreferredImportedImageExtension(extension)
    const fileStem = `img_${date.split('-').join('')}_${timestamp}`
    const location = await readImageExifLocation(sourcePath).catch(() => undefined)
    const importedFile = await importImageFile({
      extension,
      fileStem,
      mediaDirectory,
      preferredExtension,
      sourcePath,
      usedFileNames,
    })
    const imageId = createAvailableImageId(importedFile.fileName, importedFile.extension, usedImageIds)

    usedFileNames.add(importedFile.fileName)
    usedImageIds.add(imageId)

    const importedImage: ImportedJournalImage = {
      id: imageId,
      src: `${mediaDirectoryName}/${importedFile.fileName}`,
      fileName: importedFile.fileName,
      filePath: importedFile.filePath,
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

type ImportImageFileInput = {
  extension: string
  fileStem: string
  mediaDirectory: string
  preferredExtension: string
  sourcePath: string
  usedFileNames: Set<string>
}

async function importImageFile(input: ImportImageFileInput) {
  const preferredFileName = await createAvailableImageFileName(
    input.mediaDirectory,
    input.fileStem,
    input.preferredExtension,
    input.usedFileNames,
  )
  const preferredFilePath = path.join(input.mediaDirectory, preferredFileName)

  if (input.preferredExtension === compressedImageExtension) {
    try {
      await optimizeImageToWebp(input.sourcePath, preferredFilePath)

      return {
        extension: input.preferredExtension,
        fileName: preferredFileName,
        filePath: preferredFilePath,
      }
    } catch {
      await rm(preferredFilePath, { force: true }).catch(() => undefined)
    }
  }

  const fallbackFileName = input.preferredExtension === input.extension
    ? preferredFileName
    : await createAvailableImageFileName(
      input.mediaDirectory,
      input.fileStem,
      input.extension,
      input.usedFileNames,
    )
  const fallbackFilePath = path.join(input.mediaDirectory, fallbackFileName)

  await copyFile(input.sourcePath, fallbackFilePath)

  return {
    extension: input.extension,
    fileName: fallbackFileName,
    filePath: fallbackFilePath,
  }
}

async function optimizeImageToWebp(sourcePath: string, targetPath: string) {
  await sharp(sourcePath)
    .rotate()
    .resize({
      fit: 'inside',
      height: compressedImageMaxLongEdge,
      width: compressedImageMaxLongEdge,
      withoutEnlargement: true,
    })
    .webp({
      effort: 4,
      quality: compressedImageQuality,
    })
    .toFile(targetPath)
}

function getPreferredImportedImageExtension(extension: string) {
  return passthroughImageExtensions.has(extension) ? extension : compressedImageExtension
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

function createAvailableImageId(fileName: string, extension: string, usedImageIds: Set<string>) {
  const baseId = path.basename(fileName, extension)

  for (let index = 0; index < 10_000; index += 1) {
    const suffix = index === 0 ? '' : `_${index + 1}`
    const imageId = `${baseId}${suffix}`

    if (!usedImageIds.has(imageId)) {
      return imageId
    }
  }

  throw new Error('Could not create a unique journal image id.')
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
