import type {
  FetchResult,
  FsClient,
  HttpClient,
  MergeResult,
  PushResult,
  ReadCommitResult,
  ServerRef,
  StatusRow,
  TreeEntry,
} from 'isomorphic-git'
import * as defaultGit from 'isomorphic-git'
import {
  createJournalGitAuthenticatedHttpClient,
  type JournalGitCredentials,
} from './auth'
import {
  createJournalMergeStats,
  mergeJournalFileContents,
} from '../merge/smartMerge'
import { runJournalDomainMergeOperation } from '../merge/domainMerge'
import {
  getBranchName,
  getLocalBranchRef,
  getRemoteBranchRef,
  getRemoteTrackingBranchRef,
} from './refs'
import {
  isCommitReadable,
  rebuildMissingPackIndexesForCommit,
  type MissingPackIndexRepairResult,
} from './objectRepair'
import {
  createJournalGitObjectRepairThrottle,
  type JournalGitObjectRepairThrottle,
} from './objectRepairThrottle'
import {
  isSafeRepositoryPath,
  isTextMergeJournalPath,
  isTrackedJournalEntryPath,
  isTrackedJournalPath,
  normalizeCheckoutFilepaths,
  normalizeRepositoryPath,
  trackedStatusFilepaths,
} from './trackedPaths'
import {
  createJournalSyncBlockedError,
  type SyncBlockConflictPreview,
} from '../state/syncBlock'

export {
  createJournalGitAuthenticatedHttpClient,
  createJournalGitAuthHeaders,
  getJournalGitAuthenticationErrorMessage,
  type JournalGitCredentials,
  type JournalGitHttpClientOptions,
} from './auth'

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
  firstSyncLocalContent?: 'empty' | 'unknown'
  skipDirtyCheckBeforeMerge?: boolean
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

export {
  createJournalGitObjectRepairThrottle,
  type JournalGitObjectRepairThrottle,
} from './objectRepairThrottle'

