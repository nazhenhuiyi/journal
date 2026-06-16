import type { FsClient, HttpClient, ServerRef } from 'isomorphic-git'
import * as git from 'isomorphic-git'
import fs from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  pullJournalUpdates,
  type JournalGitRuntime,
} from './gitCore'

const author = {
  email: 'sync-test@example.invalid',
  name: 'Sync Test',
}

const credentials = {
  token: 'token',
}

const textDecoder = new TextDecoder()

let tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map((tempRoot) => rm(tempRoot, {
    force: true,
    recursive: true,
  })))
  tempRoots = []
})

describe('journal git sync core integration', () => {
  it('rebuilds a missing pack index with real isomorphic-git pack objects before fetching', async () => {
    const dir = await createTempRepository()
    const entryPath = 'entries/2026/06/2026-06-16.md'

    await git.init({
      defaultBranch: 'main',
      dir,
      fs,
    })
    const remoteOid = await commitFiles(dir, 'Remote journal state', {
      [entryPath]: 'remote line\n',
    })
    await git.writeRef({
      dir,
      force: true,
      fs,
      ref: 'refs/remotes/origin/main',
      value: remoteOid,
    })
    const packFile = await moveLooseCommitToOrphanPack(dir, remoteOid)
    const traceEvents: string[] = []
    const runtime = createRuntime(dir, remoteOid, traceEvents)

    const result = await pullJournalUpdates(
      runtime,
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
      {
        collectDirtyPathsAfterSync: false,
      },
    )

    await expect(git.readCommit({
      dir,
      fs,
      oid: remoteOid,
    })).resolves.toMatchObject({
      oid: remoteOid,
    })
    expect(await fileExists(path.join(dir, '.git/objects/pack', packFile.replace(/\.pack$/, '.idx')))).toBe(true)
    expect(result.fetchResult).toBeNull()
    expect(traceEvents).toContain('remote.packIndexRepair')
    expect(traceEvents).toContain('remote.merge')
    expect(traceEvents).not.toContain('remote.fetch')
  })

  it('domain-merges real isomorphic-git commits while using remote-wins for non-journal and media paths', async () => {
    const dir = await createTempRepository()
    const entryPath = 'entries/2026/06/2026-06-16.md'
    const remoteEntryPath = 'entries/2026/06/2026-06-17.md'
    const readmePath = 'README.md'
    const mediaPath = 'media/2026/06/photo.jpg'

    await git.init({
      defaultBranch: 'main',
      dir,
      fs,
    })
    const baseOid = await commitFiles(dir, 'Base journal state', {
      [entryPath]: 'base line\n',
      [mediaPath]: new Uint8Array([1, 2, 3]),
      [readmePath]: 'base readme\n',
    })
    const remoteOid = await commitFiles(dir, 'Remote journal state', {
      [entryPath]: 'base line\n',
      [remoteEntryPath]: 'remote line\n',
      [mediaPath]: new Uint8Array([9, 8, 7]),
      [readmePath]: 'remote readme\n',
    })

    await git.writeRef({
      dir,
      force: true,
      fs,
      ref: 'refs/remotes/origin/main',
      value: remoteOid,
    })
    await git.writeRef({
      dir,
      force: true,
      fs,
      ref: 'refs/heads/main',
      value: baseOid,
    })
    await git.checkout({
      dir,
      force: true,
      fs,
      ref: 'refs/heads/main',
    })
    const localOid = await commitFiles(dir, 'Local journal state', {
      [entryPath]: 'base line\nlocal line\n',
      [mediaPath]: new Uint8Array([4, 5, 6]),
      [readmePath]: 'local readme\n',
    })
    const traceEvents: string[] = []
    const runtime = createRuntime(dir, remoteOid, traceEvents)

    const result = await pullJournalUpdates(
      runtime,
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
      {
        collectDirtyPathsAfterSync: false,
      },
    )
    const headOid = await git.resolveRef({
      dir,
      fs,
      ref: 'refs/heads/main',
    })
    const { commit } = await git.readCommit({
      dir,
      fs,
      oid: headOid,
    })
    const entryText = await readUtf8File(dir, entryPath)
    const remoteEntryText = await readUtf8File(dir, remoteEntryPath)
    const readmeText = await readUtf8File(dir, readmePath)
    const mediaBytes = await readFile(path.join(dir, mediaPath))

    expect(result.mergeCommitOid).toBe(headOid)
    expect(result.updatedWorktree).toBe(true)
    expect(commit.parent).toEqual([localOid, remoteOid])
    expect(entryText).toContain('local line')
    expect(remoteEntryText).toContain('remote line')
    expect(readmeText).toBe('remote readme\n')
    expect([...mediaBytes]).toEqual([9, 8, 7])
    expect(traceEvents).toContain('remote.fetchSkipped')
    expect(traceEvents).toContain('remote.merge')
    expect(traceEvents).not.toContain('remote.fetch')
  })
})

async function createTempRepository() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'journal-sync-'))

  tempRoots.push(tempRoot)

  return tempRoot
}

function createRuntime(
  dir: string,
  remoteOid: string,
  traceEvents: string[],
): JournalGitRuntime {
  const wrappedGit = {
    ...git,
    fetch: async () => {
      throw new Error('integration fake remote should not fetch when tracking ref is readable')
    },
    listServerRefs: async () => ([
      {
        oid: remoteOid,
        ref: 'refs/heads/main',
      },
    ] satisfies ServerRef[]),
  }

  return {
    cache: {},
    dir,
    fs: fs as unknown as FsClient,
    git: wrappedGit as unknown as typeof git,
    http: {
      request: async () => {
        throw new Error('integration fake remote should not perform HTTP requests')
      },
    } as unknown as HttpClient,
    trace: (event) => {
      traceEvents.push(event.name)
    },
  }
}

async function commitFiles(
  dir: string,
  message: string,
  files: Record<string, string | Uint8Array>,
) {
  for (const [filepath, contents] of Object.entries(files)) {
    const absolutePath = path.join(dir, filepath)

    await fs.promises.mkdir(path.dirname(absolutePath), {
      recursive: true,
    })
    await writeFile(absolutePath, contents)
    await git.add({
      dir,
      filepath,
      fs,
    })
  }

  return git.commit({
    author,
    dir,
    fs,
    message,
  })
}

async function moveLooseCommitToOrphanPack(dir: string, oid: string) {
  const { filename, packfile } = await git.packObjects({
    dir,
    fs,
    oids: [oid],
  })

  if (!packfile) {
    throw new Error('packObjects did not return a packfile.')
  }

  const packDirectory = path.join(dir, '.git/objects/pack')

  await fs.promises.mkdir(packDirectory, {
    recursive: true,
  })
  await writeFile(path.join(packDirectory, filename), packfile)
  await rm(path.join(dir, '.git/objects', oid.slice(0, 2), oid.slice(2)), {
    force: true,
  })

  return filename
}

async function fileExists(filepath: string) {
  try {
    await fs.promises.stat(filepath)
    return true
  } catch {
    return false
  }
}

async function readUtf8File(dir: string, filepath: string) {
  return textDecoder.decode(await readFile(path.join(dir, filepath)))
}
