import { Buffer } from 'buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createExpoGitFileSystem } from './expoGitFileSystem'

const mockModernFileSystem = vi.hoisted(() => {
  const state = {
    fileBytes: vi.fn(),
    fileText: vi.fn(),
    fileWrite: vi.fn(),
  }

  class MockFile {
    readonly uri: string

    constructor(path: string) {
      this.uri = path
    }

    async bytes() {
      return state.fileBytes(this.uri)
    }

    async text() {
      return state.fileText(this.uri)
    }

    write(content: string | Uint8Array, options?: { encoding?: string }) {
      return options
        ? state.fileWrite(this.uri, content, options)
        : state.fileWrite(this.uri, content)
    }
  }

  return {
    File: MockFile,
    state,
  }
})

const mockLegacyFileSystem = vi.hoisted(() => ({
  EncodingType: {
    Base64: 'base64',
    UTF8: 'utf8',
  },
  deleteAsync: vi.fn(),
  getInfoAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  readDirectoryAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
}))

vi.mock('expo-file-system', () => mockModernFileSystem)
vi.mock('expo-file-system/legacy', () => mockLegacyFileSystem)

type TestFs = ReturnType<typeof createExpoGitFileSystem> & {
  promises: {
    lstat: (path: string) => Promise<{
      isDirectory: () => boolean
      isFile: () => boolean
      mode: number
      mtimeMs: number
      size: number
    }>
    mkdir: (path: string) => Promise<void>
    readFile: (path: string, options?: string | { encoding?: string }) => Promise<Buffer | string>
    readlink: (path: string) => Promise<never>
    readdir: (path: string) => Promise<string[]>
    rmdir: (path: string) => Promise<void>
    stat: (path: string) => Promise<{
      isDirectory: () => boolean
      isFile: () => boolean
      mode: number
      mtimeMs: number
      size: number
    }>
    symlink: (target: string, path: string) => Promise<never>
    unlink: (path: string) => Promise<void>
    writeFile: (path: string, data: string | Uint8Array, options?: string | { encoding?: string }) => Promise<void>
  }
}

