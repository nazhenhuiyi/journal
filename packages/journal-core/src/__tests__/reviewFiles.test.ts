import { describe, expect, it } from 'vitest'
import {
  createReviewFile,
  normalizeReviewFile,
} from '../index'

describe('review files', () => {
  it('creates and normalizes review files', () => {
    const reviewFile = createReviewFile({
      date: '2026-06-10',
      generatedAt: '2026-06-10T20:00:00.000Z',
      moments: [
        {
          anchors: [
            { label: '那年今日', type: 'date', value: '2025-06-10' },
            { label: '此刻的天空', type: 'theme', value: 'sky-now' },
          ],
          displayImage: {
            alt: '西湖边',
            locationName: ' 西湖边 ',
            src: ' media/2025/06/rain.webp ',
          },
          displayLabel: ' 那年今日，阴。西湖边 ',
          id: 'anniversary-2025-06-10',
          kind: 'anniversary',
          sourceDays: ['2025-06-10'],
          subtitle: '你写过一句：风很好',
          themes: ['sky-now', 'sky-now'],
          title: '那年今日',
          widgetEligible: true,
        },
      ],
    })

    expect(reviewFile).toEqual({
      date: '2026-06-10',
      generatedAt: '2026-06-10T20:00:00.000Z',
      moments: [
        {
          anchors: [
            { label: '那年今日', type: 'date', value: '2025-06-10' },
            { label: '此刻的天空', type: 'theme', value: 'sky-now' },
          ],
          displayImage: {
            alt: '西湖边',
            locationName: '西湖边',
            src: 'media/2025/06/rain.webp',
          },
          displayLabel: '那年今日，阴。西湖边',
          id: 'anniversary-2025-06-10',
          kind: 'anniversary',
          sourceDays: ['2025-06-10'],
          subtitle: '你写过一句：风很好',
          themes: ['sky-now'],
          title: '那年今日',
          widgetEligible: true,
        },
      ],
      version: 1,
    })
    expect(normalizeReviewFile(reviewFile)).toEqual(reviewFile)
  })

  it('rejects invalid review files and drops invalid moments', () => {
    expect(normalizeReviewFile({
      date: '2026/06/10',
      generatedAt: '2026-06-10T20:00:00.000Z',
      moments: [],
      version: 1,
    })).toBeNull()
    expect(normalizeReviewFile({
      date: '2026-06-10',
      generatedAt: '2026-06-10T20:00:00.000Z',
      moments: [],
      version: 2,
    })).toBeNull()
    expect(normalizeReviewFile({
      date: '2026-06-10',
      generatedAt: '2026-06-10T20:00:00.000Z',
      moments: [],
      version: 1,
    })).toBeNull()
    expect(normalizeReviewFile({
      date: '2026-06-10',
      generatedAt: '2026-06-10T20:00:00.000Z',
      moments: [
        { id: '', kind: 'single', sourceDays: ['2025-06-10'], title: '坏数据' },
        { id: 'single-bad', kind: 'single', sourceDays: ['bad'], title: '坏来源' },
      ],
      version: 1,
    })).toBeNull()
    expect(normalizeReviewFile({
      date: '2026-06-10',
      generatedAt: '2026-06-10T20:00:00.000Z',
      moments: [
        { id: '', kind: 'single', sourceDays: ['2025-06-10'], title: '坏数据' },
        {
          anchors: [{ label: '雨天', type: 'weather', value: '雨天' }],
          id: 'single-2025-06-10',
          kind: 'single',
          sourceDays: ['2025-06-10', 'bad'],
          title: '6 月 10 日',
          widgetEligible: false,
        },
      ],
      version: 1,
    })).toEqual({
      date: '2026-06-10',
      generatedAt: '2026-06-10T20:00:00.000Z',
      moments: [
        {
          anchors: [{ label: '雨天', type: 'weather', value: '雨天' }],
          id: 'single-2025-06-10',
          kind: 'single',
          sourceDays: ['2025-06-10'],
          themes: [],
          title: '6 月 10 日',
          widgetEligible: false,
        },
      ],
      version: 1,
    })
  })
})
