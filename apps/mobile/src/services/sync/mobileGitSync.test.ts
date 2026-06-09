import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  initMobileGitSyncRepository,
  pullMobileJournalUpdatesFromGitHub,
  pushMobileJournalChangesToGitHub,
  syncMobileJournalWithGitHub,
} from './mobileGitSync'

const { mockExpoFetch, mockFileSystem, mockFs, mockGit } = vi.hoisted(() => ({
  mockExpoFetch: vi.fn(),
  mockFileSystem: {
    EncodingType: {
      Base64: 'base64',
      UTF8: 'utf8',
    },
    getInfoAsync: vi.fn(),
    makeDirectoryAsync: vi.fn(),
    readAsStringAsync: vi.fn(),
    readDirectoryAsync: vi.fn(),
    writeAsStringAsync: vi.fn(),
  },
  mockFs: {
    promises: {
      stat: vi.fn(),
    },
  },
  mockGit: {
    add: vi.fn(),
    addRemote: vi.fn(),
    branch: vi.fn(),
    checkout: vi.fn(),
    commit: vi.fn(),
    currentBranch: vi.fn(),
    fetch: vi.fn(),
    getConfig: vi.fn(),
    init: vi.fn(),
    listFiles: vi.fn(),
    listServerRefs: vi.fn(),
    log: vi.fn(),
    merge: vi.fn(),
    push: vi.fn(),
    readObject: vi.fn(),
    remove: vi.fn(),
    resolveRef: vi.fn(),
    setConfig: vi.fn(),
    statusMatrix: vi.fn(),
    TREE: vi.fn(),
    walk: vi.fn(),
    writeRef: vi.fn(),
  },
}))

vi.mock('isomorphic-git', () => mockGit)
vi.mock('isomorphic-git/http/web', () => ({
  default: {
    request: vi.fn(),
  },
}))
vi.mock('expo/fetch', () => ({
  fetch: mockExpoFetch,
}))
vi.mock('expo-file-system/legacy', () => mockFileSystem)
vi.mock('../mobileJournalStore', () => ({
  ensureJournalWorktreeDirectory: vi.fn(() => Promise.resolve('/mobile/worktree/')),
}))
vi.mock('./expoGitFileSystem', () => ({
  createExpoGitFileSystem: vi.fn(() => mockFs),
}))
vi.mock('./secureSyncCredentials', () => ({
  loadGitHubSyncCredentials: vi.fn(() => Promise.resolve({
    token: 'stored-token',
  })),
}))

