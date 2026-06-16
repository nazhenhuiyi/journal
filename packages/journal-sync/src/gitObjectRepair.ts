import type { ReadCommitResult } from 'isomorphic-git'
import * as defaultGit from 'isomorphic-git'
import type { JournalGitRuntime } from './gitCore'

export type MissingPackIndexRepairResult = {
  failedPacks: number
  indexedPacks: number
  orphanPacks: number
  restored: boolean
  unavailableReason: string | null
}

type PromiseGitFileSystem = {
  promises: {
    readdir?: (path: string) => Promise<string[]>
  }
}

export async function isCommitReadable(runtime: JournalGitRuntime, oid: string) {
  try {
    await readCommit(runtime, oid)
    return true
  } catch (error) {
    if (isMissingGitObjectError(error)) {
      return false
    }

    throw error
  }
}

export async function rebuildMissingPackIndexesForCommit(
  runtime: JournalGitRuntime,
  oid: string,
): Promise<MissingPackIndexRepairResult> {
  const git = getGit(runtime)

  if (typeof git.indexPack !== 'function') {
    return createMissingPackIndexRepairResult({
      unavailableReason: 'missing-index-pack-api',
    })
  }

  const orphanPackFiles = await listPackFilesMissingIndexes(runtime)

  if (orphanPackFiles.unavailableReason) {
    return createMissingPackIndexRepairResult({
      unavailableReason: orphanPackFiles.unavailableReason,
    })
  }

  let failedPacks = 0
  let indexedPacks = 0

  for (const packFile of orphanPackFiles.files) {
    try {
      const result = await git.indexPack({
        cache: runtime.cache,
        dir: runtime.dir,
        filepath: `.git/objects/pack/${packFile}`,
        fs: runtime.fs,
      })

      indexedPacks += 1

      if (result.oids.includes(oid) && await isCommitReadableAfterPackRepair(runtime, oid)) {
        return {
          failedPacks,
          indexedPacks,
          orphanPacks: orphanPackFiles.files.length,
          restored: true,
          unavailableReason: null,
        }
      }
    } catch {
      failedPacks += 1
    }
  }

  return {
    failedPacks,
    indexedPacks,
    orphanPacks: orphanPackFiles.files.length,
    restored: indexedPacks > 0 && await isCommitReadableAfterPackRepair(runtime, oid),
    unavailableReason: null,
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

async function isCommitReadableAfterPackRepair(runtime: JournalGitRuntime, oid: string) {
  try {
    return await isCommitReadable(runtime, oid)
  } catch {
    return false
  }
}

async function listPackFilesMissingIndexes(runtime: JournalGitRuntime) {
  const fs = runtime.fs as unknown as PromiseGitFileSystem
  const readdir = fs.promises.readdir

  if (!readdir) {
    return {
      files: [],
      unavailableReason: 'missing-readdir',
    }
  }

  let entries: string[]

  try {
    entries = await readdir(joinRuntimePath(runtime.dir, '.git/objects/pack'))
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return {
        files: [],
        unavailableReason: null,
      }
    }

    return {
      files: [],
      unavailableReason: 'pack-directory-read-failed',
    }
  }

  const indexBasenames = new Set(
    entries
      .filter((entry) => entry.endsWith('.idx'))
      .map((entry) => entry.slice(0, -'.idx'.length)),
  )
  const files = entries
    .filter((entry) => entry.endsWith('.pack'))
    .filter((entry) => !indexBasenames.has(entry.slice(0, -'.pack'.length)))
    .sort()

  return {
    files,
    unavailableReason: null,
  }
}

function createMissingPackIndexRepairResult(
  partial: Partial<MissingPackIndexRepairResult> = {},
): MissingPackIndexRepairResult {
  return {
    failedPacks: 0,
    indexedPacks: 0,
    orphanPacks: 0,
    restored: false,
    unavailableReason: null,
    ...partial,
  }
}

function isMissingGitObjectError(error: unknown) {
  const message = getErrorMessage(error)

  return (
    getErrorCode(error) === 'NotFoundError' &&
    /could not find [0-9a-f]{40}/i.test(message)
  )
}

function isFileNotFoundError(error: unknown) {
  const code = getErrorCode(error)

  return code === 'ENOENT' || code === 'NotFoundError'
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

  return 'Git object repair failed.'
}

function getGit(runtime: JournalGitRuntime) {
  return runtime.git ?? defaultGit
}

function joinRuntimePath(parent: string, child: string) {
  return `${parent.replace(/\/$/, '')}/${child.replace(/^\//, '')}`
}
