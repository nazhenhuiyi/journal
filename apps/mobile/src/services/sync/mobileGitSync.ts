import { Buffer } from 'buffer'
import { fetch as expoFetch } from 'expo/fetch'
import http from 'isomorphic-git/http/web'
import {
  cloneJournalGitSyncRepository,
  commitJournalChanges,
  getJournalGitSyncStatus,
  initJournalGitSyncRepository,
  pullJournalUpdates,
  pushJournalChanges,
  syncJournalNow,
  type JournalGitCredentials,
  type JournalGitPullResult,
  type JournalGitPushResult,
  type JournalGitRuntime,
  type JournalGitSyncConfig,
  type JournalGitSyncResult,
  type JournalGitSyncStatus,
} from '@journal/sync'
import { ensureJournalWorktreeDirectory } from '../mobileJournalStore'
import { createExpoGitFileSystem } from './expoGitFileSystem'
import {
  loadGitHubSyncCredentials,
  type GitHubSyncCredentials,
} from './secureSyncCredentials'

export type MobileGitSyncConfig = JournalGitSyncConfig
export type MobileGitSyncStatus = JournalGitSyncStatus
export type MobileGitSyncResult = JournalGitSyncResult
export type MobileGitPushResult = JournalGitPushResult
export type MobileGitPullResult = JournalGitPullResult

const defaultAuthorEmail = 'journal-mobile@example.invalid'
const defaultAuthorName = 'Journal Mobile'
const gitHttpRequestTimeoutMs = 30_000

export async function getMobileGitSyncStatus(
  config: MobileGitSyncConfig = {},
): Promise<MobileGitSyncStatus> {
  const runtime = await createMobileGitRuntime()
  const credentials = await loadGitHubSyncCredentials()

  return getJournalGitSyncStatus(
    runtime,
    withMobileAuthorDefaults(config),
    credentials,
  )
}

export async function initMobileGitSyncRepository(
  config: MobileGitSyncConfig = {},
): Promise<MobileGitSyncStatus> {
  const runtime = await createMobileGitRuntime()

  await initJournalGitSyncRepository(runtime, withMobileAuthorDefaults(config))

  return getMobileGitSyncStatus(config)
}

export async function cloneMobileGitSyncRepository(
  config: MobileGitSyncConfig,
  credentials?: GitHubSyncCredentials,
): Promise<MobileGitSyncStatus> {
  const resolvedCredentials = await requireCredentials(credentials)
  const runtime = await createMobileGitRuntime()

  await cloneJournalGitSyncRepository(
    runtime,
    withMobileAuthorDefaults(config),
    resolvedCredentials,
  )

  return getMobileGitSyncStatus(config)
}

export async function commitMobileJournalChanges(
  config: MobileGitSyncConfig = {},
  message = 'Sync mobile journal changes',
): Promise<string | null> {
  const runtime = await createMobileGitRuntime()

  return commitJournalChanges(runtime, withMobileAuthorDefaults(config), message)
}

export async function pushMobileJournalChangesToGitHub(
  config: MobileGitSyncConfig,
  credentials?: GitHubSyncCredentials,
): Promise<MobileGitPushResult> {
  const resolvedCredentials = await requireCredentials(credentials)
  const runtime = await createMobileGitRuntime()

  return pushJournalChanges(
    runtime,
    withMobileAuthorDefaults(config),
    resolvedCredentials,
  )
}

export async function pullMobileJournalUpdatesFromGitHub(
  config: MobileGitSyncConfig,
  credentials?: GitHubSyncCredentials,
): Promise<MobileGitPullResult> {
  const resolvedCredentials = await requireCredentials(credentials)
  const runtime = await createMobileGitRuntime()

  return pullJournalUpdates(
    runtime,
    withMobileAuthorDefaults(config),
    resolvedCredentials,
  )
}

export async function syncMobileJournalWithGitHub(
  config: MobileGitSyncConfig,
  credentials?: GitHubSyncCredentials,
): Promise<MobileGitSyncResult> {
  const resolvedCredentials = await requireCredentials(credentials)
  const runtime = await createMobileGitRuntime()

  return syncJournalNow(
    runtime,
    withMobileAuthorDefaults(config),
    resolvedCredentials,
  )
}

async function createMobileGitRuntime(): Promise<JournalGitRuntime> {
  ;(globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer = Buffer

  return {
    dir: await ensureJournalWorktreeDirectory(),
    fs: createExpoGitFileSystem(),
    http: createMobileGitHttpClient(),
  }
}

function createMobileGitHttpClient(): typeof http {
  return {
    ...http,
    request: async (request) => {
      const response = await withTimeout(
        requestGitHttpWithExpoFetch(request),
        gitHttpRequestTimeoutMs,
        `GitHub request timed out: ${request.method ?? 'GET'} ${request.url}`,
      )

      return response
    },
  }
}

async function requestGitHttpWithExpoFetch(
  request: Parameters<typeof http.request>[0],
): Promise<Awaited<ReturnType<typeof http.request>>> {
  const method = request.method ?? 'GET'
  const body = await collectGitHttpBody(request.body)
  const response = await expoFetch(request.url, {
    body: body ?? undefined,
    headers: request.headers,
    method,
  })
  const bytes = new Uint8Array(await response.arrayBuffer())

  return {
    body: [bytes] as unknown as AsyncIterableIterator<Uint8Array>,
    headers: parseResponseHeaders(response.headers),
    method,
    statusCode: response.status,
    statusMessage: response.statusText,
    url: response.url || request.url,
  }
}

async function collectGitHttpBody(body: Parameters<typeof http.request>[0]['body']) {
  if (!body) {
    return null
  }

  const chunks: Uint8Array[] = []
  let size = 0

  for await (const chunk of body) {
    chunks.push(chunk)
    size += chunk.byteLength
  }

  const result = new Uint8Array(size)
  let offset = 0

  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }

  return result
}

async function requireCredentials(credentials?: GitHubSyncCredentials): Promise<JournalGitCredentials> {
  const resolvedCredentials = credentials ?? await loadGitHubSyncCredentials()

  if (!resolvedCredentials?.token) {
    throw new Error('GitHub token is required before syncing.')
  }

  return resolvedCredentials
}

function withMobileAuthorDefaults(config: MobileGitSyncConfig): MobileGitSyncConfig {
  return {
    ...config,
    authorEmail: config.authorEmail ?? defaultAuthorEmail,
    authorName: config.authorName ?? defaultAuthorName,
  }
}

function parseResponseHeaders(headers: Headers) {
  const result: Record<string, string> = {}

  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value
  })

  return result
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message))
    }, timeoutMs)
  })

  return Promise.race([
    promise,
    timeout,
  ]).finally(() => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
  })
}
