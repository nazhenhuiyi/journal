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
  type JournalGitOperationOptions,
  type JournalGitRecentCommit,
  type JournalGitRuntime,
  type JournalGitTrace,
} from '@journal/sync'
import { loadJournalSettings, saveJournalSettings } from './journalSettings'
import {
  inspectJournalGitSyncCredentials,
  loadJournalGitSyncCredentials,
  saveJournalGitSyncCredentials,
  type JournalGitSyncCredentialStatus,
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
  credentialMessage?: string
  credentialStatus: JournalGitSyncCredentialStatus
  dirtyPaths: string[]
  hasCredentials: boolean
  hasRepository: boolean
  recentCommits: JournalGitRecentCommit[]
  remoteUrl: string
}

const defaultAuthorEmail = 'journal-desktop@example.invalid'
const defaultAuthorName = 'Journal Desktop'

export async function loadJournalGitSyncStatus(journalDirectory: string): Promise<JournalGitSyncStatus> {
  const settings = await loadJournalSettings(journalDirectory)
  const runtime = await createDesktopGitRuntime(journalDirectory)
  const credentialState = await inspectJournalGitSyncCredentials(journalDirectory)
  const hasCredentials = credentialState.status === 'available'
  const status = await getJournalGitSyncStatus(
    runtime,
    createDesktopGitConfig(settings),
    hasCredentials ? { token: 'stored' } : null,
  )

  return {
    branch: status.branch,
    credentialMessage: credentialState.status === 'available' ? undefined : credentialState.message,
    credentialStatus: credentialState.status,
    dirtyPaths: status.dirtyPaths,
    hasCredentials: status.hasCredentials,
    hasRepository: status.hasRepository,
    recentCommits: status.recentCommits,
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

export async function pushJournalChanges(
  journalDirectory: string,
  optionsPayload?: unknown,
): Promise<JournalGitSyncResult> {
  const context = await loadDesktopSyncContext(journalDirectory)
  const options = normalizeGitOperationOptions(optionsPayload)
  const result = await pushSharedJournalChanges(
    context.runtime,
    context.config,
    context.credentials,
    options,
  )

  return {
    changed: Boolean(result.localCommitOid || result.retriedPush),
    dirtyPaths: result.dirtyPathsAfterPush,
    message: result.localCommitOid || result.retriedPush ? 'Push complete' : 'Nothing to push',
  }
}

export async function syncJournalNow(
  journalDirectory: string,
  optionsPayload?: unknown,
): Promise<JournalGitSyncResult> {
  const context = await loadDesktopSyncContext(journalDirectory)
  const options = normalizeGitOperationOptions(optionsPayload)
  const result = await syncSharedJournalNow(
    context.runtime,
    context.config,
    context.credentials,
    options,
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
    trace: createDesktopGitTraceLogger(),
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

function createDesktopGitTraceLogger(): JournalGitTrace {
  return (event) => {
    const details = event.details ? ` ${JSON.stringify(event.details)}` : ''
    const error = event.errorMessage ? ` ${event.errorMessage}` : ''

    console.info(`[journal-sync] ${event.name} ${event.ok ? 'ok' : 'error'} ${event.durationMs}ms${details}${error}`)
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

function normalizeGitOperationOptions(payload: unknown): JournalGitOperationOptions {
  if (payload === undefined || payload === null) {
    return {}
  }

  if (!isRecord(payload)) {
    throw new Error('Git sync options 格式不正确。')
  }

  const options: JournalGitOperationOptions = {}

  if (payload.changedPaths !== undefined) {
    if (!Array.isArray(payload.changedPaths)) {
      throw new Error('changedPaths 格式不正确。')
    }

    options.changedPaths = payload.changedPaths.map((changedPath) => {
      if (typeof changedPath !== 'string') {
        throw new Error('changedPaths 格式不正确。')
      }

      return changedPath
    })
  }

  if (payload.collectDirtyPathsAfterSync !== undefined) {
    if (typeof payload.collectDirtyPathsAfterSync !== 'boolean') {
      throw new Error('collectDirtyPathsAfterSync 格式不正确。')
    }

    options.collectDirtyPathsAfterSync = payload.collectDirtyPathsAfterSync
  }

  return options
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
