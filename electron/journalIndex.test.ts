import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listJournalIndex } from './journalIndex'

const temporaryDirectories: string[] = []

async function createTemporaryJournalDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'journal-index-'))

  temporaryDirectories.push(directory)

  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('journal index', () => {
  it('lists non-empty journal files newest first with searchable curation metadata', async () => {
    const directory = await createTemporaryJournalDirectory()

    await writeFile(path.join(directory, '2026-04-23.md'), `---
date: 2026-04-23
---

`, 'utf8')
    await writeFile(path.join(directory, '2026-04-24.md'), `---
date: 2026-04-24
title: 雨夜和台灯
excerpt: 窗外下雨，桌面很安静。
tags: [雨, 夜晚]
favorite: true
collections: [雨天]
---

# 今天

长日记正文。

:::murmur
id: m_20260424_213800
time: 2026-04-24T21:38:00+08:00
---
窗外下雨了。

::image
id: img_20260424_213801
src: 2026-04-24.media/rain.jpg
caption: 雨打在窗户上
tags: [窗户, 夜晚]
::
:::
`, 'utf8')
    await writeFile(path.join(directory, '2026-04-25.md'), `---
date: 2026-04-25
tags: [灯]
---

只有一点灯光。
`, 'utf8')

    const index = await listJournalIndex(directory)

    expect(index.map((entry) => entry.date)).toEqual(['2026-04-25', '2026-04-24'])
    expect(index[1]).toMatchObject({
      collections: ['雨天'],
      favorite: true,
      images: [
        {
          caption: '雨打在窗户上',
          id: 'img_20260424_213801',
          murmurId: 'm_20260424_213800',
          src: '2026-04-24.media/rain.jpg',
          tags: ['窗户', '夜晚'],
        },
      ],
      murmurs: [
        {
          excerpt: '窗外下雨了。',
          id: 'm_20260424_213800',
          imageCount: 1,
          time: '2026-04-24T21:38:00+08:00',
        },
      ],
      stats: {
        imageCount: 1,
        murmurCount: 1,
        wordCount: 12,
      },
      tags: ['雨', '夜晚'],
      title: '雨夜和台灯',
    })
    expect(index[1].searchableText).toContain('雨夜和台灯')
    expect(index[1].searchableText).toContain('长日记正文。')
    expect(index[1].searchableText).toContain('窗户')
    expect(index[0].tags).toEqual(['灯'])

    const indexFile = JSON.parse(await readFile(path.join(directory, 'index', 'journal-index.json'), 'utf8'))

    expect(indexFile.version).toBe(1)
    expect(typeof indexFile.generatedAt).toBe('string')
    expect(indexFile.entries.map((entry: { date: string }) => entry.date)).toEqual(['2026-04-25', '2026-04-24'])
  })

  it('writes an empty index when the journal directory does not exist', async () => {
    const parentDirectory = await createTemporaryJournalDirectory()
    const directory = path.join(parentDirectory, 'missing')

    await expect(listJournalIndex(directory)).resolves.toEqual([])
    await expect(readFile(path.join(directory, 'index', 'journal-index.json'), 'utf8')).resolves.toContain(
      '"entries": []',
    )
  })
})
