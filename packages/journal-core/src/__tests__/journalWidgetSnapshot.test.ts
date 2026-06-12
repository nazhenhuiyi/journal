import { describe, expect, it } from 'vitest'
import {
  createJournalWidgetSnapshot,
  normalizeJournalWidgetSnapshot,
  type ReviewMoment,
  type ReviewSourceDay,
} from '../index'

const sourceDay: ReviewSourceDay = {
  date: '2025-06-10',
  frontMatter: { date: '2025-06-10' },
  longEntryMarkdown: '',
  murmurs: [
    {
      body: '云有一点发紫。',
      id: 'm_20250610_070000',
      images: [],
      themes: ['sky-now'],
      time: '2025-06-10T07:00:00+08:00',
    },
  ],
}

const reviewMoment: ReviewMoment = {
  anchors: [
    { label: '那年今日', type: 'date', value: '2025-06-10' },
    { label: '此刻的天空', type: 'theme', value: 'sky-now' },
  ],
  id: 'anniversary-2025-06-10',
  kind: 'anniversary',
  sourceDays: ['2025-06-10'],
  subtitle: '你写过一句：云有一点发紫',
  themes: ['sky-now'],
  title: '那年今日',
  widgetEligible: true,
}

describe('journal widget snapshots', () => {
  it('normalizes valid snapshots and rejects invalid actions', () => {
    const snapshot = {
      action: { themeId: ' sky-now ', type: 'write' },
      date: '2026-06-10',
      footnote: ' 且留 ',
      generatedAt: '2026-06-10T08:00:00.000Z',
      mode: 'theme-entry',
      subtitle: ' 留一张现在的天 ',
      title: ' 此刻的天空 ',
      version: 1,
    }

    expect(normalizeJournalWidgetSnapshot(snapshot)).toEqual({
      action: { themeId: 'sky-now', type: 'write' },
      date: '2026-06-10',
      footnote: '且留',
      generatedAt: '2026-06-10T08:00:00.000Z',
      mode: 'theme-entry',
      subtitle: '留一张现在的天',
      title: '此刻的天空',
      version: 1,
    })
    expect(normalizeJournalWidgetSnapshot({
      ...snapshot,
      action: { date: 'bad', type: 'reviewDay' },
      mode: 'review-moment',
    })).toBeNull()
    expect(normalizeJournalWidgetSnapshot({
      ...snapshot,
      action: { themeId: 'sky-now', type: 'write' },
      mode: 'review-moment',
    })).toBeNull()
  })

  it('creates a review snapshot from a widget eligible strong moment', () => {
    expect(createJournalWidgetSnapshot({
      date: '2026-06-10',
      generatedAt: '2026-06-10T08:00:00.000Z',
      reviewMoments: [reviewMoment],
      sourceDays: [sourceDay],
    })).toEqual({
      action: { date: '2025-06-10', type: 'reviewDay' },
      date: '2026-06-10',
      footnote: '此刻的天空',
      generatedAt: '2026-06-10T08:00:00.000Z',
      mode: 'review-moment',
      subtitle: '你写过一句：云有一点发紫',
      title: '那年今日',
      version: 1,
    })
  })

  it('falls back to a stable theme entry when no review is available', () => {
    const snapshot = createJournalWidgetSnapshot({
      date: '2026-06-11',
      generatedAt: '2026-06-11T08:00:00.000Z',
      reviewMoments: [],
      sourceDays: [],
    })

    expect(snapshot).toMatchObject({
      action: expect.objectContaining({ type: 'write' }),
      date: '2026-06-11',
      footnote: '且留',
      generatedAt: '2026-06-11T08:00:00.000Z',
      mode: 'theme-entry',
      version: 1,
    })
    expect(snapshot.title).toBeTruthy()
    expect(snapshot.subtitle).toBeTruthy()
  })

  it('prefers review after today has content but entry after several quiet days', () => {
    const softMoment: ReviewMoment = {
      ...reviewMoment,
      anchors: [
        { label: '此刻的天空', type: 'theme', value: 'sky-now' },
      ],
      id: 'theme-cluster-sky-now-2025-06-10',
      kind: 'cluster',
      title: '你留下过一些天空',
    }
    const currentDay: ReviewSourceDay = {
      date: '2026-06-11',
      frontMatter: { date: '2026-06-11' },
      longEntryMarkdown: '',
      murmurs: [
        {
          body: '今天也留下一点。',
          id: 'm_20260611_080000',
          images: [],
          themes: [],
          time: '2026-06-11T08:00:00+08:00',
        },
      ],
    }

    expect(createJournalWidgetSnapshot({
      date: '2026-06-11',
      reviewMoments: [softMoment],
      sourceDays: [currentDay, sourceDay],
    }).mode).toBe('review-moment')
    expect(createJournalWidgetSnapshot({
      date: '2026-06-15',
      reviewMoments: [softMoment],
      sourceDays: [sourceDay],
    }).mode).toBe('theme-entry')
  })
})
