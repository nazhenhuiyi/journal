import type { FsClient, HttpClient } from 'isomorphic-git'
import * as git from 'isomorphic-git'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertSafeRemoteUrl,
  commitJournalChanges,
  createJournalGitAuthenticatedHttpClient,
  createJournalGitAuthHeaders,
  getJournalGitSyncStatus,
  initJournalGitSyncRepository,
  pullJournalUpdates,
  pushJournalChanges,
  syncJournalNow,
  type JournalGitRuntime,
} from './gitCore'

const mockFs = {
  promises: {
    readFile: vi.fn(),
    stat: vi.fn(),
    unlink: vi.fn(),
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
  fetch: vi.fn(),
  getConfig: vi.fn(),
  init: vi.fn(),
  merge: vi.fn(),
  push: vi.fn(),
  readCommit: vi.fn(),
  remove: vi.fn(),
  resolveRef: vi.fn(),
  setConfig: vi.fn(),
  statusMatrix: vi.fn(),
  writeRef: vi.fn(),
}
const credentials = {
  token: 'github-token',
}

function createRuntime(): JournalGitRuntime {
  return {
    dir: '/journal',
    fs: mockFs as unknown as FsClient,
    git: mockGit as unknown as typeof git,
    http: { request: vi.fn() } as unknown as HttpClient,
  }
}

describe('journal git sync core', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockFs.promises.stat.mockResolvedValue({})
    mockFs.promises.readFile.mockRejectedValue(Object.assign(new Error('missing'), {
      code: 'ENOENT',
    }))
    mockFs.promises.unlink.mockResolvedValue(undefined)
    mockGit.add.mockResolvedValue(undefined)
    mockGit.addRemote.mockResolvedValue(undefined)
    mockGit.branch.mockResolvedValue(undefined)
    mockGit.checkout.mockResolvedValue(undefined)
    mockGit.clone.mockResolvedValue(undefined)
    mockGit.commit.mockResolvedValue('commit-oid')
    mockGit.currentBranch.mockResolvedValue('main')
    mockGit.fetch.mockResolvedValue({
      fetchHead: 'remote-head',
    })
    mockGit.getConfig.mockResolvedValue('https://github.com/example/journal-sync.git')
    mockGit.init.mockResolvedValue(undefined)
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
    mockGit.remove.mockResolvedValue(undefined)
    mockGit.resolveRef.mockResolvedValue('local-head')
    mockGit.setConfig.mockResolvedValue(undefined)
    mockGit.statusMatrix.mockResolvedValue([])
    mockGit.writeRef.mockResolvedValue(undefined)
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

  it('does not commit when no tracked journal file changed', async () => {
    mockGit.statusMatrix.mockResolvedValue([
      ['settings.json', 1, 2, 1],
    ])

    const commitOid = await commitJournalChanges(createRuntime(), {
      branch: 'main',
    })

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
    ])

    const status = await getJournalGitSyncStatus(createRuntime(), {
      branch: 'main',
    })

    expect(status.dirtyPaths).toEqual([
      'entries/2026/06/2026-06-09.md',
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

    const commitOid = await commitJournalChanges(createRuntime(), {
      branch: 'main',
    })

    expect(mockGit.add).toHaveBeenCalledTimes(1)
    expect(mockGit.add).toHaveBeenCalledWith(expect.objectContaining({
      filepath: 'entries/2026/06/2026-06-09.md',
    }))
    expect(mockGit.add).not.toHaveBeenCalledWith(expect.objectContaining({
      filepath: 'entries/2026/06/2026-06-09.md.91423.tmp',
    }))
    expect(commitOid).toBe('commit-oid')
  })

  it('stages deleted tracked journal files with git remove', async () => {
    mockGit.statusMatrix
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 1, 0, 1],
      ])
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 1, 0, 0],
      ])

    const commitOid = await commitJournalChanges(createRuntime(), {
      branch: 'main',
    })

    expect(mockGit.remove).toHaveBeenCalledWith(expect.objectContaining({
      filepath: 'entries/2026/06/2026-06-08.md',
    }))
    expect(mockGit.add).not.toHaveBeenCalled()
    expect(commitOid).toBe('commit-oid')
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

    const commitOid = await commitJournalChanges(createRuntime(), {
      branch: 'main',
    })

    expect(commitOid).toBeNull()
    expect(mockGit.writeRef).toHaveBeenCalledWith(expect.objectContaining({
      force: true,
      ref: 'refs/heads/main',
      value: 'local-head',
    }))
  })

  it('fetches, merges, and retries once when push is rejected by remote updates', async () => {
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
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
    )

    expect(mockGit.fetch).toHaveBeenCalledTimes(2)
    expect(mockGit.merge).toHaveBeenCalledTimes(2)
    expect(mockGit.push).toHaveBeenCalledTimes(2)
    expect(mockGit.push).toHaveBeenCalledWith(expect.objectContaining({
      force: false,
    }))
    expect(result.retriedPush).toBe(true)
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
    await pullJournalUpdates(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
    )

    expect(mockGit.merge).toHaveBeenCalledWith(expect.objectContaining({
      ours: 'refs/heads/main',
      theirs: 'refs/remotes/origin/main',
    }))
    expect(mockGit.checkout).toHaveBeenCalledWith(expect.objectContaining({
      force: true,
      ref: 'refs/heads/main',
    }))
  })

  it('does not commit stale worktree contents after a fast-forward pull', async () => {
    mockGit.statusMatrix
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    mockGit.merge.mockResolvedValueOnce({
      fastForward: true,
      oid: 'remote-head',
    })

    const result = await pullJournalUpdates(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
    )

    expect(mockGit.merge).toHaveBeenCalledTimes(1)
    expect(mockGit.checkout).toHaveBeenCalledWith(expect.objectContaining({
      force: true,
      ref: 'refs/heads/main',
    }))
    expect(mockGit.add).not.toHaveBeenCalled()
    expect(mockGit.commit).not.toHaveBeenCalled()
    expect(result.mergeCommitOid).toBeNull()
    expect(result.updatedWorktree).toBe(true)
  })

  it('commits resolved journal changes after a non-fast-forward merge', async () => {
    mockGit.statusMatrix
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 1, 2, 1],
      ])
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 1, 2, 2],
      ])
      .mockResolvedValueOnce([])
    mockGit.merge.mockResolvedValueOnce({
      fastForward: false,
      oid: 'merge-head',
    })

    const result = await pullJournalUpdates(
      createRuntime(),
      {
        branch: 'main',
        remoteUrl: 'https://github.com/example/journal-sync.git',
      },
      credentials,
    )

    expect(mockGit.add).toHaveBeenCalledWith(expect.objectContaining({
      filepath: 'entries/2026/06/2026-06-08.md',
    }))
    expect(mockGit.commit).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Resolve journal sync conflicts',
      ref: 'refs/heads/main',
    }))
    expect(result.mergeCommitOid).toBe('commit-oid')
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
      checkout: true,
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

  it('pushes committed local changes without fetching first', async () => {
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
    expect(result.localCommitOid).toBe('commit-oid')
  })
})
