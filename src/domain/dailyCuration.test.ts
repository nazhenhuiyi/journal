import { describe, expect, it } from 'vitest'
import {
  applyDailyCurationAiDraft,
  createDailyCuration,
  createDailyCurationDisplay,
  createLegacyEchoObjectDeck,
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

  it('creates five candidate memory objects for the daily echo', () => {
    const curation = createTestCuration()

    expect(curation.objects?.map((object) => object.slot)).toEqual([
      'today-thread',
      'nearby-memory',
      'archive-ledger',
      'daily-receipt',
      'reply-ticket',
    ])
    expect(curation.objects?.find((object) => object.slot === 'reply-ticket')?.action).toMatchObject({
      label: '写一句回应',
      to: `/calendar?date=${curation.today.date}`,
    })
  })

  it('can build full object candidates from a single historical entry', () => {
    const curation = createDailyCuration([createSingleEntry()], new Date('2026-05-09T12:00:00'))

    expect(curation?.objects).toHaveLength(5)
    expect(curation?.objects?.find((object) => object.slot === 'nearby-memory')?.source?.date).toBe('2026-03-30')
    expect(curation?.objects?.find((object) => object.slot === 'archive-ledger')?.rows).toHaveLength(3)
  })

  it('recreates object cards for saved v6 curations that do not have objects yet', () => {
    const curation = createTestCuration()
    const legacyDeck = createLegacyEchoObjectDeck({ ...curation, objects: undefined })

    expect(legacyDeck.map((object) => object.slot)).toEqual([
      'today-thread',
      'nearby-memory',
      'archive-ledger',
      'daily-receipt',
      'reply-ticket',
    ])
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
    const originalThread = curation.objects?.find((object) => object.slot === 'today-thread')
    const draft: DailyCurationAiDraft = {
      closingQuestion: 'AI 想问：这页现在还留下些什么？',
      curatorVoice: 'AI 读到这页旧日子没有急着解释什么，只把窗边的新叶和今天并排放下。',
      objectDrafts: [
        {
          body: 'AI 把这张旧页轻轻放在旁边。',
          slot: 'today-thread',
          title: 'AI 便签',
        },
        {
          question: 'AI 想问：这页现在还留下些什么？',
          slot: 'reply-ticket',
        },
      ],
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
    expect(refined.objects?.find((object) => object.slot === 'today-thread')).toMatchObject({
      body: originalThread?.body,
      title: originalThread?.title,
    })
    expect(refined.supports.find((support) => support.role === 'receipt')?.items).toEqual([
      { label: '今天', value: '今天' },
      { label: '回声', value: '春天' },
      { label: '天气', value: '春天' },
      { label: '找零', value: '一点春天' },
    ])
  })

  it('lets AI choose object count and order without changing selected sources', () => {
    const curation = createTestCuration()
    const originalNearby = curation.objects?.find((object) => object.slot === 'nearby-memory')
    const originalReceipt = curation.objects?.find((object) => object.slot === 'daily-receipt')
    const refined = applyDailyCurationAiDraft(
      curation,
      {
        objectDrafts: [
          {
            enabled: false,
            slot: 'today-thread',
          },
          {
            body: '旁边那页不解释今天，只把书桌上的安静也放到同一张桌面。',
            slot: 'nearby-memory',
            title: '书桌旁边',
          },
          {
            items: [
              { label: '今天', value: '窗边新叶' },
              { label: '回声', value: '旧书桌' },
              { label: '天气', value: '春天' },
              { label: '找零', value: '一点安静' },
            ],
            slot: 'daily-receipt',
          },
        ],
      },
      {
        generatedAt: '2026-05-09T12:00:00.000Z',
        provider: 'codex',
        threadId: null,
        usage: null,
      },
    )

    expect(refined.objects?.map((object) => object.slot)).toEqual(['nearby-memory', 'daily-receipt'])
    expect(refined.objects?.find((object) => object.slot === 'nearby-memory')).toMatchObject({
      body: '旁边那页不解释今天，只把书桌上的安静也放到同一张桌面。',
      source: originalNearby?.source,
      title: '书桌旁边',
    })
    expect(refined.objects?.find((object) => object.slot === 'daily-receipt')).toMatchObject({
      id: originalReceipt?.id,
      items: [
        { label: '今天', value: '窗边新叶' },
        { label: '回声', value: '旧书桌' },
        { label: '天气', value: '春天' },
        { label: '找零', value: '一点安静' },
      ],
    })
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

function createSingleEntry(): JournalIndexEntry {
  return {
    collections: [],
    date: '2026-03-30',
    favorite: false,
    fileName: '2026-03-30.md',
    filePath: '/Users/zilin/.journal/2026-03-30.md',
    images: [],
    murmurs: [],
    searchableText: '只有这一页旧日记，窗边那盆植物又长出一点新叶。',
    stats: { imageCount: 0, murmurCount: 0, wordCount: 20 },
    tags: ['春天'],
    title: '窗边新叶',
    updatedAt: null,
  }
}
