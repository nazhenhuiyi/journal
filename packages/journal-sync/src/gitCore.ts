import type {
  FetchResult,
  FsClient,
  HttpClient,
  MergeResult,
  PushResult,
  ReadCommitResult,
  ServerRef,
  StatusRow,
} from 'isomorphic-git'
import * as defaultGit from 'isomorphic-git'
import {
  createJournalMergeDriver,
  createJournalMergeStats,
} from './smartMerge'

export type JournalGitCredentials = {
  token: string
  username?: string
}

export type JournalGitSyncConfig = {
  authorEmail?: string
  authorName?: string
  branch?: string
  commitMessage?: string
  remote?: string
  remoteUrl?: string
}

export type JournalGitOperationOptions = {
  changedPaths?: readonly string[]
  collectDirtyPathsAfterSync?: boolean
}

export type JournalGitTraceValue = boolean | null | number | string
export type JournalGitTraceDetails = Record<string, JournalGitTraceValue>
export type JournalGitTraceEvent = {
  details?: JournalGitTraceDetails
  durationMs: number
  errorMessage?: string
  name: string
  ok: boolean
}
export type JournalGitTrace = (event: JournalGitTraceEvent) => void

export type JournalGitRuntime = {
  cache: object
  dir: string
  fs: FsClient
  git?: typeof defaultGit
  http: HttpClient
  trace?: JournalGitTrace
}

export type JournalGitRecentCommit = {
  committedAt: string | null
  message: string
  oid: string
  shortOid: string
}

export type JournalGitSyncStatus = {
  branch: string
  dirtyPaths: string[]
  hasCredentials: boolean
  hasRepository: boolean
  recentCommits: JournalGitRecentCommit[]
  remoteUrl: string | null
  worktreeDirectory: string
}

export type JournalGitSyncStatusOptions = {
  includeDirtyPaths?: boolean
  includeRecentCommits?: boolean
  recentCommitLimit?: number
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

type PromiseGitFileSystem = {
  promises: {
    readFile?: (path: string, options?: unknown) => Promise<string | Uint8Array>
    stat: (path: string) => Promise<unknown>
    unlink?: (path: string) => Promise<void>
  }
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

type RemoteFetchDecision = {
  fetchResult: FetchResult | null
  skipped: boolean
}

const defaultAuthorEmail = 'journal-sync@example.invalid'
const defaultAuthorName = 'Journal Sync'
const defaultBranch = 'main'
const defaultCommitMessage = 'Sync journal changes'
const defaultRemote = 'origin'
const trackedPathPrefixes = [
  'annotations/',
  'entries/',
  'media/',
  'reviews/',
]
const trackedPathFiles = new Set(['manifest.json'])
const trackedStatusFilepaths = [
  ...trackedPathPrefixes.map((pathPrefix) => pathPrefix.slice(0, -1)),
  ...trackedPathFiles,
]
const journalEntryPathPattern = /^entries\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.md$/
const journalAnnotationPathPattern = /^annotations\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.json$/
const journalReviewPathPattern = /^reviews\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.json$/

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
  options: JournalGitSyncStatusOptions = {},
): Promise<JournalGitSyncStatus> {
  const includeDirtyPaths = options.includeDirtyPaths ?? true
  const includeRecentCommits = options.includeRecentCommits ?? true
  const recentCommitLimit = normalizeRecentCommitLimit(options.recentCommitLimit)
  const configuredBranch = getBranchName(config.branch ?? defaultBranch)
  const hasRepository = await traceGitStep(runtime, 'repo.exists', () => hasGitRepository(runtime))
  const branch = hasRepository
    ? await getCurrentBranch(runtime, configuredBranch)
    : configuredBranch
  const remoteUrl = hasRepository
    ? await getRemoteUrl(runtime, config.remote ?? defaultRemote)
    : config.remoteUrl ?? null
  const dirtyPaths = hasRepository && includeDirtyPaths
    ? await getDirtyTrackedPaths(runtime, 'status.dirtyPaths')
    : []
  const recentCommits = hasRepository && includeRecentCommits && recentCommitLimit > 0
    ? await getRecentCommits(runtime, branch, recentCommitLimit)
    : []

  return {
    branch,
    dirtyPaths,
    hasCredentials: credentials !== null,
    hasRepository,
    recentCommits,
    remoteUrl,
    worktreeDirectory: runtime.dir,
  }
}

export async function initJournalGitSyncRepository(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig = {},
) {
  if (!config.remoteUrl) {
    return
  }

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
    cache: runtime.cache,
    dir: runtime.dir,
    fs: runtime.fs,
    http: createJournalGitAuthenticatedHttpClient(runtime.http, credentials),
    ref: getBranchName(config.branch ?? defaultBranch),
    singleBranch: true,
    url: config.remoteUrl,
  })

  await configureAuthor(runtime, config)
}

export async function commitJournalChanges(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig = {},
  message = getSyncCommitMessage(config),
  options: JournalGitOperationOptions = {},
) {
  if (!config.remoteUrl) {
    throw new Error('GitHub repository URL is required before committing sync data.')
  }

  await ensureRepository(runtime, config)

  return commitTrackedChanges(runtime, config, message, options)
}

export async function pushJournalChanges(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
  options: JournalGitOperationOptions = {},
): Promise<JournalGitPushResult> {
  return traceGitStep(
    runtime,
    'push.total',
    () => pushJournalChangesInternal(runtime, config, credentials, options),
    (result) => ({
      changed: Boolean(result.localCommitOid || result.retriedPush),
      dirty: result.dirtyPathsAfterPush.length,
      retried: result.retriedPush,
    }),
  )
}

