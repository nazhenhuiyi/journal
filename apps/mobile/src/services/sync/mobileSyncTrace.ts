import {
  createConsoleJournalGitTraceSink,
  createJournalGitTrace,
  type JournalGitTrace,
  type JournalGitTraceDetails,
  type JournalGitTraceSink,
} from '@journal/sync'

type GitHttpTraceRequest = {
  method?: string
  url: string
}

export function createMobileSyncTrace(
  sinks: readonly JournalGitTraceSink[] = [createConsoleJournalGitTraceSink()],
): JournalGitTrace | undefined {
  if (isTestEnvironment() || sinks.length === 0) {
    return undefined
  }

  return createJournalGitTrace(sinks)
}

export function createMobileGitHttpTraceDetails(
  request: GitHttpTraceRequest,
  statusCode: number | null = null,
): JournalGitTraceDetails {
  return {
    host: getGitHttpHost(request.url),
    method: request.method ?? 'GET',
    service: getGitHttpService(request.url),
    statusCode,
  }
}

function isTestEnvironment() {
  return (globalThis as typeof globalThis & {
    process?: { env?: { NODE_ENV?: string } }
  }).process?.env?.NODE_ENV === 'test'
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
    // Trace details are diagnostic only.
  }

  return 'unknown'
}
