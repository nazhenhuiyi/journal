import type {
  CommitObject,
  MergeResult,
  TreeEntry,
} from 'isomorphic-git'
import * as defaultGit from 'isomorphic-git'
import {
  mergeJournalFileContents,
  type JournalMergeStats,
} from './smartMerge'
import {
  getBranchName,
  getLocalBranchRef,
  getRemoteTrackingBranchRef,
} from './gitRefs'
import {
  isTextMergeJournalPath,
  isTrackedJournalPath,
  normalizeRepositoryPath,
} from './trackedPaths'
import {
  createJournalSyncBlockedError,
} from './syncBlock'
import type {
  JournalGitRuntime,
  JournalGitSyncConfig,
} from './gitCore'

export type JournalDomainMergeOperationResult = {
  baseOid: string | null
  changedPaths: number
  localOid: string | null
  mergeResult: MergeResult | null
  nonJournalRemoteWins: number
  reason: string
  remoteOid: string | null
}

export type JournalDomainMergeDependencies = {
  attachHeadToLocalBranchIfSameCommit: (runtime: JournalGitRuntime, branch: string) => Promise<boolean>
  getLocalBranchCommitOid: (runtime: JournalGitRuntime, branch: string) => Promise<string | null>
  getRemoteTrackingBranchCommitOid: (
    runtime: JournalGitRuntime,
    remote: string,
    branch: string
  ) => Promise<string | null>
}

type ManualMergeLeafEntry = {
  filepath: string
  mode: string
  oid: string
  type: 'blob' | 'commit'
}

type ManualTreeNode = {
  children: Map<string, ManualTreeNode | ManualMergeLeafEntry>
  type: 'tree'
}

const defaultAuthorEmail = 'journal-sync@example.invalid'
const defaultAuthorName = 'Journal Sync'
const defaultBranch = 'main'
const defaultRemote = 'origin'

export async function runJournalDomainMergeOperation(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  mergeStats: JournalMergeStats,
  deps: JournalDomainMergeDependencies,
): Promise<JournalDomainMergeOperationResult> {
  const git = getGit(runtime)

  assertJournalDomainMergeApisAvailable(git)

  const branch = getBranchName(config.branch ?? defaultBranch)
  const remote = config.remote ?? defaultRemote
  const localRef = getLocalBranchRef(branch)
  const remoteTrackingRef = getRemoteTrackingBranchRef(remote, branch)
  const [localOid, remoteOid] = await Promise.all([
    deps.getLocalBranchCommitOid(runtime, branch),
    deps.getRemoteTrackingBranchCommitOid(runtime, remote, branch),
  ])

  if (!localOid || !remoteOid) {
    return {
      baseOid: null,
      changedPaths: 0,
      localOid,
      mergeResult: null,
      nonJournalRemoteWins: 0,
      reason: 'missing-ref',
      remoteOid,
    }
  }

  const baseOids = await git.findMergeBase({
    cache: runtime.cache,
    dir: runtime.dir,
    fs: runtime.fs,
    oids: [localOid, remoteOid],
  })
  const baseOid = baseOids[0] ?? null

  if (baseOids.length === 0 || !baseOid) {
    throw createUnrelatedHistoriesError(new Error('No common merge base.'))
  }

  if (baseOids.length > 1) {
    throw new Error(`Journal domain merge found multiple merge bases: ${baseOids.length}.`)
  }

  if (baseOid === remoteOid) {
    return {
      baseOid,
      changedPaths: 0,
      localOid,
      mergeResult: {
        alreadyMerged: true,
        oid: localOid,
      },
      nonJournalRemoteWins: 0,
      reason: 'already-merged',
      remoteOid,
    }
  }

  if (baseOid === localOid) {
    await git.writeRef({
      dir: runtime.dir,
      force: true,
      fs: runtime.fs,
      ref: localRef,
      value: remoteOid,
    })
    await deps.attachHeadToLocalBranchIfSameCommit(runtime, branch)

    return {
      baseOid,
      changedPaths: 0,
      localOid,
      mergeResult: {
        fastForward: true,
        oid: remoteOid,
      },
      nonJournalRemoteWins: 0,
      reason: 'fast-forward',
      remoteOid,
    }
  }

  const manualMerge = await createManualRemoteMergeCommit(runtime, config, {
    attachHeadToLocalBranchIfSameCommit: deps.attachHeadToLocalBranchIfSameCommit,
    baseOid,
    localOid,
    localRef,
    mergeStats,
    remoteOid,
    remoteTrackingRef,
  })

  return {
    baseOid,
    changedPaths: manualMerge.changedPaths,
    localOid,
    mergeResult: manualMerge.mergeResult,
    nonJournalRemoteWins: manualMerge.nonJournalRemoteWins,
    reason: 'merge-commit',
    remoteOid,
  }
}