async function pushJournalChangesInternal(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
  options: JournalGitOperationOptions,
): Promise<JournalGitPushResult> {
  if (!config.remoteUrl) {
    throw new Error('GitHub repository URL is required before pushing sync data.')
  }

  const branch = getBranchName(config.branch ?? defaultBranch)
  const remote = config.remote ?? defaultRemote

  await ensureRepository(runtime, config)

  await assertCanCreateFirstLocalCommit(runtime, config, credentials, options)
  const localCommitOid = await commitTrackedChanges(
    runtime,
    config,
    getSyncCommitMessage(config),
    options,
  )

  if (!(await hasLocalBranchCommit(runtime, branch))) {
    return {
      dirtyPathsAfterPush: await getDirtyTrackedPathsAfterOperation(runtime, options, 'push.dirtyPathsAfterPush'),
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
    dirtyPathsAfterPush: await getDirtyTrackedPathsAfterOperation(runtime, options, 'push.dirtyPathsAfterPush'),
    localCommitOid,
    pushResult: pushAttempt.pushResult,
    retriedPush: pushAttempt.retriedPush,
  }
}

export async function pullJournalUpdates(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
  options: JournalGitOperationOptions = {},
): Promise<JournalGitPullResult> {
  return traceGitStep(
    runtime,
    'pull.total',
    () => pullJournalUpdatesInternal(runtime, config, credentials, options),
    (result) => ({
      changed: result.updatedWorktree,
      dirty: result.dirtyPathsAfterPull.length,
      merged: Boolean(result.mergeCommitOid || result.mergeResult),
    }),
  )
}

async function pullJournalUpdatesInternal(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
  options: JournalGitOperationOptions,
): Promise<JournalGitPullResult> {
  if (!config.remoteUrl) {
    throw new Error('GitHub repository URL is required before pulling sync data.')
  }

  await ensureRepository(runtime, config)

  let fetchResult: FetchResult | null = null
  let mergeCommitOid: string | null = null
  let mergeResult: MergeResult | null = null
  let updatedWorktree = false
  let dirtyPathsBeforeMerge: string[] = []

  try {
    const result = await pullRemoteIntoWorktree(runtime, config, credentials, options)

    fetchResult = result.fetchResult
    dirtyPathsBeforeMerge = result.dirtyPathsBeforeMerge
    mergeCommitOid = result.mergeCommitOid
    mergeResult = result.mergeResult
    updatedWorktree = result.updatedWorktree
  } catch (error) {
    if (!isEmptyRemoteError(error)) {
      throw error
    }
  }

  return {
    dirtyPathsAfterPull: dirtyPathsBeforeMerge.length > 0
      ? dirtyPathsBeforeMerge
      : await getDirtyTrackedPathsAfterOperation(runtime, options, 'pull.dirtyPathsAfterPull'),
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
  options: JournalGitOperationOptions = {},
): Promise<JournalGitSyncResult> {
  return traceGitStep(
    runtime,
    'sync.total',
    () => syncJournalNowInternal(runtime, config, credentials, options),
    (result) => ({
      changed: Boolean(result.localCommitOid || result.mergeCommitOid || result.mergeResult || result.retriedPush),
      dirty: result.dirtyPathsAfterSync.length,
      retried: result.retriedPush,
    }),
  )
}

async function syncJournalNowInternal(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
  options: JournalGitOperationOptions,
): Promise<JournalGitSyncResult> {
  if (!config.remoteUrl) {
    throw new Error('GitHub repository URL is required before syncing.')
  }

  const branch = getBranchName(config.branch ?? defaultBranch)
  const remote = config.remote ?? defaultRemote

  await ensureRepository(runtime, config)

  await assertCanCreateFirstLocalCommit(runtime, config, credentials, options)
  const localCommitOid = await commitTrackedChanges(
    runtime,
    config,
    getSyncCommitMessage(config),
    options,
  )
  let fetchResult: FetchResult | null = null
  let mergeResult: MergeResult | null = null
  let mergeCommitOid: string | null = null
  let skipPush = false

  try {
    const result = await pullRemoteIntoWorktree(runtime, config, credentials, options)

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
      dirtyPathsAfterSync: await getDirtyTrackedPathsAfterOperation(runtime, options, 'sync.dirtyPathsAfterSync'),
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
  const resolvedMergeCommitOid = mergeCommitOid ?? pushAttempt.retryMergeCommitOid ?? null

  return {
    dirtyPathsAfterSync: await getDirtyTrackedPathsAfterOperation(runtime, options, 'sync.dirtyPathsAfterSync'),
    fetchResult,
    localCommitOid: localCommitOid ?? resolvedMergeCommitOid,
    mergeCommitOid: resolvedMergeCommitOid,
    mergeResult,
    pushResult: pushAttempt.pushResult,
    retriedPush: pushAttempt.retriedPush,
  }
}

async function ensureRepository(runtime: JournalGitRuntime, config: JournalGitSyncConfig) {
  const branch = getBranchName(config.branch ?? defaultBranch)
  const remote = config.remote ?? defaultRemote
  const git = getGit(runtime)
  const hasRepository = await traceGitStep(runtime, 'repo.exists', () => hasGitRepository(runtime))

  if (!hasRepository) {
    await traceGitStep(runtime, 'repo.init', () => git.init({
      defaultBranch: branch,
      dir: runtime.dir,
      fs: runtime.fs,
    }), { branch })
    await traceGitStep(runtime, 'repo.configureAuthor', () => configureAuthor(runtime, config))
  } else {
    await traceGitStep(runtime, 'repo.configureAuthor', async () => null, {
      skipped: true,
    })
  }

  await traceGitStep(runtime, 'repo.repairRefs', async () => {
    await removeStaleShortBranchRef(runtime, branch)
    await attachHeadToLocalBranchIfSameCommit(runtime, branch)
  }, { branch })

  if (config.remoteUrl) {
    const remoteUrl = config.remoteUrl

    assertSafeRemoteUrl(remoteUrl)

    await traceGitStep(runtime, 'repo.addRemote', () => git.addRemote({
      dir: runtime.dir,
      force: true,
      fs: runtime.fs,
      remote,
      url: remoteUrl,
    }), { remote })
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
  options: JournalGitOperationOptions = {},
) {
  const git = getGit(runtime)
  const branch = getBranchName(config.branch ?? defaultBranch)
  const knownChangedPaths = normalizeKnownChangedPaths(options.changedPaths)

  if (knownChangedPaths && knownChangedPaths.length === 0) {
    return null
  }

  const rows = await getTrackedStatusRows(runtime, 'commit.status', knownChangedPaths)
  const changedRows = rows.filter(isDirtyStatusRow)

  if (changedRows.length === 0) {
    return null
  }

  await assertNoConflictMarkersInChangedMarkdown(runtime, changedRows)

  await traceGitStep(runtime, 'commit.stage', async () => {
    for (const [filepath, headStatus, workdirStatus] of changedRows) {
      if (workdirStatus === 0 && headStatus !== 0) {
        await git.remove({
          cache: runtime.cache,
          dir: runtime.dir,
          filepath,
          fs: runtime.fs,
        })
      } else if (workdirStatus !== 0) {
        await git.add({
          cache: runtime.cache,
          dir: runtime.dir,
          filepath,
          fs: runtime.fs,
        })
      }
    }
  }, {
    changed: changedRows.length,
    knownPaths: knownChangedPaths?.length ?? null,
  })

  if (!knownChangedPaths) {
    const stagedRows = await getTrackedStatusRows(runtime, 'commit.stagedStatus')

    if (!stagedRows.some(isStagedStatusRow)) {
      return null
    }
  }

  const parentCommitOid = await traceGitStep(
    runtime,
    'commit.resolveParent',
    () => getLocalBranchCommitOid(runtime, branch),
    (oid) => ({ found: oid !== null }),
  )
  const commitOid = await traceGitStep(runtime, 'commit.write', () => git.commit({
    author: {
      email: config.authorEmail ?? defaultAuthorEmail,
      name: config.authorName ?? defaultAuthorName,
    },
    cache: runtime.cache,
    dir: runtime.dir,
    fs: runtime.fs,
    message,
    ref: getLocalBranchRef(branch),
  }), { branch })

  const hasSameTree = parentCommitOid
    ? await traceGitStep(
      runtime,
      'commit.treeCheck',
      () => doCommitsHaveSameTree(runtime, commitOid, parentCommitOid),
      (sameTree) => ({ sameTree }),
    )
    : false

  if (parentCommitOid && hasSameTree) {
    await git.writeRef({
      dir: runtime.dir,
      force: true,
      fs: runtime.fs,
      ref: getLocalBranchRef(branch),
      value: parentCommitOid,
    })
    await traceGitStep(runtime, 'commit.alignHead', () => attachHeadToLocalBranchIfSameCommit(runtime, branch), { branch })

    return null
  }

  await traceGitStep(runtime, 'commit.alignHead', () => attachHeadToLocalBranchIfSameCommit(runtime, branch), { branch })

  return commitOid
}

async function doCommitsHaveSameTree(
  runtime: JournalGitRuntime,
  commitOid: string,
  parentCommitOid: string,
) {
  try {
    const [commit, parentCommit] = await Promise.all([
      readCommit(runtime, commitOid),
      readCommit(runtime, parentCommitOid),
    ])

    return commit.commit.tree === parentCommit.commit.tree
  } catch {
    return false
  }
}

async function readCommit(runtime: JournalGitRuntime, oid: string): Promise<ReadCommitResult> {
  return getGit(runtime).readCommit({
    cache: runtime.cache,
    dir: runtime.dir,
    fs: runtime.fs,
    oid,
  })
}

async function fetchRemote(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
  traceName = 'remote.fetch',
) {
  return traceGitStep(runtime, traceName, () => getGit(runtime).fetch({
    cache: runtime.cache,
    dir: runtime.dir,
    fs: runtime.fs,
    http: createJournalGitAuthenticatedHttpClient(runtime.http, credentials),
    ref: getBranchName(config.branch ?? defaultBranch),
    remote: config.remote ?? defaultRemote,
    singleBranch: true,
  }), {
    branch: getBranchName(config.branch ?? defaultBranch),
    remote: config.remote ?? defaultRemote,
  })
}

async function fetchRemoteIfRemoteChanged(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
): Promise<RemoteFetchDecision> {
  const branch = getBranchName(config.branch ?? defaultBranch)
  const remote = config.remote ?? defaultRemote
  const remoteBranchOid = await getRemoteBranchOid(runtime, config, credentials)
  const remoteTrackingOid = await getRemoteTrackingBranchCommitOid(runtime, remote, branch)

  if (remoteBranchOid && remoteTrackingOid && remoteBranchOid === remoteTrackingOid) {
    await traceGitStep(runtime, 'remote.fetchSkipped', async () => null, {
      branch,
      reason: 'remote-unchanged',
      remote,
    })

    return {
      fetchResult: null,
      skipped: true,
    }
  }

  return {
    fetchResult: await fetchRemote(runtime, config, credentials),
    skipped: false,
  }
}

async function assertCanCreateFirstLocalCommit(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
  options: JournalGitOperationOptions,
) {
  const branch = getBranchName(config.branch ?? defaultBranch)

  if (await hasLocalBranchCommit(runtime, branch)) {
    return
  }

  const localDirtyPaths = await getFirstCommitDirtyPaths(runtime, options)

  if (localDirtyPaths.length === 0) {
    return
  }

  const remoteBranchOid = await getRemoteBranchOid(runtime, config, credentials)

  if (!remoteBranchOid) {
    return
  }

  throw createFirstSyncNeedsChoiceError(localDirtyPaths)
}

async function getFirstCommitDirtyPaths(
  runtime: JournalGitRuntime,
  options: JournalGitOperationOptions,
) {
  const knownChangedPaths = normalizeKnownChangedPaths(options.changedPaths)

  if (knownChangedPaths) {
    return knownChangedPaths
  }

  return getDirtyTrackedPaths(runtime, 'firstCommit.dirtyPaths')
}

async function getRemoteBranchOid(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
) {
  if (!config.remoteUrl) {
    return null
  }

  const branch = getBranchName(config.branch ?? defaultBranch)
  const remoteBranchRef = getRemoteBranchRef(branch)
  const refs = await traceGitStep(
    runtime,
    'remote.listRefs',
    () => getGit(runtime).listServerRefs({
      http: createJournalGitAuthenticatedHttpClient(runtime.http, credentials),
      prefix: remoteBranchRef,
      url: config.remoteUrl!,
    }),
    (serverRefs: ServerRef[]) => ({
      branch,
      found: serverRefs.some((serverRef) => serverRef.ref === remoteBranchRef),
      refs: serverRefs.length,
    }),
  )

  return refs.find((serverRef) => serverRef.ref === remoteBranchRef)?.oid ?? null
}

async function mergeRemoteBranch(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
) {
  const branch = getBranchName(config.branch ?? defaultBranch)
  const remote = config.remote ?? defaultRemote
  const mergeStats = createJournalMergeStats()

  try {
    const mergeResult = await runRemoteMerge(runtime, config, mergeStats, 'remote.merge')

    await traceGitStep(runtime, 'merge.strategy', async () => null, {
      clean: mergeStats.conflictPaths === 0,
      conflictPaths: mergeStats.conflictPaths,
      fallbackPaths: mergeStats.fallbackPaths,
      journalStructurePaths: mergeStats.journalStructurePaths,
      markdownPaths: mergeStats.markdownPaths,
      result: getMergeResultKind(mergeResult),
      strategy: 'markdown-diff3-fallback-lww',
    })

    return mergeResult
  } catch (error) {
    if (isRecoverableInternalMergeError(error)) {
      const retryStats = createJournalMergeStats()

      await traceGitStep(runtime, 'remote.mergeRepair', async () => {
        await clearRemoteTrackingBranchRef(runtime, remote, branch)
        await fetchRemote(runtime, config, credentials, 'remote.refetchAfterMergeError')
        return null
      }, {
        branch,
        error: getErrorMessage(error),
        remote,
      })

      try {
        const retryResult = await runRemoteMerge(runtime, config, retryStats, 'remote.mergeRetry')

        await traceGitStep(runtime, 'merge.strategy', async () => null, {
          clean: retryStats.conflictPaths === 0,
          conflictPaths: retryStats.conflictPaths,
          fallbackPaths: retryStats.fallbackPaths,
          journalStructurePaths: retryStats.journalStructurePaths,
          markdownPaths: retryStats.markdownPaths,
          result: getMergeResultKind(retryResult),
          strategy: 'markdown-diff3-fallback-lww',
        })

        return retryResult
      } catch (retryError) {
        if (isRecoverableInternalMergeError(retryError)) {
          await throwRecoverableMergeFailure(runtime, config, credentials, retryError)
        }

        throw createMergeRecoveryError(retryError)
      }
    }

    if (isMergeConflictError(error)) {
      const conflictPathCount = getMergeConflictPathCount(error) ?? mergeStats.conflictPaths

      await traceGitStep(runtime, 'merge.strategy', async () => null, {
        clean: false,
        conflictPaths: conflictPathCount,
        fallbackPaths: mergeStats.fallbackPaths,
        journalStructurePaths: mergeStats.journalStructurePaths,
        markdownPaths: mergeStats.markdownPaths,
        result: 'conflict',
        strategy: 'markdown-diff3-fallback-lww',
      })
      await traceGitStep(runtime, 'merge.conflict', async () => null, {
        conflictPaths: conflictPathCount,
        fallbackPaths: mergeStats.fallbackPaths,
        journalStructurePaths: mergeStats.journalStructurePaths,
        markdownPaths: mergeStats.markdownPaths,
        strategy: 'markdown-diff3-fallback-lww',
      })
    }

    throw error
  }
}

async function runRemoteMerge(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  mergeStats: ReturnType<typeof createJournalMergeStats>,
  traceName: string,
) {
  const branch = getBranchName(config.branch ?? defaultBranch)
  const remote = config.remote ?? defaultRemote
  const mergeDetails = await traceMergeInputs(runtime, traceName, branch, remote)

  return traceGitStep(runtime, traceName, () => getGit(runtime).merge({
    abortOnConflict: false,
    allowUnrelatedHistories: true,
    author: {
      email: config.authorEmail ?? defaultAuthorEmail,
      name: config.authorName ?? defaultAuthorName,
    },
    cache: runtime.cache,
    dir: runtime.dir,
    fs: runtime.fs,
    mergeDriver: createJournalMergeDriver('theirs', mergeStats),
    ours: getLocalBranchRef(branch),
    theirs: getRemoteTrackingBranchRef(remote, branch),
  }), (result) => ({
    ...mergeDetails,
    branch,
    conflictPaths: mergeStats.conflictPaths,
    fallbackPaths: mergeStats.fallbackPaths,
    journalStructurePaths: mergeStats.journalStructurePaths,
    missingContentPaths: mergeStats.missingContentPaths,
    markdownPaths: mergeStats.markdownPaths,
    remote,
    result: getMergeResultKind(result),
  }), mergeDetails)
}

async function throwRecoverableMergeFailure(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
  retryError: unknown,
): Promise<never> {
  const details = await traceGitStep(
    runtime,
    'remote.mergeRecoveryDiagnostics',
    () => collectRecoverableMergeFailureDetails(runtime, config, credentials),
    (diagnostics) => diagnostics,
  )

  if (details.unrelated === true) {
    throw createUnrelatedHistoriesError(retryError)
  }

  throw createMergeRecoveryError(retryError)
}

async function collectRecoverableMergeFailureDetails(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
) {
  const branch = getBranchName(config.branch ?? defaultBranch)
  const remote = config.remote ?? defaultRemote
  const branchOid = await getLocalBranchCommitOid(runtime, branch)
  let remoteOid = await getRemoteTrackingBranchCommitOid(runtime, remote, branch)
  let refetchedRemoteTracking = false
  let baseOid: string | null = null
  let baseCount: number | null = null

  if (!remoteOid && config.remoteUrl) {
    await fetchRemote(runtime, config, credentials, 'remote.refetchForMergeRecovery')
    remoteOid = await getRemoteTrackingBranchCommitOid(runtime, remote, branch)
    refetchedRemoteTracking = true
  }

  if (branchOid && remoteOid) {
    const baseOids = await getGit(runtime).findMergeBase({
      cache: runtime.cache,
      dir: runtime.dir,
      fs: runtime.fs,
      oids: [branchOid, remoteOid],
    })

    baseOid = baseOids[0] ?? null
    baseCount = baseOids.length
  }

  return {
    baseOid: shortTraceOid(baseOid),
    bases: baseCount,
    branch,
    localOid: shortTraceOid(branchOid),
    refetchedRemoteTracking,
    remote,
    remoteOid: shortTraceOid(remoteOid),
    remoteTrackingRef: getRemoteTrackingBranchRef(remote, branch),
    unrelated: baseCount === null ? null : baseCount === 0,
  }
}

async function pullRemoteIntoWorktree(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
  options: JournalGitOperationOptions,
): Promise<{
  dirtyPathsBeforeMerge: string[]
  fetchResult: FetchResult | null
  mergeCommitOid: string | null
  mergeResult: MergeResult | null
  updatedWorktree: boolean
}> {
  const branch = getBranchName(config.branch ?? defaultBranch)
  const remote = config.remote ?? defaultRemote
  const hasLocalCommit = await hasLocalBranchCommit(runtime, branch)
  const fetchDecision = await fetchRemoteIfRemoteChanged(runtime, config, credentials)
  const fetchResult = fetchDecision.fetchResult

  if (
    hasLocalCommit &&
    fetchDecision.skipped &&
    await isLocalBranchAtRemoteTracking(runtime, remote, branch)
  ) {
    return {
      dirtyPathsBeforeMerge: [],
      fetchResult,
      mergeCommitOid: null,
      mergeResult: null,
      updatedWorktree: false,
    }
  }

  const dirtyPathsBeforeMerge = await getDirtyTrackedPathsBeforeMerge(runtime, options)

  if (dirtyPathsBeforeMerge.length > 0) {
    return {
      dirtyPathsBeforeMerge,
      fetchResult,
      mergeCommitOid: null,
      mergeResult: null,
      updatedWorktree: false,
    }
  }

  if (hasLocalCommit) {
    const { mergeCommitOid, mergeResult, updatedWorktree } = await mergeRemoteBranchAndCommitChanges(
      runtime,
      config,
      credentials,
    )

    return {
      dirtyPathsBeforeMerge: [],
      fetchResult,
      mergeCommitOid,
      mergeResult,
      updatedWorktree,
    }
  }

  await traceGitStep(runtime, 'remote.checkoutRemoteBranch', () => checkoutRemoteBranch(runtime, config), {
    branch,
    remote: config.remote ?? defaultRemote,
  })

  return {
    dirtyPathsBeforeMerge: [],
    fetchResult,
    mergeCommitOid: null,
    mergeResult: null,
    updatedWorktree: true,
  }
}

async function checkoutRemoteBranch(runtime: JournalGitRuntime, config: JournalGitSyncConfig) {
  const branch = getBranchName(config.branch ?? defaultBranch)
  const remote = config.remote ?? defaultRemote
  const git = getGit(runtime)

  await traceGitStep(runtime, 'checkout.branchFromRemote', () => git.branch({
    checkout: false,
    dir: runtime.dir,
    force: true,
    fs: runtime.fs,
    object: getRemoteTrackingBranchRef(remote, branch),
    ref: branch,
  }), { branch, remote })
  await traceGitStep(runtime, 'checkout.setUpstreamRemote', () => git.setConfig({
    dir: runtime.dir,
    fs: runtime.fs,
    path: `branch.${branch}.remote`,
    value: remote,
  }), { branch, remote })
  await traceGitStep(runtime, 'checkout.setUpstreamMerge', () => git.setConfig({
    dir: runtime.dir,
    fs: runtime.fs,
    path: `branch.${branch}.merge`,
    value: getRemoteBranchRef(branch),
  }), { branch })
  await traceGitStep(runtime, 'checkout.localBranch', () => checkoutLocalBranch(
    runtime,
    branch,
    trackedStatusFilepaths,
  ), { branch, paths: trackedStatusFilepaths.length })
}

async function checkoutLocalBranch(
  runtime: JournalGitRuntime,
  branch: string,
  filepaths?: readonly string[],
) {
  const checkoutPaths = filepaths ? normalizeCheckoutFilepaths(filepaths) : null

  if (checkoutPaths && checkoutPaths.length === 0) {
    return false
  }

  await removeStaleShortBranchRef(runtime, branch)
  await traceGitStep(runtime, 'checkout.local', () => getGit(runtime).checkout({
    cache: runtime.cache,
    dir: runtime.dir,
    filepaths: checkoutPaths ?? undefined,
    force: true,
    fs: runtime.fs,
    ref: getLocalBranchRef(branch),
  }), {
    branch: getBranchName(branch),
    paths: checkoutPaths?.length ?? null,
  })

  return true
}

async function attachHeadToLocalBranchIfSameCommit(
  runtime: JournalGitRuntime,
  branch: string,
) {
  if (await readCurrentBranch(runtime) === branch) {
    return true
  }

  const localBranchRef = getLocalBranchRef(branch)
  const git = getGit(runtime)

  try {
    const [headOid, branchOid] = await Promise.all([
      git.resolveRef({
        dir: runtime.dir,
        fs: runtime.fs,
        ref: 'HEAD',
      }),
      git.resolveRef({
        dir: runtime.dir,
        fs: runtime.fs,
        ref: localBranchRef,
      }),
    ])

    if (headOid !== branchOid) {
      return false
    }

    await git.writeRef({
      dir: runtime.dir,
      force: true,
      fs: runtime.fs,
      ref: 'HEAD',
      symbolic: true,
      value: localBranchRef,
    })

    return true
  } catch {
    return false
  }
}

async function removeStaleShortBranchRef(runtime: JournalGitRuntime, branch: string) {
  if (!isSafeShortRefFileName(branch)) {
    return
  }

  const fs = runtime.fs as unknown as PromiseGitFileSystem
  const shortRefPath = joinRuntimePath(joinRuntimePath(runtime.dir, '.git'), branch)
  const readFile = fs.promises.readFile
  const unlink = fs.promises.unlink

  if (!readFile || !unlink) {
    return
  }

  try {
    const shortRefContents = await readFile(shortRefPath, { encoding: 'utf8' })
    const branchOid = await getGit(runtime).resolveRef({
      dir: runtime.dir,
      fs: runtime.fs,
      ref: getLocalBranchRef(branch),
    })
    const shortRefOid = String(shortRefContents).trim()

    if (shortRefOid === branchOid) {
      await unlink(shortRefPath)
    }
  } catch {
    // Old versions accidentally wrote `.git/main`. Ignore missing or unrelated refs.
  }
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
      retryMergeCommitOid: null,
      retriedPush: false,
    }
  }

  await fetchRemote(runtime, input.config, input.credentials)
  const retryMergeResult = await mergeRemoteBranchAndCommitChanges(
    runtime,
    input.config,
    input.credentials,
  )
  await traceGitStep(runtime, 'push.retryMerge', async () => retryMergeResult, (result) => ({
    mergeCommit: Boolean(result.mergeCommitOid),
    retryCommit: false,
    updatedWorktree: result.updatedWorktree,
  }))

  const secondPushResult = await tryPushRemote(runtime, input)

  if (!secondPushResult.ok) {
    throw new Error(secondPushResult.error ?? 'GitHub push failed after retry.')
  }

  return {
    pushResult: secondPushResult,
    retryMergeCommitOid: retryMergeResult.mergeCommitOid,
    retriedPush: true,
  }
}

async function mergeRemoteBranchAndCommitChanges(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
) {
  const branch = getBranchName(config.branch ?? defaultBranch)
  const beforeMergeOid = await getLocalBranchCommitOid(runtime, branch)
  const mergeResult = await mergeRemoteBranch(runtime, config, credentials)

  if (!mergeResult || isAlreadyMergedMergeResult(mergeResult)) {
    return {
      mergeCommitOid: null,
      mergeResult,
      updatedWorktree: false,
    }
  }

  if (isFastForwardMergeResult(mergeResult)) {
    const afterMergeOid = getMergeResultOid(mergeResult) ?? await getLocalBranchCommitOid(runtime, branch)
    const checkoutPaths = beforeMergeOid && afterMergeOid
      ? await getChangedTrackedPathsBetweenRefs(runtime, beforeMergeOid, afterMergeOid, 'checkout.fastForwardDiff')
      : trackedStatusFilepaths
    const updatedWorktree = await checkoutLocalBranch(runtime, branch, checkoutPaths)

    return {
      mergeCommitOid: null,
      mergeResult,
      updatedWorktree,
    }
  }

  const mergeCommitOid = isMergeCommitMergeResult(mergeResult)
    ? getMergeResultOid(mergeResult)
    : null
  const afterMergeOid = mergeCommitOid ?? getMergeResultOid(mergeResult) ?? await getLocalBranchCommitOid(runtime, branch)
  const checkoutPaths = beforeMergeOid && afterMergeOid
    ? await getChangedTrackedPathsBetweenRefs(runtime, beforeMergeOid, afterMergeOid, 'checkout.mergeDiff')
    : trackedStatusFilepaths

  const updatedWorktree = await checkoutLocalBranch(runtime, branch, checkoutPaths)

  return {
    mergeCommitOid,
    mergeResult,
    updatedWorktree,
  }
}

function isFastForwardMergeResult(mergeResult: MergeResult | null) {
  return Boolean(mergeResult && 'fastForward' in mergeResult && mergeResult.fastForward)
}

function isAlreadyMergedMergeResult(mergeResult: MergeResult | null) {
  return Boolean(mergeResult && 'alreadyMerged' in mergeResult && mergeResult.alreadyMerged)
}

function isMergeCommitMergeResult(mergeResult: MergeResult | null) {
  return Boolean(mergeResult && 'mergeCommit' in mergeResult && mergeResult.mergeCommit)
}

function getMergeResultOid(mergeResult: MergeResult | null) {
  if (!mergeResult || !('oid' in mergeResult)) {
    return null
  }

  return typeof mergeResult.oid === 'string' ? mergeResult.oid : null
}

function getMergeResultKind(mergeResult: MergeResult | null) {
  if (!mergeResult) {
    return 'none'
  }

  if (isAlreadyMergedMergeResult(mergeResult)) {
    return 'alreadyMerged'
  }

  if (isFastForwardMergeResult(mergeResult)) {
    return 'fastForward'
  }

  if (isMergeCommitMergeResult(mergeResult)) {
    return 'mergeCommit'
  }

  return 'merge'
}

function isMergeConflictError(error: unknown) {
  return getErrorCode(error) === 'MergeConflictError'
}

function getMergeConflictPathCount(error: unknown) {
  if (!isRecord(error) || !isRecord(error.data)) {
    return null
  }

  const filepaths = error.data.filepaths

  return Array.isArray(filepaths) ? filepaths.length : null
}

async function tryPushRemote(
  runtime: JournalGitRuntime,
  input: {
    branch: string
    credentials: JournalGitCredentials
    remote: string
  },
) {
  const branch = getBranchName(input.branch)

  try {
    return await traceGitStep(runtime, 'remote.push', () => getGit(runtime).push({
      cache: runtime.cache,
      dir: runtime.dir,
      force: false,
      fs: runtime.fs,
      http: createJournalGitAuthenticatedHttpClient(runtime.http, input.credentials),
      ref: getLocalBranchRef(branch),
      remote: input.remote,
      remoteRef: getRemoteBranchRef(branch),
    }), {
      branch,
      remote: input.remote,
    })
  } catch (error) {
    const pushResult = getPushResultFromError(error)

    if (pushResult?.ok) {
      return pushResult
    }

    throw error
  }
}

async function getTrackedStatusRows(
  runtime: JournalGitRuntime,
  traceName = 'status.matrix',
  filepaths: readonly string[] | null = null,
) {
  const statusFilepaths = [...(filepaths ?? trackedStatusFilepaths)]
  const rows = await traceGitStep(runtime, traceName, () => getGit(runtime).statusMatrix({
    cache: runtime.cache,
    dir: runtime.dir,
    filepaths: statusFilepaths,
    fs: runtime.fs,
  }), (statusRows) => {
    const trackedRows = statusRows.filter(([filepath]) => isTrackedJournalPath(filepath))

    return {
      dirty: trackedRows.filter(isDirtyStatusRow).length,
      globalFallback: filepaths === null,
      knownPaths: filepaths?.length ?? null,
      rows: trackedRows.length,
    }
  })

  return rows.filter(([filepath]) => isTrackedJournalPath(filepath))
}

async function getDirtyTrackedPaths(runtime: JournalGitRuntime, traceName = 'status.dirtyPaths') {
  const rows = await getTrackedStatusRows(runtime, traceName)

  return rows.filter(isDirtyStatusRow).map(([filepath]) => filepath)
}

async function getRecentCommits(
  runtime: JournalGitRuntime,
  branch: string,
  depth = 3,
): Promise<JournalGitRecentCommit[]> {
  const reflogCommits = await getRecentCommitsFromReflog(runtime, branch, depth)

  if (reflogCommits.length > 0) {
    await traceGitStep(runtime, 'status.recentCommits', async () => reflogCommits, {
      commits: reflogCommits.length,
      source: 'reflog',
    })

    return reflogCommits
  }

  try {
    const commits = await traceGitStep(
      runtime,
      'status.recentCommits',
      async () => {
        const git = getGit(runtime)
        const results: Array<Awaited<ReturnType<typeof git.readCommit>>> = []
        const seenOids = new Set<string>()
        let nextOid: string | null = await git.resolveRef({
          dir: runtime.dir,
          fs: runtime.fs,
          ref: 'HEAD',
        })

        while (nextOid && results.length < depth && !seenOids.has(nextOid)) {
          seenOids.add(nextOid)

          const result = await git.readCommit({
            cache: runtime.cache,
            dir: runtime.dir,
            fs: runtime.fs,
            oid: nextOid,
          })

          results.push(result)
          nextOid = result.commit.parent[0] ?? null
        }

        return results
      },
      (results) => ({ commits: results.length }),
    )

    return commits.map(({ commit, oid }) => {
      const timestamp = commit.committer?.timestamp

      return {
        committedAt: typeof timestamp === 'number'
          ? new Date(timestamp * 1000).toISOString()
          : null,
        message: normalizeRecentCommitMessage(commit.message),
        oid,
        shortOid: oid.slice(0, 7),
      }
    })
  } catch {
    return []
  }
}

async function getRecentCommitsFromReflog(
  runtime: JournalGitRuntime,
  branch: string,
  depth: number,
): Promise<JournalGitRecentCommit[]> {
  const readFile = (runtime.fs as unknown as PromiseGitFileSystem).promises.readFile
  const reflogPath = getLocalBranchReflogPath(runtime, branch)

  if (!readFile || !reflogPath) {
    return []
  }

  try {
    const contents = await readFile(reflogPath, { encoding: 'utf8' })
    const text = typeof contents === 'string'
      ? contents
      : new TextDecoder().decode(contents)
    const seenOids = new Set<string>()
    const commits: JournalGitRecentCommit[] = []

    for (const line of text.split(/\r?\n/).reverse()) {
      if (!line.trim()) {
        continue
      }

      const commit = parseReflogCommitLine(line)

      if (!commit || seenOids.has(commit.oid)) {
        continue
      }

      seenOids.add(commit.oid)
      commits.push(commit)

      if (commits.length >= depth) {
        break
      }
    }

    return commits
  } catch {
    return []
  }
}

function parseReflogCommitLine(line: string): JournalGitRecentCommit | null {
  const [meta, rawMessage = ''] = line.split('\t', 2)
  const fields = meta.trim().split(/\s+/)
  const oid = fields[1]
  const timestamp = Number(fields[fields.length - 2])

  if (!oid || !/^[0-9a-f]{40}$/i.test(oid) || /^0+$/.test(oid)) {
    return null
  }

  return {
    committedAt: Number.isFinite(timestamp)
      ? new Date(timestamp * 1000).toISOString()
      : null,
    message: normalizeReflogMessage(rawMessage),
    oid,
    shortOid: oid.slice(0, 7),
  }
}

function normalizeReflogMessage(message: string) {
  return normalizeRecentCommitMessage(
    message
      .replace(/^commit(?: \(initial\))?:\s*/i, '')
      .replace(/^merge .*?:\s*/i, ''),
  )
}

function normalizeRecentCommitMessage(message: string) {
  return message.trim().split(/\r?\n/, 1)[0] || '(no message)'
}

function normalizeRecentCommitLimit(limit: number | undefined) {
  if (limit === undefined) {
    return 3
  }

  if (!Number.isFinite(limit)) {
    return 3
  }

  return Math.max(0, Math.floor(limit))
}

function getSyncCommitMessage(config: JournalGitSyncConfig) {
  return config.commitMessage?.trim() || defaultCommitMessage
}

function getLocalBranchReflogPath(runtime: JournalGitRuntime, branch: string) {
  const branchName = getBranchName(branch)

  if (!isSafeBranchPath(branchName)) {
    return null
  }

  return joinRuntimePath(
    joinRuntimePath(runtime.dir, '.git/logs/refs/heads'),
    branchName,
  )
}

function isSafeBranchPath(branch: string) {
  return branch.split('/').every((segment) => (
    segment !== '' &&
    segment !== '.' &&
    segment !== '..' &&
    /^[A-Za-z0-9._-]+$/.test(segment)
  ))
}

async function getDirtyTrackedPathsAfterOperation(
  runtime: JournalGitRuntime,
  options: JournalGitOperationOptions,
  traceName: string,
) {
  if (options.collectDirtyPathsAfterSync === false) {
    return traceGitStep(runtime, traceName, async () => [], {
      skipped: true,
    })
  }

  return getDirtyTrackedPaths(runtime, traceName)
}

async function getDirtyTrackedPathsBeforeMerge(
  runtime: JournalGitRuntime,
  options: JournalGitOperationOptions,
) {
  const knownChangedPaths = normalizeKnownChangedPaths(options.changedPaths)

  if (knownChangedPaths) {
    return traceGitStep(runtime, 'pull.postFetchDirtyStatus', async () => [], {
      knownPaths: knownChangedPaths.length,
      skipped: true,
    })
  }

  return getDirtyTrackedPaths(runtime, 'pull.postFetchDirtyStatus')
}

async function getChangedTrackedPathsBetweenRefs(
  runtime: JournalGitRuntime,
  beforeRef: string,
  afterRef: string,
  traceName: string,
): Promise<string[]> {
  if (beforeRef === afterRef) {
    return []
  }

  return traceGitStep<string[]>(runtime, traceName, async () => {
    const git = getGit(runtime)
    const rawChangedPaths = await git.walk({
      cache: runtime.cache,
      dir: runtime.dir,
      fs: runtime.fs,
      map: async (filepath, entries) => {
        const [beforeEntry, afterEntry] = entries

        if (filepath === '.') {
          return undefined
        }

        const [beforeType, afterType] = await Promise.all([
          beforeEntry?.type(),
          afterEntry?.type(),
        ])
        const entryType = beforeType ?? afterType

        if (entryType === 'tree') {
          return shouldWalkTrackedJournalTree(filepath) ? undefined : null
        }

        if (!isTrackedJournalPath(filepath)) {
          return undefined
        }

        const [beforeOid, afterOid] = await Promise.all([
          beforeEntry?.oid(),
          afterEntry?.oid(),
        ])

        return beforeOid !== afterOid ? filepath : undefined
      },
      reduce: async (parent, children) => {
        const flattened: string[] = []

        if (typeof parent === 'string') {
          flattened.push(parent)
        }

        for (const child of children) {
          if (typeof child === 'string') {
            flattened.push(child)
          } else if (Array.isArray(child)) {
            flattened.push(...child.filter((filepath: unknown): filepath is string => typeof filepath === 'string'))
          }
        }

        return flattened
      },
      trees: [
        git.TREE({ ref: beforeRef }),
        git.TREE({ ref: afterRef }),
      ],
    })

    const changedPaths: string[] = rawChangedPaths.filter((filepath: unknown): filepath is string => {
      return typeof filepath === 'string' && isTrackedJournalPath(filepath)
    })

    return [...new Set(changedPaths)].sort()
  }, (changedPaths) => ({
    paths: changedPaths.length,
  }))
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
  return await readCurrentBranch(runtime) ?? fallback
}

async function readCurrentBranch(runtime: JournalGitRuntime) {
  try {
    return await getGit(runtime).currentBranch({
      dir: runtime.dir,
      fs: runtime.fs,
      test: true,
    }) ?? null
  } catch {
    return null
  }
}

async function hasLocalBranchCommit(runtime: JournalGitRuntime, branch: string) {
  return (await getLocalBranchCommitOid(runtime, branch)) !== null
}

async function getLocalBranchCommitOid(runtime: JournalGitRuntime, branch: string) {
  try {
    return await getGit(runtime).resolveRef({
      dir: runtime.dir,
      fs: runtime.fs,
      ref: getLocalBranchRef(branch),
    })
  } catch {
    return null
  }
}

async function getRemoteTrackingBranchCommitOid(
  runtime: JournalGitRuntime,
  remote: string,
  branch: string,
) {
  try {
    return await getGit(runtime).resolveRef({
      dir: runtime.dir,
      fs: runtime.fs,
      ref: getRemoteTrackingBranchRef(remote, branch),
    })
  } catch {
    return null
  }
}

async function isLocalBranchAtRemoteTracking(
  runtime: JournalGitRuntime,
  remote: string,
  branch: string,
) {
  const [localBranchOid, remoteTrackingOid] = await Promise.all([
    getLocalBranchCommitOid(runtime, branch),
    getRemoteTrackingBranchCommitOid(runtime, remote, branch),
  ])

  return Boolean(localBranchOid && remoteTrackingOid && localBranchOid === remoteTrackingOid)
}

async function clearRemoteTrackingBranchRef(
  runtime: JournalGitRuntime,
  remote: string,
  branch: string,
) {
  const ref = getRemoteTrackingBranchRef(remote, branch)

  await traceGitStep(runtime, 'remote.clearTrackingRef', async () => {
    try {
      await getGit(runtime).deleteRef({
        dir: runtime.dir,
        fs: runtime.fs,
        ref,
      })
      return true
    } catch {
      return false
    }
  }, (deleted) => ({
    branch: getBranchName(branch),
    deleted,
    remote,
  }))
}

async function fileExists(runtime: JournalGitRuntime, path: string) {
  try {
    await (runtime.fs as unknown as PromiseGitFileSystem).promises.stat(path)
    return true
  } catch {
    return false
  }
}

async function traceMergeInputs(
  runtime: JournalGitRuntime,
  traceName: string,
  branch: string,
  remote: string,
) {
  const startedAt = Date.now()

  try {
    const details = await collectMergeInputDetails(runtime, branch, remote, traceName)

    emitGitTrace(runtime, {
      details,
      durationMs: Date.now() - startedAt,
      name: 'remote.mergeInputs',
      ok: true,
    })

    return details
  } catch (error) {
    emitGitTrace(runtime, {
      details: createErrorTraceDetails(error, { attempt: traceName, branch, remote }),
      durationMs: Date.now() - startedAt,
      errorMessage: getErrorMessage(error),
      name: 'remote.mergeInputs',
      ok: false,
    })

    return {
      attempt: traceName,
      branch,
      remote,
    }
  }
}

async function collectMergeInputDetails(
  runtime: JournalGitRuntime,
  branch: string,
  remote: string,
  traceName: string,
): Promise<JournalGitTraceDetails> {
  const localRef = getLocalBranchRef(branch)
  const remoteTrackingRef = getRemoteTrackingBranchRef(remote, branch)
  const upstreamRemoteKey = `branch.${branch}.remote`
  const upstreamMergeKey = `branch.${branch}.merge`
  const [
    headOid,
    localOid,
    remoteTrackingOid,
    upstreamRemote,
    upstreamMerge,
  ] = await Promise.all([
    resolveRefForTrace(runtime, 'HEAD'),
    resolveRefForTrace(runtime, localRef),
    resolveRefForTrace(runtime, remoteTrackingRef),
    getConfigForTrace(runtime, upstreamRemoteKey),
    getConfigForTrace(runtime, upstreamMergeKey),
  ])

  return {
    attempt: traceName,
    branch,
    headOid,
    localOid,
    localRef,
    remote,
    remoteTrackingOid,
    remoteTrackingRef,
    upstreamMerge,
    upstreamRemote,
  }
}

async function resolveRefForTrace(runtime: JournalGitRuntime, ref: string) {
  try {
    const oid = await getGit(runtime).resolveRef({
      dir: runtime.dir,
      fs: runtime.fs,
      ref,
    })

    return shortTraceOid(oid)
  } catch (error) {
    return `unresolved:${compactErrorMessage(error)}`
  }
}

async function getConfigForTrace(runtime: JournalGitRuntime, path: string) {
  try {
    const value = await getGit(runtime).getConfig({
      dir: runtime.dir,
      fs: runtime.fs,
      path,
    })

    return typeof value === 'string' && value ? value : 'unset'
  } catch (error) {
    return `unreadable:${compactErrorMessage(error)}`
  }
}

function getBranchName(branch: string) {
  return branch.startsWith('refs/heads/') ? branch.slice('refs/heads/'.length) : branch
}

function getLocalBranchRef(branch: string) {
  return `refs/heads/${getBranchName(branch)}`
}

function getRemoteBranchRef(branch: string) {
  return `refs/heads/${getBranchName(branch)}`
}

function getRemoteTrackingBranchRef(remote: string, branch: string) {
  return `refs/remotes/${remote}/${getBranchName(branch)}`
}

function isRecoverableInternalMergeError(error: unknown) {
  const message = getErrorMessage(error)

  return (
    message.includes("Cannot read property 'match' of undefined") ||
    message.includes("Cannot read properties of undefined (reading 'match')")
  )
}

function createMergeRecoveryError(error: unknown) {
  return new Error(
    `Git merge failed after refreshing remote tracking refs: ${getErrorMessage(error)}`,
  )
}

function createUnrelatedHistoriesError(error: unknown) {
  return new Error(
    `Local and remote journal histories do not share a common ancestor. Sync stopped before merging or pushing; choose one history or run a one-time repair before syncing again. Original merge error: ${getErrorMessage(error)}`,
  )
}

function createFirstSyncNeedsChoiceError(localDirtyPaths: string[]) {
  const previewPaths = localDirtyPaths.slice(0, 3).join(', ')
  const suffix = localDirtyPaths.length > 3 ? ` 等 ${localDirtyPaths.length} 个路径` : previewPaths

  return new Error(
    `首次同步前本地已有日记内容，而远端分支也已有历史。为避免创建没有共同祖先的 Git 历史，同步已停止；请先选择保留本地内容或先导入远端内容。受影响路径：${suffix}`,
  )
}

function isSafeShortRefFileName(branch: string) {
  return /^[A-Za-z0-9._-]+$/.test(branch)
}

function getJournalGitAuthUsername(credentials: JournalGitCredentials) {
  return credentials.username ?? 'x-access-token'
}

function getPushResultFromError(error: unknown): PushResult | null {
  if (!isRecord(error) || !isRecord(error.data)) {
    return null
  }

  return normalizePushResult(error.data.result)
}

function normalizePushResult(value: unknown): PushResult | null {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return null
  }

  return {
    ...value,
    error: typeof value.error === 'string' ? value.error : null,
    refs: isRecord(value.refs) ? value.refs : {},
  } as PushResult
}

type JournalGitTraceDetailsInput<T> =
  | JournalGitTraceDetails
  | ((result: T) => JournalGitTraceDetails)

async function traceGitStep<T>(
  runtime: JournalGitRuntime,
  name: string,
  operation: () => Promise<T>,
  details?: JournalGitTraceDetailsInput<T>,
  errorDetails?: JournalGitTraceDetails,
): Promise<T> {
  const startedAt = Date.now()

  try {
    const result = await operation()

    emitGitTrace(runtime, {
      details: createTraceDetails(details, result),
      durationMs: Date.now() - startedAt,
      name,
      ok: true,
    })

    return result
  } catch (error) {
    emitGitTrace(runtime, {
      details: createErrorTraceDetails(
        error,
        errorDetails ?? (typeof details === 'function' ? undefined : details),
      ),
      durationMs: Date.now() - startedAt,
      errorMessage: getErrorMessage(error),
      name,
      ok: false,
    })

    throw error
  }
}

function emitGitTrace(runtime: JournalGitRuntime, event: JournalGitTraceEvent) {
  try {
    runtime.trace?.(event)
  } catch {
    // Tracing is diagnostic only; logging failures must not break sync.
  }
}

function createTraceDetails<T>(
  details: JournalGitTraceDetailsInput<T> | undefined,
  result: T,
) {
  return typeof details === 'function' ? details(result) : details
}

function createErrorTraceDetails(
  error: unknown,
  details?: JournalGitTraceDetails,
): JournalGitTraceDetails {
  const errorRecord = isRecord(error) ? error : null
  const errorName = error instanceof Error ? error.name : typeof error
  const errorCaller = errorRecord && typeof errorRecord.caller === 'string'
    ? errorRecord.caller
    : null
  const errorCode = getErrorCode(error)
  const errorStackTop = getErrorStackTop(error)

  return {
    ...(details ?? {}),
    errorCaller,
    errorCode,
    errorName,
    errorStackTop,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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

function shortTraceOid(value: string | null) {
  if (!value) {
    return 'missing'
  }

  return /^[0-9a-f]{40}$/i.test(value) ? value.slice(0, 12) : value
}

function compactErrorMessage(error: unknown) {
  return getErrorMessage(error)
    .replace(/\s+/g, ' ')
    .slice(0, 160)
}

function getErrorStackTop(error: unknown) {
  if (!(error instanceof Error) || !error.stack) {
    return null
  }

  return error.stack
    .split('\n')
    .slice(0, 6)
    .map((line) => line.trim())
    .join(' | ')
    .slice(0, 700)
}

function isDirtyStatusRow([, headStatus, workdirStatus, stageStatus]: StatusRow) {
  return headStatus !== workdirStatus || workdirStatus !== stageStatus
}

function isStagedStatusRow([, headStatus, , stageStatus]: StatusRow) {
  return headStatus !== stageStatus
}

async function assertNoConflictMarkersInChangedMarkdown(
  runtime: JournalGitRuntime,
  changedRows: StatusRow[],
) {
  const readFile = (runtime.fs as unknown as PromiseGitFileSystem).promises.readFile

  if (!readFile) {
    return
  }

  await traceGitStep(runtime, 'commit.conflictMarkerCheck', async () => {
    let checked = 0

    for (const [filepath, , workdirStatus] of changedRows) {
      if (workdirStatus === 0 || !journalEntryPathPattern.test(filepath)) {
        continue
      }

      checked += 1
      const content = await readFileIfExists(runtime, filepath, readFile)

      if (content === null) {
        continue
      }

      if (hasConflictMarkers(toUtf8String(content))) {
        throw new Error(`Journal sync conflict markers remain in ${filepath}. Resolve conflicts before syncing.`)
      }
    }

    return checked
  }, (checked) => ({
    checked,
  }))
}

async function readFileIfExists(
  runtime: JournalGitRuntime,
  filepath: string,
  readFile: NonNullable<PromiseGitFileSystem['promises']['readFile']>,
) {
  try {
    return await readFile(joinRuntimePath(runtime.dir, filepath), { encoding: 'utf8' })
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return null
    }

    throw error
  }
}

function hasConflictMarkers(content: string) {
  return /^(<<<<<<<|>>>>>>>)(?: .*)?$/m.test(content)
}

function toUtf8String(content: string | Uint8Array) {
  if (typeof content === 'string') {
    return content
  }

  return new TextDecoder().decode(content)
}

function normalizeKnownChangedPaths(changedPaths: readonly string[] | undefined) {
  if (!changedPaths) {
    return null
  }

  const normalizedPaths = [...new Set(changedPaths.map(normalizeRepositoryPath))].sort()

  for (const filepath of normalizedPaths) {
    if (!isTrackedJournalPath(filepath)) {
      throw new Error(`Invalid journal sync changed path: ${filepath}`)
    }
  }

  return normalizedPaths
}

function normalizeCheckoutFilepaths(filepaths: readonly string[]) {
  return [...new Set(filepaths.map(normalizeRepositoryPath))]
    .filter((filepath) => trackedPathFiles.has(filepath) || trackedStatusFilepaths.includes(filepath) || isTrackedJournalPath(filepath))
    .sort()
}

function normalizeRepositoryPath(filepath: string) {
  return filepath.trim().replace(/\\/g, '/').replace(/^\.?\//, '')
}

function isTrackedJournalPath(filepath: string) {
  return trackedPathFiles.has(filepath) ||
    journalEntryPathPattern.test(filepath) ||
    journalAnnotationPathPattern.test(filepath) ||
    journalReviewPathPattern.test(filepath) ||
    isTrackedJournalMediaPath(filepath)
}

function shouldWalkTrackedJournalTree(filepath: string) {
  const normalizedPath = normalizeRepositoryPath(filepath)

  return trackedPathPrefixes.some((pathPrefix) => {
    const treeRoot = pathPrefix.slice(0, -1)

    return normalizedPath === treeRoot || normalizedPath.startsWith(`${treeRoot}/`)
  })
}

function isTrackedJournalMediaPath(filepath: string) {
  return filepath.startsWith('media/') && !hasTemporaryOrHiddenPathSegment(filepath)
}

function hasTemporaryOrHiddenPathSegment(filepath: string) {
  return filepath.split('/').some((segment) => {
    return segment === '' ||
      segment.startsWith('.') ||
      segment.endsWith('.tmp')
  })
}

function isEmptyRemoteError(error: unknown) {
  const code = getErrorCode(error)

  if (code === 'EmptyServerResponseError') {
    return true
  }

  const message = error instanceof Error ? error.message : ''

  return /couldn't find remote ref|fatal: couldn't find remote ref/i.test(message)
}

function isFileNotFoundError(error: unknown) {
  const code = getErrorCode(error)

  return code === 'ENOENT' || code === 'NotFoundError'
}

function isRetryablePushError(error: unknown) {
  const code = getErrorCode(error)
  const message = getErrorMessage(error).toLowerCase()

  return code === 'PushRejectedError' ||
    code === 'GitPushError' ||
    message.includes('failed to push') ||
    message.includes('non-fast-forward') ||
    message.includes('cannot lock ref') ||
    message.includes('stale info')
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null
  }

  const code = (error as { code?: unknown }).code

  return typeof code === 'string' ? code : null
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Git push failed.'
}

function getGit(runtime: JournalGitRuntime) {
  return runtime.git ?? defaultGit
}

function joinRuntimePath(parent: string, child: string) {
  return `${parent.replace(/\/$/, '')}/${child.replace(/^\//, '')}`
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
