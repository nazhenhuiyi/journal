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

  it('rejects unsafe or incomplete links', () => {
    expect(parseJournalDeepLink('https://example.com')).toBeNull()
    expect(parseJournalDeepLink('journal://write')).toBeNull()
    expect(parseJournalDeepLink('journal://review-day?date=bad')).toBeNull()
  })
})
