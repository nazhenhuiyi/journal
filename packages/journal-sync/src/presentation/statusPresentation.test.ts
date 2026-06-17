import { describe, expect, it } from 'vitest'
import type { SyncSnapshot } from '../state/scheduler'
import {
  getJournalSyncBlockPresentation,
  getJournalSyncStatusPresentation,
} from './statusPresentation'

const syncedSnapshot: SyncSnapshot = {
  block: null,
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

  it.each([
    ['content-conflict', '需要处理冲突'],
    ['first-sync-needs-choice', '需要选择方向'],
    ['unrelated-histories', '历史不兼容'],
    ['object-store-corrupt', '本地仓库需修复'],
  ] as const)('presents blocked reason %s', (reason, label) => {
    const presentation = getJournalSyncStatusPresentation(
      {
        ...syncedSnapshot,
        block: {
          message: '同步需要处理后再继续。',
          reason,
        },
        lastError: '同步需要处理后再继续。',
        status: 'blocked',
      },
      '旧成功文案不应覆盖阻断状态',
      'https://github.com/example/journal.git',
      true,
    )

    expect(presentation.kind).toBe('blocked')
    expect(presentation.label).toBe(label)
  })
})

describe('getJournalSyncBlockPresentation', () => {
  it('presents content conflicts with paths and a resolution action', () => {
    const presentation = getJournalSyncBlockPresentation({
      conflicts: [{
        ours: '本机内容',
        path: 'entries/2026/06/2026-06-08.md',
        theirs: '远端内容',
      }],
      message: '日记内容存在需要人工处理的合并冲突。',
      paths: ['entries/2026/06/2026-06-08.md'],
      reason: 'content-conflict',
    })

    expect(presentation).toMatchObject({
      action: 'resolve-content-conflict',
      conflicts: [{
        ours: '本机内容',
        path: 'entries/2026/06/2026-06-08.md',
        theirs: '远端内容',
      }],
      detail: '本机和远端改到了同一段内容，同步已暂停。',
      paths: ['entries/2026/06/2026-06-08.md'],
      suggestion: '选择保留本机、保留远端，或把两段都留下后继续。',
      title: '内容有冲突',
      tone: 'danger',
    })
  })
})
