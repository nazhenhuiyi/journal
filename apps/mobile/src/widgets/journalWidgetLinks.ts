import type { JournalWidgetAction } from '@journal/core'
import type { SyncBlockedReason } from '@journal/sync'

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
  | {
      type: 'weeklyReview'
      week: string
    }
  | {
      reason: SyncBlockedReason
      type: 'debugSyncBlocked'
    }
  | {
      date: string
      localText: string
      type: 'debugSyncConflictFixture'
    }

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/
const weekKeyPattern = /^\d{4}-W\d{2}$/
const debugSyncBlockedReasons = new Set<SyncBlockedReason>([
  'content-conflict',
  'first-sync-needs-choice',
  'object-store-corrupt',
  'unrelated-histories',
])

export function buildJournalWidgetDeepLink(action: JournalWidgetAction) {
  if (action.type === 'write') {
    return `journal://write?theme=${encodeURIComponent(action.themeId)}`
  }

  if (action.type === 'reviewDay') {
    return `journal://review-day?date=${encodeURIComponent(action.date)}`
  }

  if (action.type === 'weeklyReview') {
    return `journal://weekly-review?week=${encodeURIComponent(action.week)}`
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

  if (host === 'weekly-review') {
    const week = parsedUrl.searchParams.get('week')?.trim()

    return week && weekKeyPattern.test(week)
      ? { type: 'weeklyReview', week }
      : null
  }

  if (host === 'debug' && parsedUrl.pathname === '/sync-blocked') {
    const reason = parsedUrl.searchParams.get('reason')?.trim()

    return isSyncBlockedReason(reason)
      ? { reason, type: 'debugSyncBlocked' }
      : null
  }

  if (host === 'debug' && parsedUrl.pathname === '/sync-conflict-fixture') {
    const date = parsedUrl.searchParams.get('date')?.trim()
    const localText = parsedUrl.searchParams.get('localText')?.trim()

    return date && dateKeyPattern.test(date) && localText
      ? {
          date,
          localText,
          type: 'debugSyncConflictFixture',
        }
      : null
  }

  return null
}

function isSyncBlockedReason(value: string | undefined): value is SyncBlockedReason {
  return Boolean(value && debugSyncBlockedReasons.has(value as SyncBlockedReason))
}
