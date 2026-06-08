import { describe, expect, it } from 'vitest'
import { chooseLastWriteWinsContent } from './lastWriteWins'

describe('chooseLastWriteWinsContent', () => {
  it('chooses the journal markdown with the later updatedAt value', () => {
    const ours = [
      '---',
      'date: "2026-06-08"',
      'updatedAt: "2026-06-08T12:00:00.000Z"',
      '---',
      '',
      'ours',
    ].join('\n')
    const theirs = [
      '---',
      'date: "2026-06-08"',
      'updatedAt: "2026-06-08T12:30:00.000Z"',
      '---',
      '',
      'theirs',
    ].join('\n')

    expect(chooseLastWriteWinsContent({
      ours,
      path: 'entries/2026/06/2026-06-08.md',
      theirs,
    })).toEqual({
      content: theirs,
      reason: 'updatedAt',
      side: 'theirs',
    })
  })

  it('chooses the annotation file with the latest annotation timestamp', () => {
    const ours = JSON.stringify({
      annotations: [
        {
          createdAt: '2026-06-08T12:45:00.000Z',
          id: 'a',
        },
      ],
      date: '2026-06-08',
      source: 'entries/2026/06/2026-06-08.md',
      sourceHash: 'abc',
      version: 1,
    })
    const theirs = JSON.stringify({
      annotations: [
        {
          createdAt: '2026-06-08T12:00:00.000Z',
          id: 'b',
        },
      ],
      date: '2026-06-08',
      source: 'entries/2026/06/2026-06-08.md',
      sourceHash: 'abc',
      version: 1,
    })

    expect(chooseLastWriteWinsContent({
      ours,
      path: 'annotations/2026/06/2026-06-08.json',
      theirs,
    }).side).toBe('ours')
  })

  it('uses the configured fallback when no timestamp is available', () => {
    expect(chooseLastWriteWinsContent({
      fallbackSide: 'ours',
      ours: 'local',
      path: 'media/2026/06/img.txt',
      theirs: 'remote',
    })).toEqual({
      content: 'local',
      reason: 'fallback',
      side: 'ours',
    })
  })
})
