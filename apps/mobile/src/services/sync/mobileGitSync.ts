import { Buffer } from 'buffer'
import { fetch as expoFetch } from 'expo/fetch'
import http from 'isomorphic-git/http/web'
import {
  cloneJournalGitSyncRepository,
  commitJournalChanges,
  createJournalGitObjectRepairThrottle,
  getJournalGitSyncStatus,
  initJournalGitSyncRepository,
  pullJournalUpdates,
  pushJournalChanges,
  resolveJournalContentConflict,
  syncJournalNow,
  type JournalGitConflictResolutionOptions,
  type JournalGitConflictResolutionResult,
  type JournalGitCredentials,
  type JournalGitOperationOptions,
  type JournalGitPullResult,
  type JournalGitPushResult,
  type JournalGitRuntime,
  type JournalGitSyncConfig,
  type JournalGitSyncResult,
  type JournalGitSyncStatus,
  type JournalGitSyncStatusOptions,
  type JournalGitTrace,
} from '@journal/sync'
import { ensureJournalWorktreeDirectory } from '../mobileJournalStore'
import { createExpoGitFileSystem } from './expoGitFileSystem'
import {
  loadGitHubSyncCredentials,
  type GitHubSyncCredentials,
} from './secureSyncCredentials'
import {
  createMobileGitHttpTraceDetails,
  createMobileSyncTrace,
} from './mobileSyncTrace'

export type MobileGitSyncConfig = JournalGitSyncConfig
export type MobileGitOperationOptions = JournalGitOperationOptions
export type MobileGitConflictResolutionOptions = JournalGitConflictResolutionOptions
export type MobileGitConflictResolutionResult = JournalGitConflictResolutionResult
export type MobileGitSyncStatus = JournalGitSyncStatus
export type MobileGitSyncStatusOptions = JournalGitSyncStatusOptions
export type MobileGitSyncResult = JournalGitSyncResult
export type MobileGitPushResult = JournalGitPushResult
export type MobileGitPullResult = JournalGitPullResult

const defaultAuthorEmail = 'journal-mobile-sync@example.invalid'
const defaultAuthorName = 'Journal Mobile Sync'
const defaultCommitMessage = 'Sync mobile journal changes'
const gitHttpRequestTimeoutMs = 300_000
const mobileObjectRepairThrottle = createJournalGitObjectRepairThrottle()

export async function getMobileGitSyncStatus(
  config: MobileGitSyncConfig = {},
  options: MobileGitSyncStatusOptions = {},
): Promise<MobileGitSyncStatus> {
  const runtime = await createMobileGitRuntime()
  const credentialState = await loadGitHubSyncCredentials()

  return getJournalGitSyncStatus(
    runtime,
    withMobileAuthorDefaults(config),
    credentialState.status === 'available' ? credentialState.credentials : null,
    options,
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
  message = defaultCommitMessage,
  options: MobileGitOperationOptions = {},
): Promise<string | null> {
  const runtime = await createMobileGitRuntime()

  return commitJournalChanges(runtime, withMobileAuthorDefaults(config), message, options)
}

export async function pushMobileJournalChangesToGitHub(
  config: MobileGitSyncConfig,
  credentials?: GitHubSyncCredentials,
  options: MobileGitOperationOptions = {},
): Promise<MobileGitPushResult> {
  const resolvedCredentials = await requireCredentials(credentials)
  const runtime = await createMobileGitRuntime()

  return pushJournalChanges(
    runtime,
    withMobileAuthorDefaults(config),
    resolvedCredentials,
    options,
  )
}

export async function pullMobileJournalUpdatesFromGitHub(
  config: MobileGitSyncConfig,
  credentials?: GitHubSyncCredentials,
  options: MobileGitOperationOptions = {},
): Promise<MobileGitPullResult> {
  const resolvedCredentials = await requireCredentials(credentials)
  const runtime = await createMobileGitRuntime()

  return pullJournalUpdates(
    runtime,
    withMobileAuthorDefaults(config),
    resolvedCredentials,
    options,
  )
}

export async function syncMobileJournalWithGitHub(
  config: MobileGitSyncConfig,
  credentials?: GitHubSyncCredentials,
  options: MobileGitOperationOptions = {},
): Promise<MobileGitSyncResult> {
  const resolvedCredentials = await requireCredentials(credentials)
  const runtime = await createMobileGitRuntime()

  return syncJournalNow(
    runtime,
    withMobileAuthorDefaults(config),
    resolvedCredentials,
    options,
  )
}

export async function resolveMobileJournalSyncConflict(
  config: MobileGitSyncConfig,
  options: MobileGitConflictResolutionOptions,
  credentials?: GitHubSyncCredentials,
): Promise<MobileGitConflictResolutionResult> {
  const resolvedCredentials = await requireCredentials(credentials)
  const runtime = await createMobileGitRuntime()

  return resolveJournalContentConflict(
    runtime,
    withMobileAuthorDefaults(config),
    resolvedCredentials,
    options,
  )
}

async function createMobileGitRuntime(): Promise<JournalGitRuntime> {
  const globalWithBuffer = globalThis as typeof globalThis & { Buffer: typeof Buffer }

  globalWithBuffer.Buffer = Buffer
  const trace = createMobileSyncTrace()

  return {
    cache: {},
    dir: await ensureJournalWorktreeDirectory(),
    fs: createExpoGitFileSystem(),
    http: createMobileGitHttpClient(trace),
    objectRepairThrottle: mobileObjectRepairThrottle,
    trace,
  }
}

function createMobileGitHttpClient(trace?: JournalGitTrace): typeof http {
  return {
    ...http,
    request: async (request) => {
      const startedAt = Date.now()

      try {
        const response = await withTimeout(
          requestGitHttpWithExpoFetch(request),
          gitHttpRequestTimeoutMs,
          `GitHub request timed out: ${request.method ?? 'GET'} ${request.url}`,
        )

        trace?.({
          details: createMobileGitHttpTraceDetails(request, response.statusCode),
          durationMs: Date.now() - startedAt,
          name: 'http.gitRequest',
          ok: true,
        })

        return response
      } catch (error) {
        trace?.({
          details: createMobileGitHttpTraceDetails(request),
          durationMs: Date.now() - startedAt,
          errorMessage: getErrorMessage(error),
          name: 'http.gitRequest',
          ok: false,
        })

        throw error
      }
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
    body: createGitHttpResponseBody(bytes),
    headers: parseResponseHeaders(response.headers),
    method,
    statusCode: response.status,
    statusMessage: response.statusText,
    url: response.url || request.url,
  }
}

async function* createGitHttpResponseBody(bytes: Uint8Array): AsyncIterableIterator<Uint8Array> {
  yield bytes
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
  if (credentials) {
    return credentials
  }

  const credentialState = await loadGitHubSyncCredentials()

  if (credentialState.status === 'available') {
    return credentialState.credentials
  }

  if (credentialState.status === 'corrupt') {
    throw new Error(credentialState.message ?? 'GitHub token 无法读取，请重新保存。')
  }

  throw new Error('GitHub token is required before syncing.')
}

function withMobileAuthorDefaults(config: MobileGitSyncConfig): MobileGitSyncConfig {
  return {
    ...config,
    authorEmail: config.authorEmail ?? defaultAuthorEmail,
    authorName: config.authorName ?? defaultAuthorName,
    commitMessage: config.commitMessage ?? defaultCommitMessage,
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'GitHub sync request failed.'
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
