import { describe, expect, it } from 'vitest'
import {
  JournalSyncBlockedError,
  createJournalSyncBlockedError,
  getJournalSyncBlock,
  normalizeSyncBlock,
} from './syncBlock'

describe('sync blocked errors', () => {
  it('normalizes blocked payloads', () => {
    expect(normalizeSyncBlock({
      message: '  needs attention  ',
      paths: ['b.md', 'a.md', 'a.md', ''],
      reason: 'content-conflict',
      retryAfterMs: 10.2,
    })).toEqual({
      message: 'needs attention',
      paths: ['a.md', 'b.md'],
      reason: 'content-conflict',
      retryAfterMs: 11,
    })
  })

  it('creates errors that expose a stable sync block', () => {
    const cause = new Error('inner')
    const error = createJournalSyncBlockedError({
      message: 'Choose sync direction.',
      paths: ['entries/2026/06/2026-06-16.md'],
      reason: 'first-sync-needs-choice',
    }, cause)

    expect(error).toBeInstanceOf(JournalSyncBlockedError)
    expect(error.message).toBe('Choose sync direction.')
    expect(error.cause).toBe(cause)
    expect(getJournalSyncBlock(error)).toEqual({
      message: 'Choose sync direction.',
      paths: ['entries/2026/06/2026-06-16.md'],
      reason: 'first-sync-needs-choice',
    })
  })

  it('finds a block on plain error-like objects', () => {
    expect(getJournalSyncBlock({
      block: {
        message: 'Local object store needs repair.',
        reason: 'object-store-corrupt',
      },
    })).toEqual({
      message: 'Local object store needs repair.',
      reason: 'object-store-corrupt',
    })
  })
})
