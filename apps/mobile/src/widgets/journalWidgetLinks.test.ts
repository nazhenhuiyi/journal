import { describe, expect, it } from 'vitest'
import {
  buildJournalWidgetDeepLink,
  parseJournalDeepLink,
} from './journalWidgetLinks'

describe('journal widget links', () => {
  it('builds and parses write links', () => {
    const link = buildJournalWidgetDeepLink({
      themeId: 'sky-now',
      type: 'write',
    })

    expect(link).toBe('journal://write?theme=sky-now')
    expect(parseJournalDeepLink(link)).toEqual({
      themeId: 'sky-now',
      type: 'write',
    })
  })

  it('builds and parses review day links', () => {
    const link = buildJournalWidgetDeepLink({
      date: '2025-06-10',
      type: 'reviewDay',
    })

    expect(link).toBe('journal://review-day?date=2025-06-10')
    expect(parseJournalDeepLink(link)).toEqual({
      date: '2025-06-10',
      type: 'reviewDay',
    })
  })

  it('builds and parses weekly review links', () => {
    const link = buildJournalWidgetDeepLink({
      type: 'weeklyReview',
      week: '2026-W25',
    })

    expect(link).toBe('journal://weekly-review?week=2026-W25')
    expect(parseJournalDeepLink(link)).toEqual({
      type: 'weeklyReview',
      week: '2026-W25',
    })
  })

  it('rejects unsafe or incomplete links', () => {
    expect(parseJournalDeepLink('https://example.com')).toBeNull()
    expect(parseJournalDeepLink('journal://write')).toBeNull()
    expect(parseJournalDeepLink('journal://review-day?date=bad')).toBeNull()
    expect(parseJournalDeepLink('journal://weekly-review?week=bad')).toBeNull()
  })

  it('parses E2E sync blocked debug links', () => {
    expect(parseJournalDeepLink('journal://debug/sync-blocked?reason=content-conflict')).toEqual({
      reason: 'content-conflict',
      type: 'debugSyncBlocked',
    })
    expect(parseJournalDeepLink('journal://debug/sync-blocked?reason=bad')).toBeNull()
  })

  it('parses E2E sync conflict fixture links', () => {
    const link = [
      'journal://debug/sync-conflict-fixture',
      '?date=2026-06-17',
      '&localText=local%20text',
    ].join('')

    expect(parseJournalDeepLink(link)).toEqual({
      date: '2026-06-17',
      localText: 'local text',
      type: 'debugSyncConflictFixture',
    })
    expect(parseJournalDeepLink('journal://debug/sync-conflict-fixture?date=bad')).toBeNull()
  })
})
