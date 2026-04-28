import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownPreviewPage, {
  createManagedJournalMarkdown,
  stripManagedFrontMatter,
} from './MarkdownPreviewPage'
import { createTextSelector } from '../domain/annotations'
import type { AnnotationFile } from '../domain/annotations'

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

function enterReviewMode() {
  fireEvent.click(screen.getByRole('button', { name: '回看' }))
}

describe('MarkdownPreviewPage', () => {
  it('loads today journal from the desktop journal store', async () => {
    const storedJournal = {
      content: '---\ndate: 2026-04-28\n---\n\n# 从文件醒来\n',
      date: '2026-04-28',
      fileName: '2026-04-28.md',
      filePath: '/Users/zilin/.journal/2026-04-28.md',
      updatedAt: '2026-04-28T06:30:00.000Z',
    }
    const loadToday = vi.fn().mockResolvedValue(storedJournal)
    const saveToday = vi.fn().mockResolvedValue(storedJournal)

    vi.stubGlobal('journalStore', { loadToday, saveToday })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(loadToday).toHaveBeenCalledOnce()
      expect(screen.getByRole('heading', { name: '4月28日 · 周二' })).toBeInTheDocument()
      expect(screen.getByText('~/.journal/2026-04-28.md')).toHaveAttribute('title', storedJournal.filePath)
      expect(screen.getByRole('textbox', { name: '日记正文' })).toHaveTextContent('从文件醒来')
      expect(screen.getByRole('textbox', { name: '日记正文' })).not.toHaveTextContent('date: 2026-04-28')
    })
    expect(saveToday).not.toHaveBeenCalled()
  })

  it('loads same-day annotations from the desktop journal store in review mode', async () => {
    const storedJournal = {
      content: '---\ndate: 2026-04-28\n---\n\n# 从文件醒来\n今天记得很轻。\n',
      date: '2026-04-28',
      fileName: '2026-04-28.md',
      filePath: '/Users/zilin/.journal/2026-04-28.md',
      updatedAt: '2026-04-28T06:30:00.000Z',
    }
    const longEntryMarkdown = '# 从文件醒来\n今天记得很轻。'
    const exact = '今天记得很轻'
    const start = longEntryMarkdown.indexOf(exact)
    const annotationFile: AnnotationFile = {
      version: 1,
      date: '2026-04-28',
      source: storedJournal.filePath,
      sourceHash: 'test-hash',
      annotations: [
        {
          id: 'ann_today_light',
          author: 'ai',
          kind: 'observation',
          target: {
            type: 'longEntryRange',
            selector: createTextSelector(longEntryMarkdown, start, start + exact.length),
          },
          body: {
            content: '这条来自今天的旁路批注文件。',
          },
          status: 'visible',
          createdAt: '2026-04-28T17:20:00+08:00',
        },
      ],
    }
    const loadToday = vi.fn().mockResolvedValue(storedJournal)
    const saveToday = vi.fn().mockResolvedValue(storedJournal)
    const readAnnotations = vi.fn().mockResolvedValue(annotationFile)

    vi.stubGlobal('journalStore', { loadToday, saveToday, readAnnotations })

    const { container } = render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(readAnnotations).toHaveBeenCalledWith('2026-04-28')
    })
    enterReviewMode()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /这条来自今天/ })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /这里保留了疲惫/ })).not.toBeInTheDocument()
    expect(container.querySelector('[data-annotation-ids="ann_today_light"]')).toHaveTextContent('今天记得很轻。')
  })

  it('keeps managed front matter out of the editable journal body', () => {
    expect(stripManagedFrontMatter('---\ndate: 2026-04-28\n---\n\n今天直接写。')).toBe('今天直接写。')
    expect(createManagedJournalMarkdown('今天直接写。', '2026-04-28')).toBe(
      '---\ndate: 2026-04-28\n---\n\n今天直接写。',
    )
    expect(createManagedJournalMarkdown('今天直接写。', '2026-04-28', {
      weather: {
        text: '小雨',
        temperature: 18,
      },
      location: {
        name: '上海',
      },
    })).toBe('---\ndate: 2026-04-28\nweather:\n  text: 小雨\n  temperature: 18\nlocation:\n  name: 上海\n---\n\n今天直接写。')
  })

  it('refreshes missing weather and shows it above the writing area', async () => {
    const storedJournal = {
      content: '---\ndate: 2026-04-28\n---\n\n# 等天气来\n',
      date: '2026-04-28',
      fileName: '2026-04-28.md',
      filePath: '/Users/zilin/.journal/2026-04-28.md',
      updatedAt: '2026-04-28T06:30:00.000Z',
    }
    const refreshedJournal = {
      ...storedJournal,
      content: [
        '---',
        'date: 2026-04-28',
        'weather:',
        '  text: 小雨',
        '  temperature: 18',
        '  feelsLike: 17',
        '  humidity: 82',
        '  windSpeed: 9',
        'location:',
        '  name: 上海',
        '---',
        '',
        '# 等天气来',
        '',
      ].join('\n'),
    }
    const loadToday = vi.fn().mockResolvedValue(storedJournal)
    const saveToday = vi.fn().mockResolvedValue(refreshedJournal)
    const refreshTodayWeather = vi.fn().mockResolvedValue(refreshedJournal)

    vi.stubGlobal('journalStore', { loadToday, saveToday, refreshTodayWeather })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(refreshTodayWeather).toHaveBeenCalledOnce()
      expect(screen.getByRole('heading', { name: '4月28日 · 周二 · 雨天' })).toBeInTheDocument()
      expect(screen.getByLabelText('今日天气')).toHaveTextContent('小雨')
      expect(screen.getByLabelText('今日天气')).toHaveTextContent('18°C')
      expect(screen.getByLabelText('今日天气')).toHaveTextContent('上海')
    })
  })

  it('renders the writing state as the default page experience', () => {
    render(<MarkdownPreviewPage />)

    expect(screen.getByRole('heading', { name: /\d+月\d+日 · 周./ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '书写' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: '日记正文' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '批注' })).not.toBeInTheDocument()
  })

  it('shows the reading preview and annotation margin in review mode', () => {
    render(<MarkdownPreviewPage />)

    enterReviewMode()

    expect(screen.getByRole('button', { name: '回看' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: '批注目标' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '批注' })).toBeInTheDocument()
  })

  it('mounts the writing surface as a CodeMirror editor', () => {
    const { container } = render(<MarkdownPreviewPage />)

    expect(screen.getByRole('textbox', { name: '日记正文' })).toBeInTheDocument()
    expect(container.querySelector('.cm-editor')).toBeInTheDocument()
  })

  it('selects an annotation from the sidebar and marks the matching preview block active', () => {
    const { container } = render(<MarkdownPreviewPage />)

    enterReviewMode()
    fireEvent.click(screen.getByRole('button', { name: /这句重复出现/ }))

    const activeBlock = container.querySelector('[data-annotation-active="true"]')

    expect(activeBlock).toHaveAttribute('data-annotation-ids', 'ann_repeat')
    expect(activeBlock).toHaveTextContent('这句话会重复出现。')
  })

  it('updates the active text highlight when selecting a sidebar annotation', async () => {
    render(<MarkdownPreviewPage />)

    enterReviewMode()
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

    enterReviewMode()
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

    enterReviewMode()
    const tiredBlock = container.querySelector('[data-annotation-ids~="ann_tired"]')

    expect(tiredBlock).toBeInTheDocument()
    fireEvent.click(tiredBlock as Element)

    expect(tiredBlock).toHaveAttribute('data-annotation-active', 'true')
  })

  it('selects the precise annotation at the clicked text position inside a shared block', async () => {
    const { container } = render(<MarkdownPreviewPage />)

    enterReviewMode()
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
