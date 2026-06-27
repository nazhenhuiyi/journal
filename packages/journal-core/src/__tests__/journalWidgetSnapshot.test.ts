import { describe, expect, it } from 'vitest'
import {
  adaptJournalWidgetSnapshotToBundle,
  createJournalWidgetBundleSnapshot,
  createJournalWidgetSnapshot,
  normalizeJournalWidgetBundleSnapshot,
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

  it('keeps a daily review whenever an eligible moment exists', () => {
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
    }).mode).toBe('review-moment')
  })

  it('keeps a fresh weekly review as a text card even when it has a cover image', () => {
    const snapshot = createJournalWidgetBundleSnapshot({
      date: '2026-06-22',
      generatedAt: '2026-06-22T08:00:00.000Z',
      now: new Date(2026, 5, 22, 8),
      reviewMoments: [reviewMoment],
      sourceDays: [sourceDay],
      weeklyReviews: [
        {
          coverImage: 'media/2026/06/img_20260620_210717.webp',
          endDate: '2026-06-21',
          startDate: '2026-06-15',
          summary: '在快的时代里，给自己留一扇漏窗。',
          title: '漏窗外的一点绿',
          week: '2026-W25',
        },
      ],
    })

    expect(snapshot.review).toEqual({
      action: {
        type: 'weeklyReview',
        week: '2026-W25',
      },
      mode: 'weekly-review',
      subtitle: '6月15日 - 6月21日',
      summary: '在快的时代里，给自己留一扇漏窗。',
      title: '漏窗外的一点绿',
    })
  })

  it('keeps a fresh weekly review when its optional cover image is unsafe', () => {
    const snapshot = createJournalWidgetBundleSnapshot({
      date: '2026-06-22',
      generatedAt: '2026-06-22T08:00:00.000Z',
      now: new Date(2026, 5, 22, 8),
      reviewMoments: [reviewMoment],
      sourceDays: [sourceDay],
      weeklyReviews: [
        {
          coverImage: '../media/bad.jpg',
          endDate: '2026-06-21',
          startDate: '2026-06-15',
          summary: '在快的时代里，给自己留一扇漏窗。',
          title: '漏窗外的一点绿',
          week: '2026-W25',
        },
      ],
    })

    expect(snapshot.review).toEqual({
      action: {
        type: 'weeklyReview',
        week: '2026-W25',
      },
      mode: 'weekly-review',
      subtitle: '6月15日 - 6月21日',
      summary: '在快的时代里，给自己留一扇漏窗。',
      title: '漏窗外的一点绿',
    })
  })

  it('falls back to a daily review when the weekly review is older than one day', () => {
    const snapshot = createJournalWidgetBundleSnapshot({
      date: '2026-06-23',
      generatedAt: '2026-06-23T08:00:00.000Z',
      now: new Date(2026, 5, 23, 8),
      reviewMoments: [reviewMoment],
      sourceDays: [
        {
          ...sourceDay,
          murmurs: [
            {
              ...sourceDay.murmurs[0]!,
              images: [
                {
                  id: 'img_20250610_070000',
                  src: 'media/2025/06/sky.jpg',
                  tags: [],
                },
              ],
            },
          ],
        },
      ],
      weeklyReviews: [
        {
          endDate: '2026-06-21',
          startDate: '2026-06-15',
          summary: '过期周回顾。',
          title: '漏窗外的一点绿',
          week: '2026-W25',
        },
      ],
    })

    expect(snapshot.review).toMatchObject({
      action: {
        date: '2025-06-10',
        type: 'reviewDay',
      },
      mode: 'daily-review',
      summary: '你写过一句：云有一点发紫',
      subtitle: '此刻的天空',
      title: '那年今日',
    })
    expect(snapshot.review).not.toHaveProperty('backgroundImageSrc')
  })

  it('omits time-of-day anchors from ordinary text review subtitles', () => {
    const weatherMoment: ReviewMoment = {
      ...reviewMoment,
      anchors: [
        { label: '6 月 23 日', type: 'date', value: '2026-06-23' },
        { label: '多云', type: 'weather', value: '多云' },
        { label: '上午', type: 'timeOfDay', value: '09' },
        { label: '此刻的天空', type: 'theme', value: 'sky-now' },
      ],
      id: 'single-2026-06-23',
      kind: 'single',
      sourceDays: ['2026-06-23'],
      title: '6 月 23 日，多云',
    }

    expect(createJournalWidgetBundleSnapshot({
      date: '2026-06-26',
      generatedAt: '2026-06-26T08:00:00.000Z',
      reviewMoments: [weatherMoment],
      sourceDays: [],
      weeklyReviews: [],
    }).review).toMatchObject({
      mode: 'daily-review',
      subtitle: '多云',
      title: '6 月 23 日，多云',
    })
  })

  it('uses a display image and small display label only for marked daily review moments', () => {
    const photoMoment: ReviewMoment = {
      ...reviewMoment,
      displayImage: {
        alt: '西湖边的一张照片',
        locationName: '西湖边',
        src: 'media/2025/06/sky.jpg',
      },
      displayLabel: '上周的今天，阴。西湖边',
    }

    const snapshot = createJournalWidgetBundleSnapshot({
      date: '2026-06-23',
      generatedAt: '2026-06-23T08:00:00.000Z',
      now: new Date(2026, 5, 23, 8),
      reviewMoments: [photoMoment],
      sourceDays: [sourceDay],
      weeklyReviews: [],
    })

    expect(snapshot.review).toMatchObject({
      action: {
        date: '2025-06-10',
        type: 'reviewDay',
      },
      backgroundImageSrc: 'media/2025/06/sky.jpg',
      displayLabel: '上周的今天，阴。西湖边',
      mode: 'daily-review',
      summary: '你写过一句：云有一点发紫',
      subtitle: '此刻的天空',
      title: '那年今日',
    })
  })

  it('creates a stable empty review placeholder when no review content exists', () => {
    const snapshot = createJournalWidgetBundleSnapshot({
      date: '2026-06-23',
      generatedAt: '2026-06-23T08:00:00.000Z',
      now: new Date(2026, 5, 23, 8),
      sourceDays: [],
    })

    expect(snapshot.review).toMatchObject({
      action: {
        themeId: 'small-thing',
        type: 'write',
      },
      mode: 'empty-review',
    })
    expect(snapshot.review.title).toBeTruthy()
    expect(snapshot.review.summary).toBeTruthy()
  })

  it('selects moment themes by local time and avoids themes already used today', () => {
    expect(createJournalWidgetBundleSnapshot({
      date: '2026-06-23',
      now: new Date(2026, 5, 23, 7),
      sourceDays: [],
    }).moment.action.themeId).toBe('sky-now')
    expect(createJournalWidgetBundleSnapshot({
      date: '2026-06-23',
      now: new Date(2026, 5, 23, 12),
      sourceDays: [],
    }).moment.action.themeId).toBe('food-today')
    expect(createJournalWidgetBundleSnapshot({
      date: '2026-06-23',
      now: new Date(2026, 5, 23, 18),
      sourceDays: [],
    }).moment.action.themeId).toBe('light-shadow')
    expect(createJournalWidgetBundleSnapshot({
      date: '2026-06-23',
      now: new Date(2026, 5, 23, 23),
      sourceDays: [],
    }).moment.action.themeId).toBe('thought-maybe')
    expect(createJournalWidgetBundleSnapshot({
      date: '2026-06-23',
      now: new Date(2026, 5, 23, 7),
      sourceDays: [
        {
          date: '2026-06-23',
          frontMatter: { date: '2026-06-23' },
          longEntryMarkdown: '',
          murmurs: [
            {
              body: '今天已经写过天空。',
              id: 'm_20260623_070000',
              images: [],
              themes: ['sky-now'],
              time: '2026-06-23T07:00:00+08:00',
            },
          ],
        },
      ],
    }).moment.action.themeId).toBe('sunrise-sunset')
  })

  it('normalizes v2 bundle snapshots and rejects unsafe bundle fields', () => {
    const snapshot = {
      date: '2026-06-23',
      generatedAt: '2026-06-23T08:00:00.000Z',
      moment: {
        action: { themeId: ' sky-now ', type: 'write' },
        mode: 'theme-entry',
        subtitle: ' 留一张现在的天 ',
        title: ' 此刻的天空 ',
      },
      review: {
        action: { type: 'weeklyReview', week: '2026-W25' },
        backgroundImageSrc: ' media/2026/06/img.webp ',
        mode: 'weekly-review',
        subtitle: ' 6月15日 - 6月21日 ',
        summary: ' 留一扇漏窗。 ',
        title: ' 漏窗外的一点绿 ',
      },
      version: 2,
    }

    expect(normalizeJournalWidgetBundleSnapshot(snapshot)).toEqual({
      date: '2026-06-23',
      generatedAt: '2026-06-23T08:00:00.000Z',
      moment: {
        action: { themeId: 'sky-now', type: 'write' },
        mode: 'theme-entry',
        subtitle: '留一张现在的天',
        title: '此刻的天空',
      },
      review: {
        action: { type: 'weeklyReview', week: '2026-W25' },
        mode: 'weekly-review',
        subtitle: '6月15日 - 6月21日',
        summary: '留一扇漏窗。',
        title: '漏窗外的一点绿',
      },
      version: 2,
    })
    expect(normalizeJournalWidgetBundleSnapshot({
      ...snapshot,
      review: {
        ...snapshot.review,
        action: { date: '2026-06-03', type: 'reviewDay' },
        backgroundImageSrc: '../media/bad.jpg',
        mode: 'daily-review',
      },
    })).toBeNull()
    expect(normalizeJournalWidgetBundleSnapshot({
      ...snapshot,
      review: {
        ...snapshot.review,
        action: { themeId: 'small-thing', type: 'write' },
      },
    })).toBeNull()
  })

  it('normalizes display labels for daily review image snapshots', () => {
    expect(normalizeJournalWidgetBundleSnapshot({
      date: '2026-06-23',
      generatedAt: '2026-06-23T08:00:00.000Z',
      moment: {
        action: { themeId: 'sky-now', type: 'write' },
        mode: 'theme-entry',
        title: '此刻的天空',
      },
      review: {
        action: { date: '2025-06-10', type: 'reviewDay' },
        backgroundImageSrc: ' media/2025/06/sky.webp ',
        displayLabel: ' 上周的今天，阴。西湖边 ',
        mode: 'daily-review',
        summary: ' 你拍下了一张照片。 ',
        title: '上周的今天，阴',
      },
      version: 2,
    })?.review).toEqual({
      action: { date: '2025-06-10', type: 'reviewDay' },
      backgroundImageSrc: 'media/2025/06/sky.webp',
      displayLabel: '上周的今天，阴。西湖边',
      mode: 'daily-review',
      summary: '你拍下了一张照片。',
      title: '上周的今天，阴',
    })
  })

  it('adapts legacy v1 snapshots into a v2 bundle fallback', () => {
    const bundle = adaptJournalWidgetSnapshotToBundle({
      action: {
        date: '2025-06-10',
        type: 'reviewDay',
      },
      date: '2026-06-10',
      footnote: '此刻的天空',
      generatedAt: '2026-06-10T08:00:00.000Z',
      mode: 'review-moment',
      subtitle: '你写过一句：云有一点发紫',
      title: '那年今日',
      version: 1,
    })

    expect(bundle).toMatchObject({
      date: '2026-06-10',
      review: {
        action: {
          date: '2025-06-10',
          type: 'reviewDay',
        },
        mode: 'daily-review',
        summary: '你写过一句：云有一点发紫',
        subtitle: '此刻的天空',
        title: '那年今日',
      },
      version: 2,
    })
  })
})
