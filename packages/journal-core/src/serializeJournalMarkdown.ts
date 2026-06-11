import type { ImageBlock, MurmurBlock } from './types'
import { normalizeThemeIds } from './themes'

export function serializeJournalMarkdownBody(longEntryMarkdown: string, murmurs: MurmurBlock[]) {
  const chunks = [longEntryMarkdown.trimEnd()]

  for (const murmur of murmurs) {
    chunks.push(serializeMurmurBlock(murmur))
  }

  return chunks.filter((chunk) => chunk.trim()).join('\n\n')
}

export function serializeMurmurBlock(murmur: MurmurBlock) {
  const themes = normalizeThemeIds(murmur.themes)
  const lines = [
    ':::murmur',
    `id: ${sanitizeMetadataValue(murmur.id)}`,
    `time: ${sanitizeMetadataValue(murmur.time)}`,
  ]

  if (themes.length > 0) {
    lines.push(`themes: [${themes.map((theme) => sanitizeMetadataValue(theme)).join(', ')}]`)
  }

  lines.push('---')
  const body = murmur.body.trim()

  if (body) {
    lines.push(body)
  }

  for (const image of murmur.images) {
    if (lines[lines.length - 1] !== '---') {
      lines.push('')
    }

    lines.push(serializeImageBlock(image))
  }

  lines.push(':::')

  return lines.join('\n')
}

function serializeImageBlock(image: ImageBlock) {
  const lines = [
    '::image',
    `id: ${sanitizeMetadataValue(image.id)}`,
    `src: ${sanitizeMetadataValue(image.src)}`,
  ]

  if (image.caption?.trim()) {
    lines.push(`caption: ${sanitizeMetadataValue(image.caption)}`)
  }

  if (image.location?.name?.trim()) {
    lines.push(`location: ${sanitizeMetadataValue(image.location.name)}`)
  }

  if (typeof image.location?.latitude === 'number' && Number.isFinite(image.location.latitude)) {
    lines.push(`latitude: ${formatCoordinate(image.location.latitude)}`)
  }

  if (typeof image.location?.longitude === 'number' && Number.isFinite(image.location.longitude)) {
    lines.push(`longitude: ${formatCoordinate(image.location.longitude)}`)
  }

  if (image.location?.source) {
    lines.push(`locationSource: ${sanitizeMetadataValue(image.location.source)}`)
  }

  if (image.tags.length > 0) {
    lines.push(`tags: [${image.tags.map((tag) => sanitizeMetadataValue(tag)).join(', ')}]`)
  }

  lines.push('::')

  return lines.join('\n')
}

function sanitizeMetadataValue(value: string) {
  return value.replace(/\r?\n/g, ' ').trim()
}

function formatCoordinate(value: number) {
  return `${Math.round(value * 1_000_000) / 1_000_000}`
}
