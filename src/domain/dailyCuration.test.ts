import { describe, expect, it } from 'vitest'
import {
  applyDailyCurationAiDraft,
  createDailyCuration,
  createDailyCurationDisplay,
  type DailyCuration,
  type DailyCurationAiDraft,
} from './dailyCuration'
import type { JournalIndexEntry } from './journalIndex/types'

describe('dailyCuration', () => {
  it('separates archive metadata from the main reading copy', () => {
    const curation = createTestCuration()
    const display = createDailyCurationDisplay(curation)

    expect(display.artifact).toMatchObject({
      badge: curation.recall.label,
      dateLabel: '03.30',
      eyebrow: 'ARCHIVE NOTE',
    })
    expect(display.artifact.caption).toBeUndefined()
    expect(display.main).toMatchObject({
      excerpt: curation.source.excerpt,
      kickerLabel: '今日翻到',
      title: curation.source.title,
    })
    expect(display.main.tags).toEqual(['春天'])
  })

  it('falls back to anchor copy when AI copy repeats the source title', () => {
    const curation = createTestCuration()
    const refined = applyDailyCurationAiDraft(
      curation,
      {
        curatorVoice:
          '《窗边新叶》和今天的《今天》放在一起看，都是一边看见植物，一边想起桌面上那些安静的细节。',
      },
      {
        generatedAt: '2026-05-09T12:00:00.000Z',
        provider: 'codex',
        threadId: null,
        usage: null,
      },
    )
    const display = createDailyCurationDisplay(refined)

    expect(display.main.note).toBe('这页把“春天”留在旧时刻里；今天再看，只取它照出的那一点手边动静。')
    expect(display.main.note).not.toContain('《窗边新叶》')
  })

  it('keeps AI narrator language out of generated display copy', () => {
    const curation = createTestCuration()
    const originalThemeNote = curation.supports.find((support) => support.role === 'theme-note')
    const originalParallel = curation.supports.find((support) => support.role === 'parallel-memory')
    const draft: DailyCurationAiDraft = {
      closingQuestion: 'AI 想问：这页现在还留下些什么？',
      curatorVoice: 'AI 读到这页旧日子没有急着解释什么，只把窗边的新叶和今天并排放下。',
      parallelConnection: '相近余味：AI 写下的旁证',
      receiptItems: [
        { label: '今天', value: '今天' },
        { label: '回声', value: '春天' },
        { label: '天气', value: '春天' },
        { label: '找零', value: '一点春天' },
      ],
      subtitle: 'AI 先替今天翻到一页旧日子。',
      themeNoteBody: 'AI 把这张旧页轻轻放在旁边。',
      themeNoteTitle: 'AI 便签',
    }

    const refined = applyDailyCurationAiDraft(curation, draft, {
      generatedAt: '2026-05-09T12:00:00.000Z',
      provider: 'codex',
      threadId: null,
      usage: null,
    })

    expect(refined.closingQuestion).toBe(curation.closingQuestion)
    expect(refined.thesis.curatorVoice).toBe(curation.thesis.curatorVoice)
    expect(refined.thesis.subtitle).toBe(curation.thesis.subtitle)
    expect(refined.supports.find((support) => support.role === 'theme-note')).toMatchObject({
      body: originalThemeNote?.body,
      title: originalThemeNote?.title,
    })
    expect(refined.supports.find((support) => support.role === 'parallel-memory')?.connection).toBe(
      originalParallel?.connection,
    )
    expect(refined.supports.find((support) => support.role === 'receipt')?.items).toEqual([
      { label: '今天', value: '今天' },
      { label: '回声', value: '春天' },
      { label: '天气', value: '春天' },
      { label: '找零', value: '一点春天' },
    ])
  })
})

function createTestCuration(): DailyCuration {
  const entries: JournalIndexEntry[] = [
    {
      collections: [],
      date: '2026-03-30',
      favorite: false,
      fileName: '2026-03-30.md',
      filePath: '/Users/zilin/.journal/2026-03-30.md',
      images: [],
      murmurs: [],
      searchableText: '窗边那盆植物又长出一点新叶。',
      stats: { imageCount: 0, murmurCount: 0, wordCount: 14 },
      tags: ['春天'],
      title: '窗边新叶',
      updatedAt: null,
    },
    {
      collections: ['书桌'],
      date: '2026-04-08',
      favorite: false,
      fileName: '2026-04-08.md',
      filePath: '/Users/zilin/.journal/2026-04-08.md',
      images: [],
      murmurs: [],
      searchableText: '旧书桌上放着一只空杯子。',
      stats: { imageCount: 0, murmurCount: 0, wordCount: 12 },
      tags: [],
      title: '旧书桌',
      updatedAt: null,
    },
  ]
  const curation = createDailyCuration(entries, new Date('2026-05-09T12:00:00'))

  if (!curation) {
    throw new Error('Expected test curation to be created.')
  }

  return curation
}