function assertJournalDomainMergeApisAvailable(git: typeof defaultGit) {
  const missingApis = [
    typeof git.findMergeBase === 'function' ? null : 'findMergeBase',
    typeof git.readBlob === 'function' ? null : 'readBlob',
    typeof git.walk === 'function' ? null : 'walk',
    typeof git.writeBlob === 'function' ? null : 'writeBlob',
    typeof git.writeCommit === 'function' ? null : 'writeCommit',
    typeof git.writeTree === 'function' ? null : 'writeTree',
    typeof git.writeRef === 'function' ? null : 'writeRef',
  ].filter((api): api is string => api !== null)

  if (missingApis.length > 0) {
    throw new Error(`Journal domain merge requires isomorphic-git APIs: ${missingApis.join(', ')}`)
  }
}

async function createManualRemoteMergeCommit(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  input: {
    attachHeadToLocalBranchIfSameCommit: (runtime: JournalGitRuntime, branch: string) => Promise<boolean>
    baseOid: string
    localOid: string
    localRef: string
    mergeStats: JournalMergeStats
    remoteOid: string
    remoteTrackingRef: string
  },
) {
  const [baseEntries, localEntries, remoteEntries] = await Promise.all([
    getManualMergeLeafEntries(runtime, input.baseOid),
    getManualMergeLeafEntries(runtime, input.localOid),
    getManualMergeLeafEntries(runtime, input.remoteOid),
  ])
  const mergedEntries = new Map(localEntries)
  const changedPaths = new Set([
    ...baseEntries.keys(),
    ...localEntries.keys(),
    ...remoteEntries.keys(),
  ])
  const conflictPaths: string[] = []
  let appliedChanges = 0
  let nonJournalRemoteWins = 0

  for (const filepath of [...changedPaths].sort()) {
    const baseEntry = baseEntries.get(filepath) ?? null
    const localEntry = localEntries.get(filepath) ?? null
    const remoteEntry = remoteEntries.get(filepath) ?? null
    const localChanged = !areManualMergeEntriesEqual(localEntry, baseEntry)
    const remoteChanged = !areManualMergeEntriesEqual(remoteEntry, baseEntry)

    if (!isTrackedJournalPath(filepath)) {
      if (!areManualMergeEntriesEqual(localEntry, remoteEntry)) {
        applyManualMergeEntry(mergedEntries, filepath, remoteEntry)
        appliedChanges += 1
        nonJournalRemoteWins += 1
      }

      continue
    }

    if (!remoteChanged) {
      continue
    }

    if (!localChanged || areManualMergeEntriesEqual(localEntry, remoteEntry)) {
      applyManualMergeEntry(mergedEntries, filepath, remoteEntry)
      appliedChanges += 1
      continue
    }

    if (!isTextMergeJournalPath(filepath)) {
      applyManualMergeEntry(mergedEntries, filepath, remoteEntry)
      appliedChanges += 1
      continue
    }

    const mergedEntry = await mergeManualBlobEntries(
      runtime,
      filepath,
      baseEntry,
      localEntry,
      remoteEntry,
      input.mergeStats,
    )

    if (!mergedEntry) {
      conflictPaths.push(filepath)
      continue
    }

    applyManualMergeEntry(mergedEntries, filepath, mergedEntry)
    appliedChanges += 1
  }

  if (conflictPaths.length > 0) {
    throw createManualMergeConflictError(conflictPaths)
  }

  const treeOid = await writeManualTree(runtime, mergedEntries)
  const commitOid = await writeManualMergeCommit(runtime, config, {
    attachHeadToLocalBranchIfSameCommit: input.attachHeadToLocalBranchIfSameCommit,
    localOid: input.localOid,
    localRef: input.localRef,
    remoteOid: input.remoteOid,
    remoteTrackingRef: input.remoteTrackingRef,
    treeOid,
  })

  return {
    changedPaths: appliedChanges,
    mergeResult: {
      mergeCommit: true,
      oid: commitOid,
      tree: treeOid,
    } satisfies MergeResult,
    nonJournalRemoteWins,
  }
}

