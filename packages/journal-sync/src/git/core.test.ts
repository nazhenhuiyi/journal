import type { FsClient, HttpClient } from 'isomorphic-git'
import * as git from 'isomorphic-git'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertSafeRemoteUrl,
  cloneJournalGitSyncRepository,
  commitJournalChanges,
  createJournalGitAuthenticatedHttpClient,
  createJournalGitAuthHeaders,
  getJournalGitAuthenticationErrorMessage,
  getJournalGitSyncStatus,
  initJournalGitSyncRepository,
  pullJournalUpdates,
  pushJournalChanges,
  resolveJournalContentConflict,
  syncJournalNow,
  type JournalGitRuntime,
} from './core'

const mockFs = {
  promises: {
    readFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    unlink: vi.fn(),
    writeFile: vi.fn(),
  },
}
const mockGit = {
  add: vi.fn(),
  addRemote: vi.fn(),
  branch: vi.fn(),
  checkout: vi.fn(),
  clone: vi.fn(),
  commit: vi.fn(),
  currentBranch: vi.fn(),
  deleteRef: vi.fn(),
  fetch: vi.fn(),
  findMergeBase: vi.fn(),
  getConfig: vi.fn(),
  init: vi.fn(),
  indexPack: vi.fn(),
  listFiles: vi.fn(),
  listServerRefs: vi.fn(),
  log: vi.fn(),
  merge: vi.fn(),
  push: vi.fn(),
  readBlob: vi.fn(),
  readCommit: vi.fn(),
  readObject: vi.fn(),
  remove: vi.fn(),
  resolveRef: vi.fn(),
  setConfig: vi.fn(),
  statusMatrix: vi.fn(),
  TREE: vi.fn(),
  walk: vi.fn(),
  writeBlob: vi.fn(),
  writeCommit: vi.fn(),
  writeRef: vi.fn(),
  writeTree: vi.fn(),
}
const credentials = {
  token: 'github-token',
}
const syncConfig = {
  branch: 'main',
  remoteUrl: 'https://github.com/example/journal-sync.git',
}

function createRuntime(): JournalGitRuntime {
  return {
    cache: {},
    dir: '/journal',
    fs: mockFs as unknown as FsClient,
    git: mockGit as unknown as typeof git,
    http: { request: vi.fn() } as unknown as HttpClient,
  }
}

function createMissingGitObjectError(oid = 'e650e6dd7d12eb3a9bc09c38b49f8b5bee477fd8') {
  return Object.assign(new Error(`Could not find ${oid}.`), {
    code: 'NotFoundError',
    name: 'NotFoundError',
  })
}

type MockTreeLeaf = {
  mode?: string
  oid: string
  type?: 'blob' | 'commit'
}

function createMockWalkerEntry(entry: MockTreeLeaf) {
  return {
    mode: vi.fn(async () => entry.mode ?? '100644'),
    oid: vi.fn(async () => entry.oid),
    type: vi.fn(async () => entry.type ?? 'blob'),
  }
}

function mockManualMergeTreeWalk(
  entriesByRef: Record<string, Record<string, MockTreeLeaf>>,
  changedPaths: string[],
) {
  mockGit.walk.mockImplementation(async ({
    map,
    reduce,
    trees,
  }: {
    map?: (filepath: string, entries: unknown[]) => Promise<unknown>
    reduce?: (parent: unknown, children: unknown[]) => Promise<unknown>
    trees: Array<{ ref: string }>
  }) => {
    const refs = trees.map((tree) => tree.ref)

    if (refs.length === 1 && map && reduce) {
      const mappedEntries: unknown[] = []
      const entries = entriesByRef[refs[0]!] ?? {}

      for (const [filepath, entry] of Object.entries(entries).sort(([left], [right]) => left.localeCompare(right))) {
        const mapped = await map(filepath, [createMockWalkerEntry(entry)])

        if (mapped !== undefined) {
          mappedEntries.push(mapped)
        }
      }

      return reduce(undefined, mappedEntries)
    }

    if (refs.length === 2) {
      return changedPaths
    }

    return []
  })
}