export type JournalGitRuntime = {
  cache: object
  dir: string
  fs: FsClient
  git?: typeof defaultGit
  http: HttpClient
  httpRequestTimeoutMs?: number | null
  objectRepairThrottle?: JournalGitObjectRepairThrottle
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

export type JournalGitConflictResolutionStrategy = 'keep-both' | 'keep-local' | 'keep-remote'

export type JournalGitConflictResolutionOptions = {
  strategy: JournalGitConflictResolutionStrategy
}

export type JournalGitConflictResolutionResult = {
  localCommitOid: string | null
  pushResult: PushResult | null
  strategy: JournalGitConflictResolutionStrategy
  updatedWorktree: boolean
}

type PromiseGitFileSystem = {
  promises: {
    readFile?: (path: string, options?: unknown) => Promise<string | Uint8Array>
    readdir?: (path: string) => Promise<string[]>
    stat: (path: string) => Promise<unknown>
    unlink?: (path: string) => Promise<void>
    writeFile?: (path: string, data: string | Uint8Array, options?: unknown) => Promise<void>
  }
}

type RemoteFetchDecision = {
  fetchResult: FetchResult | null
  repairCooldownKey: string | null
  restoredTrackingObjectFromPack: boolean
  skipped: boolean
}

type RemoteMergeRepairHints = {
  preferRetryWithoutRefetch?: boolean
}

type ResolutionTreeLeafEntry = {
  filepath: string
  mode: string
  oid: string
  type: 'blob' | 'commit'
}

type ResolutionTreeNode = {
  children: Map<string, ResolutionTreeNode | ResolutionTreeLeafEntry>
  type: 'tree'
}

const defaultAuthorEmail = 'journal-sync@example.invalid'
const defaultAuthorName = 'Journal Sync'
const defaultBranch = 'main'
const defaultCommitMessage = 'Sync journal changes'
const defaultRemote = 'origin'
const missingObjectRefetchCooldownMs = 10 * 60 * 1000
const defaultObjectRepairThrottle = createJournalGitObjectRepairThrottle()
const maxConflictPreviewCount = 4
const maxConflictPreviewLines = 10
const maxConflictPreviewTextLength = 600

function createAuthenticatedRuntimeHttpClient(
  runtime: JournalGitRuntime,
  credentials: JournalGitCredentials,
) {
  return createJournalGitAuthenticatedHttpClient(runtime.http, credentials, {
    requestTimeoutMs: runtime.httpRequestTimeoutMs,
  })
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
    http: createAuthenticatedRuntimeHttpClient(runtime, credentials),
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

    skipPush = !localCommitOid && !(await hasLocalBranchCommit(runtime, branch))
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

  const shouldSkipPush = !localCommitOid &&
    !mergeCommitOid &&
    await isLocalBranchAtRemoteTracking(runtime, remote, branch)

  if (shouldSkipPush) {
    await traceGitStep(runtime, 'remote.pushSkipped', async () => null, {
      branch,
      reason: 'no-local-or-merge-commit',
      remote,
    })

    return {
      dirtyPathsAfterSync: await getDirtyTrackedPathsAfterOperation(runtime, options, 'sync.dirtyPathsAfterSync'),
      fetchResult,
      localCommitOid,
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

export async function resolveJournalContentConflict(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
  options: JournalGitConflictResolutionOptions,
): Promise<JournalGitConflictResolutionResult> {
  return traceGitStep(
    runtime,
    'resolveConflict.total',
    () => resolveJournalContentConflictInternal(runtime, config, credentials, options),
    (result) => ({
      changed: Boolean(result.localCommitOid || result.updatedWorktree),
      pushed: Boolean(result.pushResult),
      strategy: result.strategy,
    }),
  )
}

async function resolveJournalContentConflictInternal(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
  options: JournalGitConflictResolutionOptions,
): Promise<JournalGitConflictResolutionResult> {
  if (!config.remoteUrl) {
    throw new Error('GitHub repository URL is required before resolving sync conflicts.')
  }

  const branch = getBranchName(config.branch ?? defaultBranch)
  const remote = config.remote ?? defaultRemote

  await ensureRepository(runtime, config)

  if (options.strategy === 'keep-local') {
    await requireLocalBranchCommitOid(runtime, branch)

    const localCommitOid = await commitTrackedChanges(
      runtime,
      config,
      getSyncCommitMessage(config),
    )

    await assertNoConflictMarkersInWorktreeMarkdown(runtime)
    await fetchRemote(runtime, config, credentials, 'resolveConflict.fetch')

    const resolutionCommitOid = await createKeepLocalConflictResolutionCommit(
      runtime,
      config,
      remote,
      branch,
    )
    const pushResult = await tryPushRemote(runtime, {
      branch,
      credentials,
      remote,
    })

    if (!pushResult.ok) {
      throw new Error(pushResult.error ?? 'GitHub push failed while resolving sync conflict.')
    }

    await updateRemoteTrackingBranchRef(runtime, remote, branch, resolutionCommitOid)

    return {
      localCommitOid: resolutionCommitOid ?? localCommitOid,
      pushResult,
      strategy: options.strategy,
      updatedWorktree: false,
    }
  }

  if (options.strategy === 'keep-both') {
    await requireLocalBranchCommitOid(runtime, branch)
    await resolveConflictMarkersInWorktreeMarkdown(runtime)

    const localCommitOid = await commitTrackedChanges(
      runtime,
      config,
      getSyncCommitMessage(config),
    )

    await assertNoConflictMarkersInWorktreeMarkdown(runtime)
    await fetchRemote(runtime, config, credentials, 'resolveConflict.fetch')

    const resolutionCommitOid = await createKeepBothConflictResolutionCommit(
      runtime,
      config,
      remote,
      branch,
    )
    const pushResult = await tryPushRemote(runtime, {
      branch,
      credentials,
      remote,
    })

    if (!pushResult.ok) {
      throw new Error(pushResult.error ?? 'GitHub push failed while resolving sync conflict.')
    }

    await updateRemoteTrackingBranchRef(runtime, remote, branch, resolutionCommitOid)

    return {
      localCommitOid: resolutionCommitOid ?? localCommitOid,
      pushResult,
      strategy: options.strategy,
      updatedWorktree: true,
    }
  }

  if (options.strategy === 'keep-remote') {
    await fetchRemote(runtime, config, credentials, 'resolveConflict.fetch')

    const localOid = await requireLocalBranchCommitOid(runtime, branch)
    const remoteTrackingOid = await requireRemoteTrackingBranchCommitOid(runtime, remote, branch)

    await traceGitStep(runtime, 'resolveConflict.keepRemoteRef', () => getGit(runtime).writeRef({
      dir: runtime.dir,
      force: true,
      fs: runtime.fs,
      ref: getLocalBranchRef(branch),
      value: remoteTrackingOid,
    }), {
      branch,
      remote,
      remoteOid: shortTraceOid(remoteTrackingOid),
    })
    await traceGitStep(runtime, 'resolveConflict.alignHead', () => attachHeadToLocalBranchIfSameCommit(runtime, branch), { branch })

    const checkoutPaths = await getChangedCheckoutPathsBetweenRefs(
      runtime,
      localOid,
      remoteTrackingOid,
      'resolveConflict.keepRemoteDiff',
    )
    const updatedWorktree = await checkoutLocalBranch(
      runtime,
      branch,
      checkoutPaths.length > 0 ? checkoutPaths : trackedStatusFilepaths,
    )

    return {
      localCommitOid: null,
      pushResult: null,
      strategy: options.strategy,
      updatedWorktree,
    }
  }

  throw new Error(`Unsupported journal conflict resolution strategy: ${String(options.strategy)}`)
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
    await traceGitStep(runtime, 'commit.status', async () => [], {
      dirty: 0,
      globalFallback: false,
      knownPaths: 0,
      rows: 0,
      skipped: true,
      trusted: true,
    })

    return null
  }

  const changedRows = knownChangedPaths
    ? await getKnownChangedStatusRows(runtime, knownChangedPaths)
    : (await getTrackedStatusRows(runtime, 'commit.status')).filter(isDirtyStatusRow)

  if (changedRows.length === 0) {
    return null
  }

  await assertNoConflictMarkersInChangedMarkdown(runtime, changedRows)

  await traceGitStep(runtime, 'commit.stage', async () => {
    for (const [filepath, headStatus, workdirStatus] of changedRows) {
      if (workdirStatus === 0 && headStatus !== 0) {
        await removeTrackedPathFromIndex(runtime, filepath, Boolean(knownChangedPaths))
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

async function removeTrackedPathFromIndex(
  runtime: JournalGitRuntime,
  filepath: string,
  ignoreNotFound: boolean,
) {
  try {
    await getGit(runtime).remove({
      cache: runtime.cache,
      dir: runtime.dir,
      filepath,
      fs: runtime.fs,
    })
  } catch (error) {
    if (ignoreNotFound && isFileNotFoundError(error)) {
      return
    }

    throw error
  }
}

async function getKnownChangedStatusRows(
  runtime: JournalGitRuntime,
  knownChangedPaths: readonly string[],
) {
  return traceGitStep(runtime, 'commit.status', async () => {
    const rows: StatusRow[] = []

    for (const filepath of knownChangedPaths) {
      const workdirStatus = await doesWorktreePathExist(runtime, filepath) ? 2 : 0

      rows.push([filepath, 1, workdirStatus, 1])
    }

    return rows
  }, (rows) => ({
    dirty: rows.length,
    globalFallback: false,
    knownPaths: knownChangedPaths.length,
    rows: rows.length,
    trusted: true,
  }))
}

async function doesWorktreePathExist(runtime: JournalGitRuntime, filepath: string) {
  try {
    await (runtime.fs as unknown as PromiseGitFileSystem).promises.stat(
      joinRuntimePath(runtime.dir, filepath),
    )

    return true
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return false
    }

    throw error
  }
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

async function repairMissingPackIndexForCommit(
  runtime: JournalGitRuntime,
  oid: string,
  traceName: string,
): Promise<MissingPackIndexRepairResult> {
  return traceGitStep(
    runtime,
    traceName,
    () => rebuildMissingPackIndexesForCommit(runtime, oid),
    (result) => ({
      failedPacks: result.failedPacks,
      indexedPacks: result.indexedPacks,
      orphanPacks: result.orphanPacks,
      restored: result.restored,
      targetOid: shortTraceOid(oid),
      unavailableReason: result.unavailableReason,
    }),
  )
}

function createMissingObjectRefetchCooldownKey(
  runtime: JournalGitRuntime,
  remote: string,
  branch: string,
  oid: string,
) {
  return [
    runtime.dir,
    remote,
    getBranchName(branch),
    oid,
  ].join('\0')
}

async function assertMissingObjectRefetchAllowed(
  runtime: JournalGitRuntime,
  cooldownKey: string | null,
  traceName: string,
  details: JournalGitTraceDetails,
) {
  if (!cooldownKey) {
    return
  }

  const remainingMs = getMissingObjectRefetchCooldownRemainingMs(runtime, cooldownKey)

  if (remainingMs <= 0) {
    return
  }

  await traceGitStep(runtime, traceName, async () => {
    throw createObjectStoreCorruptBlockedError({
      message: `本地同步仓库对象库仍不可读，已暂缓重新下载以避免反复消耗流量。请稍后手动同步，或重新修复本地同步仓库。剩余等待时间：${Math.ceil(remainingMs / 1000)} 秒。`,
      retryAfterMs: remainingMs,
    })
  }, {
    ...details,
    cooldownMs: missingObjectRefetchCooldownMs,
    remainingMs,
  })
}

function getMissingObjectRefetchCooldownRemainingMs(runtime: JournalGitRuntime, cooldownKey: string) {
  const objectRepairThrottle = getObjectRepairThrottle(runtime)
  const attemptedAt = objectRepairThrottle.getAttemptedAt(cooldownKey)

  if (!attemptedAt) {
    return 0
  }

  const remainingMs = attemptedAt + missingObjectRefetchCooldownMs - Date.now()

  if (remainingMs <= 0) {
    objectRepairThrottle.clearAttempt(cooldownKey)
    return 0
  }

  return remainingMs
}

function rememberMissingObjectRefetchAttempt(runtime: JournalGitRuntime, cooldownKey: string | null) {
  if (cooldownKey) {
    getObjectRepairThrottle(runtime).rememberAttempt(cooldownKey, Date.now())
  }
}

function clearMissingObjectRefetchAttempt(runtime: JournalGitRuntime, cooldownKey: string | null) {
  if (cooldownKey) {
    getObjectRepairThrottle(runtime).clearAttempt(cooldownKey)
  }
}

function getObjectRepairThrottle(runtime: JournalGitRuntime) {
  return runtime.objectRepairThrottle ?? defaultObjectRepairThrottle
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
    http: createAuthenticatedRuntimeHttpClient(runtime, credentials),
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
    if (!(await isCommitReadable(runtime, remoteTrackingOid))) {
      const packRepair = await repairMissingPackIndexForCommit(
        runtime,
        remoteTrackingOid,
        'remote.packIndexRepair',
      )

      if (packRepair.restored && await isCommitReadable(runtime, remoteTrackingOid)) {
        return {
          fetchResult: null,
          repairCooldownKey: null,
          restoredTrackingObjectFromPack: true,
          skipped: false,
        }
      }

      const repairCooldownKey = createMissingObjectRefetchCooldownKey(
        runtime,
        remote,
        branch,
        remoteTrackingOid,
      )

      await assertMissingObjectRefetchAllowed(
        runtime,
        repairCooldownKey,
        'remote.fetchRepairThrottled',
        {
          branch,
          reason: 'missing-tracking-object',
          remote,
          remoteTrackingOid: shortTraceOid(remoteTrackingOid),
        },
      )
      await traceGitStep(runtime, 'remote.fetchRepair', async () => {
        await clearRemoteTrackingBranchRef(runtime, remote, branch)
        return null
      }, {
        branch,
        indexedPacks: packRepair.indexedPacks,
        reason: 'missing-tracking-object',
        remote,
        remoteTrackingOid: shortTraceOid(remoteTrackingOid),
        restoredFromPack: packRepair.restored,
      })
      const fetchResult = await fetchRemote(runtime, config, credentials)

      rememberMissingObjectRefetchAttempt(runtime, repairCooldownKey)

      return {
        fetchResult,
        repairCooldownKey,
        restoredTrackingObjectFromPack: false,
        skipped: false,
      }
    }

    await traceGitStep(runtime, 'remote.fetchSkipped', async () => null, {
      branch,
      reason: 'remote-unchanged',
      remote,
    })

    return {
      fetchResult: null,
      repairCooldownKey: null,
      restoredTrackingObjectFromPack: false,
      skipped: true,
    }
  }

  return {
    fetchResult: await fetchRemote(runtime, config, credentials),
    repairCooldownKey: null,
    restoredTrackingObjectFromPack: false,
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

  if (options.firstSyncLocalContent === 'empty') {
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

  if (knownChangedPaths && knownChangedPaths.length > 0) {
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
      http: createAuthenticatedRuntimeHttpClient(runtime, credentials),
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
  repairHints: RemoteMergeRepairHints = {},
) {
  const branch = getBranchName(config.branch ?? defaultBranch)
  const remote = config.remote ?? defaultRemote
  const mergeStats = createJournalMergeStats()

  try {
    const mergeResult = await runJournalDomainMerge(runtime, config, mergeStats, 'remote.merge')

    await traceGitStep(runtime, 'merge.strategy', async () => null, {
      clean: mergeStats.conflictPaths === 0,
      conflictPaths: mergeStats.conflictPaths,
      journalStructurePaths: mergeStats.journalStructurePaths,
      markdownPaths: mergeStats.markdownPaths,
      result: getMergeResultKind(mergeResult),
      sideChoicePaths: mergeStats.sideChoicePaths,
      strategy: 'journal-domain-merge',
    })

    return mergeResult
  } catch (error) {
    if (isRecoverableInternalMergeError(error)) {
      const retryStats = createJournalMergeStats()

      const repairResult = await traceGitStep(runtime, 'remote.mergeRepair', async () => {
        const remoteTrackingOid = await getRemoteTrackingBranchCommitOid(runtime, remote, branch)
        const packRepair = remoteTrackingOid
          ? await repairMissingPackIndexForCommit(
            runtime,
            remoteTrackingOid,
            'remote.mergePackIndexRepair',
          )
          : null

        const canRetryWithoutRefetch = remoteTrackingOid &&
          (packRepair?.restored || repairHints.preferRetryWithoutRefetch) &&
          await isCommitReadable(runtime, remoteTrackingOid)

        if (remoteTrackingOid && canRetryWithoutRefetch) {
          return {
            indexedPacks: packRepair?.indexedPacks ?? 0,
            refetched: false,
            repairCooldownKey: null,
            retryWithoutRefetch: true,
            restoredFromPack: Boolean(packRepair?.restored || repairHints.preferRetryWithoutRefetch),
          }
        }

        const repairCooldownKey = remoteTrackingOid
          ? createMissingObjectRefetchCooldownKey(runtime, remote, branch, remoteTrackingOid)
          : null

        await assertMissingObjectRefetchAllowed(
          runtime,
          repairCooldownKey,
          'remote.mergeRefetchThrottled',
          {
            branch,
            reason: 'merge-repair-refetch',
            remote,
            remoteTrackingOid: shortTraceOid(remoteTrackingOid),
          },
        )
        await clearRemoteTrackingBranchRef(runtime, remote, branch)
        await fetchRemote(runtime, config, credentials, 'remote.refetchAfterMergeError')
        rememberMissingObjectRefetchAttempt(runtime, repairCooldownKey)

        return {
          indexedPacks: packRepair?.indexedPacks ?? 0,
          refetched: true,
          repairCooldownKey,
          retryWithoutRefetch: false,
          restoredFromPack: false,
        }
      }, (result) => ({
        branch,
        error: getErrorMessage(error),
        indexedPacks: result.indexedPacks,
        refetched: result.refetched,
        remote,
        retryWithoutRefetch: result.retryWithoutRefetch,
        restoredFromPack: result.restoredFromPack,
      }))

      try {
        const retryResult = await runJournalDomainMerge(runtime, config, retryStats, 'remote.mergeRetry')

        await traceGitStep(runtime, 'merge.strategy', async () => null, {
          clean: retryStats.conflictPaths === 0,
          conflictPaths: retryStats.conflictPaths,
          journalStructurePaths: retryStats.journalStructurePaths,
          markdownPaths: retryStats.markdownPaths,
          result: getMergeResultKind(retryResult),
          sideChoicePaths: retryStats.sideChoicePaths,
          strategy: 'journal-domain-merge',
        })
        clearMissingObjectRefetchAttempt(runtime, repairResult.repairCooldownKey)

        return retryResult
      } catch (retryError) {
        if (isRecoverableInternalMergeError(retryError)) {
          await throwRecoverableMergeFailure(runtime, config, credentials, retryError)
        }

        throw createMergeRecoveryError(retryError)
      }
    }

    if (isMergeConflictError(error)) {
      const conflictPaths = getMergeConflictPaths(error)
      const conflictPathCount = conflictPaths.length || mergeStats.conflictPaths

      await traceGitStep(runtime, 'merge.strategy', async () => null, {
        clean: false,
        conflictPaths: conflictPathCount,
        journalStructurePaths: mergeStats.journalStructurePaths,
        markdownPaths: mergeStats.markdownPaths,
        result: 'conflict',
        sideChoicePaths: mergeStats.sideChoicePaths,
        strategy: 'journal-domain-merge',
      })
      await traceGitStep(runtime, 'merge.conflict', async () => null, {
        conflictPaths: conflictPathCount,
        journalStructurePaths: mergeStats.journalStructurePaths,
        markdownPaths: mergeStats.markdownPaths,
        sideChoicePaths: mergeStats.sideChoicePaths,
        strategy: 'journal-domain-merge',
      })

      const conflictPreviews = getMergeConflictPreviews(error)
      const worktreeConflictPreviews = conflictPreviews.length > 0
        ? []
        : await collectWorktreeConflictPreviews(runtime, conflictPaths)
      const mergeSideConflictPreviews = await collectMergeSideConflictPreviews(runtime, branch, remote, conflictPaths)
      const previewCandidates = conflictPreviews.length > 0
        ? mergeSideConflictPreviews.length > 0
          ? replaceMetadataConflictPreviews(conflictPreviews, mergeSideConflictPreviews)
          : conflictPreviews
        : worktreeConflictPreviews.length > 0
          ? mergeSideConflictPreviews.length > 0
            ? replaceMetadataConflictPreviews(worktreeConflictPreviews, mergeSideConflictPreviews)
            : worktreeConflictPreviews
          : mergeSideConflictPreviews

      throw createContentConflictBlockedError({
        conflictPreviews: previewCandidates,
        paths: conflictPaths,
      }, error)
    }

    throw error
  }
}

async function runJournalDomainMerge(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  mergeStats: ReturnType<typeof createJournalMergeStats>,
  traceName: string,
) {
  const branch = getBranchName(config.branch ?? defaultBranch)
  const remote = config.remote ?? defaultRemote
  const mergeDetails = await traceMergeInputs(runtime, traceName, branch, remote)

  const domainResult = await traceGitStep(
    runtime,
    traceName,
    () => runJournalDomainMergeOperation(runtime, config, mergeStats, {
      attachHeadToLocalBranchIfSameCommit,
      getLocalBranchCommitOid,
      getRemoteTrackingBranchCommitOid,
    }),
    (result) => ({
      ...mergeDetails,
      baseOid: shortTraceOid(result.baseOid),
      branch,
      changedPaths: result.changedPaths,
      conflictPaths: mergeStats.conflictPaths,
      journalStructurePaths: mergeStats.journalStructurePaths,
      localOid: shortTraceOid(result.localOid),
      markdownPaths: mergeStats.markdownPaths,
      missingContentPaths: mergeStats.missingContentPaths,
      nonJournalRemoteWins: result.nonJournalRemoteWins,
      reason: result.reason,
      remote,
      remoteOid: shortTraceOid(result.remoteOid),
      result: getMergeResultKind(result.mergeResult),
      sideChoicePaths: mergeStats.sideChoicePaths,
    }),
    mergeDetails,
  )

  return domainResult.mergeResult
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
      {
        preferRetryWithoutRefetch: fetchDecision.restoredTrackingObjectFromPack,
      },
    )

    clearMissingObjectRefetchAttempt(runtime, fetchDecision.repairCooldownKey)

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
  clearMissingObjectRefetchAttempt(runtime, fetchDecision.repairCooldownKey)

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
    await updateRemoteTrackingRefToLocalBranch(runtime, input.remote, input.branch)

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

  await updateRemoteTrackingRefToLocalBranch(runtime, input.remote, input.branch)

  return {
    pushResult: secondPushResult,
    retryMergeCommitOid: retryMergeResult.mergeCommitOid,
    retriedPush: true,
  }
}

async function createKeepLocalConflictResolutionCommit(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  remote: string,
  branch: string,
) {
  const localOid = await requireLocalBranchCommitOid(runtime, branch)
  const remoteTrackingOid = await requireRemoteTrackingBranchCommitOid(runtime, remote, branch)

  if (localOid === remoteTrackingOid) {
    return localOid
  }

  const localCommit = await readCommit(runtime, localOid)
  const identity = createResolutionCommitIdentity(config)
  const commitOid = await traceGitStep(runtime, 'resolveConflict.keepLocalCommit', () => getGit(runtime).writeCommit({
    dir: runtime.dir,
    fs: runtime.fs,
    commit: {
      author: identity,
      committer: identity,
      message: `Resolve journal sync conflict by keeping local changes\n`,
      parent: [localOid, remoteTrackingOid],
      tree: localCommit.commit.tree,
    },
  }), {
    branch,
    localOid: shortTraceOid(localOid),
    remote,
    remoteOid: shortTraceOid(remoteTrackingOid),
  })

  await traceGitStep(runtime, 'resolveConflict.keepLocalRef', () => getGit(runtime).writeRef({
    dir: runtime.dir,
    force: true,
    fs: runtime.fs,
    ref: getLocalBranchRef(branch),
    value: commitOid,
  }), {
    branch,
    commitOid: shortTraceOid(commitOid),
  })
  await traceGitStep(runtime, 'resolveConflict.alignHead', () => attachHeadToLocalBranchIfSameCommit(runtime, branch), { branch })

  return commitOid
}

async function createKeepBothConflictResolutionCommit(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  remote: string,
  branch: string,
) {
  const localOid = await requireLocalBranchCommitOid(runtime, branch)
  const remoteTrackingOid = await requireRemoteTrackingBranchCommitOid(runtime, remote, branch)

  if (localOid === remoteTrackingOid) {
    return localOid
  }

  const baseOid = await getSingleMergeBaseOid(runtime, localOid, remoteTrackingOid)
  const [baseEntries, localEntries, remoteEntries] = await Promise.all([
    getResolutionTreeLeafEntries(runtime, baseOid),
    getResolutionTreeLeafEntries(runtime, localOid),
    getResolutionTreeLeafEntries(runtime, remoteTrackingOid),
  ])
  const mergedEntries = new Map(localEntries)
  const changedPaths = new Set([
    ...baseEntries.keys(),
    ...localEntries.keys(),
    ...remoteEntries.keys(),
  ])
  let keptBothPaths = 0
  let appliedRemotePaths = 0

  for (const filepath of [...changedPaths].sort()) {
    const baseEntry = baseEntries.get(filepath) ?? null
    const localEntry = localEntries.get(filepath) ?? null
    const remoteEntry = remoteEntries.get(filepath) ?? null
    const localChanged = !areResolutionTreeEntriesEqual(localEntry, baseEntry)
    const remoteChanged = !areResolutionTreeEntriesEqual(remoteEntry, baseEntry)

    if (!remoteChanged) {
      continue
    }

    if (!localChanged || areResolutionTreeEntriesEqual(localEntry, remoteEntry)) {
      applyResolutionTreeEntry(mergedEntries, filepath, remoteEntry)
      appliedRemotePaths += 1
      continue
    }

    if (!isTrackedJournalPath(filepath)) {
      applyResolutionTreeEntry(mergedEntries, filepath, remoteEntry)
      appliedRemotePaths += 1
      continue
    }

    if (!isTextMergeJournalPath(filepath) || !localEntry || !remoteEntry || localEntry.type !== 'blob' || remoteEntry.type !== 'blob') {
      throw new Error(`Cannot keep both sides automatically for non-text sync conflict: ${filepath}`)
    }

    const combinedEntry = await createKeepBothResolutionEntry(
      runtime,
      filepath,
      baseEntry,
      localEntry,
      remoteEntry,
    )

    applyResolutionTreeEntry(mergedEntries, filepath, combinedEntry)
    keptBothPaths += 1
  }

  const treeOid = await writeResolutionTree(runtime, mergedEntries)
  const identity = createResolutionCommitIdentity(config)
  const commitOid = await traceGitStep(runtime, 'resolveConflict.keepBothCommit', () => getGit(runtime).writeCommit({
    dir: runtime.dir,
    fs: runtime.fs,
    commit: {
      author: identity,
      committer: identity,
      message: `Resolve journal sync conflict by keeping both sides\n`,
      parent: [localOid, remoteTrackingOid],
      tree: treeOid,
    },
  }), {
    appliedRemotePaths,
    branch,
    keptBothPaths,
    localOid: shortTraceOid(localOid),
    remote,
    remoteOid: shortTraceOid(remoteTrackingOid),
  })

  await traceGitStep(runtime, 'resolveConflict.keepBothRef', () => getGit(runtime).writeRef({
    dir: runtime.dir,
    force: true,
    fs: runtime.fs,
    ref: getLocalBranchRef(branch),
    value: commitOid,
  }), {
    branch,
    commitOid: shortTraceOid(commitOid),
  })
  await traceGitStep(runtime, 'resolveConflict.alignHead', () => attachHeadToLocalBranchIfSameCommit(runtime, branch), { branch })
  await checkoutLocalBranch(runtime, branch, trackedStatusFilepaths)

  return commitOid
}

async function getSingleMergeBaseOid(
  runtime: JournalGitRuntime,
  localOid: string,
  remoteOid: string,
) {
  const baseOids = await traceGitStep(
    runtime,
    'resolveConflict.keepBothMergeBase',
    () => getGit(runtime).findMergeBase({
      cache: runtime.cache,
      dir: runtime.dir,
      fs: runtime.fs,
      oids: [localOid, remoteOid],
    }),
    (oids) => ({
      bases: oids.length,
      localOid: shortTraceOid(localOid),
      remoteOid: shortTraceOid(remoteOid),
    }),
  )
  const baseOid = baseOids[0]

  if (!baseOid) {
    throw new Error('Cannot keep both sides because local and remote histories have no common base.')
  }

  if (baseOids.length > 1) {
    throw new Error(`Cannot keep both sides because local and remote histories have multiple merge bases: ${baseOids.length}.`)
  }

  return baseOid
}

async function getResolutionTreeLeafEntries(runtime: JournalGitRuntime, ref: string) {
  const git = getGit(runtime)
  const rawEntries = await git.walk({
    cache: runtime.cache,
    dir: runtime.dir,
    fs: runtime.fs,
    map: async (filepath, [entry]) => {
      if (filepath === '.' || !entry) {
        return undefined
      }

      const [rawType, rawMode, oid] = await Promise.all([
        entry.type(),
        entry.mode(),
        entry.oid(),
      ])
      const type = normalizeResolutionTreeLeafType(rawType, rawMode)

      if (type === 'tree') {
        return undefined
      }

      if (!type || !oid) {
        throw new Error(`Cannot read tree entry metadata for ${filepath}.`)
      }

      return {
        filepath: normalizeRepositoryPath(filepath),
        mode: normalizeResolutionTreeMode(type, rawMode),
        oid,
        type,
      } satisfies ResolutionTreeLeafEntry
    },
    reduce: async (parent, children) => {
      const entries: ResolutionTreeLeafEntry[] = []

      if (isResolutionTreeLeafEntry(parent)) {
        entries.push(parent)
      }

      for (const child of children) {
        if (isResolutionTreeLeafEntry(child)) {
          entries.push(child)
        } else if (Array.isArray(child)) {
          entries.push(...child.filter(isResolutionTreeLeafEntry))
        }
      }

      return entries
    },
    trees: [
      git.TREE({ ref }),
    ],
  })
  const entries = Array.isArray(rawEntries)
    ? rawEntries.filter(isResolutionTreeLeafEntry)
    : []

  return new Map(entries.map((entry) => [entry.filepath, entry]))
}

async function createKeepBothResolutionEntry(
  runtime: JournalGitRuntime,
  filepath: string,
  baseEntry: ResolutionTreeLeafEntry | null,
  localEntry: ResolutionTreeLeafEntry,
  remoteEntry: ResolutionTreeLeafEntry,
): Promise<ResolutionTreeLeafEntry> {
  const [baseText, localText, remoteText] = await Promise.all([
    baseEntry?.type === 'blob' ? readResolutionBlobText(runtime, baseEntry.oid) : '',
    readResolutionBlobText(runtime, localEntry.oid),
    readResolutionBlobText(runtime, remoteEntry.oid),
  ])
  const mergedText = mergeKeepBothText(filepath, baseText, localText, remoteText)
  const oid = await getGit(runtime).writeBlob({
    dir: runtime.dir,
    fs: runtime.fs,
    blob: toUtf8Bytes(mergedText),
  })

  return {
    filepath,
    mode: baseEntry?.mode === localEntry.mode ? remoteEntry.mode : localEntry.mode,
    oid,
    type: 'blob',
  }
}

function mergeKeepBothText(
  filepath: string,
  baseText: string,
  localText: string,
  remoteText: string,
) {
  const result = mergeJournalFileContents({
    base: baseText,
    defaultSide: 'theirs',
    ours: stripConflictMarkers(localText),
    oursName: '本机',
    path: filepath,
    stats: createJournalMergeStats(),
    theirs: stripConflictMarkers(remoteText),
    theirsName: '远端',
  })

  return ensureTrailingNewline(stripConflictMarkers(result.mergedText).trimEnd())
}

function stripConflictMarkers(content: string) {
  return content.replace(
    /^<<<<<<<[^\r\n]*(?:\r?\n)([\s\S]*?)^=======(?:\r?\n)([\s\S]*?)^>>>>>>>[^\r\n]*(?:\r?\n|$)/gm,
    (_match, ours: string, theirs: string) => `${ours.trimEnd()}\n\n${theirs.trim()}\n`,
  )
}

function ensureTrailingNewline(content: string) {
  return content.endsWith('\n') ? content : `${content}\n`
}

async function readResolutionBlobText(runtime: JournalGitRuntime, oid: string) {
  const { blob } = await getGit(runtime).readBlob({
    cache: runtime.cache,
    dir: runtime.dir,
    fs: runtime.fs,
    oid,
  })

  return toUtf8String(blob)
}

async function writeResolutionTree(
  runtime: JournalGitRuntime,
  entries: Map<string, ResolutionTreeLeafEntry>,
) {
  const root: ResolutionTreeNode = {
    children: new Map(),
    type: 'tree',
  }

  for (const entry of entries.values()) {
    insertResolutionTreeEntry(root, entry)
  }

  return writeResolutionTreeNode(runtime, root)
}

function insertResolutionTreeEntry(root: ResolutionTreeNode, entry: ResolutionTreeLeafEntry) {
  const parts = normalizeRepositoryPath(entry.filepath).split('/')
  let current = root

  for (const directoryName of parts.slice(0, -1)) {
    const existing = current.children.get(directoryName)

    if (existing && existing.type !== 'tree') {
      throw new Error(`Cannot create tree for ${entry.filepath}.`)
    }

    if (!existing) {
      const nextNode: ResolutionTreeNode = {
        children: new Map(),
        type: 'tree',
      }

      current.children.set(directoryName, nextNode)
      current = nextNode
    } else {
      current = existing
    }
  }

  current.children.set(parts[parts.length - 1]!, entry)
}

async function writeResolutionTreeNode(
  runtime: JournalGitRuntime,
  node: ResolutionTreeNode,
): Promise<string> {
  const treeEntries: TreeEntry[] = []

  for (const [path, child] of [...node.children.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (child.type === 'tree') {
      treeEntries.push({
        mode: '040000',
        oid: await writeResolutionTreeNode(runtime, child),
        path,
        type: 'tree',
      })
    } else {
      treeEntries.push({
        mode: child.mode,
        oid: child.oid,
        path,
        type: child.type,
      })
    }
  }

  return getGit(runtime).writeTree({
    dir: runtime.dir,
    fs: runtime.fs,
    tree: treeEntries,
  })
}

function applyResolutionTreeEntry(
  entries: Map<string, ResolutionTreeLeafEntry>,
  filepath: string,
  entry: ResolutionTreeLeafEntry | null,
) {
  if (!entry) {
    entries.delete(filepath)
    return
  }

  entries.set(filepath, entry)
}

function areResolutionTreeEntriesEqual(
  left: ResolutionTreeLeafEntry | null,
  right: ResolutionTreeLeafEntry | null,
) {
  if (!left || !right) {
    return left === right
  }

  return left.mode === right.mode && left.oid === right.oid && left.type === right.type
}

function isResolutionTreeLeafEntry(value: unknown): value is ResolutionTreeLeafEntry {
  return isRecord(value) &&
    typeof value.filepath === 'string' &&
    typeof value.mode === 'string' &&
    typeof value.oid === 'string' &&
    (value.type === 'blob' || value.type === 'commit')
}

function normalizeResolutionTreeLeafType(type: unknown, mode: unknown) {
  if (type === 'blob' || type === 'commit' || type === 'tree') {
    return type
  }

  if (typeof mode === 'string') {
    if (/^0?4/.test(mode)) {
      return 'tree'
    }

    if (/^160/.test(mode)) {
      return 'commit'
    }

    if (/^(100|120)/.test(mode)) {
      return 'blob'
    }
  }

  if (typeof mode === 'number') {
    return normalizeResolutionTreeLeafType(type, mode.toString(8))
  }

  return null
}

function normalizeResolutionTreeMode(type: 'blob' | 'commit', mode: unknown) {
  if (typeof mode === 'string' && mode) {
    return mode
  }

  if (typeof mode === 'number') {
    return mode.toString(8)
  }

  return type === 'commit' ? '160000' : '100644'
}

function createResolutionCommitIdentity(config: JournalGitSyncConfig) {
  return {
    email: config.authorEmail ?? defaultAuthorEmail,
    name: config.authorName ?? defaultAuthorName,
    timestamp: Math.floor(Date.now() / 1000),
    timezoneOffset: new Date().getTimezoneOffset(),
  }
}

async function requireLocalBranchCommitOid(runtime: JournalGitRuntime, branch: string) {
  const oid = await getLocalBranchCommitOid(runtime, branch)

  if (!oid) {
    throw new Error(`Cannot resolve sync conflict because local branch ${getBranchName(branch)} has no commit.`)
  }

  return oid
}

async function requireRemoteTrackingBranchCommitOid(
  runtime: JournalGitRuntime,
  remote: string,
  branch: string,
) {
  const oid = await getRemoteTrackingBranchCommitOid(runtime, remote, branch)

  if (!oid) {
    throw new Error(`Cannot resolve sync conflict because ${getRemoteTrackingBranchRef(remote, branch)} is missing.`)
  }

  return oid
}

async function updateRemoteTrackingBranchRef(
  runtime: JournalGitRuntime,
  remote: string,
  branch: string,
  oid: string | null,
) {
  if (!oid) {
    return
  }

  await traceGitStep(runtime, 'remote.updateTrackingRef', () => getGit(runtime).writeRef({
    dir: runtime.dir,
    force: true,
    fs: runtime.fs,
    ref: getRemoteTrackingBranchRef(remote, branch),
    value: oid,
  }), {
    branch: getBranchName(branch),
    remote,
    remoteOid: shortTraceOid(oid),
  })
}

async function updateRemoteTrackingRefToLocalBranch(
  runtime: JournalGitRuntime,
  remote: string,
  branch: string,
) {
  const localOid = await getLocalBranchCommitOid(runtime, branch)

  await updateRemoteTrackingBranchRef(runtime, remote, branch, localOid)
}

async function mergeRemoteBranchAndCommitChanges(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  credentials: JournalGitCredentials,
  repairHints: RemoteMergeRepairHints = {},
) {
  const branch = getBranchName(config.branch ?? defaultBranch)
  const beforeMergeOid = await getLocalBranchCommitOid(runtime, branch)
  const mergeResult = await mergeRemoteBranch(runtime, config, credentials, repairHints)

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
      ? await getChangedCheckoutPathsBetweenRefs(runtime, beforeMergeOid, afterMergeOid, 'checkout.fastForwardDiff')
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
    ? await getChangedCheckoutPathsBetweenRefs(runtime, beforeMergeOid, afterMergeOid, 'checkout.mergeDiff')
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

function getMergeConflictPaths(error: unknown) {
  if (!isRecord(error) || !isRecord(error.data)) {
    return []
  }

  const filepaths = error.data.filepaths

  return Array.isArray(filepaths)
    ? filepaths.filter((filepath): filepath is string => typeof filepath === 'string' && filepath.trim().length > 0)
    : []
}

function getMergeConflictPreviews(error: unknown): SyncBlockConflictPreview[] {
  if (!isRecord(error) || !isRecord(error.data) || !Array.isArray(error.data.conflicts)) {
    return []
  }

  return error.data.conflicts
    .filter(isMergeConflictPreview)
    .map((conflict) => ({
      ours: conflict.ours,
      path: conflict.path,
      theirs: conflict.theirs,
    }))
}

function isMergeConflictPreview(value: unknown): value is SyncBlockConflictPreview {
  return isRecord(value) &&
    typeof value.ours === 'string' &&
    typeof value.path === 'string' &&
    typeof value.theirs === 'string' &&
    value.path.trim().length > 0 &&
    (value.ours.trim().length > 0 || value.theirs.trim().length > 0)
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
      http: createAuthenticatedRuntimeHttpClient(runtime, input.credentials),
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
  const knownChangedPaths = normalizeKnownChangedPaths(options.changedPaths)

  if (options.collectDirtyPathsAfterSync === false) {
    return traceGitStep(runtime, traceName, async () => [], {
      knownPaths: knownChangedPaths?.length ?? null,
      skipped: true,
    })
  }

  if (knownChangedPaths) {
    return traceGitStep(runtime, traceName, async () => [], {
      knownPaths: knownChangedPaths.length,
      reason: 'known-changed-paths',
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

  if (options.skipDirtyCheckBeforeMerge) {
    return traceGitStep(runtime, 'pull.postFetchDirtyStatus', async () => [], {
      reason: 'assume-clean-worktree',
      skipped: true,
    })
  }

  return getDirtyTrackedPaths(runtime, 'pull.postFetchDirtyStatus')
}

async function getChangedCheckoutPathsBetweenRefs(
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
          return isSafeRepositoryPath(filepath) ? undefined : null
        }

        const normalizedPath = normalizeRepositoryPath(filepath)

        if (!isSafeRepositoryPath(normalizedPath)) {
          return undefined
        }

        const [beforeOid, afterOid] = await Promise.all([
          beforeEntry?.oid(),
          afterEntry?.oid(),
        ])

        return beforeOid !== afterOid ? normalizedPath : undefined
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
      return typeof filepath === 'string' && isSafeRepositoryPath(filepath)
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

function isRecoverableInternalMergeError(error: unknown) {
  return isMissingGitObjectError(error)
}

function createMergeRecoveryError(error: unknown) {
  return createObjectStoreCorruptBlockedError({
    cause: error,
    message: `本地同步仓库对象库修复后仍不可读，同步已停止以避免写出不完整的合并结果。请稍后手动同步，或重新修复本地同步仓库。原始错误：${getErrorMessage(error)}`,
  })
}

function createUnrelatedHistoriesError(error: unknown) {
  return createJournalSyncBlockedError({
    message: `本地和远端日记历史没有共同祖先。同步已停止；请先选择保留本地内容、导入远端内容，或做一次性迁移修复。原始错误：${getErrorMessage(error)}`,
    reason: 'unrelated-histories',
  }, error)
}

function createFirstSyncNeedsChoiceError(localDirtyPaths: string[]) {
  const previewPaths = localDirtyPaths.slice(0, 3).join(', ')
  const suffix = localDirtyPaths.length > 3 ? ` 等 ${localDirtyPaths.length} 个路径` : previewPaths

  return createJournalSyncBlockedError({
    message: `首次同步前本地已有日记内容，而远端分支也已有历史。为避免创建没有共同祖先的 Git 历史，同步已停止；请先选择保留本地内容或先导入远端内容。受影响路径：${suffix}`,
    paths: localDirtyPaths,
    reason: 'first-sync-needs-choice',
  })
}

function createContentConflictBlockedError(input: {
  conflictPreviews?: readonly SyncBlockConflictPreview[]
  paths: readonly string[]
}, cause?: unknown) {
  return createJournalSyncBlockedError({
    ...(input.conflictPreviews && input.conflictPreviews.length > 0 ? { conflicts: [...input.conflictPreviews] } : {}),
    message: '本机和远端改到了同一段内容，同步已暂停。',
    paths: [...input.paths],
    reason: 'content-conflict',
  }, cause)
}

function createObjectStoreCorruptBlockedError(input: {
  cause?: unknown
  message: string
  retryAfterMs?: number
}) {
  return createJournalSyncBlockedError({
    message: input.message,
    reason: 'object-store-corrupt',
    ...(input.retryAfterMs ? { retryAfterMs: input.retryAfterMs } : {}),
  }, input.cause)
}

function isSafeShortRefFileName(branch: string) {
  return /^[A-Za-z0-9._-]+$/.test(branch)
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
      if (workdirStatus === 0 || !isTrackedJournalEntryPath(filepath)) {
        continue
      }

      checked += 1
      const content = await readFileIfExists(runtime, filepath, readFile)

      if (content === null) {
        continue
      }

      const text = toUtf8String(content)

      if (hasConflictMarkers(text)) {
        throw createContentConflictBlockedError({
          conflictPreviews: extractConflictPreviewsFromContent(filepath, text),
          paths: [filepath],
        })
      }
    }

    return checked
  }, (checked) => ({
    checked,
  }))
}

async function resolveConflictMarkersInWorktreeMarkdown(runtime: JournalGitRuntime) {
  const fs = (runtime.fs as unknown as PromiseGitFileSystem).promises
  const readFile = fs.readFile
  const writeFile = fs.writeFile

  if (!readFile || !writeFile) {
    return
  }

  const rows = await getTrackedStatusRows(runtime, 'resolveConflict.keepBothMarkerStatus')

  await traceGitStep(runtime, 'resolveConflict.keepBothMarkerRewrite', async () => {
    let rewritten = 0

    for (const [filepath] of rows) {
      if (!isTrackedJournalEntryPath(filepath)) {
        continue
      }

      const content = await readFileIfExists(runtime, filepath, readFile)

      if (content === null) {
        continue
      }

      const text = toUtf8String(content)

      if (!hasConflictMarkers(text)) {
        continue
      }

      await writeFile(
        joinRuntimePath(runtime.dir, filepath),
        stripConflictMarkers(text),
        { encoding: 'utf8' },
      )
      rewritten += 1
    }

    return rewritten
  }, (rewritten) => ({
    rewritten,
  }))
}

async function assertNoConflictMarkersInWorktreeMarkdown(runtime: JournalGitRuntime) {
  const readFile = (runtime.fs as unknown as PromiseGitFileSystem).promises.readFile

  if (!readFile) {
    return
  }

  const rows = await getTrackedStatusRows(runtime, 'resolveConflict.conflictMarkerStatus')

  await traceGitStep(runtime, 'resolveConflict.conflictMarkerCheck', async () => {
    let checked = 0

    for (const [filepath] of rows) {
      if (!isTrackedJournalEntryPath(filepath)) {
        continue
      }

      checked += 1
      const content = await readFileIfExists(runtime, filepath, readFile)

      if (content === null) {
        continue
      }

      const text = toUtf8String(content)

      if (hasConflictMarkers(text)) {
        throw createContentConflictBlockedError({
          conflictPreviews: extractConflictPreviewsFromContent(filepath, text),
          paths: [filepath],
        })
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

async function collectWorktreeConflictPreviews(
  runtime: JournalGitRuntime,
  paths: readonly string[],
): Promise<SyncBlockConflictPreview[]> {
  const readFile = (runtime.fs as unknown as PromiseGitFileSystem).promises.readFile

  if (!readFile || paths.length === 0) {
    return []
  }

  const previews: SyncBlockConflictPreview[] = []

  for (const filepath of paths) {
    const content = await readFileIfExists(runtime, filepath, readFile)

    if (content === null || content === undefined) {
      continue
    }

    previews.push(...extractConflictPreviewsFromContent(filepath, toUtf8String(content)))

    if (previews.length >= maxConflictPreviewCount) {
      break
    }
  }

  return previews.slice(0, maxConflictPreviewCount)
}

async function collectMergeSideConflictPreviews(
  runtime: JournalGitRuntime,
  branch: string,
  remote: string,
  paths: readonly string[],
): Promise<SyncBlockConflictPreview[]> {
  if (paths.length === 0) {
    return []
  }

  const [localOid, remoteOid] = await Promise.all([
    getLocalBranchCommitOid(runtime, branch),
    getRemoteTrackingBranchCommitOid(runtime, remote, branch),
  ])

  if (!localOid || !remoteOid) {
    return []
  }

  const previews: SyncBlockConflictPreview[] = []

  for (const filepath of paths) {
    if (!isTextMergeJournalPath(filepath)) {
      continue
    }

    const [ours, theirs] = await Promise.all([
      readCommitPathPreviewText(runtime, localOid, filepath),
      readCommitPathPreviewText(runtime, remoteOid, filepath),
    ])

    if (!ours && !theirs) {
      continue
    }

    previews.push({
      ours,
      path: filepath,
      theirs,
    })

    if (previews.length >= maxConflictPreviewCount) {
      break
    }
  }

  return previews
}

function replaceMetadataConflictPreviews(
  previews: readonly SyncBlockConflictPreview[],
  sidePreviews: readonly SyncBlockConflictPreview[],
): SyncBlockConflictPreview[] {
  if (previews.length === 0 || sidePreviews.length === 0) {
    return [...previews]
  }

  return previews.map((preview) => {
    const sidePreview = sidePreviews.find((candidate) => candidate.path === preview.path)

    if (!sidePreview || !shouldPreferSideConflictPreview(preview, sidePreview)) {
      return preview
    }

    return sidePreview
  })
}

function shouldPreferSideConflictPreview(
  preview: SyncBlockConflictPreview,
  sidePreview: SyncBlockConflictPreview,
) {
  if (!sidePreview.ours && !sidePreview.theirs) {
    return false
  }

  return isMetadataConflictPreviewText(preview.ours) ||
    isMetadataConflictPreviewText(preview.theirs)
}

async function readCommitPathPreviewText(
  runtime: JournalGitRuntime,
  oid: string,
  filepath: string,
) {
  try {
    const { blob } = await getGit(runtime).readBlob({
      cache: runtime.cache,
      dir: runtime.dir,
      filepath,
      fs: runtime.fs,
      oid,
    })

    return createConflictSidePreviewText(toUtf8String(blob))
  } catch {
    return ''
  }
}

function createConflictSidePreviewText(content: string) {
  const body = stripFrontMatterForConflictPreview(content)
  const previewSource = body.trim() ? body : content

  return trimConflictPreviewLines(previewSource.replace(/\r\n/g, '\n').split('\n'))
}

function stripFrontMatterForConflictPreview(content: string) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')

  if (lines[0]?.trim() !== '---') {
    return content
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')

  if (closingIndex === -1) {
    return content
  }

  return lines.slice(closingIndex + 1).join('\n').replace(/^\n/, '')
}

function isMetadataConflictPreviewText(text: string) {
  const firstContentLine = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && line !== '...')

  if (!firstContentLine) {
    return false
  }

  return firstContentLine === '---' ||
    /^(createdAt|date|feelsLike|humidity|location|temperature|text|updatedAt|weather|windSpeed):(?:\s|$)/.test(firstContentLine)
}

function extractConflictPreviewsFromContent(
  filepath: string,
  content: string,
): SyncBlockConflictPreview[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const previews: SyncBlockConflictPreview[] = []
  let index = 0

  while (index < lines.length && previews.length < maxConflictPreviewCount) {
    if (!lines[index]?.startsWith('<<<<<<<')) {
      index += 1
      continue
    }

    index += 1
    const ours: string[] = []

    while (index < lines.length && !lines[index]?.startsWith('=======')) {
      ours.push(lines[index] ?? '')
      index += 1
    }

    if (index >= lines.length) {
      break
    }

    index += 1
    const theirs: string[] = []

    while (index < lines.length && !lines[index]?.startsWith('>>>>>>>')) {
      theirs.push(lines[index] ?? '')
      index += 1
    }

    if (index >= lines.length) {
      break
    }

    index += 1
    const oursText = trimConflictPreviewLines(ours)
    const theirsText = trimConflictPreviewLines(theirs)

    if (oursText || theirsText) {
      previews.push({
        ours: oursText,
        path: filepath,
        theirs: theirsText,
      })
    }
  }

  return previews
}

function trimConflictPreviewLines(lines: string[]) {
  const selectedLines = lines.slice(0, maxConflictPreviewLines)
  let text = selectedLines.join('\n').trim()

  if (lines.length > maxConflictPreviewLines) {
    text = `${text}\n...`
  }

  if (text.length > maxConflictPreviewTextLength) {
    return `${text.slice(0, maxConflictPreviewTextLength).trimEnd()}...`
  }

  return text
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

function toUtf8Bytes(value: string) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value)
  }

  const encoded = encodeURIComponent(value)
  const bytes: number[] = []

  for (let index = 0; index < encoded.length; index += 1) {
    const character = encoded[index]

    if (character === '%') {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16))
      index += 2
    } else {
      bytes.push(character.charCodeAt(0))
    }
  }

  return new Uint8Array(bytes)
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

function isMissingGitObjectError(error: unknown) {
  const message = getErrorMessage(error)

  return (
    getErrorCode(error) === 'NotFoundError' &&
    /could not find [0-9a-f]{40}/i.test(message)
  )
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
