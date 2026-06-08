import type {
  FetchResult,
  FsClient,
  HttpClient,
  MergeResult,
  PushResult,
  StatusRow,
} from 'isomorphic-git'
import * as defaultGit from 'isomorphic-git'
import { createLastWriteWinsMergeDriver } from './lastWriteWins'

export type JournalGitCredentials = {
  token: string
  username?: string
}

export type JournalGitSyncConfig = {
  authorEmail?: string
  authorName?: string
  branch?: string
  remote?: string
  remoteUrl?: string
}

export type JournalGitRuntime = {
  dir: string
  fs: FsClient
  git?: typeof defaultGit
  http: HttpClient
}

export type JournalGitSyncStatus = {
  branch: string
  dirtyPaths: string[]
  hasCredentials: boolean
  hasRepository: boolean
  remoteUrl: string | null
  worktreeDirectory: string
}

export type JournalGitSyncResult = {
  dirtyPathsAfterSync: string[]
  fetchResult: FetchResult | null
  localCommitOid: string | null
  mergeCommitOid: string | null
  mergeResult: MergeResult | null
  pushResult: PushResult | null
  retriedPush: boolean
}

export type JournalGitPushResult = {
  dirtyPathsAfterPush: string[]
  localCommitOid: string | null
  pushResult: PushResult | null
  retriedPush: boolean
}

export type JournalGitPullResult = {
  dirtyPathsAfterPull: string[]
  fetchResult: FetchResult | null
  mergeCommitOid: string | null
  mergeResult: MergeResult | null
  updatedWorktree: boolean
}

type PromiseStatFileSystem = {
  promises: {
    stat: (path: string) => Promise<unknown>
  }
}

const defaultAuthorEmail = 'journal-sync@example.invalid'
const defaultAuthorName = 'Journal Sync'
const defaultBranch = 'main'
const defaultRemote = 'origin'
const trackedPathPrefixes = [
  'annotations/',
  'entries/',
  'media/',
]
const trackedPathFiles = new Set(['manifest.json'])

