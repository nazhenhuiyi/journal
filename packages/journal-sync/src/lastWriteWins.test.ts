import { describe, expect, it } from 'vitest'
import {
  chooseFallbackMergeContent,
  createFallbackMergeDriver,
} from './lastWriteWins'

describe('chooseFallbackMergeContent', () => {
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

    expect(chooseFallbackMergeContent({
      fallbackSide: 'ours',
      ours,
      path: 'entries/2026/06/2026-06-08.md',
      theirs,
    })).toEqual({
      content: ours,
      reason: 'fallback',
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

    expect(chooseFallbackMergeContent({
      ours,
      path: 'annotations/2026/06/2026-06-08.json',
      theirs,
    }).side).toBe('ours')
  })

  it('uses the configured fallback when no timestamp is available', () => {
    expect(chooseFallbackMergeContent({
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

  it('treats missing merge driver contents as empty text', async () => {
    const driver = createFallbackMergeDriver('ours')
    const result = await driver({
      branches: ['base', 'ours', 'theirs'],
      contents: [
        '',
        undefined as unknown as string,
        'remote',
      ],
      path: 'media/2026/06/img.txt',
    })

    expect(result).toEqual({
      cleanMerge: true,
      mergedText: '',
    })
  })
})
