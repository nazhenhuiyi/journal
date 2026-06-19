import { useEffect, useState } from 'react'
import * as FileSystem from 'expo-file-system/legacy'
import {
  manipulateAsync,
  SaveFormat,
} from 'expo-image-manipulator'
import { resolveJournalMediaFileUri } from './mobileJournalStore'

const thumbnailCacheDirectoryName = 'journal-image-thumbnails'
const defaultThumbnailSize = 512
const thumbnailQuality = 0.72

export function useJournalImageThumbnailUri(src: string, size = defaultThumbnailSize) {
  const fallbackUri = resolveJournalMediaFileUri(src) ?? src
  const [thumbnailUri, setThumbnailUri] = useState(fallbackUri)

  useEffect(() => {
    let isMounted = true

    setThumbnailUri(fallbackUri)

    void resolveJournalImageThumbnailUri(src, size)
      .then((nextUri) => {
        if (isMounted) {
          setThumbnailUri(nextUri)
        }
      })

    return () => {
      isMounted = false
    }
  }, [fallbackUri, size, src])

  return thumbnailUri
}

export async function resolveJournalImageThumbnailUri(src: string, size = defaultThumbnailSize) {
  const sourceUri = resolveJournalMediaFileUri(src) ?? src
  const normalizedSize = normalizeThumbnailSize(size)

  try {
    const sourceInfo = await FileSystem.getInfoAsync(sourceUri)

    if (!sourceInfo.exists) {
      return sourceUri
    }

    const sourceMetadata = sourceInfo as typeof sourceInfo & {
      modificationTime?: number
      size?: number
    }
    const cacheDirectory = getJournalImageThumbnailCacheDirectory()
    const cacheKey = hashThumbnailKey([
      src,
      `${normalizedSize}`,
      `${sourceMetadata.size ?? 0}`,
      `${sourceMetadata.modificationTime ?? 0}`,
    ].join(':'))
    const cacheUri = `${cacheDirectory}${cacheKey}.webp`
    const cacheInfo = await FileSystem.getInfoAsync(cacheUri)

    if (cacheInfo.exists) {
      return cacheUri
    }

    await FileSystem.makeDirectoryAsync(cacheDirectory, { intermediates: true })

    const result = await manipulateAsync(
      sourceUri,
      [{ resize: { width: normalizedSize } }],
      {
        compress: thumbnailQuality,
        format: SaveFormat.WEBP,
      },
    )

    await FileSystem.copyAsync({
      from: result.uri,
      to: cacheUri,
    })

    return cacheUri
  } catch {
    return sourceUri
  }
}

export function getJournalImageThumbnailCacheDirectory() {
  if (!FileSystem.cacheDirectory) {
    throw new Error('File system cache directory is unavailable.')
  }

  return `${FileSystem.cacheDirectory}${thumbnailCacheDirectoryName}/`
}

function normalizeThumbnailSize(size: number) {
  return Number.isFinite(size) ? Math.min(Math.max(Math.round(size), 64), 1024) : defaultThumbnailSize
}

function hashThumbnailKey(value: string) {
  let hash = 5381

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index)
  }

  return (hash >>> 0).toString(36)
}