export function createJournalGitAuthenticatedHttpClient(
  http: HttpClient,
  credentials?: JournalGitCredentials | null,
): HttpClient {
  return {
    ...http,
    request: (request) => http.request({
      ...request,
      headers: createJournalGitAuthHeaders(request.headers, credentials),
    }),
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

export async function getJournalGitSyncStatus(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig = {},
  credentials: JournalGitCredentials | null = null,
): Promise<JournalGitSyncStatus> {
  const hasRepository = await hasGitRepository(runtime)
  const branch = hasRepository
    ? await getCurrentBranch(runtime, config.branch ?? defaultBranch)
    : config.branch ?? defaultBranch
  const remoteUrl = hasRepository
    ? await getRemoteUrl(runtime, config.remote ?? defaultRemote)
    : config.remoteUrl ?? null
  const dirtyPaths = hasRepository ? await getDirtyTrackedPaths(runtime) : []

  return {
    branch,
    dirtyPaths,
    hasCredentials: credentials !== null,
    hasRepository,
    remoteUrl,
    worktreeDirectory: runtime.dir,
  }
}

export async function initJournalGitSyncRepository(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig = {},
) {
  await ensureRepository(runtime, config)
}

export async function cloneJournalGitSyncRepository(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
) {
  if (!config.remoteUrl) {
    throw new Error('GitHub repository URL is required before cloning sync data.')
  }

  if (await hasGitRepository(runtime)) {
    throw new Error('A local sync repository already exists.')
  }

  assertSafeRemoteUrl(config.remoteUrl)

  await getGit(runtime).clone({
    dir: runtime.dir,
    fs: runtime.fs,
    http: createJournalGitAuthenticatedHttpClient(runtime.http, credentials),
    ref: config.branch ?? defaultBranch,
    singleBranch: true,
    url: config.remoteUrl,
  })

  await configureAuthor(runtime, config)
}

export async function commitJournalChanges(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig = {},
  message = 'Sync journal changes',
) {
  await ensureRepository(runtime, config)

  return commitTrackedChanges(runtime, config, message)
}

export async function pushJournalChanges(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
): Promise<JournalGitPushResult> {
  if (!config.remoteUrl) {
    throw new Error('GitHub repository URL is required before pushing sync data.')
  }

  const branch = config.branch ?? defaultBranch
  const remote = config.remote ?? defaultRemote

  await ensureRepository(runtime, config)

  const localCommitOid = await commitTrackedChanges(
    runtime,
    config,
    'Sync journal changes',
  )

  if (!(await hasLocalBranchCommit(runtime, branch))) {
    return {
      dirtyPathsAfterPush: await getDirtyTrackedPaths(runtime),
      localCommitOid,
      pushResult: null,
      retriedPush: false,
    }
  }

  const pushAttempt = await pushRemoteWithRetry(runtime, {
    branch,
    config,
    credentials,
    remote,
  })

  return {
    dirtyPathsAfterPush: await getDirtyTrackedPaths(runtime),
    localCommitOid,
    pushResult: pushAttempt.pushResult,
    retriedPush: pushAttempt.retriedPush,
  }
}

export async function pullJournalUpdates(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
): Promise<JournalGitPullResult> {
  if (!config.remoteUrl) {
    throw new Error('GitHub repository URL is required before pulling sync data.')
  }

  await ensureRepository(runtime, config)

  let fetchResult: FetchResult | null = null
  let mergeCommitOid: string | null = null
  let mergeResult: MergeResult | null = null
  let updatedWorktree = false

  try {
    const result = await pullRemoteIntoWorktree(runtime, config, credentials)

    fetchResult = result.fetchResult
    mergeCommitOid = result.mergeCommitOid
    mergeResult = result.mergeResult
    updatedWorktree = result.updatedWorktree
  } catch (error) {
    if (!isEmptyRemoteError(error)) {
      throw error
    }
  }

  return {
    dirtyPathsAfterPull: await getDirtyTrackedPaths(runtime),
    fetchResult,
    mergeCommitOid,
    mergeResult,
    updatedWorktree,
  }
}

export async function syncJournalNow(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
): Promise<JournalGitSyncResult> {
  if (!config.remoteUrl) {
    throw new Error('GitHub repository URL is required before syncing.')
  }

  const branch = config.branch ?? defaultBranch
  const remote = config.remote ?? defaultRemote

  await ensureRepository(runtime, config)

  const localCommitOid = await commitTrackedChanges(
    runtime,
    config,
    'Sync journal changes',
  )
  let fetchResult: FetchResult | null = null
  let mergeResult: MergeResult | null = null
  let mergeCommitOid: string | null = null
  let skipPush = false

  try {
    const result = await pullRemoteIntoWorktree(runtime, config, credentials)

    fetchResult = result.fetchResult
    mergeCommitOid = result.mergeCommitOid
    mergeResult = result.mergeResult
  } catch (error) {
    if (!isEmptyRemoteError(error)) {
      throw error
    }

    skipPush = !(await hasLocalBranchCommit(runtime, branch))
  }

  if (skipPush) {
    return {
      dirtyPathsAfterSync: await getDirtyTrackedPaths(runtime),
      fetchResult,
      localCommitOid: localCommitOid ?? mergeCommitOid,
      mergeCommitOid,
      mergeResult,
      pushResult: null,
      retriedPush: false,
    }
  }

  const pushAttempt = await pushRemoteWithRetry(runtime, {
    branch,
    config,
    credentials,
    remote,
  })

  return {
    dirtyPathsAfterSync: await getDirtyTrackedPaths(runtime),
    fetchResult,
    localCommitOid: localCommitOid ?? mergeCommitOid,
    mergeCommitOid,
    mergeResult,
    pushResult: pushAttempt.pushResult,
    retriedPush: pushAttempt.retriedPush,
  }
}

async function ensureRepository(runtime: JournalGitRuntime, config: JournalGitSyncConfig) {
  const branch = config.branch ?? defaultBranch
  const remote = config.remote ?? defaultRemote
  const git = getGit(runtime)

  if (!(await hasGitRepository(runtime))) {
    await git.init({
      defaultBranch: branch,
      dir: runtime.dir,
      fs: runtime.fs,
    })
  }

  await configureAuthor(runtime, config)

  if (config.remoteUrl) {
    assertSafeRemoteUrl(config.remoteUrl)

    await git.addRemote({
      dir: runtime.dir,
      force: true,
      fs: runtime.fs,
      remote,
      url: config.remoteUrl,
    })
  }
}

async function configureAuthor(runtime: JournalGitRuntime, config: JournalGitSyncConfig) {
  const git = getGit(runtime)

  await git.setConfig({
    dir: runtime.dir,
    fs: runtime.fs,
    path: 'user.name',
    value: config.authorName ?? defaultAuthorName,
  })
  await git.setConfig({
    dir: runtime.dir,
    fs: runtime.fs,
    path: 'user.email',
    value: config.authorEmail ?? defaultAuthorEmail,
  })
}

async function commitTrackedChanges(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  message: string,
) {
  const git = getGit(runtime)
  const rows = await getTrackedStatusRows(runtime)
  const changedRows = rows.filter(isDirtyStatusRow)

  if (changedRows.length === 0) {
    return null
  }

  for (const [filepath, headStatus, workdirStatus] of changedRows) {
    if (workdirStatus === 0 && headStatus !== 0) {
      await git.remove({
        dir: runtime.dir,
        filepath,
        fs: runtime.fs,
      })
    } else if (workdirStatus !== 0) {
      await git.add({
        dir: runtime.dir,
        filepath,
        fs: runtime.fs,
      })
    }
  }

  const stagedRows = await getTrackedStatusRows(runtime)

  if (!stagedRows.some(isStagedStatusRow)) {
    return null
  }

  return git.commit({
    author: {
      email: config.authorEmail ?? defaultAuthorEmail,
      name: config.authorName ?? defaultAuthorName,
    },
    dir: runtime.dir,
    fs: runtime.fs,
    message,
    ref: config.branch ?? defaultBranch,
  })
}

async function fetchRemote(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
) {
  return getGit(runtime).fetch({
    dir: runtime.dir,
    fs: runtime.fs,
    http: createJournalGitAuthenticatedHttpClient(runtime.http, credentials),
    ref: config.branch ?? defaultBranch,
    remote: config.remote ?? defaultRemote,
    singleBranch: true,
  })
}

async function mergeRemoteBranch(runtime: JournalGitRuntime, config: JournalGitSyncConfig) {
  const branch = config.branch ?? defaultBranch
  const remote = config.remote ?? defaultRemote

  return getGit(runtime).merge({
    abortOnConflict: false,
    allowUnrelatedHistories: true,
    author: {
      email: config.authorEmail ?? defaultAuthorEmail,
      name: config.authorName ?? defaultAuthorName,
    },
    dir: runtime.dir,
    fs: runtime.fs,
    mergeDriver: createLastWriteWinsMergeDriver('theirs'),
    ours: branch,
    theirs: `remotes/${remote}/${branch}`,
  })
}

async function pullRemoteIntoWorktree(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
): Promise<{
  fetchResult: FetchResult
  mergeCommitOid: string | null
  mergeResult: MergeResult | null
  updatedWorktree: boolean
}> {
  const branch = config.branch ?? defaultBranch
  const hasLocalCommit = await hasLocalBranchCommit(runtime, branch)
  const fetchResult = await fetchRemote(runtime, config, credentials)

  if ((await getDirtyTrackedPaths(runtime)).length > 0) {
    return {
      fetchResult,
      mergeCommitOid: null,
      mergeResult: null,
      updatedWorktree: false,
    }
  }

  if (hasLocalCommit) {
    const mergeResult = await mergeRemoteBranch(runtime, config)
    const mergeCommitOid = await commitTrackedChanges(
      runtime,
      config,
      'Resolve journal sync conflicts',
    )

    await checkoutLocalBranch(runtime, branch)

    return {
      fetchResult,
      mergeCommitOid,
      mergeResult,
      updatedWorktree: mergeResult !== null,
    }
  }

  await checkoutRemoteBranch(runtime, config)

  return {
    fetchResult,
    mergeCommitOid: null,
    mergeResult: null,
    updatedWorktree: true,
  }
}

async function checkoutRemoteBranch(runtime: JournalGitRuntime, config: JournalGitSyncConfig) {
  await getGit(runtime).checkout({
    dir: runtime.dir,
    force: true,
    fs: runtime.fs,
    ref: config.branch ?? defaultBranch,
    remote: config.remote ?? defaultRemote,
    track: true,
  })
}

async function checkoutLocalBranch(runtime: JournalGitRuntime, branch: string) {
  await getGit(runtime).checkout({
    dir: runtime.dir,
    force: true,
    fs: runtime.fs,
    ref: branch,
  })
}

async function pushRemoteWithRetry(
  runtime: JournalGitRuntime,
  input: {
    branch: string
    config: JournalGitSyncConfig
    credentials: JournalGitCredentials
    remote: string
  },
) {
  let firstPushResult: PushResult

  try {
    firstPushResult = await tryPushRemote(runtime, input)
  } catch (error) {
    if (!isRetryablePushError(error)) {
      throw error
    }

    firstPushResult = {
      error: getErrorMessage(error),
      ok: false,
      refs: {},
    }
  }

  if (firstPushResult.ok) {
    return {
      pushResult: firstPushResult,
      retriedPush: false,
    }
  }

  await fetchRemote(runtime, input.config, input.credentials)
  await mergeRemoteBranch(runtime, input.config)
  await commitTrackedChanges(runtime, input.config, 'Retry journal sync after remote update')

  const secondPushResult = await tryPushRemote(runtime, input)

  if (!secondPushResult.ok) {
    throw new Error(secondPushResult.error ?? 'GitHub push failed after retry.')
  }

  return {
    pushResult: secondPushResult,
    retriedPush: true,
  }
}

async function tryPushRemote(
  runtime: JournalGitRuntime,
  input: {
    branch: string
    credentials: JournalGitCredentials
    remote: string
  },
) {
  return getGit(runtime).push({
    dir: runtime.dir,
    fs: runtime.fs,
    http: createJournalGitAuthenticatedHttpClient(runtime.http, input.credentials),
    ref: input.branch,
    remote: input.remote,
    remoteRef: input.branch,
  })
}

async function getTrackedStatusRows(runtime: JournalGitRuntime) {
  const rows = await getGit(runtime).statusMatrix({
    dir: runtime.dir,
    fs: runtime.fs,
  })

  return rows.filter(([filepath]) => isTrackedJournalPath(filepath))
}

async function getDirtyTrackedPaths(runtime: JournalGitRuntime) {
  const rows = await getTrackedStatusRows(runtime)

  return rows.filter(isDirtyStatusRow).map(([filepath]) => filepath)
}

async function hasGitRepository(runtime: JournalGitRuntime) {
  return fileExists(runtime, joinRuntimePath(runtime.dir, '.git/HEAD'))
}

async function getRemoteUrl(runtime: JournalGitRuntime, remote: string) {
  try {
    return await getGit(runtime).getConfig({
      dir: runtime.dir,
      fs: runtime.fs,
      path: `remote.${remote}.url`,
    }) ?? null
  } catch {
    return null
  }
}

async function getCurrentBranch(runtime: JournalGitRuntime, fallback: string) {
  try {
    return await getGit(runtime).currentBranch({
      dir: runtime.dir,
      fs: runtime.fs,
      test: true,
    }) ?? fallback
  } catch {
    return fallback
  }
}

async function hasLocalBranchCommit(runtime: JournalGitRuntime, branch: string) {
  try {
    await getGit(runtime).resolveRef({
      dir: runtime.dir,
      fs: runtime.fs,
      ref: branch,
    })
    return true
  } catch {
    return false
  }
}

async function fileExists(runtime: JournalGitRuntime, path: string) {
  try {
    await (runtime.fs as unknown as PromiseStatFileSystem).promises.stat(path)
    return true
  } catch {
    return false
  }
}

function getJournalGitAuthUsername(credentials: JournalGitCredentials) {
  return credentials.username ?? 'x-access-token'
}

function hasAuthorizationHeader(headers: Record<string, string>) {
  return Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')
}

function encodeBase64(value: string) {
  const bytes = encodeUtf8(value)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let result = ''

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const second = bytes[index + 1]
    const third = bytes[index + 2]

    result += alphabet[first >> 2]
    result += alphabet[((first & 0x03) << 4) | ((second ?? 0) >> 4)]
    result += second === undefined
      ? '='
      : alphabet[((second & 0x0f) << 2) | ((third ?? 0) >> 6)]
    result += third === undefined ? '=' : alphabet[third & 0x3f]
  }

  return result
}

function encodeUtf8(value: string) {
  const bytes: number[] = []

  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.codePointAt(index) ?? 0

    if (codePoint > 0xffff) {
      index += 1
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint)
    } else if (codePoint <= 0x7ff) {
      bytes.push(
        0xc0 | (codePoint >> 6),
        0x80 | (codePoint & 0x3f),
      )
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      )
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      )
    }
  }

  return bytes
}

