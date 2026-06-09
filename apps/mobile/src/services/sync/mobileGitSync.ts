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
  type JournalGitOperationOptions,
  type JournalGitPullResult,
  type JournalGitPushResult,
  type JournalGitRuntime,
  type JournalGitSyncConfig,
  type JournalGitSyncResult,
  type JournalGitSyncStatus,
  type JournalGitTrace,
} from '@journal/sync'
import { ensureJournalWorktreeDirectory } from '../mobileJournalStore'
import { createExpoGitFileSystem } from './expoGitFileSystem'
import {
  loadGitHubSyncCredentials,
  type GitHubSyncCredentials,
} from './secureSyncCredentials'

export type MobileGitSyncConfig = JournalGitSyncConfig
export type MobileGitOperationOptions = JournalGitOperationOptions
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
  const credentialState = await loadGitHubSyncCredentials()

  return getJournalGitSyncStatus(
    runtime,
    withMobileAuthorDefaults(config),
    credentialState.status === 'available' ? credentialState.credentials : null,
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

async function createMobileGitRuntime(): Promise<JournalGitRuntime> {
  globalThis.Buffer = Buffer
  const trace = createMobileGitTraceLogger()

  return {
    dir: await ensureJournalWorktreeDirectory(),
    fs: createExpoGitFileSystem(),
    http: createMobileGitHttpClient(trace),
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
          details: createGitHttpTraceDetails(request, response.statusCode),
          durationMs: Date.now() - startedAt,
          name: 'http.gitRequest',
          ok: true,
        })

        return response
      } catch (error) {
        trace?.({
          details: createGitHttpTraceDetails(request),
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
  }
}

function createMobileGitTraceLogger(): JournalGitTrace | undefined {
  const nodeEnv = (globalThis as typeof globalThis & {
    process?: { env?: { NODE_ENV?: string } }
  }).process?.env?.NODE_ENV

  if (nodeEnv === 'test') {
    return undefined
  }

  return (event) => {
    const details = event.details ? ` ${JSON.stringify(event.details)}` : ''
    const error = event.errorMessage ? ` error=${event.errorMessage}` : ''
    const status = event.ok ? 'ok' : 'error'

    console.info(`[journal-sync] ${event.name} ${status} ${event.durationMs}ms${details}${error}`)
  }
}

function createGitHttpTraceDetails(
  request: Parameters<typeof http.request>[0],
  statusCode: number | null = null,
) {
  return {
    host: getGitHttpHost(request.url),
    method: request.method ?? 'GET',
    service: getGitHttpService(request.url),
    statusCode,
  }
}

function getGitHttpHost(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}

function getGitHttpService(url: string) {
  try {
    const parsedUrl = new URL(url)
    const service = parsedUrl.searchParams.get('service')

    if (service) {
      return service
    }

    if (parsedUrl.pathname.endsWith('/git-upload-pack')) {
      return 'git-upload-pack'
    }

    if (parsedUrl.pathname.endsWith('/git-receive-pack')) {
      return 'git-receive-pack'
    }
  } catch {
    // Keep trace details intentionally non-fatal.
  }

  return 'unknown'
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
