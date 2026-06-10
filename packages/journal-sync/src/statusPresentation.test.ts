import { describe, expect, it } from 'vitest'
import type { SyncSnapshot } from './scheduler'
import { getJournalSyncStatusPresentation } from './statusPresentation'

const syncedSnapshot: SyncSnapshot = {
  lastError: null,
  lastSyncedAt: '2026-06-09T00:00:00.000Z',
  pendingReason: null,
  status: 'synced',
}

describe('getJournalSyncStatusPresentation', () => {
  it('does not show synced while local writing is not saved yet', () => {
    const presentation = getJournalSyncStatusPresentation(
      syncedSnapshot,
      '',
      'https://github.com/example/journal.git',
      true,
      { hasUnsavedLocalChanges: true },
    )

    expect(presentation.label).toBe('书写中')
  })

  it('presents pending local sync as saved', () => {
    const presentation = getJournalSyncStatusPresentation(
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

  it('keeps the main surface quiet when sync is not configured', () => {
    const presentation = getJournalSyncStatusPresentation(
      {
        ...syncedSnapshot,
        lastSyncedAt: null,
        status: 'idle',
      },
      '',
      '',
      false,
      { showConfigurationState: false },
    )

    expect(presentation.label).toBe('已保存')
  })

  it('can show configuration state for settings surfaces', () => {
    const presentation = getJournalSyncStatusPresentation(
      {
        ...syncedSnapshot,
        lastSyncedAt: null,
        status: 'idle',
      },
      '',
      '',
      false,
      { showConfigurationState: true },
    )

    expect(presentation.label).toBe('未配置')
  })

  it('keeps the main surface quiet when sync is configured but idle', () => {
    const presentation = getJournalSyncStatusPresentation(
      {
        ...syncedSnapshot,
        lastSyncedAt: null,
        status: 'idle',
      },
      '',
      'https://github.com/example/journal.git',
      true,
    )

    expect(presentation.label).toBe('已保存')
  })

  it('can show saved configuration for settings surfaces', () => {
    const presentation = getJournalSyncStatusPresentation(
      {
        ...syncedSnapshot,
        lastSyncedAt: null,
        status: 'idle',
      },
      '',
      'https://github.com/example/journal.git',
      true,
      { showConfigurationState: true },
    )

    expect(presentation.label).toBe('已配置')
  })

  it('does not let an older sync timestamp hide retry state', () => {
    const presentation = getJournalSyncStatusPresentation(
      {
        ...syncedSnapshot,
        lastError: 'network unavailable',
        pendingReason: 'retry',
        status: 'retrying',
      },
      '',
      'https://github.com/example/journal.git',
      true,
    )

    expect(presentation.label).toBe('稍后重试')
  })

  it('does not let an older sync timestamp hide error state', () => {
    const presentation = getJournalSyncStatusPresentation(
      {
        ...syncedSnapshot,
        lastError: 'pull failed',
        status: 'error',
      },
      '',
      'https://github.com/example/journal.git',
      true,
    )

    expect(presentation.label).toBe('同步受阻')
  })
})
