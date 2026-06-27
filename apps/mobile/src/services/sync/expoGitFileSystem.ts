import { Buffer } from 'buffer'
import { File } from 'expo-file-system'
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
  const knownDirectoryPaths = new Set<string>()

  return {
    promises: {
      lstat: statPath,
      mkdir: (path: string) => mkdirPath(path, knownDirectoryPaths),
      readFile,
      readlink,
      readdir,
      rmdir: (path: string) => rmdir(path, knownDirectoryPaths),
      stat: statPath,
      symlink,
      unlink,
      writeFile: (
        path: string,
        data: string | Uint8Array,
        options?: WriteFileOptions,
      ) => writeFile(path, data, options, knownDirectoryPaths),
    },
  }
}

async function readFile(path: string, options?: ReadFileOptions) {
  const encoding = getEncoding(options)
  const file = new File(path)

  if (encoding === 'utf8' || encoding === 'utf-8') {
    try {
      return await file.text()
    } catch {
      return FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.UTF8,
      })
    }
  }

  try {
    return Buffer.from(await file.bytes())
  } catch {
    const contents = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
    })

    return Buffer.from(contents, 'base64')
  }
}

async function writeFile(
  path: string,
  data: string | Uint8Array,
  options: WriteFileOptions,
  knownDirectoryPaths: Set<string>,
) {
  const encoding = getEncoding(options)
  const file = new File(path)

  await ensureParentDirectory(path, knownDirectoryPaths)

  if (typeof data === 'string' && (!encoding || encoding === 'utf8' || encoding === 'utf-8')) {
    try {
      await file.write(data)
    } catch {
      await FileSystem.writeAsStringAsync(path, data, {
        encoding: FileSystem.EncodingType.UTF8,
      })
    }
    return
  }

  if (typeof data !== 'string') {
    try {
      await file.write(data)
      return
    } catch {
      await writeLegacyBase64File(path, Buffer.from(data).toString('base64'))
      return
    }
  }

  const isBase64 = encoding === 'base64'

  try {
    await file.write(data, isBase64 ? { encoding: 'base64' } : undefined)
  } catch {
    await writeLegacyBase64File(
      path,
      isBase64 ? data : Buffer.from(data, 'utf8').toString('base64'),
    )
  }
}

async function writeLegacyBase64File(path: string, base64Contents: string) {
  await FileSystem.writeAsStringAsync(path, base64Contents, {
    encoding: FileSystem.EncodingType.Base64,
  })
}

async function ensureParentDirectory(path: string, knownDirectoryPaths: Set<string>) {
  const parentPath = getParentPath(path)

  if (!parentPath) {
    return
  }

  const normalizedParentPath = normalizeDirectoryPath(parentPath)

  if (knownDirectoryPaths.has(normalizedParentPath)) {
    return
  }

  const info = await FileSystem.getInfoAsync(parentPath)

  if (info.exists) {
    if (!info.isDirectory) {
      throw createFileSystemError('ENOTDIR', parentPath)
    }

    knownDirectoryPaths.add(normalizedParentPath)
    return
  }

  await FileSystem.makeDirectoryAsync(parentPath, { intermediates: true })
  knownDirectoryPaths.add(normalizedParentPath)
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

async function mkdirPath(path: string, knownDirectoryPaths: Set<string>) {
  const info = await FileSystem.getInfoAsync(path)

  if (info.exists) {
    throw createFileSystemError('EEXIST', path)
  }

  await FileSystem.makeDirectoryAsync(path, { intermediates: false })
  knownDirectoryPaths.add(normalizeDirectoryPath(path))
}

async function rmdir(path: string, knownDirectoryPaths: Set<string>) {
  const info = await getExistingInfo(path)

  if (!info.isDirectory) {
    throw createFileSystemError('ENOTDIR', path)
  }

  const entries = await FileSystem.readDirectoryAsync(path)

  if (entries.length > 0) {
    throw createFileSystemError('ENOTEMPTY', path)
  }

  await FileSystem.deleteAsync(path, { idempotent: false })
  removeKnownDirectoryPath(knownDirectoryPaths, path)
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
  const timestamp = typeof mtimeMs === 'number' && Number.isFinite(mtimeMs) ? mtimeMs : Date.now()
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

function removeKnownDirectoryPath(knownDirectoryPaths: Set<string>, path: string) {
  const normalizedPath = normalizeDirectoryPath(path)

  for (const knownPath of knownDirectoryPaths) {
    if (knownPath === normalizedPath || knownPath.startsWith(`${normalizedPath}/`)) {
      knownDirectoryPaths.delete(knownPath)
    }
  }
}

function normalizeDirectoryPath(path: string) {
  return path.endsWith('/') ? path.slice(0, -1) : path
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
