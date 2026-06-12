import type { JournalWidgetAction } from '@journal/core'

export type ParsedJournalDeepLink =
  | {
      type: 'write'
      themeId: string
    }
  | {
      type: 'reviewDay'
      date: string
    }
  | {
      type: 'review'
    }

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/

export function buildJournalWidgetDeepLink(action: JournalWidgetAction) {
  if (action.type === 'write') {
    return `journal://write?theme=${encodeURIComponent(action.themeId)}`
  }

  if (action.type === 'reviewDay') {
    return `journal://review-day?date=${encodeURIComponent(action.date)}`
  }

  return 'journal://review'
}

export function parseJournalDeepLink(url: string): ParsedJournalDeepLink | null {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(url)
  } catch {
    return null
  }

  if (parsedUrl.protocol !== 'journal:') {
    return null
  }

  const host = parsedUrl.hostname

  if (host === 'write') {
    const themeId = parsedUrl.searchParams.get('theme')?.trim()

    return themeId ? { themeId, type: 'write' } : null
  }

  if (host === 'review-day') {
    const date = parsedUrl.searchParams.get('date')?.trim()

    return date && dateKeyPattern.test(date)
      ? { date, type: 'reviewDay' }
      : null
  }

  if (host === 'review') {
    return { type: 'review' }
  }

  return null
}