describe('createExpoGitFileSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLegacyFileSystem.getInfoAsync.mockResolvedValue({
      exists: true,
      isDirectory: true,
      modificationTime: 1700000000,
      size: 0,
      uri: '/repo',
    })
    mockLegacyFileSystem.readAsStringAsync.mockResolvedValue('')
    mockLegacyFileSystem.readDirectoryAsync.mockResolvedValue([])
    mockLegacyFileSystem.writeAsStringAsync.mockResolvedValue(undefined)
    mockModernFileSystem.state.fileBytes.mockResolvedValue(new Uint8Array())
    mockModernFileSystem.state.fileText.mockResolvedValue('')
  })

  it('provides the promise methods that isomorphic-git binds during setup', () => {
    const fs = createTestFileSystem()
    const requiredMethods = [
      'lstat',
      'mkdir',
      'readFile',
      'readdir',
      'readlink',
      'rmdir',
      'stat',
      'symlink',
      'unlink',
      'writeFile',
    ] as const

    for (const method of requiredMethods) {
      expect(fs.promises[method]).toEqual(expect.any(Function))
    }
  })

  it('reads binary files as Buffer values through the modern bytes API', async () => {
    const fs = createTestFileSystem()
    const binary = new Uint8Array([0, 1, 254, 255])

    mockModernFileSystem.state.fileBytes.mockResolvedValue(binary)

    const result = await fs.promises.readFile('/repo/.git/index')

    expect(Buffer.isBuffer(result)).toBe(true)
    expect((result as Buffer).equals(Buffer.from(binary))).toBe(true)
    expect(mockModernFileSystem.state.fileBytes).toHaveBeenCalledWith('/repo/.git/index')
  })

  it('falls back to legacy base64 reads when the modern bytes API throws at runtime', async () => {
    const fs = createTestFileSystem()
    const binary = Buffer.from([1, 2, 3])

    mockModernFileSystem.state.fileBytes.mockRejectedValue(new Error('native bridge failed'))
    mockLegacyFileSystem.readAsStringAsync.mockResolvedValue(binary.toString('base64'))

    const result = await fs.promises.readFile('/repo/.git/index')

    expect((result as Buffer).equals(binary)).toBe(true)
    expect(mockLegacyFileSystem.readAsStringAsync).toHaveBeenCalledWith('/repo/.git/index', {
      encoding: 'base64',
    })
  })

  it('reads UTF-8 files as strings when encoding is requested', async () => {
    const fs = createTestFileSystem()

    mockModernFileSystem.state.fileText.mockResolvedValue('hello')

    await expect(fs.promises.readFile('/repo/README.md', 'utf8')).resolves.toBe('hello')
    expect(mockModernFileSystem.state.fileText).toHaveBeenCalledWith('/repo/README.md')
  })

  it('writes Uint8Array values through the modern write API without base64 conversion', async () => {
    const fs = createTestFileSystem()
    const binary = new Uint8Array([1, 2, 3])

    await fs.promises.writeFile('/repo/.git/objects/blob', binary)

    expect(mockModernFileSystem.state.fileWrite).toHaveBeenCalledWith('/repo/.git/objects/blob', binary)
    expect(mockLegacyFileSystem.writeAsStringAsync).not.toHaveBeenCalled()
  })

  it('falls back to legacy base64 writes when modern Uint8Array writes fail at runtime', async () => {
    const fs = createTestFileSystem()

    mockModernFileSystem.state.fileWrite.mockRejectedValueOnce(new Error('native bridge failed'))

    await fs.promises.writeFile('/repo/.git/objects/blob', new Uint8Array([1, 2, 3]))

    expect(mockLegacyFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      '/repo/.git/objects/blob',
      Buffer.from([1, 2, 3]).toString('base64'),
      { encoding: 'base64' },
    )
  })

  it('preserves already-base64 binary strings through the modern write API', async () => {
    const fs = createTestFileSystem()

    await fs.promises.writeFile('/repo/.git/objects/blob', 'AQID', 'base64')

    expect(mockModernFileSystem.state.fileWrite).toHaveBeenCalledWith(
      '/repo/.git/objects/blob',
      'AQID',
      { encoding: 'base64' },
    )
    expect(mockLegacyFileSystem.writeAsStringAsync).not.toHaveBeenCalled()
  })

  it('falls back to legacy base64 writes when modern base64 string writes fail at runtime', async () => {
    const fs = createTestFileSystem()

    mockModernFileSystem.state.fileWrite.mockRejectedValueOnce(new Error('native bridge failed'))

    await fs.promises.writeFile('/repo/.git/objects/blob', 'AQID', 'base64')

    expect(mockLegacyFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      '/repo/.git/objects/blob',
      'AQID',
      { encoding: 'base64' },
    )
  })

  it('creates a missing parent directory before writing Git object files', async () => {
    const fs = createTestFileSystem()

    mockLegacyFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: false,
      isDirectory: false,
      uri: '/repo/.git/objects/78',
    })

    await fs.promises.writeFile('/repo/.git/objects/78/blob', new Uint8Array([1, 2, 3]))

    expect(mockLegacyFileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
      '/repo/.git/objects/78',
      { intermediates: true },
    )
    expect(mockModernFileSystem.state.fileWrite).toHaveBeenCalledWith(
      '/repo/.git/objects/78/blob',
      new Uint8Array([1, 2, 3]),
    )
  })

  it('caches existing parent directories between writes in the same filesystem instance', async () => {
    const fs = createTestFileSystem()

    mockLegacyFileSystem.getInfoAsync.mockResolvedValue({
      exists: true,
      isDirectory: true,
      modificationTime: 1700000000,
      size: 0,
      uri: '/repo/.git/objects/78',
    })

    await fs.promises.writeFile('/repo/.git/objects/78/blob-a', new Uint8Array([1]))
    await fs.promises.writeFile('/repo/.git/objects/78/blob-b', new Uint8Array([2]))

    expect(mockLegacyFileSystem.getInfoAsync).toHaveBeenCalledTimes(1)
    expect(mockLegacyFileSystem.getInfoAsync).toHaveBeenCalledWith('/repo/.git/objects/78')
    expect(mockLegacyFileSystem.makeDirectoryAsync).not.toHaveBeenCalled()
  })

  it('caches newly created parent directories between object writes', async () => {
    const fs = createTestFileSystem()

    mockLegacyFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: false,
      isDirectory: false,
      uri: '/repo/.git/objects/9a',
    })

    await fs.promises.writeFile('/repo/.git/objects/9a/blob-a', new Uint8Array([1]))
    await fs.promises.writeFile('/repo/.git/objects/9a/blob-b', new Uint8Array([2]))

    expect(mockLegacyFileSystem.getInfoAsync).toHaveBeenCalledTimes(1)
    expect(mockLegacyFileSystem.makeDirectoryAsync).toHaveBeenCalledTimes(1)
    expect(mockLegacyFileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
      '/repo/.git/objects/9a',
      { intermediates: true },
    )
  })

  it('rechecks a parent directory after the cached directory is removed', async () => {
    const fs = createTestFileSystem()

    mockLegacyFileSystem.getInfoAsync
      .mockResolvedValueOnce({
        exists: false,
        isDirectory: false,
        uri: '/repo/.git/objects/9b',
      })
      .mockResolvedValue({
        exists: true,
        isDirectory: true,
        modificationTime: 1700000000,
        size: 0,
        uri: '/repo/.git/objects/9b',
      })

    await fs.promises.mkdir('/repo/.git/objects/9b')
    await fs.promises.rmdir('/repo/.git/objects/9b')
    await fs.promises.writeFile('/repo/.git/objects/9b/blob', new Uint8Array([1]))

    expect(mockLegacyFileSystem.getInfoAsync).toHaveBeenCalledWith('/repo/.git/objects/9b')
    expect(mockLegacyFileSystem.getInfoAsync).toHaveBeenCalledTimes(3)
  })

  it('returns file and directory stat shims compatible with isomorphic-git', async () => {
    const fs = createTestFileSystem()

    mockLegacyFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: false,
      modificationTime: 1700000000,
      size: 12,
      uri: '/repo/entry.md',
    })
    mockLegacyFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: true,
      modificationTime: 1700000001,
      size: 0,
      uri: '/repo/entries',
    })

    const fileStat = await fs.promises.stat('/repo/entry.md')
    const directoryStat = await fs.promises.stat('/repo/entries')

    expect(fileStat.isFile()).toBe(true)
    expect(fileStat.isDirectory()).toBe(false)
    expect(fileStat.mode).toBe(0o100644)
    expect(fileStat.size).toBe(12)
    expect(directoryStat.isFile()).toBe(false)
    expect(directoryStat.isDirectory()).toBe(true)
    expect(directoryStat.mode).toBe(0o040755)
    expect(directoryStat.mtimeMs).toBe(1700000001000)
  })

  it('maps common filesystem error cases to Node-style error codes', async () => {
    const fs = createTestFileSystem()

    mockLegacyFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: false,
      isDirectory: false,
      uri: '/missing',
    })
    await expect(fs.promises.stat('/missing')).rejects.toMatchObject({
      code: 'ENOENT',
      path: '/missing',
    })

    mockLegacyFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: true,
      modificationTime: 1700000000,
      size: 0,
      uri: '/repo/entries',
    })
    await expect(fs.promises.unlink('/repo/entries')).rejects.toMatchObject({
      code: 'EISDIR',
      path: '/repo/entries',
    })

    mockLegacyFileSystem.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: true,
      modificationTime: 1700000000,
      size: 0,
      uri: '/repo',
    })
    mockLegacyFileSystem.readDirectoryAsync.mockResolvedValueOnce(['entries'])
    await expect(fs.promises.rmdir('/repo')).rejects.toMatchObject({
      code: 'ENOTEMPTY',
      path: '/repo',
    })
  })
})

function createTestFileSystem() {
  return createExpoGitFileSystem() as TestFs
}