function isDirtyStatusRow([, headStatus, workdirStatus, stageStatus]: StatusRow) {
  return headStatus !== workdirStatus || workdirStatus !== stageStatus
}

function isStagedStatusRow([, headStatus,, stageStatus]: StatusRow) {
  return headStatus !== stageStatus
}

function isTrackedJournalPath(filepath: string) {
  return trackedPathFiles.has(filepath)
    || trackedPathPrefixes.some((prefix) => filepath.startsWith(prefix))
}

function isEmptyRemoteError(error: unknown) {
  const code = getErrorCode(error)

  if (code === 'EmptyServerResponseError') {
    return true
  }

  const message = error instanceof Error ? error.message : ''

  return /couldn't find remote ref|fatal: couldn't find remote ref/i.test(message)
}

function isRetryablePushError(error: unknown) {
  const code = getErrorCode(error)

  return code === 'PushRejectedError' || code === 'GitPushError'
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null
  }

  const code = (error as { code?: unknown }).code

  return typeof code === 'string' ? code : null
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Git push failed.'
}

function getGit(runtime: JournalGitRuntime) {
  return runtime.git ?? defaultGit
}

function joinRuntimePath(parent: string, child: string) {
  return parent.endsWith('/') ? `${parent}${child}` : `${parent}/${child}`
}

export function assertSafeRemoteUrl(remoteUrl: string) {
  const value = remoteUrl.trim()

  if (!value) {
    return
  }

  let parsedUrl: URL

  try {
    parsedUrl = new URL(value)
  } catch {
    throw new Error('同步仓库地址必须使用 http 或 https。')
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('同步仓库地址必须使用 http 或 https。')
  }

  if (
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error('同步仓库地址不能包含用户名或 token，请把 GitHub token 单独保存到 token 字段。')
  }
}
