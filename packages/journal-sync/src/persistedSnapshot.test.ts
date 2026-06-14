import { describe, expect, it } from 'vitest'
import { JournalSyncCoordinator } from './scheduler'
import {
  createPersistedSyncSnapshot,
  createSyncSnapshotPersistenceIdentity,
  normalizePersistedSyncSnapshot,
  normalizeRestoredSyncSnapshot,
  shouldPersistSyncSnapshot,
} from './persistedSnapshot'

describe('persisted sync snapshots', () => {
  const identity = createSyncSnapshotPersistenceIdentity({
    branch: 'main',
    remoteUrl: 'https://github.com/example/journal-sync.git',
  })

  it('round-trips a synced snapshot for the matching identity', () => {
    const persisted = createPersistedSyncSnapshot({
      identity,
      now: new Date('2026-06-14T12:30:00.000Z'),
      snapshot: {
        lastError: null,
        lastSyncedAt: '2026-06-14T12:00:00.000Z',
        pendingReason: null,
        status: 'synced',
      },
    })

    expect(persisted).toEqual({
      identity,
      snapshot: {
        lastError: null,
        lastSyncedAt: '2026-06-14T12:00:00.000Z',
        pendingReason: null,
        status: 'synced',
      },
      updatedAt: '2026-06-14T12:30:00.000Z',
      version: 1,
    })
    expect(normalizePersistedSyncSnapshot(persisted, identity)?.snapshot.status).toBe('synced')
  })

  it('ignores snapshots for a different remote or branch', () => {
    const persisted = createPersistedSyncSnapshot({
      identity,
      snapshot: {
        lastError: null,
        lastSyncedAt: '2026-06-14T12:00:00.000Z',
        pendingReason: null,
        status: 'synced',
      },
    })

    expect(normalizePersistedSyncSnapshot(persisted, {
      branch: 'preview',
      remoteUrl: identity.remoteUrl,
    })).toBeNull()
    expect(normalizePersistedSyncSnapshot(persisted, {
      branch: identity.branch,
      remoteUrl: 'https://github.com/example/other.git',
    })).toBeNull()
  })

  it('drops invalid persisted payloads', () => {
    expect(normalizePersistedSyncSnapshot(null, identity)).toBeNull()
    expect(normalizePersistedSyncSnapshot({
      identity,
      snapshot: {
        lastError: null,
        lastSyncedAt: 'not-a-date',
        pendingReason: null,
        status: 'unknown',
      },
      updatedAt: '2026-06-14T12:30:00.000Z',
      version: 1,
    }, identity)).toBeNull()
    expect(normalizePersistedSyncSnapshot({
      identity,
      snapshot: {
        lastError: null,
        lastSyncedAt: '2026-06-14T12:00:00.000Z',
        pendingReason: null,
        status: 'synced',
      },
      updatedAt: 'not-a-date',
      version: 1,
    }, identity)).toBeNull()
  })

  it('normalizes an interrupted syncing snapshot to a stable state', () => {
    expect(normalizeRestoredSyncSnapshot({
      lastError: null,
      lastSyncedAt: '2026-06-14T12:00:00.000Z',
      pendingReason: null,
      status: 'syncing',
    })).toEqual({
      lastError: null,
      lastSyncedAt: '2026-06-14T12:00:00.000Z',
      pendingReason: null,
      status: 'synced',
    })

    expect(normalizeRestoredSyncSnapshot({
      lastError: null,
      lastSyncedAt: null,
      pendingReason: 'local-save',
      status: 'syncing',
    })).toEqual({
      lastError: null,
      lastSyncedAt: null,
      pendingReason: 'local-save',
      status: 'pending',
    })
  })

  it('keeps retry and error states even when an older sync time exists', () => {
    expect(normalizeRestoredSyncSnapshot({
      lastError: 'network down',
      lastSyncedAt: '2026-06-14T12:00:00.000Z',
      pendingReason: 'retry',
      status: 'retrying',
    })).toEqual({
      lastError: 'network down',
      lastSyncedAt: '2026-06-14T12:00:00.000Z',
      pendingReason: 'retry',
      status: 'retrying',
    })

    expect(normalizeRestoredSyncSnapshot({
      lastError: 'pull failed',
      lastSyncedAt: '2026-06-14T12:00:00.000Z',
      pendingReason: null,
      status: 'error',
    })).toEqual({
      lastError: 'pull failed',
      lastSyncedAt: '2026-06-14T12:00:00.000Z',
      pendingReason: null,
      status: 'error',
    })
  })

  it('does not persist idle snapshots without a sync time', () => {
    expect(shouldPersistSyncSnapshot({
      lastError: null,
      lastSyncedAt: null,
      pendingReason: null,
      status: 'idle',
    })).toBe(false)
  })

  it('restores a coordinator snapshot without surfacing syncing', () => {
    const coordinator = new JournalSyncCoordinator({
      initialSnapshot: {
        lastError: null,
        lastSyncedAt: '2026-06-14T12:00:00.000Z',
        pendingReason: null,
        status: 'syncing',
      },
      runOperation: async () => ({ skipped: true }),
    })

    expect(coordinator.getSnapshot()).toEqual({
      lastError: null,
      lastSyncedAt: '2026-06-14T12:00:00.000Z',
      pendingReason: null,
      status: 'synced',
    })
  })
})
