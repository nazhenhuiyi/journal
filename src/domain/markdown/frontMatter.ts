import type { DayFrontMatter } from './types'

const frontMatterFence = '---'

type FrontMatterScalar = string | number | boolean
type FrontMatterValue = FrontMatterScalar | Record<string, unknown> | undefined

export function stripManagedFrontMatter(markdown: string) {
  const split = splitFrontMatter(markdown)

  return split.body
}

export function createJournalMarkdownWithFrontMatter(markdown: string, frontMatter: DayFrontMatter) {
  const frontMatterMarkdown = serializeJournalFrontMatter(frontMatter)

  return `${frontMatterFence}\n${frontMatterMarkdown}\n${frontMatterFence}\n\n${markdown}`
}

export function serializeJournalFrontMatter(frontMatter: DayFrontMatter) {
  const orderedEntries = orderFrontMatterEntries(frontMatter)
  const lines: string[] = []

  for (const [key, value] of orderedEntries) {
    if (value === undefined || value === null) {
      continue
    }

    if (isRecord(value)) {
      const nestedEntries = Object.entries(value).filter(([, nestedValue]) => (
        nestedValue !== undefined && nestedValue !== null && isSerializableScalar(nestedValue)
      ))

      if (nestedEntries.length === 0) {
        continue
      }

      lines.push(`${key}:`)

      for (const [nestedKey, nestedValue] of nestedEntries) {
        if (isSerializableScalar(nestedValue)) {
          lines.push(`  ${nestedKey}: ${serializeFrontMatterScalar(nestedValue)}`)
        }
      }

      continue
    }

    if (isSerializableScalar(value)) {
      lines.push(`${key}: ${serializeFrontMatterScalar(value)}`)
    }
  }

  return lines.join('\n')
}

function splitFrontMatter(markdown: string): { frontMatterLines: string[] | null; body: string } {
  if (!markdown.startsWith(`${frontMatterFence}\n`) && !markdown.startsWith(`${frontMatterFence}\r\n`)) {
    return {
      frontMatterLines: null,
      body: markdown,
    }
  }

  const lines = markdown.split(/\r?\n/)
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === frontMatterFence)

  if (closingIndex === -1) {
    return {
      frontMatterLines: null,
      body: markdown,
    }
  }

  return {
    frontMatterLines: lines.slice(1, closingIndex),
    body: lines.slice(closingIndex + 1).join('\n').replace(/^\n/, ''),
  }
}

function orderFrontMatterEntries(frontMatter: DayFrontMatter): [string, FrontMatterValue][] {
  const preferredKeys = ['date', 'createdAt', 'updatedAt', 'weather', 'location']
  const entries = new Map(Object.entries(frontMatter) as [string, FrontMatterValue][])
  const orderedEntries: [string, FrontMatterValue][] = []

  for (const key of preferredKeys) {
    if (entries.has(key)) {
      orderedEntries.push([key, entries.get(key)])
      entries.delete(key)
    }
  }

  return [...orderedEntries, ...entries.entries()]
}

function serializeFrontMatterScalar(value: FrontMatterScalar) {
  if (typeof value !== 'string') {
    return String(value)
  }

  const normalizedValue = value.replace(/\r?\n/g, ' ').trim()

  if (!normalizedValue) {
    return '""'
  }

  if (/[#{}[\],&*?|\-<>=!%@`]/.test(normalizedValue[0]) || /:\s/.test(normalizedValue)) {
    return JSON.stringify(normalizedValue)
  }

  return normalizedValue
}

function isSerializableScalar(value: unknown): value is FrontMatterScalar {
  return ['string', 'number', 'boolean'].includes(typeof value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
