import { describe, expect, it } from 'vitest'
import annotationTargetsEntry from '../__fixtures__/annotation-targets.md?raw'
import basicEntry from '../__fixtures__/basic-entry.md?raw'
import murmurEntry from '../__fixtures__/murmur-entry.md?raw'
import {
  parseJournalMarkdown,
  serializeJournalFrontMatter,
  serializeJournalMarkdownBody,
} from '..'

describe('parseJournalMarkdown', () => {
  it('normalizes front matter and removes it from long entry markdown', () => {
    const parsed = parseJournalMarkdown(basicEntry)

    expect(parsed.frontMatter.date).toBe('2026-04-24')
    expect(parsed.frontMatter.weather).toEqual({ text: '小雨', temperature: 18 })
    expect(parsed.longEntryMarkdown).toContain('# 今天')
    expect(parsed.longEntryMarkdown).toContain('- 早上喝了茶')
    expect(parsed.longEntryMarkdown).not.toContain('createdAt:')
    expect(parsed.murmurs).toHaveLength(0)
    expect(parsed.diagnostics).toEqual([])
  })

  it('parses and serializes curation front matter fields', () => {
    const parsed = parseJournalMarkdown(`---
date: 2026-04-24
title: 雨夜和台灯
excerpt: 窗外下雨，桌面很安静。
tags: [雨, 夜晚, 台灯]
favorite: true
collections: [雨天, 房间里的光]
weather:
  text: 小雨
  temperature: 18
unknown: 留着
---

# 今天`)

    expect(parsed.frontMatter).toMatchObject({
      collections: ['雨天', '房间里的光'],
      excerpt: '窗外下雨，桌面很安静。',
      favorite: true,
      tags: ['雨', '夜晚', '台灯'],
      title: '雨夜和台灯',
      unknown: '留着',
      weather: { text: '小雨', temperature: 18 },
    })

    expect(serializeJournalFrontMatter(parsed.frontMatter)).toBe(`date: 2026-04-24
title: 雨夜和台灯
excerpt: 窗外下雨，桌面很安静。
tags: [雨, 夜晚, 台灯]
favorite: true
collections: [雨天, 房间里的光]
weather:
  text: 小雨
  temperature: 18
unknown: 留着`)
  })

  it('splits long entry content before the first murmur block', () => {
    const parsed = parseJournalMarkdown(murmurEntry)

    expect(parsed.longEntryMarkdown).toContain('长日记只应该到第一条碎碎念之前。')
    expect(parsed.longEntryMarkdown).not.toContain('窗外下雨了')
  })

  it('parses murmur blocks and nested image blocks', () => {
    const parsed = parseJournalMarkdown(murmurEntry)

    expect(parsed.murmurs).toHaveLength(2)
    expect(parsed.murmurs[0]).toMatchObject({
      id: 'm_20260424_213800',
      time: '2026-04-24T21:38:00+08:00',
      body: '窗外下雨了，声音很轻。',
    })
    expect(parsed.murmurs[0].images[0]).toEqual({
      id: 'img_20260424_213801',
      src: '../media/2026/04/window-rain.jpg',
      caption: '雨打在窗户上',
      tags: ['雨', '窗户', '夜晚'],
    })
    expect(parsed.murmurs[1].body).toBe('')
    expect(parsed.murmurs[1].images).toHaveLength(2)
  })

  it('serializes long entries, murmurs, and image metadata as readable markdown blocks', () => {
    const markdown = serializeJournalMarkdownBody('# 今天\n长日记。', [
      {
        id: 'm_20260429_213800',
        time: '2026-04-29T21:38:00+08:00',
        body: '窗外下雨了。',
        images: [
          {
            id: 'img_20260429_213801',
            src: 'media/2026/04/img_20260429_213801.jpg',
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

    expect(markdown).toContain('# 今天\n长日记。')
    expect(markdown).toContain(':::murmur\nid: m_20260429_213800')
    expect(markdown).toContain('::image\nid: img_20260429_213801')
    expect(markdown).toContain('src: media/2026/04/img_20260429_213801.jpg')
    expect(markdown).toContain('location: 青龙湖')
    expect(markdown).toContain('latitude: 39.992')
    expect(markdown).toContain('longitude: 116.277')
    expect(markdown).toContain('locationSource: exif')
    expect(markdown).toContain('tags: [雨, 窗户]')
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

  it('preserves annotation-target markdown for later anchoring', () => {
    const parsed = parseJournalMarkdown(annotationTargetsEntry)

    expect(parsed.longEntryMarkdown).toContain('今天真的**很累**')
    expect(parsed.longEntryMarkdown.match(/这句话会重复出现。/g)).toHaveLength(2)
    expect(parsed.diagnostics).toEqual([])
  })

  it('extracts image blocks while keeping body text around them', () => {
    const parsed = parseJournalMarkdown(`# 今天

:::murmur
id: m_body_around_image
time: 2026-04-24T21:00:00+08:00
---
第一段。

::image
id: img_lamp
src: ../media/lamp.jpg
caption: "暖色灯"
tags: 灯光
::

第二段还在。
:::`)

    expect(parsed.murmurs).toHaveLength(1)
    expect(parsed.murmurs[0].body).toContain('第一段。')
    expect(parsed.murmurs[0].body).toContain('第二段还在。')
    expect(parsed.murmurs[0].body).not.toContain('img_lamp')
    expect(parsed.murmurs[0].images).toEqual([
      {
        id: 'img_lamp',
        src: '../media/lamp.jpg',
        caption: '暖色灯',
        tags: ['灯光'],
      },
    ])
    expect(parsed.diagnostics).toEqual([])
  })

  it('handles entries without front matter', () => {
    const parsed = parseJournalMarkdown(`# 无元数据

今天直接开始写。`)

    expect(parsed.frontMatter).toEqual({})
    expect(parsed.longEntryMarkdown).toContain('# 无元数据')
    expect(parsed.longEntryMarkdown).toContain('今天直接开始写。')
    expect(parsed.diagnostics).toEqual([])
  })

  it('reports missing murmur and image metadata as warnings', () => {
    const parsed = parseJournalMarkdown(`# 今天

:::murmur
---
没有 id 和 time。

::image
caption: 没有 id 和 src
::
:::`)

    expect(parsed.murmurs).toHaveLength(1)
    expect(parsed.murmurs[0]).toMatchObject({
      id: '',
      time: '',
      body: '没有 id 和 time。',
    })
    expect(parsed.murmurs[0].images[0]).toMatchObject({
      id: '',
      src: '',
      caption: '没有 id 和 src',
      tags: [],
    })
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'warning', message: '碎碎念缺少 id 字段。' }),
        expect.objectContaining({ severity: 'warning', message: '碎碎念缺少 time 字段。' }),
        expect.objectContaining({ severity: 'warning', message: '图片 block 缺少 id 字段。' }),
        expect.objectContaining({ severity: 'warning', message: '图片 block 缺少 src 字段。' }),
      ]),
    )
  })

  it('reports an unclosed image block while keeping parsed metadata', () => {
    const parsed = parseJournalMarkdown(`# 今天

:::murmur
id: m_unclosed_image
time: 2026-04-24T21:00:00+08:00
---
看见一盏灯。

::image
id: img_unclosed
src: ../media/lamp.jpg
tags: 灯光
:::`)

    expect(parsed.murmurs[0].images[0]).toMatchObject({
      id: 'img_unclosed',
      src: '../media/lamp.jpg',
      tags: ['灯光'],
    })
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', message: '图片 block 缺少结束标记 ::。' }),
      ]),
    )
  })

  it('returns diagnostics instead of throwing on malformed front matter and unclosed blocks', () => {
    const parsed = parseJournalMarkdown(`---
date: [broken
---

# 坏数据

:::murmur
id: m_broken
---
没有结束`)

    expect(parsed.frontMatter).toEqual({})
    expect(parsed.murmurs[0]).toMatchObject({
      id: 'm_broken',
      body: '没有结束',
    })
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('Front Matter 第 2 行数组语法不完整'),
        }),
        expect.objectContaining({ severity: 'error', message: '碎碎念 block 缺少结束标记 :::。' }),
      ]),
    )
  })
})
