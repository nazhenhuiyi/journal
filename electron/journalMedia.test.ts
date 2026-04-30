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
        src: '2026-04-29.media/img_20260429_213800.jpg',
        fileName: 'img_20260429_213800.jpg',
        filePath: path.join(directory, '2026-04-29.media', 'img_20260429_213800.jpg'),
      },
    ])
    await expect(readFile(importedImages[0].filePath, 'utf8')).resolves.toBe('image-bytes')
  })

  it('skips unsupported files and avoids existing file names', async () => {
    const directory = await createTemporaryDirectory()
    const mediaDirectory = path.join(directory, '2026-04-29.media')
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
