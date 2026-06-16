import type { HttpClient } from 'isomorphic-git'

export type JournalGitCredentials = {
  token: string
  username?: string
}

export type JournalGitHttpClientOptions = {
  requestTimeoutMs?: number | null
}

type Base64Buffer = {
  toString: (encoding: 'base64') => string
}

type Base64BufferConstructor = {
  from: (value: string, encoding: 'utf8') => Base64Buffer
}

type Base64RuntimeGlobals = {
  Buffer?: Base64BufferConstructor
}

type JournalGitHttpRequest = Parameters<HttpClient['request']>[0]
type JournalGitHttpResponse = Awaited<ReturnType<HttpClient['request']>>

export function createJournalGitAuthenticatedHttpClient(
  http: HttpClient,
  credentials?: JournalGitCredentials | null,
  options: JournalGitHttpClientOptions = {},
): HttpClient {
  return {
    ...http,
    request: async (request) => {
      const requestTimeoutMs = normalizeGitHttpRequestTimeoutMs(options.requestTimeoutMs)
      const authenticatedRequest = {
        ...request,
        headers: createJournalGitAuthHeaders(request.headers, credentials),
      }
      const timeoutAt = requestTimeoutMs === null ? null : Date.now() + requestTimeoutMs
      const response = await withGitHttpRequestTimeout(
        http.request(authenticatedRequest),
        timeoutAt,
        authenticatedRequest,
        requestTimeoutMs,
      )

      if (!response.body || timeoutAt === null || requestTimeoutMs === null) {
        return response
      }

      return {
        ...response,
        body: withGitHttpBodyTimeout(
          response.body,
          timeoutAt,
          authenticatedRequest,
          requestTimeoutMs,
        ),
      }
    },
  }
}

export function createJournalGitAuthHeaders(
  headers: Record<string, string> | undefined,
  credentials?: JournalGitCredentials | null,
) {
  const nextHeaders = {
    ...(headers ?? {}),
  }

  if (!credentials?.token || hasAuthorizationHeader(nextHeaders)) {
    return nextHeaders
  }

  nextHeaders.Authorization = `Basic ${encodeBase64(
    `${getJournalGitAuthUsername(credentials)}:${credentials.token}`,
  )}`

  return nextHeaders
}

export function getJournalGitAuthenticationErrorMessage(error: unknown) {
  const statusCode = getErrorStatusCode(error)

  if (statusCode === 401) {
    return 'GitHub token 无效或已过期，请重新保存 token。'
  }

  if (statusCode === 403) {
    return 'GitHub token 没有访问这个仓库的权限，请检查 token 权限或重新保存。'
  }

  const message = getErrorMessage(error)

  if (
    /\b(?:401|403)\b/.test(message) ||
    /bad credentials|authentication failed|authorization failed|not authorized|unauthorized|forbidden/i.test(message)
  ) {
    return 'GitHub token 或仓库权限无效，请重新保存 token 或检查仓库权限。'
  }

  return null
}

function normalizeGitHttpRequestTimeoutMs(requestTimeoutMs: number | null | undefined) {
  if (requestTimeoutMs === undefined || requestTimeoutMs === null) {
    return null
  }

  return Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0 ? requestTimeoutMs : null
}

async function withGitHttpRequestTimeout<T>(
  promise: Promise<T>,
  timeoutAt: number | null,
  request: JournalGitHttpRequest,
  requestTimeoutMs: number | null,
): Promise<T> {
  if (timeoutAt === null || requestTimeoutMs === null) {
    return promise
  }

  const remainingMs = timeoutAt - Date.now()

  if (remainingMs <= 0) {
    throw createGitHttpRequestTimeoutError(request, requestTimeoutMs)
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createGitHttpRequestTimeoutError(request, requestTimeoutMs))
    }, remainingMs)
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

async function* withGitHttpBodyTimeout(
  body: NonNullable<JournalGitHttpResponse['body']>,
  timeoutAt: number,
  request: JournalGitHttpRequest,
  requestTimeoutMs: number,
): AsyncIterableIterator<Uint8Array> {
  const iterator = body[Symbol.asyncIterator]()

  while (true) {
    const result = await withGitHttpRequestTimeout(
      iterator.next(),
      timeoutAt,
      request,
      requestTimeoutMs,
    )

    if (result.done) {
      return
    }

    yield result.value
  }
}

function createGitHttpRequestTimeoutError(
  request: JournalGitHttpRequest,
  requestTimeoutMs: number,
) {
  return new Error(
    `GitHub 请求超时（${Math.round(requestTimeoutMs / 1000)} 秒）：${request.method ?? 'GET'} ${request.url}`,
  )
}

function getJournalGitAuthUsername(credentials: JournalGitCredentials) {
  return credentials.username ?? 'x-access-token'
}

function getErrorStatusCode(error: unknown) {
  if (!isRecord(error)) {
    return null
  }

  const directStatusCode = normalizeHttpStatusCode(error.statusCode) ??
    normalizeHttpStatusCode(error.status)

  if (directStatusCode !== null) {
    return directStatusCode
  }

  return isRecord(error.data)
    ? normalizeHttpStatusCode(error.data.statusCode) ?? normalizeHttpStatusCode(error.data.status)
    : null
}

function normalizeHttpStatusCode(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value)
    ? value
    : null
}

function hasAuthorizationHeader(headers: Record<string, string>) {
  return Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')
}

function encodeBase64(value: string) {
  const runtimeGlobals = globalThis as Base64RuntimeGlobals

  if (!runtimeGlobals.Buffer) {
    throw new Error('Base64 encoding requires a runtime Buffer implementation.')
  }

  return runtimeGlobals.Buffer.from(value, 'utf8').toString('base64')
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Git authentication failed.'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
