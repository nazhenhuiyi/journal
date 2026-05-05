import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import annotationTargetsEntry from '../__fixtures__/annotation-targets.md?raw'
import basicEntry from '../__fixtures__/basic-entry.md?raw'
import gfmEntry from '../__fixtures__/gfm-entry.md?raw'
import murmurEntry from '../__fixtures__/murmur-entry.md?raw'
import unsafeHtmlEntry from '../__fixtures__/unsafe-html.md?raw'
import { createDomRangesForSourceRange, createTextSelector } from '../../annotations'
import { parseJournalMarkdown } from '../parseJournalMarkdown'
import { renderJournalMarkdown } from '../renderJournalMarkdown'
import type { Annotation, TextSelector } from '../../annotations'

describe('renderJournalMarkdown', () => {
  it('renders basic markdown without rendering front matter', () => {
    render(<>{renderJournalMarkdown({ markdown: basicEntry })}</>)

    expect(screen.getByRole('heading', { name: '今天' })).toBeInTheDocument()
    expect(screen.getByText('今天的正文从这里开始。')).toBeInTheDocument()
    expect(screen.queryByText('createdAt:')).not.toBeInTheDocument()
  })

  it('renders ordinary CommonMark lists without relying on task-list syntax', () => {
    render(<>{renderJournalMarkdown({ markdown: basicEntry })}</>)

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('早上喝了茶')).toBeInTheDocument()
    expect(screen.getByText('晚上整理了书桌')).toBeInTheDocument()
  })

  it('renders nested ordered lists through three levels', () => {
    const { container } = render(
      <>
        {renderJournalMarkdown({
          markdown: `# 清单

1. 第一层
    1. 第二层
        1. 第三层`,
        })}
      </>,
    )

    expect(screen.getAllByRole('list')).toHaveLength(3)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(container.querySelector('ol ol ol')).toBeInTheDocument()
    expect(screen.getByText('第一层')).toBeInTheDocument()
    expect(screen.getByText('第二层')).toBeInTheDocument()
    expect(screen.getByText('第三层')).toBeInTheDocument()
  })

  it('renders GFM task lists, tables, strikethrough, links, and footnotes', () => {
    const { container } = render(<>{renderJournalMarkdown({ markdown: gfmEntry })}</>)
    const checkboxes = screen.getAllByRole('checkbox')

    expect(checkboxes[0]).not.toBeChecked()
    expect(checkboxes[1]).toBeChecked()
    expect(checkboxes[0].closest('li')).toHaveClass('task-list-item')
    expect(screen.getByText('写日记')).toBeInTheDocument()
    expect(screen.getByText('散步')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(container.querySelector('del')).toHaveTextContent('彻底删掉')
    expect(screen.getByRole('link', { name: 'https://example.com' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
    expect(screen.getByRole('heading', { name: '脚注' })).toBeInTheDocument()
    expect(screen.getByText('只是一个补充说明。')).toBeInTheDocument()
  })

  it('sanitizes dangerous HTML and links', () => {
    const { container } = render(<>{renderJournalMarkdown({ markdown: unsafeHtmlEntry })}</>)
    const sanitizedLink = container.querySelector('a')

    expect(screen.getByText('这段文字应该保留。')).toBeInTheDocument()
    expect(container.querySelector('script')).not.toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(sanitizedLink).toHaveTextContent('危险链接')
    expect(sanitizedLink).not.toHaveAttribute('href')
  })

  it('renders journal directives with stable semantic wrappers', () => {
    const { container } = render(<>{renderJournalMarkdown({ markdown: murmurEntry })}</>)
    const murmur = container.querySelector('.journal-murmur')

    expect(murmur).toBeInTheDocument()
    expect(murmur).toHaveAttribute('data-journal-directive', 'murmur')
    expect(within(murmur as HTMLElement).getByText('21:38').tagName).toBe('TIME')
    expect(within(murmur as HTMLElement).getByText('21:38')).toHaveAttribute(
      'dateTime',
      '2026-04-24T21:38:00+08:00',
    )
    expect(within(murmur as HTMLElement).getByText('窗外下雨了，声音很轻。')).toBeInTheDocument()

    const imageRender = render(<>{renderJournalMarkdown({ markdown: '::image[雨打在窗户上]' })}</>)
    const image = imageRender.container.querySelector('.journal-image')

    expect(image?.tagName).toBe('FIGURE')
    expect(image).toHaveAttribute('data-journal-directive', 'image')
    expect(within(image as HTMLElement).getByText('雨打在窗户上')).toBeInTheDocument()
  })

  it('renders stored murmur image blocks as local images when a source file path is available', () => {
    render(
      <>
        {renderJournalMarkdown({
          markdown: `# 今天

:::murmur
id: m_20260429_213800
time: 2026-04-29T21:38:00+08:00
---
窗外下雨了。

::image
id: img_20260429_213801
src: 2026-04-29.media/rain.jpg
caption: 雨窗
tags: [雨]
::
:::`,
          sourceFilePath: '/Users/zilin/.journal/2026-04-29.md',
        })}
      </>,
    )

    expect(screen.getByText('窗外下雨了。')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '雨窗' })).toHaveAttribute(
      'src',
      'journal-media://local/2026-04-29.media/rain.jpg',
    )
  })

  it('renders annotation target markdown without flattening inline content', () => {
    render(<>{renderJournalMarkdown({ markdown: annotationTargetsEntry })}</>)

    expect(screen.getByRole('heading', { name: '批注目标' })).toBeInTheDocument()
    expect(screen.getByText('很累').closest('strong')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '链接' })).toHaveAttribute('href', 'https://example.com')
    expect(screen.getAllByText('这句话会重复出现。')).toHaveLength(2)
    expect(screen.getByText(/这一段\s+跨了两行，\s+但仍然属于同一个段落。/)).toBeInTheDocument()
  })

  it('marks visible markdown text with source offsets for precise annotations', () => {
    const { longEntryMarkdown } = parseJournalMarkdown(annotationTargetsEntry)
    const { container } = render(<>{renderJournalMarkdown({ markdown: annotationTargetsEntry })}</>)
    const tiredText = screen.getByText('很累')
    const start = longEntryMarkdown.indexOf('很累')

    expect(tiredText).toHaveAttribute('data-source-start', String(start))
    expect(tiredText).toHaveAttribute('data-source-end', String(start + '很累'.length))
    expect(tiredText.closest('strong')).toBeInTheDocument()
    expect(container.querySelector('[data-annotation-ids]')).not.toBeInTheDocument()
  })

  it('maps source ranges to DOM ranges in plain paragraphs, inline markdown, and links', () => {
    const { longEntryMarkdown } = parseJournalMarkdown(annotationTargetsEntry)
    const { container } = render(<>{renderJournalMarkdown({ markdown: annotationTargetsEntry })}</>)

    const repeatedText = '这句话会重复出现。'
    const repeatedStart = longEntryMarkdown.lastIndexOf(repeatedText)
    expect(
      createDomRangesForSourceRange(container, {
        start: repeatedStart,
        end: repeatedStart + repeatedText.length,
      }).map((range) => range.toString()),
    ).toEqual([repeatedText])

    const inlineText = '今天真的**很累**'
    const inlineStart = longEntryMarkdown.indexOf(inlineText)
    expect(
      createDomRangesForSourceRange(container, {
        start: inlineStart,
        end: inlineStart + inlineText.length,
      }).map((range) => range.toString()),
    ).toEqual(['今天真的', '很累'])

    const linkText = '链接'
    const linkStart = longEntryMarkdown.indexOf(linkText)
    const linkRanges = createDomRangesForSourceRange(container, {
      start: linkStart,
      end: linkStart + linkText.length,
    })

    expect(linkRanges.map((range) => range.toString())).toEqual([linkText])
    expect(screen.getByRole('link', { name: linkText })).toContainElement(
      linkRanges[0].startContainer.parentElement,
    )
  })

  it('does not throw when front matter is malformed', () => {
    render(
      <>
        {renderJournalMarkdown({
          markdown: `---
date: [broken
---

# 仍然渲染

坏元数据不应该让预览崩溃。`,
        })}
      </>,
    )

    expect(screen.getByRole('heading', { name: '仍然渲染' })).toBeInTheDocument()
    expect(screen.getByText('坏元数据不应该让预览崩溃。')).toBeInTheDocument()
  })

  it('renders unknown directives as normal content instead of crashing', () => {
    render(
      <>
        {renderJournalMarkdown({
          markdown: `:::note
这不是日记自定义块。
:::`,
        })}
      </>,
    )

    expect(screen.getByText('这不是日记自定义块。')).toBeInTheDocument()
  })

  it('attaches visible long-entry annotations to intersecting markdown blocks', () => {
    const { longEntryMarkdown } = parseJournalMarkdown(annotationTargetsEntry)
    const exact = '今天真的**很累**'
    const start = longEntryMarkdown.indexOf(exact)
    const annotation = createAnnotation(
      'ann_tired',
      createTextSelector(longEntryMarkdown, start, start + exact.length),
    )
    const { container } = render(
      <>{renderJournalMarkdown({ markdown: annotationTargetsEntry, annotations: [annotation] })}</>,
    )
    const annotatedBlock = container.querySelector('[data-annotation-ids="ann_tired"]')

    expect(annotatedBlock).toBeInTheDocument()
    expect(annotatedBlock).toHaveClass('journal-annotated-block')
    expect(annotatedBlock).toHaveTextContent('今天真的很累')
  })
})

function createAnnotation(id: string, selector: TextSelector): Annotation {
  return {
    id,
    author: 'ai',
    kind: 'observation',
    target: {
      type: 'longEntryRange',
      selector,
    },
    body: {
      content: '测试批注',
    },
    status: 'visible',
    createdAt: '2026-04-24T00:00:00+08:00',
  }
}