async function getManualMergeLeafEntries(runtime: JournalGitRuntime, ref: string) {
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
      const type = normalizeManualMergeLeafType(rawType, rawMode)

      if (type === 'tree') {
        return undefined
      }

      if (!type || !oid) {
        throw new Error(`Manual git merge cannot read tree entry metadata for ${filepath}.`)
      }

      return {
        filepath: normalizeRepositoryPath(filepath),
        mode: normalizeManualMergeMode(type, rawMode),
        oid,
        type,
      } satisfies ManualMergeLeafEntry
    },
    reduce: async (parent, children) => {
      const entries: ManualMergeLeafEntry[] = []

      if (isManualMergeLeafEntry(parent)) {
        entries.push(parent)
      }

      for (const child of children) {
        if (isManualMergeLeafEntry(child)) {
          entries.push(child)
        } else if (Array.isArray(child)) {
          entries.push(...child.filter(isManualMergeLeafEntry))
        }
      }

      return entries
    },
    trees: [
      git.TREE({ ref }),
    ],
  })
  const entries = Array.isArray(rawEntries)
    ? rawEntries.filter(isManualMergeLeafEntry)
    : []

  return new Map(entries.map((entry) => [entry.filepath, entry]))
}

async function mergeManualBlobEntries(
  runtime: JournalGitRuntime,
  filepath: string,
  baseEntry: ManualMergeLeafEntry | null,
  localEntry: ManualMergeLeafEntry | null,
  remoteEntry: ManualMergeLeafEntry | null,
  mergeStats: JournalMergeStats,
): Promise<ManualMergeLeafEntry | null> {
  if (!localEntry || !remoteEntry || localEntry.type !== 'blob' || remoteEntry.type !== 'blob') {
    return null
  }

  const [baseContent, localContent, remoteContent] = await Promise.all([
    baseEntry?.type === 'blob' ? readManualBlobText(runtime, baseEntry.oid) : '',
    readManualBlobText(runtime, localEntry.oid),
    readManualBlobText(runtime, remoteEntry.oid),
  ])
  const result = mergeJournalFileContents({
    base: baseContent,
    defaultSide: 'theirs',
    ours: localContent,
    oursName: 'ours',
    path: filepath,
    stats: mergeStats,
    theirs: remoteContent,
    theirsName: 'theirs',
  })

  if (!result.cleanMerge) {
    return null
  }

  const oid = await getGit(runtime).writeBlob({
    dir: runtime.dir,
    fs: runtime.fs,
    blob: toUtf8Bytes(result.mergedText),
  })

  return {
    filepath,
    mode: baseEntry?.mode === localEntry.mode ? remoteEntry.mode : localEntry.mode,
    oid,
    type: 'blob',
  }
}

async function readManualBlobText(runtime: JournalGitRuntime, oid: string) {
  const { blob } = await getGit(runtime).readBlob({
    cache: runtime.cache,
    dir: runtime.dir,
    fs: runtime.fs,
    oid,
  })

  return toUtf8String(blob)
}

async function writeManualTree(runtime: JournalGitRuntime, entries: Map<string, ManualMergeLeafEntry>) {
  const root: ManualTreeNode = {
    children: new Map(),
    type: 'tree',
  }

  for (const entry of entries.values()) {
    insertManualTreeEntry(root, entry)
  }

  return writeManualTreeNode(runtime, root)
}

