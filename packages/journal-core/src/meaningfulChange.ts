import { parseJournalMarkdown } from './parseJournalMarkdown'
import type { DayFrontMatter } from './types'

const managedTopLevelFrontMatterKeys = new Set(['createdAt', 'date', 'updatedAt'])

export function hasMeaningfulJournalChange(previousMarkdown: string, nextMarkdown: string) {
  if (!hasJournalUserContent(previousMarkdown) && !hasJournalUserContent(nextMarkdown)) {
    return false
  }

  return createMeaningfulJournalSignature(previousMarkdown) !== createMeaningfulJournalSignature(nextMarkdown)
}

export function hasJournalUserContent(markdown: string) {
  const parsed = parseJournalMarkdown(markdown)

  return Boolean(
    parsed.longEntryMarkdown.trim() ||
      parsed.murmurs.some((murmur) => murmur.body.trim() || murmur.images.length > 0),
  )
}

export function createMeaningfulJournalSignature(markdown: string) {
  const parsed = parseJournalMarkdown(markdown)

  return stableStringify({
    frontMatter: normalizeFrontMatter(parsed.frontMatter, true),
    longEntryMarkdown: parsed.longEntryMarkdown,
    murmurs: parsed.murmurs,
  })
}

function normalizeFrontMatter(value: DayFrontMatter, isTopLevel = false): unknown {
  return normalizeValue(value, isTopLevel)
}

function normalizeValue(value: unknown, isTopLevelFrontMatter = false): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, false))
  }

  if (!isRecord(value)) {
    return value
  }

  const normalizedEntries = Object.entries(value)
    .filter(([key, nestedValue]) => (
      nestedValue !== undefined &&
      nestedValue !== null &&
      !isManagedFrontMatterKey(key, isTopLevelFrontMatter)
    ))
    .map(([key, nestedValue]) => [key, normalizeValue(nestedValue, false)] as const)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))

  return Object.fromEntries(normalizedEntries)
}

function isManagedFrontMatterKey(key: string, isTopLevelFrontMatter: boolean) {
  if (isTopLevelFrontMatter && managedTopLevelFrontMatterKeys.has(key)) {
    return true
  }

  return key === 'updatedAt'
}

function stableStringify(value: unknown) {
  return JSON.stringify(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
