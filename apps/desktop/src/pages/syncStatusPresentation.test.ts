import { describe, expect, it } from 'vitest'
import type { SyncSnapshot } from '@journal/sync/scheduler'
import { getSyncStatusPresentation } from './syncStatusPresentation'

const syncedSnapshot: SyncSnapshot = {
  lastError: null,
  lastSyncedAt: '2026-06-09T00:00:00.000Z',
  pendingReason: null,
  status: 'synced',
}

describe('getSyncStatusPresentation', () => {
  it('does not show synced while local writing is not saved yet', () => {
    const presentation = getSyncStatusPresentation(
      syncedSnapshot,
      '',
      'https://github.com/example/journal.git',
      true,
      { hasUnsavedLocalChanges: true },
    )

    expect(presentation.label).toBe('书写中')
  })

  it('presents pending local save as saved', () => {
    const presentation = getSyncStatusPresentation(
      {
        ...syncedSnapshot,
        pendingReason: 'local-save',
        status: 'pending',
      },
      '',
      'https://github.com/example/journal.git',
      true,
    )

    expect(presentation.label).toBe('已保存')
  })
})