describe('mobile git sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockFs.promises.stat.mockResolvedValue({})
    mockGit.add.mockResolvedValue(undefined)
    mockGit.addRemote.mockResolvedValue(undefined)
    mockGit.branch.mockResolvedValue(undefined)
    mockGit.checkout.mockResolvedValue(undefined)
    mockGit.commit.mockResolvedValue('commit-oid')
    mockGit.currentBranch.mockResolvedValue('main')
    mockGit.fetch.mockResolvedValue({
      fetchHead: 'remote-head',
    })
    mockGit.getConfig.mockResolvedValue('https://github.com/example/journal-sync.git')
    mockGit.init.mockResolvedValue(undefined)
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
          message: 'Mobile sync',
        },
        oid: '1111111111111111111111111111111111111111',
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
    mockGit.readObject.mockImplementation(async ({ filepath, oid }: { filepath: string, oid: string }) => ({
      format: 'content',
      object: new Uint8Array(),
      oid: `${oid}:${filepath}`,
      source: oid,
    }))
    mockGit.remove.mockResolvedValue(undefined)
    mockGit.resolveRef.mockResolvedValue('local-head')
    mockGit.setConfig.mockResolvedValue(undefined)
    mockGit.statusMatrix.mockResolvedValue([])
    mockGit.TREE.mockImplementation(({ ref }: { ref: string }) => ({ ref }))
    mockGit.walk.mockResolvedValue([])
    mockGit.writeRef.mockResolvedValue(undefined)
    mockExpoFetch.mockResolvedValue(new Response('', {
      headers: {
        'content-type': 'application/x-git-upload-pack-advertisement',
      },
      status: 200,
    }))
  })

  it('initializes a local sync repo and stores the configured remote', async () => {
    mockFs.promises.stat.mockRejectedValueOnce(Object.assign(new Error('missing'), {
      code: 'ENOENT',
    }))

    const status = await initMobileGitSyncRepository({
      branch: 'main',
      remoteUrl: 'https://github.com/example/journal-sync.git',
    })

    expect(mockGit.init).toHaveBeenCalledWith(expect.objectContaining({
      defaultBranch: 'main',
      dir: '/mobile/worktree/',
      fs: mockFs,
    }))
    expect(mockGit.addRemote).toHaveBeenCalledWith(expect.objectContaining({
      remote: 'origin',
      url: 'https://github.com/example/journal-sync.git',
    }))
    expect(mockGit.setConfig).toHaveBeenCalledWith(expect.objectContaining({
      path: 'user.name',
      value: 'Journal Mobile',
    }))
    expect(status.hasRepository).toBe(true)
    expect(status.recentCommits).toEqual([
      expect.objectContaining({
        message: 'Mobile sync',
        shortOid: '1111111',
      }),
    ])
  })

  it('commits tracked journal changes, fetches, merges, and pushes', async () => {
    mockGit.statusMatrix
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 0],
      ])
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 2],
      ])
      .mockResolvedValue([])

    const result = await syncMobileJournalWithGitHub({
      branch: 'main',
      remoteUrl: 'https://github.com/example/journal-sync.git',
    }, {
      token: 'runtime-token',
    })

    expect(mockGit.add).toHaveBeenCalledWith(expect.objectContaining({
      filepath: 'entries/2026/06/2026-06-08.md',
    }))
    expect(mockGit.commit).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Sync journal changes',
      ref: 'refs/heads/main',
    }))
    expect(mockGit.fetch).toHaveBeenCalledWith(expect.objectContaining({
      ref: 'main',
      remote: 'origin',
      singleBranch: true,
    }))
    expect(mockGit.merge).toHaveBeenCalledWith(expect.objectContaining({
      ours: 'refs/heads/main',
      theirs: 'refs/remotes/origin/main',
    }))
    expect(mockGit.push).toHaveBeenCalledWith(expect.objectContaining({
      ref: 'refs/heads/main',
      remote: 'origin',
      remoteRef: 'refs/heads/main',
    }))
    expect(result.localCommitOid).toBe('commit-oid')
    expect(result.retriedPush).toBe(false)
  })

  it('passes known changed paths through to the sync core', async () => {
    mockGit.statusMatrix.mockResolvedValueOnce([
      ['entries/2026/06/2026-06-08.md', 0, 2, 0],
    ])

    await syncMobileJournalWithGitHub({
      branch: 'main',
      remoteUrl: 'https://github.com/example/journal-sync.git',
    }, {
      token: 'runtime-token',
    }, {
      changedPaths: ['entries/2026/06/2026-06-08.md'],
      collectDirtyPathsAfterSync: false,
    })

    expect(mockGit.statusMatrix).toHaveBeenCalledTimes(1)
    expect(mockGit.statusMatrix).toHaveBeenCalledWith(expect.objectContaining({
      filepaths: ['entries/2026/06/2026-06-08.md'],
    }))
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

    const result = await pushMobileJournalChangesToGitHub({
      branch: 'main',
      remoteUrl: 'https://github.com/example/journal-sync.git',
    }, {
      token: 'runtime-token',
    })

    expect(mockGit.fetch).not.toHaveBeenCalled()
    expect(mockGit.push).toHaveBeenCalledTimes(1)
    expect(result.localCommitOid).toBe('commit-oid')
  })

  it('pulls remote updates without pushing', async () => {
    mockGit.walk.mockResolvedValueOnce(['entries/2026/06/2026-06-08.md'])

    const result = await pullMobileJournalUpdatesFromGitHub({
      branch: 'main',
      remoteUrl: 'https://github.com/example/journal-sync.git',
    }, {
      token: 'runtime-token',
    })

    expect(mockGit.fetch).toHaveBeenCalledTimes(1)
    expect(mockGit.merge).toHaveBeenCalledTimes(1)
    expect(mockGit.checkout).toHaveBeenCalledWith(expect.objectContaining({
      filepaths: ['entries/2026/06/2026-06-08.md'],
    }))
    expect(mockGit.push).not.toHaveBeenCalled()
    expect(result.updatedWorktree).toBe(true)
  })

  it('preemptively adds authorization to mobile Git HTTP requests', async () => {
    mockGit.fetch.mockImplementationOnce(async ({ http }) => {
      await http.request({
        headers: {
          accept: 'application/x-git-upload-pack-advertisement',
        },
        method: 'GET',
        url: 'https://github.com/example/journal-sync.git/info/refs?service=git-upload-pack',
      })

      return {
        fetchHead: 'remote-head',
      }
    })

    await pullMobileJournalUpdatesFromGitHub({
      branch: 'main',
      remoteUrl: 'https://github.com/example/journal-sync.git',
    }, {
      token: 'runtime-token',
    })

    expect(mockExpoFetch).toHaveBeenCalledWith(
      'https://github.com/example/journal-sync.git/info/refs?service=git-upload-pack',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
          accept: 'application/x-git-upload-pack-advertisement',
        }),
        method: 'GET',
      }),
    )
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
    mockGit.resolveRef
      .mockRejectedValueOnce(Object.assign(new Error('no local branch'), {
        code: 'NotFoundError',
      }))
      .mockResolvedValueOnce('local-head')
    mockGit.fetch.mockRejectedValueOnce(Object.assign(new Error('empty remote'), {
      code: 'EmptyServerResponseError',
    }))

    const result = await syncMobileJournalWithGitHub({
      branch: 'main',
      remoteUrl: 'https://github.com/example/empty-journal-sync.git',
    }, {
      token: 'runtime-token',
    })

    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.push).toHaveBeenCalledTimes(1)
    expect(result.fetchResult).toBeNull()
    expect(result.mergeResult).toBeNull()
  })

  it('does not push when both the local repo and empty remote have no commits', async () => {
    mockGit.resolveRef.mockRejectedValue(Object.assign(new Error('no local branch'), {
      code: 'NotFoundError',
    }))
    mockGit.fetch.mockRejectedValueOnce(Object.assign(new Error('empty remote'), {
      code: 'EmptyServerResponseError',
    }))

    const result = await syncMobileJournalWithGitHub({
      branch: 'main',
      remoteUrl: 'https://github.com/example/empty-journal-sync.git',
    }, {
      token: 'runtime-token',
    })

    expect(mockGit.push).not.toHaveBeenCalled()
    expect(result.localCommitOid).toBeNull()
    expect(result.pushResult).toBeNull()
  })

  it('creates and checks out the local branch from remote when the local repo has no commits yet', async () => {
    mockGit.resolveRef.mockRejectedValueOnce(Object.assign(new Error('no local branch'), {
      code: 'NotFoundError',
    }))

    await syncMobileJournalWithGitHub({
      branch: 'main',
      remoteUrl: 'https://github.com/example/existing-journal-sync.git',
    }, {
      token: 'runtime-token',
    })

    expect(mockGit.branch).toHaveBeenCalledWith(expect.objectContaining({
      checkout: false,
      object: 'refs/remotes/origin/main',
      ref: 'main',
    }))
    expect(mockGit.checkout).toHaveBeenCalledWith(expect.objectContaining({
      filepaths: ['annotations', 'entries', 'manifest.json', 'media'],
      force: true,
      ref: 'refs/heads/main',
    }))
    expect(mockGit.merge).not.toHaveBeenCalled()
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

    const result = await syncMobileJournalWithGitHub({
      branch: 'main',
      remoteUrl: 'https://github.com/example/journal-sync.git',
    }, {
      token: 'runtime-token',
    })

    expect(mockGit.fetch).toHaveBeenCalledTimes(2)
    expect(mockGit.merge).toHaveBeenCalledTimes(2)
    expect(mockGit.push).toHaveBeenCalledTimes(2)
    expect(result.retriedPush).toBe(true)
  })
})
