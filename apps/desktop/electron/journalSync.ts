import * as fs from 'node:fs'
import { mkdir } from 'node:fs/promises'
import http from 'isomorphic-git/http/node'
import {
  assertSafeRemoteUrl,
  getJournalGitSyncStatus,
  initJournalGitSyncRepository,
  pullJournalUpdates as pullSharedJournalUpdates,
  pushJournalChanges as pushSharedJournalChanges,
  syncJournalNow as syncSharedJournalNow,
  type JournalGitCredentials,
  type JournalGitRuntime,
} from '@journal/sync'
import { loadJournalSettings, saveJournalSettings } from './journalSettings'
import {
  hasJournalGitSyncCredentials,
  loadJournalGitSyncCredentials,
  saveJournalGitSyncCredentials,
} from './journalSyncCredentials'

export type JournalSyncSettingsPayload = {
  syncBranch?: unknown
  syncRemoteUrl?: unknown
  syncToken?: unknown
}

export type JournalGitSyncResult = {
  changed: boolean
  dirtyPaths: string[]
  message: string
}

export type JournalGitSyncStatus = {
  branch: string
  dirtyPaths: string[]
  hasCredentials: boolean
  hasRepository: boolean
  remoteUrl: string
}

const defaultAuthorEmail = 'journal-desktop@example.invalid'
const defaultAuthorName = 'Journal Desktop'

export async function loadJournalGitSyncStatus(journalDirectory: string): Promise<JournalGitSyncStatus> {
  const settings = await loadJournalSettings(journalDirectory)
  const runtime = await createDesktopGitRuntime(journalDirectory)
  const hasCredentials = await hasJournalGitSyncCredentials(journalDirectory)
  const status = await getJournalGitSyncStatus(
    runtime,
    createDesktopGitConfig(settings),
    hasCredentials ? { token: 'stored' } : null,
  )

  return {
    branch: status.branch,
    dirtyPaths: status.dirtyPaths,
    hasCredentials: status.hasCredentials,
    hasRepository: status.hasRepository,
    remoteUrl: settings.syncRemoteUrl,
  }
}

export async function saveJournalGitSyncSettings(
  journalDirectory: string,
  payload: unknown,
) {
  assertSafeRemoteUrlPayload(payload)

  const syncToken = normalizeSyncTokenPayload(payload)

  if (syncToken !== null) {
    await saveJournalGitSyncCredentials(journalDirectory, {
      token: syncToken,
    })
  }

  const settings = await saveJournalSettings(journalDirectory, payload)

  if (settings.syncRemoteUrl) {
    await initJournalGitSyncRepository(
      await createDesktopGitRuntime(journalDirectory),
      createDesktopGitConfig(settings),
    )
  }

  return loadJournalGitSyncStatus(journalDirectory)
}

export async function pullJournalUpdates(journalDirectory: string): Promise<JournalGitSyncResult> {
  const context = await loadDesktopSyncContext(journalDirectory)
  const result = await pullSharedJournalUpdates(
    context.runtime,
    context.config,
    context.credentials,
  )

  return {
    changed: result.updatedWorktree || Boolean(result.mergeCommitOid),
    dirtyPaths: result.dirtyPathsAfterPull,
    message: 'Pull complete',
  }
}

export async function pushJournalChanges(journalDirectory: string): Promise<JournalGitSyncResult> {
  const context = await loadDesktopSyncContext(journalDirectory)
  const result = await pushSharedJournalChanges(
    context.runtime,
    context.config,
    context.credentials,
  )

  return {
    changed: Boolean(result.localCommitOid || result.retriedPush),
    dirtyPaths: result.dirtyPathsAfterPush,
    message: result.localCommitOid || result.retriedPush ? 'Push complete' : 'Nothing to push',
  }
}

export async function syncJournalNow(journalDirectory: string): Promise<JournalGitSyncResult> {
  const context = await loadDesktopSyncContext(journalDirectory)
  const result = await syncSharedJournalNow(
    context.runtime,
    context.config,
    context.credentials,
  )

  return {
    changed: Boolean(
      result.localCommitOid ||
        result.mergeCommitOid ||
        result.mergeResult ||
        result.retriedPush,
    ),
    dirtyPaths: result.dirtyPathsAfterSync,
    message: 'Sync complete',
  }
}

async function loadDesktopSyncContext(journalDirectory: string) {
  const settings = await loadJournalSettings(journalDirectory)
  const credentials = await loadJournalGitSyncCredentials(journalDirectory)

  if (!credentials?.token) {
    throw new Error('请先保存 GitHub token。')
  }

  const gitCredentials: JournalGitCredentials = credentials

  return {
    config: createDesktopGitConfig(settings),
    credentials: gitCredentials,
    runtime: await createDesktopGitRuntime(journalDirectory),
  }
}

async function createDesktopGitRuntime(journalDirectory: string): Promise<JournalGitRuntime> {
  await mkdir(journalDirectory, { recursive: true })

  return {
    dir: journalDirectory,
    fs,
    http,
  }
}

function createDesktopGitConfig(settings: {
  syncBranch: string
  syncRemoteUrl: string
}) {
  return {
    authorEmail: defaultAuthorEmail,
    authorName: defaultAuthorName,
    branch: settings.syncBranch,
    remoteUrl: settings.syncRemoteUrl,
  }
}

function normalizeSyncTokenPayload(payload: unknown) {
  if (!isRecord(payload) || payload.syncToken === undefined) {
    return null
  }

  if (typeof payload.syncToken !== 'string') {
    throw new Error('GitHub token 格式不正确。')
  }

  const token = payload.syncToken.trim()

  return token || null
}

function assertSafeRemoteUrlPayload(payload: unknown) {
  if (!isRecord(payload) || payload.syncRemoteUrl === undefined || payload.syncRemoteUrl === null) {
    return
  }

  if (typeof payload.syncRemoteUrl === 'string') {
    assertSafeRemoteUrl(payload.syncRemoteUrl)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
