import { Buffer } from 'buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  initMobileGitSyncRepository,
  pullMobileJournalUpdatesFromGitHub,
  pushMobileJournalChangesToGitHub,
  syncMobileJournalWithGitHub,
} from './mobileGitSync'

const { mockExpoFetch, mockFileSystem, mockFs, mockGit, mockTrace } = vi.hoisted(() => ({
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
    findMergeBase: vi.fn(),
    getConfig: vi.fn(),
    init: vi.fn(),
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
  },
  mockTrace: vi.fn(),
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
    credentials: {
      token: 'stored-token',
    },
    status: 'available',
  })),
}))
vi.mock('./mobileSyncTrace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./mobileSyncTrace')>()

  return {
    ...actual,
    createMobileSyncTrace: vi.fn(() => mockTrace),
  }
})

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
    mockGit.findMergeBase.mockResolvedValue(['local-head'])
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
    mockGit.readCommit.mockImplementation(async ({ oid }: { oid: string }) => ({
      commit: {
        author: {},
        committer: {
          timestamp: 1_780_987_200,
        },
        message: 'Mobile sync',
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
      oid: 'blob-oid',
    })
    mockGit.remove.mockResolvedValue(undefined)
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => (
      ref === 'refs/remotes/origin/main' ? 'remote-head' : 'local-head'
    ))
    mockGit.setConfig.mockResolvedValue(undefined)
    mockGit.statusMatrix.mockResolvedValue([])
    mockGit.TREE.mockImplementation(({ ref }: { ref: string }) => ({ ref }))
    mockGit.walk.mockResolvedValue([])
    mockGit.writeBlob.mockResolvedValue('written-blob')
    mockGit.writeCommit.mockResolvedValue('merge-commit')
    mockGit.writeRef.mockResolvedValue(undefined)
    mockGit.writeTree.mockResolvedValue('written-tree')
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
    mockGit.resolveRef.mockResolvedValueOnce('1111111111111111111111111111111111111111')

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
      value: 'Journal Mobile Sync',
    }))
    expect(mockGit.setConfig).toHaveBeenCalledWith(expect.objectContaining({
      path: 'user.email',
      value: 'journal-mobile-sync@example.invalid',
    }))
    expect(status.hasRepository).toBe(true)
    expect(status.recentCommits).toEqual([
      expect.objectContaining({
        message: 'Mobile sync',
        shortOid: '1111111',
      }),
    ])
  })

  it('commits tracked journal changes, skips unchanged fetches, domain-merges, and pushes', async () => {
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
      message: 'Sync mobile journal changes',
      ref: 'refs/heads/main',
    }))
    expect(mockGit.fetch).not.toHaveBeenCalled()
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.findMergeBase).toHaveBeenCalledWith(expect.objectContaining({
      oids: ['local-head', 'remote-head'],
    }))
    expect(mockGit.writeRef).toHaveBeenCalledWith(expect.objectContaining({
      force: true,
      ref: 'refs/heads/main',
      value: 'remote-head',
    }))
    expect(mockGit.push).toHaveBeenCalledWith(expect.objectContaining({
      ref: 'refs/heads/main',
      remote: 'origin',
      remoteRef: 'refs/heads/main',
    }))
    const runtimeCache = mockGit.statusMatrix.mock.calls[0][0].cache

    expect(runtimeCache).toEqual(expect.any(Object))
    expect(mockGit.add.mock.calls[0][0].cache).toBe(runtimeCache)
    expect(mockGit.commit.mock.calls[0][0].cache).toBe(runtimeCache)
    expect(mockGit.push.mock.calls[0][0].cache).toBe(runtimeCache)
    expect(result.localCommitOid).toBe('commit-oid')
    expect(result.retriedPush).toBe(false)
  })

  it('passes known changed paths through to the sync core', async () => {
    await syncMobileJournalWithGitHub({
      branch: 'main',
      remoteUrl: 'https://github.com/example/journal-sync.git',
    }, {
      token: 'runtime-token',
    }, {
      changedPaths: ['entries/2026/06/2026-06-08.md'],
      collectDirtyPathsAfterSync: false,
    })

    expect(mockGit.statusMatrix).not.toHaveBeenCalled()
    expect(mockFs.promises.stat).toHaveBeenCalledWith('/mobile/worktree/entries/2026/06/2026-06-08.md')
    expect(mockGit.add).toHaveBeenCalledWith(expect.objectContaining({
      filepath: 'entries/2026/06/2026-06-08.md',
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

    expect(mockGit.fetch).not.toHaveBeenCalled()
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.findMergeBase).toHaveBeenCalledTimes(1)
    expect(mockGit.checkout).toHaveBeenCalledWith(expect.objectContaining({
      filepaths: ['entries/2026/06/2026-06-08.md'],
    }))
    expect(mockGit.push).not.toHaveBeenCalled()
    expect(result.updatedWorktree).toBe(true)
  })

  it('preemptively adds authorization to mobile Git HTTP requests', async () => {
    let didFetch = false

    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return didFetch ? 'remote-head' : 'stale-remote-head'
      }

      return 'local-head'
    })
    mockGit.fetch.mockImplementationOnce(async ({ http }) => {
      mockExpoFetch.mockResolvedValueOnce(new Response('git-response', {
        headers: {
          'content-type': 'application/x-git-upload-pack-advertisement',
        },
        status: 200,
      }))
      const response = await http.request({
        headers: {
          accept: 'application/x-git-upload-pack-advertisement',
        },
        method: 'GET',
        url: 'https://github.com/example/journal-sync.git/info/refs?service=git-upload-pack',
      })
      const firstChunk = await response.body.next()
      const secondChunk = await response.body.next()

      expect(firstChunk.done).toBe(false)
      expect(Buffer.from(firstChunk.value).toString('utf8')).toBe('git-response')
      expect(secondChunk.done).toBe(true)

      didFetch = true

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

  it('traces mobile Git HTTP body collection and fetch timing separately', async () => {
    let didFetch = false

    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return didFetch ? 'remote-head' : 'stale-remote-head'
      }

      return 'local-head'
    })
    mockGit.fetch.mockImplementationOnce(async ({ http }) => {
      mockExpoFetch.mockResolvedValueOnce(new Response('', {
        headers: {
          'content-type': 'application/x-git-upload-pack-result',
        },
        status: 200,
      }))

      await http.request({
        body: (async function* () {
          yield Buffer.from('git-body')
        })(),
        headers: {
          accept: 'application/x-git-upload-pack-result',
        },
        method: 'POST',
        url: 'https://github.com/example/journal-sync.git/git-upload-pack',
      })

      didFetch = true

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

    const fetchBody = mockExpoFetch.mock.calls[0]?.[1]?.body

    expect(fetchBody).toBeInstanceOf(ArrayBuffer)
    expect(Buffer.from(fetchBody as ArrayBuffer).toString('utf8')).toBe('git-body')
    expect(mockTrace).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        bodyBytes: 8,
        host: 'github.com',
        method: 'POST',
        service: 'git-upload-pack',
      }),
      name: 'http.gitRequestBody',
      ok: true,
    }))
    expect(mockTrace).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        host: 'github.com',
        method: 'POST',
        service: 'git-upload-pack',
        statusCode: 200,
      }),
      name: 'http.gitRequestFetch',
      ok: true,
    }))
    expect(mockTrace).toHaveBeenCalledWith(expect.objectContaining({
      name: 'http.gitRequest',
      ok: true,
    }))
  })

  it('streams mobile Git HTTP response bodies without calling arrayBuffer', async () => {
    let didFetch = false
    const arrayBuffer = vi.fn(async () => {
      throw new Error('arrayBuffer should not be called when response.body is available')
    })
    const read = vi.fn<() => Promise<ReadableStreamReadResult<Uint8Array>>>()
    const cancel = vi.fn(async () => undefined)
    const releaseLock = vi.fn()
    const responseBody = {
      getReader: vi.fn(() => ({
        cancel,
        read,
        releaseLock,
      })),
    } as unknown as ReadableStream<Uint8Array>

    read
      .mockResolvedValueOnce({
        done: false,
        value: Buffer.from('git-'),
      })
      .mockResolvedValueOnce({
        done: false,
        value: Buffer.from('response'),
      })
      .mockResolvedValueOnce({
        done: true,
        value: undefined,
      })

    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return didFetch ? 'remote-head' : 'stale-remote-head'
      }

      return 'local-head'
    })
    mockGit.fetch.mockImplementationOnce(async ({ http }) => {
      mockExpoFetch.mockResolvedValueOnce({
        arrayBuffer,
        body: responseBody,
        headers: new Headers({
          'content-type': 'application/x-git-upload-pack-result',
        }),
        status: 200,
        statusText: 'OK',
        url: 'https://github.com/example/journal-sync.git/git-upload-pack',
      })

      const response = await http.request({
        headers: {
          accept: 'application/x-git-upload-pack-result',
        },
        method: 'POST',
        url: 'https://github.com/example/journal-sync.git/git-upload-pack',
      })
      const chunks: Uint8Array[] = []

      expect(read).toHaveBeenCalledTimes(1)

      for await (const chunk of response.body) {
        chunks.push(chunk)
      }

      expect(Buffer.concat(chunks).toString('utf8')).toBe('git-response')
      expect(arrayBuffer).not.toHaveBeenCalled()
      expect(read).toHaveBeenCalledTimes(3)
      expect(releaseLock).toHaveBeenCalledOnce()

      didFetch = true

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
  })

  it('allows the first push when an empty remote cannot be fetched yet', async () => {
    mockGit.statusMatrix
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 0],
      ])
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
      .mockResolvedValue('local-head')
    mockGit.listServerRefs.mockResolvedValue([])
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
    let localBranchCreated = false

    mockGit.branch.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'main') {
        localBranchCreated = true
      }
    })
    mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) => {
      if (ref === 'refs/remotes/origin/main') {
        return 'remote-head'
      }

      if (ref === 'refs/heads/main' && !localBranchCreated) {
        throw Object.assign(new Error('no local branch'), {
          code: 'NotFoundError',
        })
      }

      return 'local-head'
    })

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
      filepaths: ['annotations', 'entries', 'manifest.json', 'media', 'reviews'],
      force: true,
      ref: 'refs/heads/main',
    }))
    expect(mockGit.merge).not.toHaveBeenCalled()
  })

  it('fetches, merges, and retries once when push is rejected by remote updates', async () => {
    mockGit.statusMatrix
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 0],
      ])
      .mockResolvedValueOnce([
        ['entries/2026/06/2026-06-08.md', 0, 2, 2],
      ])
      .mockResolvedValue([])
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

    expect(mockGit.fetch).toHaveBeenCalledTimes(1)
    expect(mockGit.merge).not.toHaveBeenCalled()
    expect(mockGit.findMergeBase).toHaveBeenCalledTimes(2)
    expect(mockGit.push).toHaveBeenCalledTimes(2)
    expect(result.retriedPush).toBe(true)
  })
})
