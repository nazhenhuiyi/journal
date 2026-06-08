import { Buffer } from 'buffer'
import * as FileSystem from 'expo-file-system/legacy'
import type { FsClient } from 'isomorphic-git'

type ExpoStats = {
  ctime: Date
  ctimeMs: number
  isDirectory: () => boolean
  isFile: () => boolean
  isSymbolicLink: () => boolean
  mode: number
  mtime: Date
  mtimeMs: number
  size: number
}

type ReadFileOptions = string | { encoding?: string | null } | null | undefined
type WriteFileOptions = string | { encoding?: string | null } | null | undefined

export function createExpoGitFileSystem(): FsClient {
  return {
    promises: {
      lstat: statPath,
      mkdir: mkdirPath,
      readFile,
      readlink,
      readdir,
      rmdir,
      stat: statPath,
      symlink,
      unlink,
      writeFile,
    },
  }
}

async function readFile(path: string, options?: ReadFileOptions) {
  const encoding = getEncoding(options)

  if (encoding === 'utf8' || encoding === 'utf-8') {
    return FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.UTF8,
    })
  }

  const contents = await FileSystem.readAsStringAsync(path, {
    encoding: FileSystem.EncodingType.Base64,
  })

  return Buffer.from(contents, 'base64')
}

async function writeFile(path: string, data: string | Uint8Array, options?: WriteFileOptions) {
  const encoding = getEncoding(options)

  await ensureParentDirectory(path)

  if (typeof data === 'string' && (!encoding || encoding === 'utf8' || encoding === 'utf-8')) {
    await FileSystem.writeAsStringAsync(path, data, {
      encoding: FileSystem.EncodingType.UTF8,
    })
    return
  }

  const buffer = typeof data === 'string'
    ? Buffer.from(data, encoding === 'base64' ? 'base64' : 'utf8')
    : Buffer.from(data)

  await FileSystem.writeAsStringAsync(path, buffer.toString('base64'), {
    encoding: FileSystem.EncodingType.Base64,
  })
}

async function ensureParentDirectory(path: string) {
  const parentPath = getParentPath(path)

  if (!parentPath) {
    return
  }

  const info = await FileSystem.getInfoAsync(parentPath)

  if (info.exists) {
    if (!info.isDirectory) {
      throw createFileSystemError('ENOTDIR', parentPath)
    }

    return
  }

  await FileSystem.makeDirectoryAsync(parentPath, { intermediates: true })
}

async function unlink(path: string) {
  const info = await getExistingInfo(path)

  if (info.isDirectory) {
    throw createFileSystemError('EISDIR', path)
  }

  await FileSystem.deleteAsync(path, { idempotent: false })
}

async function readdir(path: string) {
  const info = await getExistingInfo(path)

  if (!info.isDirectory) {
    throw createFileSystemError('ENOTDIR', path)
  }

  return FileSystem.readDirectoryAsync(path)
}

async function mkdirPath(path: string) {
  const info = await FileSystem.getInfoAsync(path)

  if (info.exists) {
    throw createFileSystemError('EEXIST', path)
  }

  await FileSystem.makeDirectoryAsync(path, { intermediates: false })
}

async function rmdir(path: string) {
  const info = await getExistingInfo(path)

  if (!info.isDirectory) {
    throw createFileSystemError('ENOTDIR', path)
  }

  const entries = await FileSystem.readDirectoryAsync(path)

  if (entries.length > 0) {
    throw createFileSystemError('ENOTEMPTY', path)
  }

  await FileSystem.deleteAsync(path, { idempotent: false })
}

async function readlink(path: string) {
  throw createFileSystemError('EINVAL', path)
}

async function symlink(_target: string, path: string) {
  throw createFileSystemError('ENOSYS', path)
}

async function statPath(path: string): Promise<ExpoStats> {
  const info = await getExistingInfo(path)
  const mtimeMs = info.modificationTime * 1000
  const timestamp = Number.isFinite(mtimeMs) ? mtimeMs : Date.now()
  const date = new Date(timestamp)

  return {
    ctime: date,
    ctimeMs: timestamp,
    isDirectory: () => info.isDirectory,
    isFile: () => !info.isDirectory,
    isSymbolicLink: () => false,
    mode: info.isDirectory ? 0o040755 : 0o100644,
    mtime: date,
    mtimeMs: timestamp,
    size: info.size,
  }
}

async function getExistingInfo(path: string) {
  const info = await FileSystem.getInfoAsync(path)

  if (!info.exists) {
    throw createFileSystemError('ENOENT', path)
  }

  return info
}

function getEncoding(options: ReadFileOptions | WriteFileOptions) {
  if (!options) {
    return undefined
  }

  if (typeof options === 'string') {
    return options.toLowerCase()
  }

  return options.encoding?.toLowerCase()
}

function getParentPath(path: string) {
  const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path
  const separatorIndex = normalizedPath.lastIndexOf('/')

  if (separatorIndex <= 0) {
    return null
  }

  return normalizedPath.slice(0, separatorIndex)
}

function createFileSystemError(code: string, path: string) {
  const error = new Error(`${code}: ${path}`) as Error & {
    code: string
    path: string
  }

  error.code = code
  error.path = path

  return error
}
