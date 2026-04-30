import type { ImageBlock, MurmurBlock } from './types'

export function serializeJournalMarkdownBody(longEntryMarkdown: string, murmurs: MurmurBlock[]) {
  const chunks = [longEntryMarkdown.trimEnd()]

  for (const murmur of murmurs) {
    chunks.push(serializeMurmurBlock(murmur))
  }

  return chunks.filter((chunk) => chunk.trim()).join('\n\n')
}

export function serializeMurmurBlock(murmur: MurmurBlock) {
  const lines = [
    ':::murmur',
    `id: ${sanitizeMetadataValue(murmur.id)}`,
    `time: ${sanitizeMetadataValue(murmur.time)}`,
    '---',
  ]
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

  if (image.tags.length > 0) {
    lines.push(`tags: [${image.tags.map((tag) => sanitizeMetadataValue(tag)).join(', ')}]`)
  }

  lines.push('::')

  return lines.join('\n')
}

function sanitizeMetadataValue(value: string) {
  return value.replace(/\r?\n/g, ' ').trim()
}