describe('journal git sync core', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    mockFs.promises.stat.mockResolvedValue({})
    mockFs.promises.readFile.mockRejectedValue(Object.assign(new Error('missing'), {
      code: 'ENOENT',
    }))
    mockFs.promises.readdir.mockResolvedValue([])
    mockFs.promises.unlink.mockResolvedValue(undefined)
    mockFs.promises.writeFile.mockResolvedValue(undefined)
    mockGit.add.mockResolvedValue(undefined)
    mockGit.addRemote.mockResolvedValue(undefined)
    mockGit.branch.mockResolvedValue(undefined)
    mockGit.checkout.mockResolvedValue(undefined)
    mockGit.clone.mockResolvedValue(undefined)
    mockGit.commit.mockResolvedValue('commit-oid')
    mockGit.currentBranch.mockResolvedValue('main')
    mockGit.deleteRef.mockResolvedValue(undefined)
    mockGit.fetch.mockResolvedValue({
      fetchHead: 'remote-head',
    })
    mockGit.findMergeBase.mockImplementation(async ({ oids }: { oids: string[] }) => {
      return oids[0] && oids[0] === oids[1] ? [oids[0]] : ['base-head']
    })
    mockGit.getConfig.mockResolvedValue('https://github.com/example/journal-sync.git')
    mockGit.init.mockResolvedValue(undefined)
    mockGit.indexPack.mockResolvedValue({
      oids: [],
    })
    mockGit.listFiles.mockResolvedValue([])
    mockGit.listServerRefs.mockResolvedValue([
      {
        oid: 'remote-head',
        ref: 'refs/heads/main',
      },
    ])
    mockGit.log.mockResolvedValue([
      {
        commit: {
          committer: {
            timestamp: 1_780_987_200,
          },
          message: 'Latest sync\n\nBody',
        },
        oid: '1111111111111111111111111111111111111111',
      },
      {
        commit: {
          committer: {
            timestamp: 1_780_900_000,
          },
          message: 'Previous sync',
        },
        oid: '2222222222222222222222222222222222222222',
      },
      {
        commit: {
          committer: {},
          message: '',
        },
        oid: '3333333333333333333333333333333333333333',
      },
    ])
    mockGit.merge.mockResolvedValue({
      fastForward: true,
      oid: 'remote-head',
    })
    mockGit.push.mockResolvedValue({
      error: null,
      ok: true,
      refs: {
        main: {
          error: '',
          ok: true,
        },
      },
    })
    mockGit.readCommit.mockImplementation(async ({ oid }: { oid: string }) => ({
      commit: {
        author: {},
        committer: {},
        message: '',
        parent: [],
        tree: `tree-${oid}`,
      },
      oid,
      payload: '',
    }))
    mockGit.readObject.mockImplementation(async ({ filepath, oid }: { filepath: string, oid: string }) => ({
      format: 'content',
      object: new Uint8Array(),
      oid: `${oid}:${filepath}`,
      source: oid,
    }))
    mockGit.readBlob.mockResolvedValue({
      blob: new Uint8Array(),
      oid: 'blob',
    })
    mockGit.remove.mockResolvedValue(undefined)
    mockGit.resolveRef.mockResolvedValue('local-head')
    mockGit.setConfig.mockResolvedValue(undefined)
    mockGit.statusMatrix.mockResolvedValue([])
    mockGit.TREE.mockImplementation(({ ref }: { ref: string }) => ({ ref }))
    mockGit.walk.mockResolvedValue([])
    mockGit.writeBlob.mockResolvedValue('merged-blob')
    mockGit.writeCommit.mockResolvedValue('merge-head')
    mockGit.writeRef.mockResolvedValue(undefined)
    mockGit.writeTree.mockResolvedValue('merge-tree')
  })

  it('initializes a repository and configures author and remote', async () => {
    mockFs.promises.stat.mockRejectedValueOnce(Object.assign(new Error('missing'), {
      code: 'ENOENT',
    }))

    await initJournalGitSyncRepository(createRuntime(), {
      authorEmail: 'desktop@example.invalid',
      authorName: 'Desktop',
      branch: 'main',
      remoteUrl: 'https://github.com/example/journal-sync.git',
    })

    expect(mockGit.init).toHaveBeenCalledWith(expect.objectContaining({
      defaultBranch: 'main',
      dir: '/journal',
      fs: mockFs,
    }))
    expect(mockGit.setConfig).toHaveBeenCalledWith(expect.objectContaining({
      path: 'user.name',
      value: 'Desktop',
    }))
    expect(mockGit.addRemote).toHaveBeenCalledWith(expect.objectContaining({
      force: true,
      remote: 'origin',
      url: 'https://github.com/example/journal-sync.git',
    }))
  })

  it('does not initialize a sync repository before a remote is configured', async () => {
    await initJournalGitSyncRepository(createRuntime(), {
      branch: 'main',
    })

    expect(mockGit.init).not.toHaveBeenCalled()
    expect(mockGit.addRemote).not.toHaveBeenCalled()
  })

  it('rejects HTTPS remote URLs that include credentials', async () => {
    expect(() => assertSafeRemoteUrl('https://token@github.com/example/journal-sync.git'))
      .toThrow('不能包含用户名或 token')
    expect(() => assertSafeRemoteUrl('https://user:token@github.com/example/journal-sync.git'))
      .toThrow('不能包含用户名或 token')

    expect(() => assertSafeRemoteUrl('https://github.com/example/journal-sync.git'))
      .not.toThrow()
    expect(() => assertSafeRemoteUrl('git@github.com:example/journal-sync.git'))
      .toThrow('必须使用 http 或 https')
    expect(() => assertSafeRemoteUrl('ssh://github.com/example/journal-sync.git'))
      .toThrow('必须使用 http 或 https')
  })

  it('creates Git Basic auth headers from credentials', () => {
    expect(createJournalGitAuthHeaders({
      accept: 'application/x-git-upload-pack-advertisement',
    }, credentials)).toEqual({
      Authorization: 'Basic eC1hY2Nlc3MtdG9rZW46Z2l0aHViLXRva2Vu',
      accept: 'application/x-git-upload-pack-advertisement',
    })
    expect(createJournalGitAuthHeaders(undefined, {
      token: 'secret',
      username: 'alice',
    })).toEqual({
      Authorization: 'Basic YWxpY2U6c2VjcmV0',
    })
  })

  it('encodes non-ASCII Git Basic auth credentials as UTF-8 base64', () => {
    expect(createJournalGitAuthHeaders(undefined, {
      token: '令牌🔑',
      username: '张三',
    })).toEqual({
      Authorization: `Basic ${Buffer.from('张三:令牌🔑', 'utf8').toString('base64')}`,
    })
  })

  it('preserves an explicitly provided Authorization header', () => {
    expect(createJournalGitAuthHeaders({
      authorization: 'Bearer existing-token',
    }, credentials)).toEqual({
      authorization: 'Bearer existing-token',
    })
  })

  it('wraps Git HTTP clients with the shared auth header logic', async () => {
    const request = vi.fn(async () => ({
      body: [],
      headers: {},
      method: 'GET',
      statusCode: 200,
      statusMessage: 'OK',
      url: 'https://github.com/example/journal-sync.git',
    }))
    const authenticatedHttp = createJournalGitAuthenticatedHttpClient(
      { request } as unknown as HttpClient,
      credentials,
    )

    await authenticatedHttp.request({
      headers: {
        accept: 'application/x-git-upload-pack-advertisement',
      },
      method: 'GET',
      url: 'https://github.com/example/journal-sync.git/info/refs?service=git-upload-pack',
    })

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Basic eC1hY2Nlc3MtdG9rZW46Z2l0aHViLXRva2Vu',
        accept: 'application/x-git-upload-pack-advertisement',
      }),
    }))
  })

  it('recognizes Git HTTP authentication failures', () => {
    expect(getJournalGitAuthenticationErrorMessage(Object.assign(new Error('HTTP Error: 401 Unauthorized'), {
      code: 'HttpError',
      data: {
        statusCode: 401,
      },
    }))).toBe('GitHub token 无效或已过期，请重新保存 token。')
    expect(getJournalGitAuthenticationErrorMessage(Object.assign(new Error('Bad credentials'), {
      code: 'HttpError',
    }))).toContain('GitHub token')
    expect(getJournalGitAuthenticationErrorMessage(new Error('network down'))).toBeNull()
  })

  it('times out slow authenticated Git HTTP requests after the configured budget', async () => {
    vi.useFakeTimers()

    try {
      const request = vi.fn(() => new Promise<never>(() => {}))
      const authenticatedHttp = createJournalGitAuthenticatedHttpClient(
        { request } as unknown as HttpClient,
        credentials,
        { requestTimeoutMs: 300_000 },
      )
      const result = authenticatedHttp.request({
        method: 'GET',
        url: 'https://github.com/example/journal-sync.git/info/refs?service=git-upload-pack',
      })

      await vi.advanceTimersByTimeAsync(299_999)
      await expect(Promise.race([
        result.then(() => 'resolved', () => 'rejected'),
        Promise.resolve('pending'),
      ])).resolves.toBe('pending')

      const rejection = expect(result).rejects.toThrow('GitHub 请求超时（300 秒）')

      await vi.advanceTimersByTimeAsync(1)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the configured Git HTTP timeout active while reading response bodies', async () => {
    vi.useFakeTimers()

    try {
      const slowBody = async function* (): AsyncIterableIterator<Uint8Array> {
        yield new Uint8Array([1])
        await new Promise<never>(() => {})
      }

      const request = vi.fn(async () => ({
        body: slowBody(),
        headers: {},
        method: 'GET',
        statusCode: 200,
        statusMessage: 'OK',
        url: 'https://github.com/example/journal-sync.git',
      }))
      const authenticatedHttp = createJournalGitAuthenticatedHttpClient(
        { request } as unknown as HttpClient,
        credentials,
        { requestTimeoutMs: 300_000 },
      )
      const response = await authenticatedHttp.request({
        method: 'GET',
        url: 'https://github.com/example/journal-sync.git/info/refs?service=git-upload-pack',
      })
      const body = response.body![Symbol.asyncIterator]()

      await expect(body.next()).resolves.toEqual({
        done: false,
        value: new Uint8Array([1]),
      })

      const result = body.next()
      const rejection = expect(result).rejects.toThrow('GitHub 请求超时（300 秒）')

      await vi.advanceTimersByTimeAsync(300_000)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses preauthenticated HTTP clients for remote operations instead of onAuth callbacks', async () => {
    const runtime = createRuntime()
    const request = vi.fn(async () => ({
      body: [],
      headers: {},
      method: 'GET',
      statusCode: 200,
      statusMessage: 'OK',
      url: 'https://github.com/example/journal-sync.git',
    }))

    runtime.http = { request } as unknown as HttpClient

    await pullJournalUpdates(
      runtime,
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
    )

    const fetchOptions = mockGit.fetch.mock.calls[0][0]

    expect(fetchOptions.onAuth).toBeUndefined()
    await fetchOptions.http.request({
      headers: {
        accept: 'application/x-git-upload-pack-advertisement',
      },
      method: 'GET',
      url: 'https://github.com/example/journal-sync.git/info/refs?service=git-upload-pack',
    })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Basic eC1hY2Nlc3MtdG9rZW46Z2l0aHViLXRva2Vu',
        accept: 'application/x-git-upload-pack-advertisement',
      }),
    }))
  })

  it('passes the runtime cache to clone operations', async () => {
    const runtime = createRuntime()

    mockFs.promises.stat.mockRejectedValueOnce(Object.assign(new Error('missing'), {
      code: 'ENOENT',
    }))

    await cloneJournalGitSyncRepository(runtime, {
      branch: 'main',
      remoteUrl: 'https://github.com/example/journal-sync.git',
    }, credentials)

    expect(mockGit.clone).toHaveBeenCalledWith(expect.objectContaining({
      cache: runtime.cache,
      dir: '/journal',
      fs: mockFs,
      ref: 'main',
      singleBranch: true,
      url: 'https://github.com/example/journal-sync.git',
    }))
  })

  it('does not commit when no tracked journal file changed', async () => {
    mockGit.statusMatrix.mockResolvedValue([
      ['settings.json', 1, 2, 1],
    ])

    const commitOid = await commitJournalChanges(createRuntime(), syncConfig)

    expect(commitOid).toBeNull()
    expect(mockGit.add).not.toHaveBeenCalled()
    expect(mockGit.commit).not.toHaveBeenCalled()
  })

  it('ignores temporary and non-journal files inside tracked directories', async () => {
    mockGit.statusMatrix.mockResolvedValue([
      ['entries/2026/06/2026-06-09.md', 1, 2, 1],
      ['entries/2026/06/2026-06-09.md.91423.tmp', 0, 2, 0],
      ['entries/2026/06/not-a-journal.txt', 0, 2, 0],
      ['annotations/2026/06/2026-06-09.json.tmp', 0, 2, 0],
      ['media/2026/06/photo.jpg.tmp', 0, 2, 0],
      ['media/2026/06/photo.jpg', 1, 1, 1],
      ['reviews/2026/06/2026-06-10.json.tmp', 0, 2, 0],
      ['reviews/2026/06/2026-06-10.json', 1, 2, 1],
    ])

    const status = await getJournalGitSyncStatus(createRuntime(), {
      branch: 'main',
    })

    expect(status.dirtyPaths).toEqual([
      'entries/2026/06/2026-06-09.md',
      'reviews/2026/06/2026-06-10.json',
    ])
  })

  it('includes the latest three local commits in sync status', async () => {
    mockFs.promises.readFile.mockResolvedValue([
      '0000000000000000000000000000000000000000 3333333333333333333333333333333333333333 Journal <journal@example.invalid> 1780800000 +0000\tcommit (initial): First sync',
      '3333333333333333333333333333333333333333 2222222222222222222222222222222222222222 Journal <journal@example.invalid> 1780900000 +0000\tcommit: Previous sync',
      '2222222222222222222222222222222222222222 1111111111111111111111111111111111111111 Journal <journal@example.invalid> 1780987200 +0000\tcommit: Latest sync',
    ].join('\n'))

    const status = await getJournalGitSyncStatus(createRuntime(), {
      branch: 'main',
    }, credentials)

    expect(mockFs.promises.readFile).toHaveBeenCalledWith(
      '/journal/.git/logs/refs/heads/main',
      { encoding: 'utf8' },
    )
    expect(mockGit.log).not.toHaveBeenCalled()
    expect(mockGit.readCommit).not.toHaveBeenCalled()
    expect(status.recentCommits).toEqual([
      {
        committedAt: new Date(1_780_987_200 * 1000).toISOString(),
        message: 'Latest sync',
        oid: '1111111111111111111111111111111111111111',
        shortOid: '1111111',
      },
      {
        committedAt: new Date(1_780_900_000 * 1000).toISOString(),
        message: 'Previous sync',
        oid: '2222222222222222222222222222222222222222',
        shortOid: '2222222',
      },
      {
        committedAt: new Date(1_780_800_000 * 1000).toISOString(),
        message: 'First sync',
        oid: '3333333333333333333333333333333333333333',
        shortOid: '3333333',
      },
    ])
  })

  it('falls back to commit objects when the local reflog is unavailable', async () => {
    const commitChain = [
      {
        commit: {
          committer: {
            timestamp: 1_780_987_200,
          },
          message: 'Latest sync\n\nBody',
          parent: ['2222222222222222222222222222222222222222'],
        },
        oid: '1111111111111111111111111111111111111111',
      },
      {
        commit: {
          committer: {
            timestamp: 1_780_900_000,
          },
          message: 'Previous sync',
          parent: ['3333333333333333333333333333333333333333'],
        },
        oid: '2222222222222222222222222222222222222222',
      },
      {
        commit: {
          committer: {},
          message: '',
          parent: [],
        },
        oid: '3333333333333333333333333333333333333333',
      },
    ]

    mockGit.resolveRef.mockResolvedValueOnce('1111111111111111111111111111111111111111')
    mockGit.readCommit.mockImplementation(async ({ oid }: { oid: string }) => {
      const entry = commitChain.find((commit) => commit.oid === oid)

      if (!entry) {
        throw new Error(`missing commit ${oid}`)
      }

      return {
        ...entry,
        payload: '',
      }
    })

    const status = await getJournalGitSyncStatus(createRuntime(), {
      branch: 'main',
    }, credentials)

    expect(mockGit.log).not.toHaveBeenCalled()
    expect(mockGit.resolveRef).toHaveBeenCalledWith(expect.objectContaining({
      dir: '/journal',
      fs: mockFs,
      ref: 'HEAD',
    }))
    expect(mockGit.readCommit).toHaveBeenCalledTimes(3)
    expect(status.recentCommits).toEqual([
      {
        committedAt: new Date(1_780_987_200 * 1000).toISOString(),
        message: 'Latest sync',
        oid: '1111111111111111111111111111111111111111',
        shortOid: '1111111',
      },
      {
        committedAt: new Date(1_780_900_000 * 1000).toISOString(),
        message: 'Previous sync',
        oid: '2222222222222222222222222222222222222222',
        shortOid: '2222222',
      },
      {
        committedAt: null,
        message: '(no message)',
        oid: '3333333333333333333333333333333333333333',
        shortOid: '3333333',
      },
    ])
  })

  it('limits recent commit object reads when requested', async () => {
    const commitChain = [
      {
        commit: {
          committer: {
            timestamp: 1_780_987_200,
          },
          message: 'Latest sync\n\nBody',
          parent: ['2222222222222222222222222222222222222222'],
        },
        oid: '1111111111111111111111111111111111111111',
      },
      {
        commit: {
          committer: {
            timestamp: 1_780_900_000,
          },
          message: 'Previous sync',
          parent: [],
        },
        oid: '2222222222222222222222222222222222222222',
      },
    ]

    mockGit.resolveRef.mockResolvedValueOnce('1111111111111111111111111111111111111111')
    mockGit.readCommit.mockImplementation(async ({ oid }: { oid: string }) => {
      const entry = commitChain.find((commit) => commit.oid === oid)

      if (!entry) {
        throw new Error(`missing commit ${oid}`)
      }

      return {
        ...entry,
        payload: '',
      }
    })

    const status = await getJournalGitSyncStatus(createRuntime(), {
      branch: 'main',
    }, credentials, {
      recentCommitLimit: 1,
    })

    expect(mockGit.readCommit).toHaveBeenCalledTimes(1)
    expect(status.recentCommits).toEqual([
      {
        committedAt: new Date(1_780_987_200 * 1000).toISOString(),
        message: 'Latest sync',
        oid: '1111111111111111111111111111111111111111',
        shortOid: '1111111',
      },
    ])
  })

  it('does not stage temporary files left by atomic writes', async () => {
    mockGit.statusMatrix
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-09.md', 1, 2, 1],
        ['entries/2026/06/2026-06-09.md.91423.tmp', 0, 2, 0],
      ])
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-09.md', 1, 2, 2],
        ['entries/2026/06/2026-06-09.md.91423.tmp', 0, 2, 0],
      ])

    const commitOid = await commitJournalChanges(createRuntime(), syncConfig)

    expect(mockGit.add).toHaveBeenCalledTimes(1)
    expect(mockGit.add).toHaveBeenCalledWith(expect.objectContaining({
      filepath: 'entries/2026/06/2026-06-09.md',
    }))
    expect(mockGit.add).not.toHaveBeenCalledWith(expect.objectContaining({
      filepath: 'entries/2026/06/2026-06-09.md.91423.tmp',
    }))
    expect(commitOid).toBe('commit-oid')
  })

  it('rejects standalone commits before a remote is configured', async () => {
    await expect(commitJournalChanges(createRuntime(), {
      branch: 'main',
    })).rejects.toThrow('GitHub repository URL is required before committing sync data')

    expect(mockGit.commit).not.toHaveBeenCalled()
  })

  it('does not stage or commit journal markdown with unresolved conflict markers', async () => {
    mockFs.promises.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/entries/2026/06/2026-06-09.md')) {
        return [
          '正文',
          '<<<<<<< main',
          '桌面内容',
          '=======',
          '移动内容',
          '>>>>>>> origin/main',
        ].join('\n')
      }

      throw Object.assign(new Error('missing'), {
        code: 'ENOENT',
      })
    })
    mockGit.statusMatrix.mockResolvedValueOnce([
      ['entries/2026/06/2026-06-09.md', 1, 2, 1],
    ])

    await expect(commitJournalChanges(createRuntime(), syncConfig))
      .rejects.toMatchObject({
        block: {
          conflicts: [{
            ours: '桌面内容',
            path: 'entries/2026/06/2026-06-09.md',
            theirs: '移动内容',
          }],
          paths: ['entries/2026/06/2026-06-09.md'],
          reason: 'content-conflict',
        },
        code: 'JournalSyncBlockedError',
      })

    expect(mockGit.add).not.toHaveBeenCalled()
    expect(mockGit.commit).not.toHaveBeenCalled()
  })

  it('commits known changed paths without statusMatrix scanning', async () => {
    const runtime = createRuntime()

    const commitOid = await commitJournalChanges(
      runtime,
      syncConfig,
      'Sync journal changes',
      {
        changedPaths: ['reviews/2026/06/2026-06-10.json'],
      },
    )

    expect(mockGit.statusMatrix).not.toHaveBeenCalled()
    expect(mockFs.promises.stat).toHaveBeenCalledWith('/journal/reviews/2026/06/2026-06-10.json')
    expect(mockGit.add).toHaveBeenCalledWith(expect.objectContaining({
      cache: runtime.cache,
      filepath: 'reviews/2026/06/2026-06-10.json',
    }))
    expect(mockGit.commit).toHaveBeenCalledWith(expect.objectContaining({
      cache: runtime.cache,
      ref: 'refs/heads/main',
    }))
    expect(mockGit.readCommit).toHaveBeenCalledWith(expect.objectContaining({
      cache: runtime.cache,
      oid: 'commit-oid',
    }))
    expect(mockGit.readCommit).toHaveBeenCalledWith(expect.objectContaining({
      cache: runtime.cache,
      oid: 'local-head',
    }))
    expect(commitOid).toBe('commit-oid')
  })

  it('stages known deleted changed paths without statusMatrix scanning', async () => {
    const runtime = createRuntime()

    mockFs.promises.stat.mockImplementation(async (path: string) => {
      if (path.endsWith('/entries/2026/06/2026-06-08.md')) {
        throw Object.assign(new Error('missing'), {
          code: 'ENOENT',
        })
      }

      return {}
    })

    const commitOid = await commitJournalChanges(
      runtime,
      syncConfig,
      'Sync journal changes',
      {
        changedPaths: ['entries/2026/06/2026-06-08.md'],
      },
    )

    expect(mockGit.statusMatrix).not.toHaveBeenCalled()
    expect(mockGit.remove).toHaveBeenCalledWith(expect.objectContaining({
      cache: runtime.cache,
      filepath: 'entries/2026/06/2026-06-08.md',
    }))
    expect(mockGit.add).not.toHaveBeenCalled()
    expect(commitOid).toBe('commit-oid')
  })

  it('accepts weekly review files as tracked journal changed paths', async () => {
    const commitOid = await commitJournalChanges(
      createRuntime(),
      syncConfig,
      'Sync journal changes',
      {
        changedPaths: ['reviews/weekly/2026-W24.md'],
      },
    )

    expect(mockGit.statusMatrix).not.toHaveBeenCalled()
    expect(mockGit.add).toHaveBeenCalledWith(expect.objectContaining({
      filepath: 'reviews/weekly/2026-W24.md',
    }))
    expect(commitOid).toBe('commit-oid')
  })

  it('accepts non-daily markdown files under entries as tracked journal changed paths', async () => {
    const commitOid = await commitJournalChanges(
      createRuntime(),
      syncConfig,
      'Sync journal changes',
      {
        changedPaths: ['entries/weekly/2026-W24.md'],
      },
    )

    expect(mockGit.statusMatrix).not.toHaveBeenCalled()
    expect(mockGit.add).toHaveBeenCalledWith(expect.objectContaining({
      filepath: 'entries/weekly/2026-W24.md',
    }))
    expect(commitOid).toBe('commit-oid')
  })

  it('stages deleted tracked journal files with git remove', async () => {
    const runtime = createRuntime()

    mockGit.statusMatrix
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 1, 0, 1],
      ])
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 1, 0, 0],
      ])

    const commitOid = await commitJournalChanges(runtime, syncConfig)

    expect(mockGit.remove).toHaveBeenCalledWith(expect.objectContaining({
      cache: runtime.cache,
      filepath: 'entries/2026/06/2026-06-08.md',
    }))
    expect(mockGit.add).not.toHaveBeenCalled()
    expect(commitOid).toBe('commit-oid')
  })

  it('skips post-sync dirty scanning when changed paths are known', async () => {
    const runtime = createRuntime()
    const trace = vi.fn()

    runtime.trace = trace

    const result = await syncJournalNow(
      runtime,
      syncConfig,
      credentials,
      {
        changedPaths: ['reviews/2026/06/2026-06-10.json'],
      },
    )

    expect(mockGit.statusMatrix).not.toHaveBeenCalled()
    expect(result.dirtyPathsAfterSync).toEqual([])
    expect(trace.mock.calls).toContainEqual([
      expect.objectContaining({
        details: expect.objectContaining({
          knownPaths: 1,
          reason: 'known-changed-paths',
          skipped: true,
        }),
        name: 'sync.dirtyPathsAfterSync',
        ok: true,
      }),
    ])
  })

  it('rolls back commits whose tree is unchanged from the parent commit', async () => {
    mockGit.statusMatrix
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 1, 2, 1],
      ])
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 1, 2, 2],
      ])
    mockGit.readCommit.mockImplementation(async ({ oid }: { oid: string }) => ({
      commit: {
        author: {},
        committer: {},
        message: '',
        parent: [],
        tree: oid === 'commit-oid' || oid === 'local-head' ? 'same-tree' : `tree-${oid}`,
      },
      oid,
      payload: '',
    }))

    const commitOid = await commitJournalChanges(createRuntime(), syncConfig)

    expect(commitOid).toBeNull()
    expect(mockGit.writeRef).toHaveBeenCalledWith(expect.objectContaining({
      force: true,
      ref: 'refs/heads/main',
      value: 'local-head',
    }))
  })

  it('fetches, merges, and retries once when push is rejected by remote updates', async () => {
    const runtime = createRuntime()
    const trace = vi.fn()

    runtime.trace = trace
    mockGit.statusMatrix
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 0],
      ])
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 2],
      ])
      .mockResolvedValue([])
    mockGit.writeCommit.mockResolvedValueOnce('retry-merge-head')
    mockGit.push
      .mockRejectedValueOnce(Object.assign(new Error('remote changed'), {
        code: 'PushRejectedError',
      }))
      .mockResolvedValueOnce({
        error: null,
        ok: true,
        refs: {
          main: {
            error: '',
            ok: true,
          },
        },
      })

    const result = await syncJournalNow(
      runtime,
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
    )

    expect(mockGit.fetch).toHaveBeenCalledTimes(2)
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.findMergeBase).toHaveBeenCalled()
    expect(mockGit.push).toHaveBeenCalledTimes(2)
    expect(mockGit.fetch).toHaveBeenCalledWith(expect.objectContaining({
      cache: runtime.cache,
    }))
    expect(mockGit.push).toHaveBeenCalledWith(expect.objectContaining({
      cache: runtime.cache,
      force: false,
    }))
    expect(result.retriedPush).toBe(true)
    expect(trace).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        mergeCommit: false,
        retryCommit: false,
      }),
      name: 'push.retryMerge',
      ok: true,
    }))
  })

  it('resolves a content conflict by keeping local content with a non-force push', async () => {
    const runtime = createRuntime()

    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/heads/main') {
        return 'local-head'
      }

      if (ref === 'refs/remotes/origin/main') {
        return 'remote-head'
      }

      return 'local-head'
    })
    mockGit.writeCommit.mockResolvedValueOnce('resolution-head')

    const result = await resolveJournalContentConflict(
      runtime,
      syncConfig,
      credentials,
      { strategy: 'keep-local' },
    )

    expect(result).toMatchObject({
      localCommitOid: 'resolution-head',
      strategy: 'keep-local',
      updatedWorktree: false,
    })
    expect(mockGit.fetch).toHaveBeenCalledWith(expect.objectContaining({
      ref: 'main',
      remote: 'origin',
    }))
    expect(mockGit.writeCommit).toHaveBeenCalledWith(expect.objectContaining({
      commit: expect.objectContaining({
        parent: ['local-head', 'remote-head'],
        tree: 'tree-local-head',
      }),
    }))
    expect(mockGit.push).toHaveBeenCalledWith(expect.objectContaining({
      force: false,
      ref: 'refs/heads/main',
      remoteRef: 'refs/heads/main',
    }))
    expect(mockGit.writeRef).toHaveBeenCalledWith(expect.objectContaining({
      ref: 'refs/heads/main',
      value: 'resolution-head',
    }))
    expect(mockGit.writeRef).toHaveBeenCalledWith(expect.objectContaining({
      ref: 'refs/remotes/origin/main',
      value: 'resolution-head',
    }))
  })

  it('does not create a first local commit when keep-local has no local branch', async () => {
    const runtime = createRuntime()

    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/heads/main') {
        throw new Error('missing local branch')
      }

      if (ref === 'refs/remotes/origin/main') {
        return 'remote-head'
      }

      return 'remote-head'
    })
    mockGit.statusMatrix.mockResolvedValueOnce([
      ['entries/2026/06/2026-06-08.md', 0, 2, 0],
    ])

    await expect(resolveJournalContentConflict(
      runtime,
      syncConfig,
      credentials,
      { strategy: 'keep-local' },
    )).rejects.toThrow('Cannot resolve sync conflict because local branch main has no commit.')

    expect(mockGit.commit).not.toHaveBeenCalled()
    expect(mockGit.fetch).not.toHaveBeenCalled()
    expect(mockGit.push).not.toHaveBeenCalled()
    expect(mockGit.writeCommit).not.toHaveBeenCalled()
  })

  it('does not keep local content when a clean tracked markdown file already contains conflict markers', async () => {
    const runtime = createRuntime()
    const conflictPath = 'entries/2026/06/2026-06-09.md'

    mockFs.promises.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith(`/${conflictPath}`)) {
        return [
          '正文',
          '<<<<<<< main',
          '本机内容',
          '=======',
          '远端内容',
          '>>>>>>> origin/main',
        ].join('\n')
      }

      throw Object.assign(new Error('missing'), {
        code: 'ENOENT',
      })
    })
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/heads/main') {
        return 'local-head'
      }

      if (ref === 'refs/remotes/origin/main') {
        return 'remote-head'
      }

      return 'local-head'
    })
    mockGit.statusMatrix
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        [conflictPath, 1, 1, 1],
      ])

    await expect(resolveJournalContentConflict(
      runtime,
      syncConfig,
      credentials,
      { strategy: 'keep-local' },
    )).rejects.toMatchObject({
      block: {
        conflicts: [{
          ours: '本机内容',
          path: conflictPath,
          theirs: '远端内容',
        }],
        paths: [conflictPath],
        reason: 'content-conflict',
      },
      code: 'JournalSyncBlockedError',
    })

    expect(mockGit.fetch).not.toHaveBeenCalled()
    expect(mockGit.push).not.toHaveBeenCalled()
    expect(mockGit.writeCommit).not.toHaveBeenCalled()
  })

  it('resolves a content conflict by keeping both markdown versions with a non-force push', async () => {
    const runtime = createRuntime()
    const conflictPath = 'entries/2026/06/2026-06-08.md'

    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/heads/main') {
        return 'local-head'
      }

      if (ref === 'refs/remotes/origin/main') {
        return 'remote-head'
      }

      return 'local-head'
    })
    mockManualMergeTreeWalk(
      {
        'base-head': {
          [conflictPath]: {
            oid: 'base-entry',
          },
        },
        'local-head': {
          [conflictPath]: {
            oid: 'local-entry',
          },
        },
        'remote-head': {
          [conflictPath]: {
            oid: 'remote-entry',
          },
        },
      },
      [],
    )
    mockGit.readBlob.mockImplementation(async ({ oid }: { oid: string }) => ({
      blob: new TextEncoder().encode({
        'base-entry': 'intro\nbase\nend\n',
        'local-entry': 'intro\nlocal text\nend\n',
        'remote-entry': 'intro\nremote text\nend\n',
      }[oid] ?? ''),
      oid,
    }))
    mockGit.writeBlob.mockResolvedValueOnce('both-entry')
    mockGit.writeCommit.mockResolvedValueOnce('both-resolution-head')

    const result = await resolveJournalContentConflict(
      runtime,
      syncConfig,
      credentials,
      { strategy: 'keep-both' },
    )

    expect(result).toMatchObject({
      localCommitOid: 'both-resolution-head',
      strategy: 'keep-both',
      updatedWorktree: true,
    })
    const writeBlobInput = mockGit.writeBlob.mock.calls[0]?.[0]

    expect(writeBlobInput).toBeDefined()
    expect(new TextDecoder().decode(writeBlobInput!.blob)).toBe('intro\nlocal text\n\nremote text\nend\n')
    expect(mockGit.writeCommit).toHaveBeenCalledWith(expect.objectContaining({
      commit: expect.objectContaining({
        message: 'Resolve journal sync conflict by keeping both sides\n',
        parent: ['local-head', 'remote-head'],
      }),
    }))
    expect(mockGit.push).toHaveBeenCalledWith(expect.objectContaining({
      force: false,
      ref: 'refs/heads/main',
      remoteRef: 'refs/heads/main',
    }))
    expect(mockGit.checkout).toHaveBeenCalledWith(expect.objectContaining({
      filepaths: ['annotations', 'entries', 'manifest.json', 'media', 'reviews'],
      force: true,
      ref: 'refs/heads/main',
    }))
  })

  it('does not keep both sides when git reports multiple merge bases', async () => {
    const runtime = createRuntime()

    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/heads/main') {
        return 'local-head'
      }

      if (ref === 'refs/remotes/origin/main') {
        return 'remote-head'
      }

      return 'local-head'
    })
    mockGit.findMergeBase.mockResolvedValueOnce(['base-a', 'base-b'])

    await expect(resolveJournalContentConflict(
      runtime,
      syncConfig,
      credentials,
      { strategy: 'keep-both' },
    )).rejects.toThrow('Cannot keep both sides because local and remote histories have multiple merge bases: 2.')

    expect(mockGit.writeCommit).not.toHaveBeenCalled()
    expect(mockGit.push).not.toHaveBeenCalled()
  })

  it('resolves a content conflict by keeping remote content without pushing', async () => {
    const runtime = createRuntime()

    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/heads/main') {
        return 'local-head'
      }

      if (ref === 'refs/remotes/origin/main') {
        return 'remote-head'
      }

      return 'local-head'
    })

    const result = await resolveJournalContentConflict(
      runtime,
      syncConfig,
      credentials,
      { strategy: 'keep-remote' },
    )

    expect(result).toMatchObject({
      localCommitOid: null,
      pushResult: null,
      strategy: 'keep-remote',
      updatedWorktree: true,
    })
    expect(mockGit.writeRef).toHaveBeenCalledWith(expect.objectContaining({
      force: true,
      ref: 'refs/heads/main',
      value: 'remote-head',
    }))
    expect(mockGit.checkout).toHaveBeenCalledWith(expect.objectContaining({
      filepaths: ['annotations', 'entries', 'manifest.json', 'media', 'reviews'],
      force: true,
      ref: 'refs/heads/main',
    }))
    expect(mockGit.push).not.toHaveBeenCalled()
  })

  it('does not retry push when the retry merge leaves a true conflict', async () => {
    const runtime = createRuntime()
    const trace = vi.fn()
    const localOid = 'local-head'
    const remoteOid = 'remote-head'
    const baseOid = 'base-head'
    const conflictPath = 'entries/2026/06/2026-06-08.md'
    let remoteTrackingOid = localOid

    runtime.trace = trace
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: localOid,
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return remoteTrackingOid
      }

      return localOid
    })
    mockGit.statusMatrix
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 0],
      ])
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 2],
      ])
      .mockResolvedValue([])
    mockGit.fetch.mockImplementation(async () => {
      remoteTrackingOid = remoteOid

      return {
        fetchHead: remoteOid,
      }
    })
    mockGit.findMergeBase.mockResolvedValueOnce([baseOid])
    mockManualMergeTreeWalk(
      {
        [baseOid]: {
          [conflictPath]: {
            oid: 'base-entry',
          },
        },
        [localOid]: {
          [conflictPath]: {
            oid: 'local-entry',
          },
        },
        [remoteOid]: {
          [conflictPath]: {
            oid: 'remote-entry',
          },
        },
      },
      [],
    )
    mockGit.readBlob.mockImplementation(async ({ oid }: { oid: string }) => ({
      blob: new TextEncoder().encode({
        'base-entry': 'base\n',
        'local-entry': 'ours\n',
        'remote-entry': 'theirs\n',
      }[oid] ?? ''),
      oid,
    }))
    mockGit.push.mockRejectedValueOnce(Object.assign(new Error('remote changed'), {
      code: 'PushRejectedError',
    }))

    await expect(syncJournalNow(
      runtime,
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
    )).rejects.toMatchObject({
      block: {
        conflicts: [{
          ours: 'ours',
          path: conflictPath,
          theirs: 'theirs',
        }],
        paths: [conflictPath],
        reason: 'content-conflict',
      },
      code: 'JournalSyncBlockedError',
    })

    expect(mockGit.push).toHaveBeenCalledTimes(1)
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(trace).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        conflictPaths: 1,
      }),
      name: 'merge.conflict',
      ok: true,
    }))
  })

  it('skips fetch, merge, and no-op push when the remote branch matches the local tracking ref', async () => {
    const runtime = createRuntime()
    const trace = vi.fn()

    runtime.trace = trace
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: 'tracking-head',
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/heads/main' || ref === 'refs/remotes/origin/main') {
        return 'tracking-head'
      }

      return 'local-head'
    })

    const result = await syncJournalNow(
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

    expect(mockGit.listServerRefs).toHaveBeenCalledWith(expect.objectContaining({
      prefix: 'refs/heads/main',
      url: 'https://github.com/example/journal-sync.git',
    }))
    expect(mockGit.fetch).not.toHaveBeenCalled()
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.push).not.toHaveBeenCalled()
    expect(result.fetchResult).toBeNull()
    expect(result.mergeResult).toBeNull()
    expect(result.pushResult).toBeNull()
    expect(trace.mock.calls).toContainEqual([
      expect.objectContaining({
        details: expect.objectContaining({
          reason: 'no-local-or-merge-commit',
        }),
        name: 'remote.pushSkipped',
        ok: true,
      }),
    ])
  })

  it('pushes existing local commits when no new commit was created in this sync run', async () => {
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: 'tracking-head',
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return 'tracking-head'
      }

      return 'local-head'
    })
    mockGit.findMergeBase.mockResolvedValueOnce(['tracking-head'])

    const result = await syncJournalNow(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
      {
        collectDirtyPathsAfterSync: false,
      },
    )

    expect(mockGit.fetch).not.toHaveBeenCalled()
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.findMergeBase).toHaveBeenCalledWith(expect.objectContaining({
      oids: ['local-head', 'tracking-head'],
    }))
    expect(mockGit.push).toHaveBeenCalledTimes(1)
    expect(result.localCommitOid).toBeNull()
    expect(result.mergeCommitOid).toBeNull()
    expect(result.mergeResult).toEqual({
      alreadyMerged: true,
      oid: 'local-head',
    })
    expect(result.pushResult).toEqual(expect.objectContaining({
      ok: true,
    }))
  })

  it('merges when fetch is skipped but the local branch is behind the tracking ref', async () => {
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: 'tracking-head',
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return 'tracking-head'
      }

      return 'local-head'
    })
    mockGit.findMergeBase.mockResolvedValueOnce(['local-head'])

    const result = await pullJournalUpdates(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
      {
        collectDirtyPathsAfterSync: false,
      },
    )

    expect(mockGit.fetch).not.toHaveBeenCalled()
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.writeRef).toHaveBeenCalledWith(expect.objectContaining({
      ref: 'refs/heads/main',
      value: 'tracking-head',
    }))
    expect(result.fetchResult).toBeNull()
    expect(result.mergeResult).toEqual({
      fastForward: true,
      oid: 'tracking-head',
    })
  })

  it('refreshes the remote tracking ref and retries missing tracking object merge errors', async () => {
    const runtime = createRuntime()
    const trace = vi.fn()
    const missingOid = 'e650e6dd7d12eb3a9bc09c38b49f8b5bee477fd8'

    runtime.trace = trace
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: missingOid,
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return missingOid
      }

      return 'local-head'
    })
    mockGit.findMergeBase
      .mockRejectedValueOnce(createMissingGitObjectError(missingOid))
      .mockResolvedValueOnce(['local-head'])

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

    const eventNames = trace.mock.calls.map(([event]) => event.name)
    const mergeErrorEvent = trace.mock.calls
      .map(([event]) => event)
      .find((event) => event.name === 'remote.merge' && !event.ok)

    expect(eventNames).toEqual(expect.arrayContaining([
      'remote.merge',
      'remote.mergeRepair',
      'remote.mergeRetry',
    ]))
    expect(mergeErrorEvent).toEqual(expect.objectContaining({
      details: expect.objectContaining({
        errorCode: 'NotFoundError',
        errorName: 'NotFoundError',
        remoteTrackingOid: 'e650e6dd7d12',
      }),
      errorMessage: `Could not find ${missingOid}.`,
      ok: false,
    }))
    expect(mockGit.deleteRef).toHaveBeenCalledWith(expect.objectContaining({
      ref: 'refs/remotes/origin/main',
    }))
    expect(mockGit.fetch).toHaveBeenCalledTimes(1)
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.findMergeBase).toHaveBeenCalledTimes(2)
    expect(result.mergeResult).toEqual({
      fastForward: true,
      oid: missingOid,
    })
  })

  it('rebuilds a missing pack index and retries missing-object merge errors before refetching', async () => {
    const runtime = createRuntime()
    const trace = vi.fn()
    const missingOid = 'e650e6dd7d12eb3a9bc09c38b49f8b5bee477fd8'
    const orphanPack = 'pack-627da082662bae2836c5b9646e732c27dd57c49a.pack'

    runtime.trace = trace
    mockFs.promises.readdir.mockResolvedValueOnce([orphanPack])
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: missingOid,
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return missingOid
      }

      return 'local-head'
    })
    mockGit.indexPack.mockResolvedValueOnce({
      oids: [missingOid],
    })
    mockGit.findMergeBase
      .mockRejectedValueOnce(createMissingGitObjectError(missingOid))
      .mockResolvedValueOnce(['local-head'])

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

    const eventNames = trace.mock.calls.map(([event]) => event.name)

    expect(eventNames).toEqual(expect.arrayContaining([
      'remote.fetchSkipped',
      'remote.merge',
      'remote.mergePackIndexRepair',
      'remote.mergeRepair',
      'remote.mergeRetry',
    ]))
    expect(eventNames).not.toContain('remote.refetchAfterMergeError')
    expect(eventNames).not.toContain('remote.clearTrackingRef')
    expect(mockGit.indexPack).toHaveBeenCalledWith(expect.objectContaining({
      filepath: `.git/objects/pack/${orphanPack}`,
    }))
    expect(mockGit.deleteRef).not.toHaveBeenCalled()
    expect(mockGit.fetch).not.toHaveBeenCalled()
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.findMergeBase).toHaveBeenCalledTimes(2)
    expect(trace.mock.calls).toContainEqual([
      expect.objectContaining({
        details: expect.objectContaining({
          indexedPacks: 1,
          refetched: false,
          restoredFromPack: true,
        }),
        name: 'remote.mergeRepair',
        ok: true,
      }),
    ])
    expect(result.mergeResult).toEqual({
      fastForward: true,
      oid: missingOid,
    })
  })

  it('throttles repeated merge repair refetches for the same missing tracking object', async () => {
    const runtime = createRuntime()
    const trace = vi.fn()
    const missingOid = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

    runtime.trace = trace
    mockGit.listServerRefs.mockResolvedValue([
      {
        oid: missingOid,
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return missingOid
      }

      return 'local-head'
    })
    mockGit.findMergeBase
      .mockRejectedValueOnce(createMissingGitObjectError(missingOid))
      .mockRejectedValueOnce(createMissingGitObjectError(missingOid))
      .mockResolvedValueOnce(['base-head'])
      .mockRejectedValueOnce(createMissingGitObjectError(missingOid))

    await expect(pullJournalUpdates(
      runtime,
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
      {
        collectDirtyPathsAfterSync: false,
      },
    )).rejects.toMatchObject({
      block: {
        reason: 'object-store-corrupt',
      },
      code: 'JournalSyncBlockedError',
    })

    await expect(pullJournalUpdates(
      runtime,
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
      {
        collectDirtyPathsAfterSync: false,
      },
    )).rejects.toMatchObject({
      block: {
        reason: 'object-store-corrupt',
      },
      code: 'JournalSyncBlockedError',
    })

    const eventNames = trace.mock.calls.map(([event]) => event.name)

    expect(mockGit.fetch).toHaveBeenCalledTimes(1)
    expect(eventNames).toContain('remote.mergeRefetchThrottled')
    expect(trace.mock.calls).toContainEqual([
      expect.objectContaining({
        details: expect.objectContaining({
          remoteTrackingOid: missingOid.slice(0, 12),
        }),
        name: 'remote.mergeRefetchThrottled',
        ok: false,
      }),
    ])
  })

  it('stops before committing or pushing unrelated local and remote histories', async () => {
    const runtime = createRuntime()
    const trace = vi.fn()

    runtime.trace = trace
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: 'tracking-head',
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return 'tracking-head'
      }

      return 'local-head'
    })
    mockGit.findMergeBase.mockResolvedValueOnce([])

    await expect(pullJournalUpdates(
      runtime,
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
      {
        collectDirtyPathsAfterSync: false,
      },
    )).rejects.toMatchObject({
      block: {
        reason: 'unrelated-histories',
      },
      code: 'JournalSyncBlockedError',
    })

    expect(mockGit.findMergeBase).toHaveBeenCalledWith(expect.objectContaining({
      dir: '/journal',
      oids: ['local-head', 'tracking-head'],
    }))
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.commit).not.toHaveBeenCalled()
    expect(mockGit.push).not.toHaveBeenCalled()
  })

  it('skips pull dirty scans when the remote branch is unchanged and dirty collection is disabled', async () => {
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: 'tracking-head',
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/heads/main' || ref === 'refs/remotes/origin/main') {
        return 'tracking-head'
      }

      return 'local-head'
    })

    const result = await pullJournalUpdates(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
      {
        collectDirtyPathsAfterSync: false,
      },
    )

    expect(mockGit.fetch).not.toHaveBeenCalled()
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.statusMatrix).not.toHaveBeenCalled()
    expect(result.dirtyPathsAfterPull).toEqual([])
    expect(result.updatedWorktree).toBe(false)
  })

  it('rebuilds a missing pack index and retries merge without refetching when it restores the tracking object', async () => {
    const runtime = createRuntime()
    const trace = vi.fn()
    const missingOid = 'e650e6dd7d12eb3a9bc09c38b49f8b5bee477fd8'
    const orphanPack = 'pack-627da082662bae2836c5b9646e732c27dd57c49a.pack'
    let missingOidReadAttempts = 0

    runtime.trace = trace
    mockFs.promises.readdir.mockResolvedValueOnce([orphanPack])
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: missingOid,
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return missingOid
      }

      return 'local-head'
    })
    mockGit.readCommit.mockImplementation(async ({ oid }: { oid: string }) => {
      if (oid === missingOid && missingOidReadAttempts++ === 0) {
        throw createMissingGitObjectError(missingOid)
      }

      return {
        commit: {
          author: {},
          committer: {},
          message: '',
          parent: [],
          tree: `tree-${oid}`,
        },
        oid,
        payload: '',
      }
    })
    mockGit.indexPack.mockResolvedValueOnce({
      oids: [missingOid],
    })
    mockGit.findMergeBase.mockResolvedValueOnce(['local-head'])

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

    const eventNames = trace.mock.calls.map(([event]) => event.name)

    expect(eventNames).toEqual(expect.arrayContaining([
      'remote.packIndexRepair',
      'remote.merge',
    ]))
    expect(eventNames).not.toContain('remote.fetchSkipped')
    expect(eventNames).not.toContain('remote.fetchRepair')
    expect(eventNames).not.toContain('remote.clearTrackingRef')
    expect(eventNames).not.toContain('remote.refetchAfterMergeError')
    expect(eventNames).not.toContain('remote.mergeRepair')
    expect(mockGit.indexPack).toHaveBeenCalledWith(expect.objectContaining({
      filepath: `.git/objects/pack/${orphanPack}`,
    }))
    expect(mockGit.deleteRef).not.toHaveBeenCalled()
    expect(mockGit.fetch).not.toHaveBeenCalled()
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(result.fetchResult).toBeNull()
    expect(result.mergeResult).toEqual({
      fastForward: true,
      oid: missingOid,
    })
  })

  it('uses the journal domain merge after pack repair without refetching', async () => {
    const runtime = createRuntime()
    const trace = vi.fn()
    const remoteOid = 'e650e6dd7d12eb3a9bc09c38b49f8b5bee477fd8'
    const localOid = '4360f2e165a37a6eb7d743951dec7233d459e810'
    const baseOid = '5e908dc7e96fe7a347b6dbe80cd0ec0d2d0c57ed'
    const orphanPack = 'pack-627da082662bae2836c5b9646e732c27dd57c49a.pack'
    let remoteReadAttempts = 0
    let writeTreeCount = 0

    runtime.trace = trace
    mockFs.promises.readdir
      .mockResolvedValueOnce([orphanPack])
      .mockResolvedValue([])
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: remoteOid,
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return remoteOid
      }

      if (ref === 'refs/heads/main' || ref === 'HEAD') {
        return localOid
      }

      return localOid
    })
    mockGit.readCommit.mockImplementation(async ({ oid }: { oid: string }) => {
      if (oid === remoteOid && remoteReadAttempts++ === 0) {
        throw createMissingGitObjectError(remoteOid)
      }

      return {
        commit: {
          author: {},
          committer: {},
          message: '',
          parent: [],
          tree: `tree-${oid}`,
        },
        oid,
        payload: '',
      }
    })
    mockGit.indexPack.mockResolvedValueOnce({
      oids: [remoteOid],
    })
    mockGit.findMergeBase.mockResolvedValue([baseOid])
    mockGit.readBlob.mockResolvedValue({
      blob: new Uint8Array(),
      oid: 'blob',
    })
    mockGit.writeBlob.mockResolvedValue('merged-blob')
    mockGit.writeTree.mockImplementation(async () => {
      writeTreeCount += 1

      return `manual-tree-${writeTreeCount}`
    })
    mockGit.writeCommit.mockResolvedValue('manual-merge-head')
    mockManualMergeTreeWalk(
      {
        [baseOid]: {},
        [localOid]: {
          'reviews/2026/06/2026-06-16.json': {
            oid: 'local-review',
          },
        },
        [remoteOid]: {
          'entries/2026/06/2026-06-16.md': {
            oid: 'remote-entry',
          },
          'reviews/weekly/2026-W24.md': {
            oid: 'remote-weekly',
          },
        },
      },
      [
        'entries/2026/06/2026-06-16.md',
        'reviews/2026/06/2026-06-16.json',
        'reviews/weekly/2026-W24.md',
      ],
    )

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

    const eventNames = trace.mock.calls.map(([event]) => event.name)

    expect(eventNames).toEqual(expect.arrayContaining([
      'remote.packIndexRepair',
      'remote.merge',
    ]))
    expect(eventNames).not.toContain('remote.fetch')
    expect(eventNames).not.toContain('remote.fetchRepair')
    expect(eventNames).not.toContain('remote.clearTrackingRef')
    expect(eventNames).not.toContain('remote.refetchAfterMergeError')
    expect(mockGit.indexPack).toHaveBeenCalledWith(expect.objectContaining({
      filepath: `.git/objects/pack/${orphanPack}`,
    }))
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.writeCommit).toHaveBeenCalledWith(expect.objectContaining({
      commit: expect.objectContaining({
        parent: [localOid, remoteOid],
        tree: 'manual-tree-8',
      }),
    }))
    expect(mockGit.writeRef).toHaveBeenCalledWith(expect.objectContaining({
      ref: 'refs/heads/main',
      value: 'manual-merge-head',
    }))
    expect(mockGit.deleteRef).not.toHaveBeenCalled()
    expect(mockGit.fetch).not.toHaveBeenCalled()
    expect(result.mergeCommitOid).toBe('manual-merge-head')
    expect(result.mergeResult).toEqual({
      mergeCommit: true,
      oid: 'manual-merge-head',
      tree: 'manual-tree-8',
    })
    expect(result.updatedWorktree).toBe(true)
  })

  it('uses the remote version for non-journal repository paths during domain merge', async () => {
    const runtime = createRuntime()
    const trace = vi.fn()

    runtime.trace = trace
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: 'remote-head',
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return 'remote-head'
      }

      return 'local-head'
    })
    mockGit.findMergeBase.mockResolvedValueOnce(['base-head'])
    mockManualMergeTreeWalk(
      {
        'base-head': {
          'README.md': {
            oid: 'base-readme',
          },
        },
        'local-head': {
          'README.md': {
            oid: 'local-readme',
          },
        },
        'remote-head': {
          'README.md': {
            oid: 'remote-readme',
          },
        },
      },
      ['README.md'],
    )

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

    expect(mockGit.writeTree).toHaveBeenCalledWith(expect.objectContaining({
      tree: expect.arrayContaining([
        expect.objectContaining({
          oid: 'remote-readme',
          path: 'README.md',
        }),
      ]),
    }))
    expect(mockGit.checkout).toHaveBeenCalledWith(expect.objectContaining({
      filepaths: ['README.md'],
    }))
    expect(trace.mock.calls).toContainEqual([
      expect.objectContaining({
        details: expect.objectContaining({
          nonJournalRemoteWins: 1,
          result: 'mergeCommit',
        }),
        name: 'remote.merge',
        ok: true,
      }),
    ])
    expect(result.mergeCommitOid).toBe('merge-head')
    expect(result.updatedWorktree).toBe(true)
  })

  it('uses the remote media object instead of text-merging binary journal paths', async () => {
    const mediaPath = 'media/2026/06/photo.jpg'

    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: 'remote-head',
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return 'remote-head'
      }

      return 'local-head'
    })
    mockGit.findMergeBase.mockResolvedValueOnce(['base-head'])
    mockManualMergeTreeWalk(
      {
        'base-head': {
          [mediaPath]: {
            oid: 'base-image',
          },
        },
        'local-head': {
          [mediaPath]: {
            oid: 'local-image',
          },
        },
        'remote-head': {
          [mediaPath]: {
            oid: 'remote-image',
          },
        },
      },
      [mediaPath],
    )

    const result = await pullJournalUpdates(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
      {
        collectDirtyPathsAfterSync: false,
      },
    )

    const writeTreeCalls = mockGit.writeTree.mock.calls.map(([input]) => input)

    expect(mockGit.readBlob).not.toHaveBeenCalled()
    expect(mockGit.writeBlob).not.toHaveBeenCalled()
    expect(writeTreeCalls).toContainEqual(expect.objectContaining({
      tree: expect.arrayContaining([
        expect.objectContaining({
          oid: 'remote-image',
          path: 'photo.jpg',
        }),
      ]),
    }))
    expect(result.mergeCommitOid).toBe('merge-head')
  })

  it('refetches when the remote tracking ref matches the server but pack index repair cannot restore it', async () => {
    const runtime = createRuntime()
    const trace = vi.fn()
    const missingOid = 'e650e6dd7d12eb3a9bc09c38b49f8b5bee477fd8'

    runtime.trace = trace
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: missingOid,
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return missingOid
      }

      return 'local-head'
    })
    mockGit.readCommit.mockImplementation(async ({ oid }: { oid: string }) => {
      if (oid === missingOid) {
        throw createMissingGitObjectError(missingOid)
      }

      return {
        commit: {
          author: {},
          committer: {},
          message: '',
          parent: [],
          tree: `tree-${oid}`,
        },
        oid,
        payload: '',
      }
    })
    mockGit.findMergeBase.mockResolvedValueOnce(['local-head'])

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

    const eventNames = trace.mock.calls.map(([event]) => event.name)

    expect(eventNames).toEqual(expect.arrayContaining([
      'remote.packIndexRepair',
      'remote.fetchRepair',
      'remote.clearTrackingRef',
      'remote.fetch',
    ]))
    expect(eventNames).not.toContain('remote.fetchSkipped')
    expect(mockGit.indexPack).not.toHaveBeenCalled()
    expect(mockGit.deleteRef).toHaveBeenCalledWith(expect.objectContaining({
      ref: 'refs/remotes/origin/main',
    }))
    expect(mockGit.fetch).toHaveBeenCalledTimes(1)
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(result.fetchResult).toEqual({
      fetchHead: 'remote-head',
    })
    expect(result.mergeResult).toEqual({
      fastForward: true,
      oid: missingOid,
    })
  })

  it('treats a successful push result carried by GitPushError as success', async () => {
    const pushResult = {
      error: null,
      ok: true,
      refs: {
        main: {
          error: '',
          ok: true,
        },
      },
    }

    mockGit.statusMatrix
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 0],
      ])
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 2],
      ])
      .mockResolvedValue([])
    mockGit.push.mockRejectedValueOnce(Object.assign(new Error('cannot lock ref'), {
      code: 'GitPushError',
      data: {
        result: pushResult,
      },
    }))

    const result = await pushJournalChanges(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
    )

    expect(mockGit.fetch).not.toHaveBeenCalled()
    expect(mockGit.push).toHaveBeenCalledTimes(1)
    expect(result.pushResult).toEqual(pushResult)
    expect(result.retriedPush).toBe(false)
  })

  it('refreshes the worktree after merging remote updates', async () => {
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: 'remote-head',
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return 'remote-head'
      }

      return 'local-head'
    })
    mockGit.findMergeBase.mockResolvedValueOnce(['local-head'])
    mockGit.walk.mockResolvedValueOnce(['entries/2026/06/2026-06-08.md'])

    await pullJournalUpdates(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
    )

    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.writeRef).toHaveBeenCalledWith(expect.objectContaining({
      ref: 'refs/heads/main',
      value: 'remote-head',
    }))
    expect(mockGit.checkout).toHaveBeenCalledWith(expect.objectContaining({
      filepaths: ['entries/2026/06/2026-06-08.md'],
      force: true,
      ref: 'refs/heads/main',
    }))
    expect(mockGit.listFiles).not.toHaveBeenCalled()
    expect(mockGit.readObject).not.toHaveBeenCalled()
  })

  it('skips the pre-merge dirty scan when the caller has already gated local edits', async () => {
    const runtime = createRuntime()
    const trace = vi.fn()

    runtime.trace = trace
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: 'remote-head',
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return 'remote-head'
      }

      return 'local-head'
    })
    mockGit.findMergeBase.mockResolvedValueOnce(['local-head'])
    mockGit.walk.mockResolvedValueOnce(['entries/2026/06/2026-06-08.md'])

    const result = await pullJournalUpdates(
      runtime,
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
      {
        collectDirtyPathsAfterSync: false,
        skipDirtyCheckBeforeMerge: true,
      },
    )

    expect(mockGit.statusMatrix).not.toHaveBeenCalled()
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.checkout).toHaveBeenCalledWith(expect.objectContaining({
      filepaths: ['entries/2026/06/2026-06-08.md'],
      force: true,
      ref: 'refs/heads/main',
    }))
    expect(result.updatedWorktree).toBe(true)
    expect(trace.mock.calls).toContainEqual([
      expect.objectContaining({
        details: expect.objectContaining({
          reason: 'assume-clean-worktree',
          skipped: true,
        }),
        name: 'pull.postFetchDirtyStatus',
        ok: true,
      }),
    ])
  })

  it('trusts an empty known changed path set without scanning or pushing', async () => {
    const runtime = createRuntime()
    const trace = vi.fn()

    runtime.trace = trace
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: 'tracking-head',
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/heads/main' || ref === 'refs/remotes/origin/main') {
        return 'tracking-head'
      }

      return 'local-head'
    })

    const result = await syncJournalNow(
      runtime,
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
      {
        changedPaths: [],
        collectDirtyPathsAfterSync: false,
        skipDirtyCheckBeforeMerge: true,
      },
    )

    expect(mockGit.statusMatrix).not.toHaveBeenCalled()
    expect(mockGit.fetch).not.toHaveBeenCalled()
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.push).not.toHaveBeenCalled()
    expect(result.localCommitOid).toBeNull()
    expect(result.dirtyPathsAfterSync).toEqual([])
    expect(trace.mock.calls).toContainEqual([
      expect.objectContaining({
        details: expect.objectContaining({
          knownPaths: 0,
          skipped: true,
          trusted: true,
        }),
        name: 'commit.status',
        ok: true,
      }),
    ])
    expect(trace.mock.calls).toContainEqual([
      expect.objectContaining({
        details: expect.objectContaining({
          skipped: true,
        }),
        name: 'sync.dirtyPathsAfterSync',
        ok: true,
      }),
    ])
  })

  it('does not checkout after a fast-forward pull when tracked journal files did not change', async () => {
    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: 'remote-head',
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return 'remote-head'
      }

      return 'local-head'
    })
    mockGit.statusMatrix
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    mockGit.findMergeBase.mockResolvedValueOnce(['local-head'])
    mockGit.walk.mockResolvedValueOnce([])

    const result = await pullJournalUpdates(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
    )

    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.checkout).not.toHaveBeenCalled()
    expect(mockGit.add).not.toHaveBeenCalled()
    expect(mockGit.commit).not.toHaveBeenCalled()
    expect(mockGit.listFiles).not.toHaveBeenCalled()
    expect(mockGit.readObject).not.toHaveBeenCalled()
    expect(result.mergeCommitOid).toBeNull()
    expect(result.updatedWorktree).toBe(false)
  })

  it('uses the merge commit after a non-fast-forward merge without committing worktree changes', async () => {
    const path = 'entries/2026/06/2026-06-08.md'

    mockGit.listServerRefs.mockResolvedValueOnce([
      {
        oid: 'remote-head',
        ref: 'refs/heads/main',
      },
    ])
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return 'remote-head'
      }

      return 'local-head'
    })
    mockGit.statusMatrix.mockResolvedValueOnce([])
    mockGit.findMergeBase.mockResolvedValueOnce(['base-head'])
    mockManualMergeTreeWalk(
      {
        'base-head': {},
        'local-head': {},
        'remote-head': {
          [path]: {
            oid: 'remote-entry',
          },
        },
      },
      [path],
    )

    const result = await pullJournalUpdates(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
    )

    expect(mockGit.add).not.toHaveBeenCalled()
    expect(mockGit.commit).not.toHaveBeenCalled()
    expect(mockGit.checkout).toHaveBeenCalledWith(expect.objectContaining({
      filepaths: [path],
      force: true,
      ref: 'refs/heads/main',
    }))
    expect(result.mergeCommitOid).toBe('merge-head')
  })

  it('emits trace events for full sync phases', async () => {
    const runtime = createRuntime()
    const trace = vi.fn()

    runtime.trace = trace
    mockGit.statusMatrix
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 0],
      ])
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 2],
      ])
      .mockResolvedValue([])

    await syncJournalNow(
      runtime,
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
    )

    const eventNames = trace.mock.calls.map(([event]) => event.name)

    expect(eventNames).toEqual(expect.arrayContaining([
      'commit.status',
      'commit.stage',
      'commit.write',
      'remote.fetch',
      'remote.merge',
      'remote.push',
      'merge.strategy',
      'sync.total',
    ]))
    expect(trace).toHaveBeenCalledWith(expect.objectContaining({
      durationMs: expect.any(Number),
      name: 'sync.total',
      ok: true,
    }))
  })

  it('allows the first push when an empty remote cannot be fetched yet', async () => {
    mockGit.statusMatrix
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 0],
      ])
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 2],
      ])
      .mockResolvedValue([])
    mockGit.fetch.mockRejectedValueOnce(Object.assign(new Error('empty remote'), {
      code: 'EmptyServerResponseError',
    }))

    const result = await syncJournalNow(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/empty-journal-sync.git',
      },
      credentials,
    )

    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.push).toHaveBeenCalledTimes(1)
    expect(result.fetchResult).toBeNull()
    expect(result.mergeResult).toBeNull()
  })

  it('creates and checks out the local branch from remote when the local repository has no commits yet', async () => {
    mockGit.resolveRef.mockRejectedValueOnce(Object.assign(new Error('no local branch'), {
      code: 'NotFoundError',
    }))

    const result = await pullJournalUpdates(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/existing-journal-sync.git',
      },
      credentials,
    )

    expect(mockGit.branch).toHaveBeenCalledWith(expect.objectContaining({
      checkout: false,
      object: 'refs/remotes/origin/main',
      ref: 'main',
    }))
    expect(mockGit.setConfig).toHaveBeenCalledWith(expect.objectContaining({
      path: 'branch.main.remote',
      value: 'origin',
    }))
    expect(mockGit.setConfig).toHaveBeenCalledWith(expect.objectContaining({
      path: 'branch.main.merge',
      value: 'refs/heads/main',
    }))
    expect(mockGit.checkout).toHaveBeenCalledWith(expect.objectContaining({
      filepaths: ['annotations', 'entries', 'manifest.json', 'media', 'reviews'],
      force: true,
      ref: 'refs/heads/main',
    }))
    expect(result.updatedWorktree).toBe(true)
  })

  it('removes stale short branch refs and reattaches detached HEAD at the same commit', async () => {
    mockGit.currentBranch.mockResolvedValue(null)
    mockFs.promises.readFile.mockResolvedValue('local-head\n')

    await initJournalGitSyncRepository(createRuntime(), {
      branch: 'main',
      remoteUrl: 'https://github.com/example/journal-sync.git',
    })

    expect(mockFs.promises.unlink).toHaveBeenCalledWith('/journal/.git/main')
    expect(mockGit.writeRef).toHaveBeenCalledWith(expect.objectContaining({
      force: true,
      ref: 'HEAD',
      symbolic: true,
      value: 'refs/heads/main',
    }))
  })

  it('does not force checkout remote files over uncommitted local journal content', async () => {
    mockGit.resolveRef.mockRejectedValueOnce(Object.assign(new Error('no local branch'), {
      code: 'NotFoundError',
    }))
    mockGit.statusMatrix
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 0],
      ])
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 0],
      ])

    const result = await pullJournalUpdates(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/existing-journal-sync.git',
      },
      credentials,
    )

    expect(mockGit.checkout).not.toHaveBeenCalled()
    expect(result.updatedWorktree).toBe(false)
    expect(result.dirtyPathsAfterPull).toEqual([
      'entries/2026/06/2026-06-08.md',
    ])
  })

  it('does not merge remote updates over uncommitted local journal content', async () => {
    mockGit.statusMatrix.mockResolvedValue([
      ['entries/2026/06/2026-06-08.md', 1, 2, 1],
    ])

    const result = await pullJournalUpdates(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/existing-journal-sync.git',
      },
      credentials,
    )

    expect(mockGit.fetch).toHaveBeenCalledTimes(1)
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.checkout).not.toHaveBeenCalled()
    expect(result.updatedWorktree).toBe(false)
    expect(result.dirtyPathsAfterPull).toEqual([
      'entries/2026/06/2026-06-08.md',
    ])
  })

  it('returns pre-merge dirty paths when pull post-scan collection is disabled', async () => {
    mockGit.statusMatrix.mockResolvedValueOnce([
      ['entries/2026/06/2026-06-08.md', 1, 2, 1],
    ])

    const result = await pullJournalUpdates(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/existing-journal-sync.git',
      },
      credentials,
      {
        collectDirtyPathsAfterSync: false,
      },
    )

    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.checkout).not.toHaveBeenCalled()
    expect(mockGit.statusMatrix).toHaveBeenCalledTimes(1)
    expect(result.updatedWorktree).toBe(false)
    expect(result.dirtyPathsAfterPull).toEqual([
      'entries/2026/06/2026-06-08.md',
    ])
  })

  it('stops the first local push when local content would create an unrelated history', async () => {
    const runtime = createRuntime()
    const entryPath = 'entries/2026/06/2026-06-08.md'
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/heads/main') {
        throw Object.assign(new Error('missing local branch'), {
          code: 'NotFoundError',
        })
      }

      return 'local-head'
    })
    await expect(pushJournalChanges(
      runtime,
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/existing-journal-sync.git',
      },
      credentials,
      {
        changedPaths: [entryPath],
        collectDirtyPathsAfterSync: false,
      },
    )).rejects.toThrow('首次同步前本地已有日记内容')

    expect(mockGit.commit).not.toHaveBeenCalled()
    expect(mockGit.push).not.toHaveBeenCalled()
  })

  it('stops the first full sync when local content would create an unrelated history', async () => {
    const runtime = createRuntime()
    const entryPath = 'entries/2026/06/2026-06-08.md'

    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/heads/main') {
        throw Object.assign(new Error('missing local branch'), {
          code: 'NotFoundError',
        })
      }

      return 'local-head'
    })
    await expect(syncJournalNow(
      runtime,
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/existing-journal-sync.git',
      },
      credentials,
      {
        changedPaths: [entryPath],
        collectDirtyPathsAfterSync: false,
      },
    )).rejects.toThrow('首次同步前本地已有日记内容')

    expect(mockGit.commit).not.toHaveBeenCalled()
    expect(mockGit.push).not.toHaveBeenCalled()
  })

  it('does not treat empty known changed paths as empty local content before the first commit', async () => {
    const runtime = createRuntime()
    const entryPath = 'entries/2026/06/2026-06-08.md'

    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/heads/main') {
        throw Object.assign(new Error('missing local branch'), {
          code: 'NotFoundError',
        })
      }

      return 'local-head'
    })
    mockGit.statusMatrix.mockResolvedValueOnce([
      [entryPath, 0, 2, 0],
    ])

    await expect(syncJournalNow(
      runtime,
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/existing-journal-sync.git',
      },
      credentials,
      {
        changedPaths: [],
        collectDirtyPathsAfterSync: false,
        skipDirtyCheckBeforeMerge: true,
      },
    )).rejects.toMatchObject({
      block: {
        paths: [entryPath],
        reason: 'first-sync-needs-choice',
      },
      code: 'JournalSyncBlockedError',
    })

    expect(mockGit.statusMatrix).toHaveBeenCalledWith(expect.objectContaining({
      filepaths: ['annotations', 'entries', 'media', 'reviews', 'manifest.json'],
    }))
    expect(mockGit.statusMatrix).not.toHaveBeenCalledWith(expect.objectContaining({
      filepaths: [],
    }))
    expect(mockGit.commit).not.toHaveBeenCalled()
    expect(mockGit.push).not.toHaveBeenCalled()
  })

  it('allows first sync to skip the direction choice when local content is explicitly empty', async () => {
    const runtime = createRuntime()

    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/heads/main') {
        throw Object.assign(new Error('missing local branch'), {
          code: 'NotFoundError',
        })
      }

      return 'remote-head'
    })

    const result = await pushJournalChanges(
      runtime,
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/existing-journal-sync.git',
      },
      credentials,
      {
        changedPaths: [],
        collectDirtyPathsAfterSync: false,
        firstSyncLocalContent: 'empty',
      },
    )

    expect(result).toMatchObject({
      dirtyPathsAfterPush: [],
      localCommitOid: null,
      pushResult: null,
      retriedPush: false,
    })
    expect(mockGit.statusMatrix).not.toHaveBeenCalled()
    expect(mockGit.commit).not.toHaveBeenCalled()
    expect(mockGit.push).not.toHaveBeenCalled()
  })

  it('pushes committed local changes without fetching first', async () => {
    let localHead = 'local-head'

    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/heads/main') {
        return localHead
      }

      return 'remote-head'
    })
    mockGit.commit.mockImplementationOnce(async () => {
      localHead = 'commit-oid'

      return 'commit-oid'
    })
    mockGit.statusMatrix
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 0],
      ])
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 2],
      ])
      .mockResolvedValue([])

    const result = await pushJournalChanges(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
    )

    expect(mockGit.fetch).not.toHaveBeenCalled()
    expect(mockGit.push).toHaveBeenCalledTimes(1)
    expect(mockGit.push).toHaveBeenCalledWith(expect.objectContaining({
      ref: 'refs/heads/main',
      remoteRef: 'refs/heads/main',
    }))
    expect(mockGit.writeRef).toHaveBeenCalledWith(expect.objectContaining({
      force: true,
      ref: 'refs/remotes/origin/main',
      value: 'commit-oid',
    }))
    expect(result.localCommitOid).toBe('commit-oid')
  })
})
