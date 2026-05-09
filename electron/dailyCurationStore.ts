import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DailyCuration } from '../src/domain/dailyCuration'

const DAILY_CURATION_DIRECTORY = path.join('curations', 'daily')

export type StoredDailyCuration = {
  curation: DailyCuration
  filePath: string
}

export async function loadDailyCuration(
  journalDirectory: string,
  date: unknown,
): Promise<StoredDailyCuration | null> {
  const curationPath = getDailyCurationPath(journalDirectory, date)
  const content = await readFile(curationPath.filePath, 'utf8').catch((error: unknown) => {
    if (isNodeError(error, 'ENOENT')) {
      return null
    }

    throw error
  })

  if (!content) {
    return null
  }

  const curation = normalizeDailyCuration(JSON.parse(content), curationPath.date)

  return {
    curation,
    filePath: curationPath.filePath,
  }
}

export async function saveDailyCuration(
  journalDirectory: string,
  payload: unknown,
): Promise<StoredDailyCuration> {
  const curation = normalizeDailyCuration(payload)
  const curationPath = getDailyCurationPath(journalDirectory, curation.curationDate)

  await mkdir(curationPath.directory, { recursive: true })

  const temporaryPath = `${curationPath.filePath}.${Date.now()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(curation, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, curationPath.filePath)

  return {
    curation,
    filePath: curationPath.filePath,
  }
}

function getDailyCurationPath(journalDirectory: string, date: unknown) {
  assertDateKey(date)

  const directory = path.join(journalDirectory, DAILY_CURATION_DIRECTORY)

  return {
    date,
    directory,
    filePath: path.join(directory, `${date}.json`),
  }
}

function normalizeDailyCuration(value: unknown, expectedDate?: string): DailyCuration {
  if (!isRecord(value)) {
    throw new TypeError('Daily curation must be an object.')
  }

  if (value.version !== 5) {
    throw new TypeError('Daily curation version is not supported.')
  }

  if (typeof value.curationDate !== 'string') {
    throw new TypeError('Daily curation must include curationDate.')
  }

  assertDateKey(value.curationDate)

  if (expectedDate && value.curationDate !== expectedDate) {
    throw new TypeError('Daily curation date does not match the requested date.')
  }

  return value as DailyCuration
}

function assertDateKey(date: unknown): asserts date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError('Daily curation date must use YYYY-MM-DD format.')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNodeError(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code
}
