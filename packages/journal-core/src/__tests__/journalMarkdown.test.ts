import { describe, expect, it } from 'vitest'
import {
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
  })
})
