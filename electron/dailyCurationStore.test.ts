import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  loadDailyCuration,
  saveDailyCuration,
} from './dailyCurationStore'
import {
  createDailyCuration,
  type DailyCuration,
} from '../src/domain/dailyCuration'
import type { JournalIndexEntry } from '../src/domain/journalIndex/types'

let journalDirectory: string

beforeEach(async () => {
  journalDirectory = await mkdtemp(path.join(os.tmpdir(), 'journal-curation-'))
})

afterEach(async () => {
  await rm(journalDirectory, { force: true, recursive: true })
})

describe('dailyCurationStore', () => {
  it('stores one daily curation JSON file per date', async () => {
    const curation = createTestCuration()

    const saved = await saveDailyCuration(journalDirectory, curation)

    expect(saved.filePath).toBe(path.join(journalDirectory, 'curations', 'daily', '2026-05-09.json'))
    await expect(readFile(saved.filePath, 'utf8')).resolves.toContain('"curationDate": "2026-05-09"')
    await expect(loadDailyCuration(journalDirectory, '2026-05-09')).resolves.toMatchObject({
      curation: {
        curationDate: '2026-05-09',
        version: 5,
      },
      filePath: saved.filePath,
    })
  })

  it('rejects unsupported curation versions instead of silently migrating them', async () => {
    const curation = {
      ...createTestCuration(),
      version: 4,
    }

    await expect(saveDailyCuration(journalDirectory, curation)).rejects.toThrow('version is not supported')
  })
})

function createTestCuration(): DailyCuration {
  const entry: JournalIndexEntry = {
    collections: [],
    date: '2026-05-01',
    excerpt: '这一天从绘圈与 AI 的价格讨论，延伸到创造的意义。',
    favorite: false,
    fileName: '2026-05-01.md',
    filePath: '/Users/zilin/.journal/2026-05-01.md',
    images: [],
    murmurs: [],
    searchableText: '荒诞与创作 AI 应用灵感 创造',
    stats: { imageCount: 0, murmurCount: 0, wordCount: 24 },
    tags: ['AI', '创作'],
    title: '荒诞与创作',
    updatedAt: null,
  }
  const curation = createDailyCuration([entry], new Date('2026-05-09T12:00:00'))

  if (!curation) {
    throw new Error('Expected test curation to be created.')
  }

  return curation
}
