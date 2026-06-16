import { describe, expect, it } from 'vitest'
import { chooseStructuredFileMergeContent } from './structuredFileMerge'

describe('chooseStructuredFileMergeContent', () => {
  it('does not use journal markdown updatedAt to choose a whole-file winner', () => {
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

    expect(chooseStructuredFileMergeContent({
      defaultSide: 'ours',
      ours,
      path: 'entries/2026/06/2026-06-08.md',
      theirs,
    })).toEqual({
      content: ours,
      reason: 'default-side',
      side: 'ours',
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

    expect(chooseStructuredFileMergeContent({
      ours,
      path: 'annotations/2026/06/2026-06-08.json',
      theirs,
    }).side).toBe('ours')
  })

  it('uses the configured default side when no timestamp is available', () => {
    expect(chooseStructuredFileMergeContent({
      defaultSide: 'ours',
      ours: 'local',
      path: 'media/2026/06/img.txt',
      theirs: 'remote',
    })).toEqual({
      content: 'local',
      reason: 'default-side',
      side: 'ours',
    })
  })
})
