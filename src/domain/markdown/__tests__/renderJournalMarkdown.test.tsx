import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import annotationTargetsEntry from '../__fixtures__/annotation-targets.md?raw'
import basicEntry from '../__fixtures__/basic-entry.md?raw'
import gfmEntry from '../__fixtures__/gfm-entry.md?raw'
import murmurEntry from '../__fixtures__/murmur-entry.md?raw'
import unsafeHtmlEntry from '../__fixtures__/unsafe-html.md?raw'
import { renderJournalMarkdown } from '../renderJournalMarkdown'

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

  it('renders GFM task lists, tables, strikethrough, links, and footnotes', () => {
    const { container } = render(<>{renderJournalMarkdown({ markdown: gfmEntry })}</>)
    const checkboxes = screen.getAllByRole('checkbox')

    expect(checkboxes[0]).not.toBeChecked()
    expect(checkboxes[1]).toBeChecked()
    expect(screen.getByText('写日记')).toBeInTheDocument()
    expect(screen.getByText('散步')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(container.querySelector('del')).toHaveTextContent('彻底删掉')
    expect(screen.getByRole('link', { name: 'https://example.com' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
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
    expect(within(murmur as HTMLElement).getByText('窗外下雨了，声音很轻。')).toBeInTheDocument()

    const imageRender = render(<>{renderJournalMarkdown({ markdown: '::image[雨打在窗户上]' })}</>)
    const image = imageRender.container.querySelector('.journal-image')

    expect(image?.tagName).toBe('FIGURE')
    expect(image).toHaveAttribute('data-journal-directive', 'image')
    expect(within(image as HTMLElement).getByText('雨打在窗户上')).toBeInTheDocument()
  })

  it('renders annotation target markdown without flattening inline content', () => {
    render(<>{renderJournalMarkdown({ markdown: annotationTargetsEntry })}</>)

    expect(screen.getByRole('heading', { name: '批注目标' })).toBeInTheDocument()
    expect(screen.getByText('很累')).toHaveProperty('tagName', 'STRONG')
    expect(screen.getByRole('link', { name: '链接' })).toHaveAttribute('href', 'https://example.com')
    expect(screen.getAllByText('这句话会重复出现。')).toHaveLength(2)
    expect(screen.getByText(/这一段\s+跨了两行，\s+但仍然属于同一个段落。/)).toBeInTheDocument()
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
})
