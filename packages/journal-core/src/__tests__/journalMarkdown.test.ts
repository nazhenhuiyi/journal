import { describe, expect, it } from 'vitest'
import {
  createReviewMoments,
  getSolarTermForDate,
  hasMeaningfulJournalChange,
  parseJournalMarkdown,
  serializeJournalFrontMatter,
  serializeJournalMarkdownBody,
} from '../index'

describe('@journal/core markdown model', () => {
  it('parses front matter and leaves long-entry markdown separate from murmurs', () => {
    const parsed = parseJournalMarkdown(`---
date: 2026-04-24
updatedAt: 2026-04-24T22:00:00+08:00
weather:
  text: 小雨
  temperature: 18
unknown: 留着
---

# 今天

长日记只应该到第一条碎碎念之前。

:::murmur
id: m_20260424_213800
time: 2026-04-24T21:38:00+08:00
---
窗外下雨了，声音很轻。
:::`)

    expect(parsed.frontMatter).toMatchObject({
      date: '2026-04-24',
      updatedAt: '2026-04-24T22:00:00+08:00',
      weather: { text: '小雨', temperature: 18 },
      unknown: '留着',
    })
    expect(parsed.longEntryMarkdown).toContain('长日记只应该到第一条碎碎念之前。')
    expect(parsed.longEntryMarkdown).not.toContain('窗外下雨了')
    expect(parsed.murmurs).toEqual([
      {
        id: 'm_20260424_213800',
        time: '2026-04-24T21:38:00+08:00',
        themes: [],
        body: '窗外下雨了，声音很轻。',
        images: [],
      },
    ])
    expect(parsed.diagnostics).toEqual([])
  })

  it('serializes front matter with stable preferred key order and unknown fields', () => {
    expect(serializeJournalFrontMatter({
      favorite: true,
      date: '2026-04-24',
      tags: ['雨', '夜晚'],
      customNote: '保留',
    })).toBe(`date: 2026-04-24
tags: [雨, 夜晚]
favorite: true
customNote: 保留`)
  })

  it('round-trips murmurs and nested image metadata', () => {
    const markdown = serializeJournalMarkdownBody('# 今天\n长日记。', [
      {
        id: 'm_20260429_213800',
        time: '2026-04-29T21:38:00+08:00',
        themes: ['sky-now', 'light-shadow'],
        body: '窗外下雨了。',
        images: [
          {
            id: 'img_20260429_213801',
            src: 'media/2026/04/window-rain.jpg',
            caption: '雨窗',
            location: {
              latitude: 39.992,
              longitude: 116.277,
              name: '青龙湖',
              source: 'exif',
            },
            tags: ['雨', '窗户'],
          },
        ],
      },
    ])

    expect(markdown).toContain(':::murmur\nid: m_20260429_213800')
    expect(markdown).toContain('themes: [sky-now, light-shadow]')
    expect(markdown).toContain('::image\nid: img_20260429_213801')
    expect(markdown).toContain('locationSource: exif')
    expect(parseJournalMarkdown(markdown).murmurs[0].images[0]).toMatchObject({
      caption: '雨窗',
      location: {
        latitude: 39.992,
        longitude: 116.277,
        name: '青龙湖',
        source: 'exif',
      },
      tags: ['雨', '窗户'],
    })
    expect(parseJournalMarkdown(markdown).murmurs[0].themes).toEqual(['sky-now', 'light-shadow'])
  })

  it('parses legacy murmurs without themes as an empty theme list', () => {
    const parsed = parseJournalMarkdown(`:::murmur
id: m_1
time: 2026-06-08T09:00:00.000Z
---
一句碎碎念。
:::`)

    expect(parsed.murmurs[0]).toMatchObject({
      id: 'm_1',
      themes: [],
    })
  })

  it('creates anchored review moments without using negative text hooks', () => {
    const moments = createReviewMoments([
      {
        date: '2025-05-21',
        frontMatter: {
          date: '2025-05-21',
          weather: {
            text: '阴天',
          },
        },
        longEntryMarkdown: '',
        murmurs: [
          {
            id: 'm_20250521_183000',
            time: '2025-05-21T18:30:00+08:00',
            themes: ['sky-now'],
            body: '风吹过树影很好。',
            images: [],
          },
          {
            id: 'm_20250521_190000',
            time: '2025-05-21T19:00:00+08:00',
            themes: ['small-thing'],
            body: '今天真的很痛苦，快撑不住了。',
            images: [],
          },
        ],
      },
      {
        date: '2025-06-10',
        frontMatter: { date: '2025-06-10' },
        longEntryMarkdown: '',
        murmurs: [
          {
            id: 'm_20250610_070000',
            time: '2025-06-10T07:00:00+08:00',
            themes: ['sky-now'],
            body: '云有一点发紫。',
            images: [],
          },
        ],
      },
    ], {
      today: '2026-05-21',
    })

    expect(moments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          anchors: expect.arrayContaining([
            expect.objectContaining({ label: '小满', type: 'solarTerm' }),
            expect.objectContaining({ label: '阴天', type: 'weather' }),
            expect.objectContaining({ label: '傍晚', type: 'timeOfDay' }),
            expect.objectContaining({ label: '此刻的天空', type: 'theme' }),
          ]),
          subtitle: '你写过一句：风吹过树影很好',
          title: '那年今日，阴天',
        }),
        expect.objectContaining({
          anchors: expect.arrayContaining([
            expect.objectContaining({ label: '清晨', type: 'timeOfDay' }),
            expect.objectContaining({ label: '此刻的天空', type: 'theme' }),
          ]),
          subtitle: '最近一次是 6 月 10 日，清晨',
          title: '你留下过一些天空',
        }),
      ]),
    )
    expect(moments.map((moment) => moment.subtitle).join('\n')).not.toContain('撑不住')
  })

  it('calculates solar terms from year-specific calendar dates', () => {
    expect(getSolarTermForDate('2026-04-04')).toBeNull()
    expect(getSolarTermForDate('2026-04-05')).toEqual({
      label: '清明',
      value: 'term-07',
    })
    expect(getSolarTermForDate('2026-12-21')).toBeNull()
    expect(getSolarTermForDate('2026-12-22')).toEqual({
      label: '冬至',
      value: 'term-00',
    })
    expect(getSolarTermForDate('not-a-date')).toBeNull()
  })

  it('matches review moments by solar term even when the Gregorian day shifts', () => {
    const moments = createReviewMoments([
      {
        date: '2025-04-04',
        frontMatter: { date: '2025-04-04' },
        longEntryMarkdown: '',
        murmurs: [
          {
            id: 'm_20250404_091000',
            time: '2025-04-04T09:10:00+08:00',
            themes: [],
            body: '路边的树忽然很亮。',
            images: [],
          },
        ],
      },
    ], {
      today: '2026-04-05',
    })

    expect(moments[0]).toMatchObject({
      anchors: expect.arrayContaining([
        expect.objectContaining({ label: '清明', type: 'solarTerm' }),
      ]),
      sourceDays: ['2025-04-04'],
      title: '清明那天',
    })
  })

  it('ignores managed timestamps when detecting meaningful changes', () => {
    const previous = `---
date: 2026-06-08
createdAt: 2026-06-08T08:00:00.000Z
updatedAt: 2026-06-08T08:00:00.000Z
weather:
  text: 晴
  temperature: 24
  updatedAt: 2026-06-08T08:00:00.000Z
---

今天。`
    const next = `---
date: 2026-06-08
createdAt: 2026-06-08T08:00:00.000Z
updatedAt: 2026-06-08T09:00:00.000Z
weather:
  text: 晴
  temperature: 24
  updatedAt: 2026-06-08T09:00:00.000Z
---

今天。`

    expect(hasMeaningfulJournalChange(previous, next)).toBe(false)
  })

  it('detects content and non-managed front matter changes', () => {
    expect(hasMeaningfulJournalChange(
      `---
date: 2026-06-08
updatedAt: 2026-06-08T08:00:00.000Z
weather:
  text: 晴
---

今天。`,
      `---
date: 2026-06-08
updatedAt: 2026-06-08T09:00:00.000Z
weather:
  text: 小雨
---

今天。`,
    )).toBe(true)

    expect(hasMeaningfulJournalChange(
      '今天。',
      '今天。\n\n:::murmur\nid: m_1\ntime: 2026-06-08T09:00:00.000Z\n---\n一句碎碎念。\n:::',
    )).toBe(true)
  })

  it('ignores metadata-only changes while the day has no user content', () => {
    const emptyDay = `---
date: 2026-06-09
---
`
    const withLocationAndWeather = `---
date: 2026-06-09
location:
  name: 成都
  region: Sichuan
  country: China
weather:
  text: 晴
  temperature: 24
---
`

    expect(hasMeaningfulJournalChange('', emptyDay)).toBe(false)
    expect(hasMeaningfulJournalChange(emptyDay, withLocationAndWeather)).toBe(false)
  })
})
