import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownPreviewPage from './MarkdownPreviewPage'

const highlightStore = new Map<string, TestHighlight>()
const highlightRegistry = {
  delete: vi.fn((name: string) => highlightStore.delete(name)),
  set: vi.fn((name: string, highlight: TestHighlight) => {
    highlightStore.set(name, highlight)
    return highlightRegistry
  }),
}

class TestHighlight {
  ranges: AbstractRange[]

  constructor(...ranges: AbstractRange[]) {
    this.ranges = ranges
  }
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  highlightStore.clear()
  highlightRegistry.delete.mockClear()
  highlightRegistry.set.mockClear()
  vi.stubGlobal('Highlight', TestHighlight)
  vi.stubGlobal('CSS', { highlights: highlightRegistry })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MarkdownPreviewPage', () => {
  it('renders markdown preview as the default page experience', () => {
    render(<MarkdownPreviewPage />)

    expect(screen.getByRole('heading', { name: '2026-04-24 日记预览' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '批注目标' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '批注' })).toBeInTheDocument()
  })

  it('selects an annotation from the sidebar and marks the matching preview block active', () => {
    const { container } = render(<MarkdownPreviewPage />)

    fireEvent.click(screen.getByRole('button', { name: /这句重复出现/ }))

    const activeBlock = container.querySelector('[data-annotation-active="true"]')

    expect(activeBlock).toHaveAttribute('data-annotation-ids', 'ann_repeat')
    expect(activeBlock).toHaveTextContent('这句话会重复出现。')
  })

  it('updates the active text highlight when selecting a sidebar annotation', async () => {
    render(<MarkdownPreviewPage />)

    fireEvent.click(screen.getByRole('button', { name: /桌面露出来/ }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /桌面露出来/ })).toHaveAttribute('aria-pressed', 'true')
      expect(highlightStore.get('journal-annotation-active')?.ranges.map((range) => range.toString())).toEqual([
        '桌面慢慢露出来',
      ])
    })
  })

  it('registers precise text highlights and cleans up its own highlight keys', async () => {
    const { unmount } = render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(highlightStore.get('journal-annotation-text')?.ranges.length).toBeGreaterThan(0)
      expect(highlightStore.get('journal-annotation-active')?.ranges.map((range) => range.toString())).toEqual([
        '今天真的',
        '很累',
      ])
    })

    unmount()

    expect(highlightRegistry.delete).toHaveBeenCalledWith('journal-annotation-text')
    expect(highlightRegistry.delete).toHaveBeenCalledWith('journal-annotation-active')
  })

  it('selects an annotation by clicking an annotated preview block', () => {
    const { container } = render(<MarkdownPreviewPage />)
    const tiredBlock = container.querySelector('[data-annotation-ids~="ann_tired"]')

    expect(tiredBlock).toBeInTheDocument()
    fireEvent.click(tiredBlock as Element)

    expect(tiredBlock).toHaveAttribute('data-annotation-active', 'true')
  })

  it('selects the precise annotation at the clicked text position inside a shared block', async () => {
    const { container } = render(<MarkdownPreviewPage />)
    const deskText = screen.getByText((content) => content.includes('桌面慢慢露出来'))
    const sourceText = deskText.firstChild as Text
    const clickRange = document.createRange()
    const clickOffset = sourceText.data.indexOf('桌面慢慢露出来') + 2

    clickRange.setStart(sourceText, clickOffset)
    clickRange.setEnd(sourceText, clickOffset)
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: vi.fn(() => clickRange),
    })

    fireEvent.click(deskText, { clientX: 10, clientY: 10 })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /桌面露出来/ })).toHaveAttribute('aria-pressed', 'true')
    })
    expect(container.querySelector('[data-annotation-active="true"]')).toHaveAttribute(
      'data-annotation-ids',
      expect.stringContaining('ann_desk'),
    )
  })
})