function insertManualTreeEntry(root: ManualTreeNode, entry: ManualMergeLeafEntry) {
  const parts = splitManualTreePath(entry.filepath)
  let current = root

  for (const directoryName of parts.slice(0, -1)) {
    const existing = current.children.get(directoryName)

    if (existing && existing.type !== 'tree') {
      throw new Error(`Manual git merge cannot create tree for ${entry.filepath}.`)
    }

    if (!existing) {
      const nextNode: ManualTreeNode = {
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

async function writeManualTreeNode(runtime: JournalGitRuntime, node: ManualTreeNode): Promise<string> {
  const treeEntries: TreeEntry[] = []

  for (const [path, child] of [...node.children.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (child.type === 'tree') {
      treeEntries.push({
        mode: '040000',
        oid: await writeManualTreeNode(runtime, child),
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

async function writeManualMergeCommit(
  runtime: JournalGitRuntime,
  config: JournalGitSyncConfig,
  input: {
    attachHeadToLocalBranchIfSameCommit: (runtime: JournalGitRuntime, branch: string) => Promise<boolean>
    localOid: string
    localRef: string
    remoteOid: string
    remoteTrackingRef: string
    treeOid: string
  },
) {
  const git = getGit(runtime)
  const branch = getBranchName(config.branch ?? defaultBranch)
  const identity = createManualMergeIdentity(config)
  const commit: CommitObject = {
    author: identity,
    committer: identity,
    message: `Merge branch '${input.remoteTrackingRef}' into ${input.localRef}`,
    parent: [input.localOid, input.remoteOid],
    tree: input.treeOid,
  }
  const commitOid = await git.writeCommit({
    dir: runtime.dir,
    fs: runtime.fs,
    commit,
  })

  await git.writeRef({
    dir: runtime.dir,
    force: true,
    fs: runtime.fs,
    ref: input.localRef,
    value: commitOid,
  })
  await input.attachHeadToLocalBranchIfSameCommit(runtime, branch)

  return commitOid
}

function createManualMergeIdentity(config: JournalGitSyncConfig) {
  return {
    email: config.authorEmail ?? defaultAuthorEmail,
    name: config.authorName ?? defaultAuthorName,
    timestamp: Math.floor(Date.now() / 1000),
    timezoneOffset: new Date().getTimezoneOffset(),
  }
}

function applyManualMergeEntry(
  entries: Map<string, ManualMergeLeafEntry>,
  filepath: string,
  entry: ManualMergeLeafEntry | null,
) {
  if (!entry) {
    entries.delete(filepath)
    return
  }

  entries.set(filepath, entry)
}

function areManualMergeEntriesEqual(
  left: ManualMergeLeafEntry | null,
  right: ManualMergeLeafEntry | null,
) {
  if (!left || !right) {
    return left === right
  }

  return left.mode === right.mode && left.oid === right.oid && left.type === right.type
}

function isManualMergeLeafEntry(value: unknown): value is ManualMergeLeafEntry {
  return isRecord(value) &&
    typeof value.filepath === 'string' &&
    typeof value.mode === 'string' &&
    typeof value.oid === 'string' &&
    (value.type === 'blob' || value.type === 'commit')
}

function normalizeManualMergeLeafType(type: unknown, mode: unknown) {
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
    return normalizeManualMergeLeafType(type, mode.toString(8))
  }

  return null
}

function normalizeManualMergeMode(type: 'blob' | 'commit', mode: unknown) {
  if (typeof mode === 'string' && mode) {
    return mode
  }

  if (typeof mode === 'number') {
    return mode.toString(8)
  }

  return type === 'commit' ? '160000' : '100644'
}

function splitManualTreePath(filepath: string) {
  const parts = normalizeRepositoryPath(filepath).split('/')

  if (
    parts.length === 0 ||
    parts.some((part) => part === '' || part === '.' || part === '..' || part === '.git')
  ) {
    throw new Error(`Manual git merge received an unsafe tree path: ${filepath}`)
  }

  return parts
}

function createManualMergeConflictError(filepaths: string[]) {
  return Object.assign(
    new Error(`Git merge conflict in ${filepaths.length} path(s): ${filepaths.slice(0, 3).join(', ')}`),
    {
      code: 'MergeConflictError',
      data: {
        filepaths,
      },
      name: 'MergeConflictError',
    },
  )
}

function createUnrelatedHistoriesError(error: unknown) {
  return createJournalSyncBlockedError({
    message: `本地和远端日记历史没有共同祖先。同步已停止；请先选择保留本地内容、导入远端内容，或做一次性迁移修复。原始错误：${getErrorMessage(error)}`,
    reason: 'unrelated-histories',
  }, error)
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

function toUtf8String(content: string | Uint8Array) {
  if (typeof content === 'string') {
    return content
  }

  return new TextDecoder().decode(content)
}

function getGit(runtime: JournalGitRuntime) {
  return runtime.git ?? defaultGit
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Git merge failed.'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
