import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownPreviewPage from './MarkdownPreviewPage'
import {
  createManagedJournalMarkdown,
  stripManagedFrontMatter,
} from './markdown-preview/managedJournalMarkdown'
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
  Range.prototype.getBoundingClientRect = vi.fn(() => new DOMRect())
  Range.prototype.getClientRects = vi.fn(() => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* iterateRects() {},
  }) as DOMRectList)
})

beforeEach(() => {
  window.localStorage.clear()
  highlightStore.clear()
  highlightRegistry.delete.mockClear()
  highlightRegistry.set.mockClear()
  vi.stubGlobal('Highlight', TestHighlight)
  vi.stubGlobal('CSS', { highlights: highlightRegistry })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function enterReviewMode() {
  fireEvent.click(screen.getByRole('button', { name: '回看' }))
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

function insertEditorText(text: string) {
  const textbox = screen.getByRole('textbox', { name: '日记正文' })
  const targetText = findLastTextNode(textbox)
  const selection = window.getSelection()
  if (targetText && selection) {
    const range = document.createRange()
    range.setStart(targetText, targetText.data.length)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  fireEvent.focus(textbox)
  fireEvent.paste(textbox, {
    clipboardData: {
      getData: (type: string) => (type === 'text/plain' ? text : ''),
    },
  })
}

function findLastTextNode(node: Node): Text | null {
  if (node instanceof Text) {
    return node
  }

  for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
    const text = findLastTextNode(node.childNodes[index])

    if (text) {
      return text
    }
  }

  return null
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

  it('prompts before moving to the real today after the calendar day changes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 3, 28, 23, 59, 0))

    const oldJournal = {
      content: '---\ndate: 2026-04-28\n---\n\n# 旧的一天\n昨天的内容。\n',
      date: '2026-04-28',
      fileName: '2026-04-28.md',
      filePath: '/Users/zilin/.journal/2026-04-28.md',
      updatedAt: '2026-04-28T15:59:00.000Z',
    }
    const newJournal = {
      content: '---\ndate: 2026-04-29\n---\n\n',
      date: '2026-04-29',
      fileName: '2026-04-29.md',
      filePath: '/Users/zilin/.journal/2026-04-29.md',
      updatedAt: '2026-04-29T00:00:00.000Z',
    }
    const loadToday = vi.fn().mockResolvedValueOnce(oldJournal).mockResolvedValueOnce(newJournal)
    const saveToday = vi.fn().mockResolvedValue(newJournal)
    const saveDate = vi.fn().mockResolvedValue(oldJournal)

    vi.stubGlobal('journalStore', { loadToday, saveToday, saveDate })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '4月28日 · 周二' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: '日记正文' })).toHaveTextContent('旧的一天')
    })

    vi.setSystemTime(new Date(2026, 3, 29, 0, 0, 10))
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => {
      expect(loadToday).toHaveBeenCalledOnce()
      expect(screen.getByRole('status')).toHaveTextContent('现在是 4月29日')
      expect(screen.getByRole('status')).toHaveTextContent('你还在写 4月28日')
      expect(screen.getByRole('textbox', { name: '日记正文' })).toHaveTextContent('旧的一天')
    })

    fireEvent.click(screen.getByRole('button', { name: '去今天' }))

    await waitFor(() => {
      expect(loadToday).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('heading', { name: '4月29日 · 周三' })).toBeInTheDocument()
      expect(screen.getByText('~/.journal/2026-04-29.md')).toHaveAttribute('title', newJournal.filePath)
      expect(screen.getByRole('textbox', { name: '日记正文' })).not.toHaveTextContent('旧的一天')
    })
    expect(saveToday).not.toHaveBeenCalled()
    expect(saveDate).not.toHaveBeenCalled()
  })

  it('keeps the current day open when switching to today cannot save dirty content', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 3, 28, 23, 59, 0))

    const oldJournal = {
      content: '---\ndate: 2026-04-28\n---\n\n# 旧的一天\n昨天的内容。\n',
      date: '2026-04-28',
      fileName: '2026-04-28.md',
      filePath: '/Users/zilin/.journal/2026-04-28.md',
      updatedAt: '2026-04-28T15:59:00.000Z',
    }
    const newJournal = {
      content: '---\ndate: 2026-04-29\n---\n\n# 新的一天\n',
      date: '2026-04-29',
      fileName: '2026-04-29.md',
      filePath: '/Users/zilin/.journal/2026-04-29.md',
      updatedAt: '2026-04-29T00:00:00.000Z',
    }
    const loadToday = vi.fn().mockResolvedValueOnce(oldJournal).mockResolvedValueOnce(newJournal)
    const saveDate = vi.fn().mockRejectedValue(new Error('disk full'))

    vi.stubGlobal('journalStore', { loadToday, saveToday: vi.fn(), saveDate })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '日记正文' })).toHaveTextContent('旧的一天')
    })

    vi.setSystemTime(new Date(2026, 3, 29, 0, 0, 10))
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('现在是 4月29日')
    })

    insertEditorText('\n补一句还没保存的话。')
    fireEvent.click(screen.getByRole('button', { name: '去今天' }))

    await waitFor(() => {
      expect(saveDate).toHaveBeenCalledWith('2026-04-28', expect.stringContaining('补一句还没保存的话。'))
      expect(screen.getByRole('status')).toHaveTextContent('刚才的内容还没有保存成功')
      expect(screen.getByRole('textbox', { name: '日记正文' })).toHaveTextContent('旧的一天')
    })
    expect(loadToday).toHaveBeenCalledOnce()
  })

  it('saves dirty previous-day content before switching to today', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 3, 28, 23, 59, 0))

    const oldJournal = {
      content: '---\ndate: 2026-04-28\n---\n\n# 旧的一天\n昨天的内容。\n',
      date: '2026-04-28',
      fileName: '2026-04-28.md',
      filePath: '/Users/zilin/.journal/2026-04-28.md',
      updatedAt: '2026-04-28T15:59:00.000Z',
    }
    const savedOldJournal = {
      ...oldJournal,
      content: '---\ndate: 2026-04-28\n---\n\n# 旧的一天\n昨天的内容。\n补一句还没保存的话。',
      updatedAt: '2026-04-28T16:01:00.000Z',
    }
    const newJournal = {
      content: '---\ndate: 2026-04-29\n---\n\n# 新的一天\n',
      date: '2026-04-29',
      fileName: '2026-04-29.md',
      filePath: '/Users/zilin/.journal/2026-04-29.md',
      updatedAt: '2026-04-29T00:00:00.000Z',
    }
    const loadToday = vi.fn().mockResolvedValueOnce(oldJournal).mockResolvedValueOnce(newJournal)
    const saveDate = vi.fn().mockResolvedValue(savedOldJournal)

    vi.stubGlobal('journalStore', { loadToday, saveToday: vi.fn(), saveDate })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '日记正文' })).toHaveTextContent('旧的一天')
    })

    vi.setSystemTime(new Date(2026, 3, 29, 0, 0, 10))
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('现在是 4月29日')
    })

    insertEditorText('\n补一句还没保存的话。')
    fireEvent.click(screen.getByRole('button', { name: '去今天' }))

    await waitFor(() => {
      expect(saveDate).toHaveBeenCalledWith('2026-04-28', expect.stringContaining('补一句还没保存的话。'))
      expect(loadToday).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('heading', { name: '4月29日 · 周三' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: '日记正文' })).toHaveTextContent('新的一天')
    })
  })

  it('ignores stale weather refreshes that return a different date', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 3, 28, 10, 0, 0))

    const oldJournal = {
      content: '---\ndate: 2026-04-28\n---\n\n# 旧的一天\n',
      date: '2026-04-28',
      fileName: '2026-04-28.md',
      filePath: '/Users/zilin/.journal/2026-04-28.md',
      updatedAt: '2026-04-28T06:30:00.000Z',
    }
    const wrongDateWeatherJournal = {
      content: [
        '---',
        'date: 2026-04-29',
        'weather:',
        '  text: 小雨',
        '  updatedAt: 2026-04-29T00:00:05+08:00',
        '---',
        '',
        '# 新的一天',
      ].join('\n'),
      date: '2026-04-29',
      fileName: '2026-04-29.md',
      filePath: '/Users/zilin/.journal/2026-04-29.md',
      updatedAt: '2026-04-29T00:00:05.000Z',
    }
    const loadToday = vi.fn().mockResolvedValue(oldJournal)
    const refreshTodayWeather = vi.fn().mockResolvedValue(wrongDateWeatherJournal)

    vi.stubGlobal('journalStore', { loadToday, saveToday: vi.fn(), refreshTodayWeather })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(refreshTodayWeather).toHaveBeenCalledOnce()
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '4月28日 · 周二' })).toBeInTheDocument()
      expect(screen.getByText('~/.journal/2026-04-28.md')).toHaveAttribute('title', oldJournal.filePath)
      expect(screen.queryByRole('heading', { name: '4月29日 · 周三 · 雨天' })).not.toBeInTheDocument()
    })
  })

  it('ignores stale annotations from a previous date', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 3, 28, 23, 59, 0))

    const oldAnnotations = createDeferred<AnnotationFile>()
    const oldJournal = {
      content: '---\ndate: 2026-04-28\n---\n\n# 旧的一天\n',
      date: '2026-04-28',
      fileName: '2026-04-28.md',
      filePath: '/Users/zilin/.journal/2026-04-28.md',
      updatedAt: '2026-04-28T15:59:00.000Z',
    }
    const newJournal = {
      content: '---\ndate: 2026-04-29\n---\n\n# 新的一天\n',
      date: '2026-04-29',
      fileName: '2026-04-29.md',
      filePath: '/Users/zilin/.journal/2026-04-29.md',
      updatedAt: '2026-04-29T00:00:00.000Z',
    }
    const newAnnotationFile: AnnotationFile = {
      version: 1,
      date: '2026-04-29',
      source: newJournal.filePath,
      sourceHash: 'new-hash',
      annotations: [
        {
          id: 'ann_new_day',
          author: 'ai',
          kind: 'observation',
          target: { type: 'day' },
          body: { content: '这是今天的批注。' },
          status: 'visible',
          createdAt: '2026-04-29T00:10:00+08:00',
        },
      ],
    }
    const staleAnnotationFile: AnnotationFile = {
      version: 1,
      date: '2026-04-28',
      source: oldJournal.filePath,
      sourceHash: 'old-hash',
      annotations: [
        {
          id: 'ann_old_day',
          author: 'ai',
          kind: 'observation',
          target: { type: 'day' },
          body: { content: '这是昨天的批注。' },
          status: 'visible',
          createdAt: '2026-04-28T23:50:00+08:00',
        },
      ],
    }
    const loadToday = vi.fn().mockResolvedValueOnce(oldJournal).mockResolvedValueOnce(newJournal)
    const readAnnotations = vi.fn((date: string) =>
      date === '2026-04-28' ? oldAnnotations.promise : Promise.resolve(newAnnotationFile),
    )

    vi.stubGlobal('journalStore', { loadToday, saveToday: vi.fn(), readAnnotations })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(readAnnotations).toHaveBeenCalledWith('2026-04-28')
    })

    vi.setSystemTime(new Date(2026, 3, 29, 0, 0, 10))
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('现在是 4月29日')
    })

    fireEvent.click(screen.getByRole('button', { name: '去今天' }))
    await waitFor(() => {
      expect(readAnnotations).toHaveBeenCalledWith('2026-04-29')
    })

    oldAnnotations.resolve(staleAnnotationFile)
    enterReviewMode()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /这是今天的批注/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /这是昨天的批注/ })).not.toBeInTheDocument()
    })
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

  it('accepts an AI annotation draft and saves it to the annotation store', async () => {
    const storedJournal = {
      content: '---\ndate: 2026-04-28\n---\n\n# 测试日记\n今天很累，但回来写了几行。\n',
      date: '2026-04-28',
      fileName: '2026-04-28.md',
      filePath: '/Users/zilin/.journal/2026-04-28.md',
      updatedAt: '2026-04-28T06:30:00.000Z',
    }
    const loadToday = vi.fn().mockResolvedValue(storedJournal)
    const saveDate = vi.fn().mockResolvedValue(storedJournal)
    const readAnnotations = vi.fn().mockResolvedValue({
      version: 1,
      date: '2026-04-28',
      source: storedJournal.filePath,
      sourceHash: '',
      annotations: [],
    } satisfies AnnotationFile)
    const saveAnnotations = vi.fn((date: string, annotations: AnnotationFile['annotations']) =>
      Promise.resolve({
        version: 1,
        date,
        source: storedJournal.filePath,
        sourceHash: 'saved-hash',
        annotations,
      } satisfies AnnotationFile),
    )
    const generateAnnotationDrafts = vi.fn().mockResolvedValue({
      drafts: [
        {
          kind: 'observation',
          content: '这里把累和继续写都留住了。',
          anchorQuote: '今天很累',
          anchorSuffix: '但回来写了几行。',
        },
      ],
      threadId: 'draft-thread',
      usage: null,
    })

    vi.stubGlobal('journalStore', { loadToday, saveDate, readAnnotations, saveAnnotations })
    vi.stubGlobal('codex', { generateAnnotationDrafts })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '日记正文' })).toHaveTextContent('测试日记')
    })

    fireEvent.click(screen.getByRole('button', { name: '页边批注' }))
    fireEvent.click(screen.getByRole('button', { name: '请页边读一遍今天' }))

    await waitFor(() => {
      expect(generateAnnotationDrafts).toHaveBeenCalledWith({
        date: '2026-04-28',
        longEntryMarkdown: '# 测试日记\n今天很累，但回来写了几行。',
      })
      expect(screen.getByRole('textbox', { name: '批注草稿' })).toHaveValue('这里把累和继续写都留住了。')
    })

    fireEvent.click(screen.getByRole('button', { name: '接受' }))

    await waitFor(() => {
      expect(saveAnnotations).toHaveBeenCalledWith(
        '2026-04-28',
        expect.arrayContaining([
          expect.objectContaining({
            author: 'ai',
            kind: 'observation',
            body: { content: '这里把累和继续写都留住了。' },
            target: expect.objectContaining({ type: 'longEntryRange' }),
          }),
        ]),
      )
    })

    enterReviewMode()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /这里把累和继续写都留住了/ })).toBeInTheDocument()
    })
  })

  it('hides the AI annotation launcher after today already has generated annotations', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 3, 28, 10, 0, 0))

    const storedJournal = {
      content: '---\ndate: 2026-04-28\n---\n\n# 今天\n今天记得很轻。\n',
      date: '2026-04-28',
      fileName: '2026-04-28.md',
      filePath: '/Users/zilin/.journal/2026-04-28.md',
      updatedAt: '2026-04-28T06:30:00.000Z',
    }
    const longEntryMarkdown = '# 今天\n今天记得很轻。'
    const exact = '今天记得很轻'
    const start = longEntryMarkdown.indexOf(exact)
    const annotationFile: AnnotationFile = {
      version: 1,
      date: '2026-04-28',
      source: storedJournal.filePath,
      sourceHash: 'test-hash',
      annotations: [
        {
          id: 'ann_today_generated',
          author: 'ai',
          kind: 'observation',
          target: {
            type: 'longEntryRange',
            selector: createTextSelector(longEntryMarkdown, start, start + exact.length),
          },
          body: {
            content: '这条已经是今天生成过的批注。',
          },
          status: 'visible',
          createdAt: '2026-04-28T09:30:00+08:00',
        },
      ],
    }
    const loadToday = vi.fn().mockResolvedValue(storedJournal)
    const readAnnotations = vi.fn().mockResolvedValue(annotationFile)

    vi.stubGlobal('journalStore', { loadToday, readAnnotations })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(readAnnotations).toHaveBeenCalledWith('2026-04-28')
      expect(screen.queryByRole('button', { name: '页边批注' })).not.toBeInTheDocument()
    })

    enterReviewMode()
    fireEvent.click(await screen.findByRole('button', { name: '沿着聊' }))

    expect(screen.getByRole('heading', { name: '沿着这句聊' })).toBeInTheDocument()
    expect(screen.queryByText('Codex')).not.toBeInTheDocument()
  })

  it('opens an annotation chat and saves the returned Codex thread id', async () => {
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
    const readAnnotations = vi.fn().mockResolvedValue(annotationFile)
    const saveAnnotations = vi.fn((date: string, annotations: AnnotationFile['annotations']) =>
      Promise.resolve({
        ...annotationFile,
        date,
        annotations,
      }),
    )
    const chatWithAnnotation = vi.fn().mockResolvedValue({
      response: '可以从“轻”这个词继续看。',
      threadId: 'thread_ann_today_light',
      usage: null,
    })

    vi.stubGlobal('journalStore', { loadToday, saveToday: vi.fn(), readAnnotations, saveAnnotations })
    vi.stubGlobal('codex', { chatWithAnnotation })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(readAnnotations).toHaveBeenCalledWith('2026-04-28')
    })
    enterReviewMode()

    fireEvent.click(await screen.findByRole('button', { name: '沿着聊' }))

    expect(screen.getByText('摘自原文')).toBeInTheDocument()
    expect(screen.getByText('第 2 行')).toBeInTheDocument()
    expect(screen.getByLabelText('批注原文')).toHaveTextContent('今天记得很轻')

    fireEvent.change(screen.getByRole('textbox', { name: '继续聊页边批注' }), {
      target: { value: '展开说说' },
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(chatWithAnnotation).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2026-04-28',
          message: '展开说说',
          threadId: undefined,
          annotation: expect.objectContaining({ id: 'ann_today_light' }),
        }),
      )
      expect(saveAnnotations).toHaveBeenCalledWith(
        '2026-04-28',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'ann_today_light',
            ai: { threadId: 'thread_ann_today_light' },
          }),
        ]),
      )
      expect(screen.getByText('可以从“轻”这个词继续看。')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '返回页边批注' }))

    expect(screen.getByRole('heading', { name: '页边批注' })).toBeInTheDocument()
  })

  it('loads existing Codex thread messages when reopening an annotation chat', async () => {
    const storedJournal = {
      content: '---\ndate: 2026-04-28\n---\n\n# 今天\n今天的光很轻。\n',
      date: '2026-04-28',
      fileName: '2026-04-28.md',
      filePath: '/Users/zilin/.journal/2026-04-28.md',
      updatedAt: '2026-04-28T08:00:00.000Z',
    }
    const longEntryMarkdown = '# 今天\n今天的光很轻。'
    const exact = '今天的光很轻'
    const start = longEntryMarkdown.indexOf(exact)
    const annotationFile: AnnotationFile = {
      version: 1,
      date: '2026-04-28',
      source: storedJournal.filePath,
      sourceHash: 'hash',
      annotations: [
        {
          id: 'ann_threaded',
          author: 'ai',
          kind: 'observation',
          target: {
            type: 'longEntryRange',
            selector: createTextSelector(longEntryMarkdown, start, start + exact.length),
          },
          body: {
            content: '这里有一点很轻的感觉。',
          },
          status: 'visible',
          createdAt: '2026-04-28T17:20:00+08:00',
          ai: { threadId: 'thread_ann_threaded' },
        },
      ],
    }
    const loadToday = vi.fn().mockResolvedValue(storedJournal)
    const readAnnotations = vi.fn().mockResolvedValue(annotationFile)
    const readAnnotationThread = vi.fn().mockResolvedValue({
      messages: [
        { id: 'thread_1', role: 'user', content: '为什么是轻？' },
        { id: 'thread_2', role: 'assistant', content: '可能是因为你在描述一种没有压迫感的亮。' },
      ],
    })

    vi.stubGlobal('journalStore', { loadToday, readAnnotations })
    vi.stubGlobal('codex', { readAnnotationThread })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(readAnnotations).toHaveBeenCalledWith('2026-04-28')
    })
    enterReviewMode()
    fireEvent.click(await screen.findByRole('button', { name: '沿着聊' }))

    await waitFor(() => {
      expect(readAnnotationThread).toHaveBeenCalledWith('thread_ann_threaded')
      expect(screen.getByText('为什么是轻？')).toBeInTheDocument()
      expect(screen.getByText('可能是因为你在描述一种没有压迫感的亮。')).toBeInTheDocument()
    })
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
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 3, 28, 10, 0, 0))

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
    expect(screen.queryByRole('heading', { name: '页边' })).not.toBeInTheDocument()
  })

  it('restores the last selected review mode for a non-empty journal', async () => {
    window.localStorage.setItem('journal.preview.mode', 'review')

    const storedJournal = {
      content: '---\ndate: 2026-04-28\n---\n\n# 从文件醒来\n今天记得很轻。\n',
      date: '2026-04-28',
      fileName: '2026-04-28.md',
      filePath: '/Users/zilin/.journal/2026-04-28.md',
      updatedAt: '2026-04-28T06:30:00.000Z',
    }
    const loadToday = vi.fn().mockResolvedValue(storedJournal)

    vi.stubGlobal('journalStore', { loadToday })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(loadToday).toHaveBeenCalledOnce()
      expect(screen.getByRole('button', { name: '回看' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('heading', { name: '从文件醒来' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '页边' })).toBeInTheDocument()
    })
  })

  it('opens a new blank journal in writing mode even when review was stored', async () => {
    window.localStorage.setItem('journal.preview.mode', 'review')

    const storedJournal = {
      content: '---\ndate: 2026-04-29\n---\n\n',
      date: '2026-04-29',
      fileName: '2026-04-29.md',
      filePath: '/Users/zilin/.journal/2026-04-29.md',
      updatedAt: '2026-04-29T00:00:00.000Z',
    }
    const loadToday = vi.fn().mockResolvedValue(storedJournal)

    vi.stubGlobal('journalStore', { loadToday })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(loadToday).toHaveBeenCalledOnce()
      expect(screen.getByRole('button', { name: '书写' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('textbox', { name: '日记正文' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: '页边' })).not.toBeInTheDocument()
    })
  })

  it('persists mode changes locally', () => {
    render(<MarkdownPreviewPage />)

    enterReviewMode()

    expect(window.localStorage.getItem('journal.preview.mode')).toBe('review')

    fireEvent.click(screen.getByRole('button', { name: '书写' }))

    expect(window.localStorage.getItem('journal.preview.mode')).toBe('write')
  })

  it('shows the reading preview and annotation margin in review mode', () => {
    render(<MarkdownPreviewPage />)

    enterReviewMode()

    expect(screen.getByRole('button', { name: '回看' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: '批注目标' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '页边' })).toBeInTheDocument()
  })

  it('mounts the writing surface as a CodeMirror editor', () => {
    const { container } = render(<MarkdownPreviewPage />)

    expect(screen.getByRole('textbox', { name: '日记正文' })).toBeInTheDocument()
    expect(container.querySelector('.cm-editor')).toBeInTheDocument()
  })

  it('keeps murmur metadata out of the long-entry editor and shows it in the murmur panel', async () => {
    const storedJournal = {
      content: `---
date: 2026-04-29
---

# 今天

长日记写在这里。

:::murmur
id: m_20260429_213800
time: 2026-04-29T21:38:00+08:00
---
窗外下雨了。
:::`,
      date: '2026-04-29',
      fileName: '2026-04-29.md',
      filePath: '/Users/zilin/.journal/2026-04-29.md',
      updatedAt: '2026-04-29T13:38:00.000Z',
    }
    const loadToday = vi.fn().mockResolvedValue(storedJournal)

    vi.stubGlobal('journalStore', { loadToday })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '日记正文' })).toHaveTextContent('长日记写在这里。')
      expect(screen.getByRole('textbox', { name: '日记正文' })).not.toHaveTextContent('m_20260429_213800')
      expect(screen.getByLabelText('碎碎念')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /窗外下雨了/ })).toBeInTheDocument()
    })
  })

  it('adds and edits a murmur through the form, then autosaves readable markdown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 3, 29, 21, 38, 0))

    const storedJournal = {
      content: '---\ndate: 2026-04-29\n---\n\n# 今天\n',
      date: '2026-04-29',
      fileName: '2026-04-29.md',
      filePath: '/Users/zilin/.journal/2026-04-29.md',
      updatedAt: '2026-04-29T13:30:00.000Z',
    }
    const loadToday = vi.fn().mockResolvedValue(storedJournal)
    const saveDate = vi.fn((date: string, content: string) =>
      Promise.resolve({
        ...storedJournal,
        date,
        content,
      }),
    )

    vi.stubGlobal('journalStore', { loadToday, saveDate })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '日记正文' })).toHaveTextContent('今天')
    })

    fireEvent.click(screen.getByRole('button', { name: '添一条' }))
    fireEvent.change(screen.getByRole('textbox', { name: '碎碎念正文' }), {
      target: { value: '刚才下雨了。' },
    })
    vi.advanceTimersByTime(800)

    await waitFor(() => {
      expect(saveDate).toHaveBeenCalledWith(
        '2026-04-29',
        expect.stringContaining(':::murmur\nid: m_20260429_213800'),
      )
      expect(saveDate).toHaveBeenCalledWith(
        '2026-04-29',
        expect.stringContaining('刚才下雨了。\n:::'),
      )
    })
  })

  it('imports images into the selected murmur and writes image blocks', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const storedJournal = {
      content: `---
date: 2026-04-29
---

# 今天

:::murmur
id: m_20260429_213800
time: 2026-04-29T21:38:00+08:00
---
窗外下雨了。
:::`,
      date: '2026-04-29',
      fileName: '2026-04-29.md',
      filePath: '/Users/zilin/.journal/2026-04-29.md',
      updatedAt: '2026-04-29T13:38:00.000Z',
    }
    const loadToday = vi.fn().mockResolvedValue(storedJournal)
    const saveDate = vi.fn((date: string, content: string) => Promise.resolve({ ...storedJournal, date, content }))
    const importImages = vi.fn().mockResolvedValue([
      {
        id: 'img_20260429_213801',
        src: '2026-04-29.media/img_20260429_213801.jpg',
        fileName: 'img_20260429_213801.jpg',
        filePath: '/Users/zilin/.journal/2026-04-29.media/img_20260429_213801.jpg',
      },
    ])

    vi.stubGlobal('journalStore', { loadToday, saveDate, importImages })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /窗外下雨了/ })).toBeInTheDocument()
    })
    await screen.findByRole('textbox', { name: '碎碎念正文' })

    fireEvent.click(screen.getByRole('button', { name: '加图片' }))

    await waitFor(() => {
      expect(importImages).toHaveBeenCalledWith('2026-04-29')
      expect(screen.getByText('2026-04-29.media/img_20260429_213801.jpg')).toBeInTheDocument()
    })

    vi.advanceTimersByTime(800)

    await waitFor(() => {
      expect(saveDate).toHaveBeenCalledWith(
        '2026-04-29',
        expect.stringContaining('::image\nid: img_20260429_213801'),
      )
      expect(saveDate).toHaveBeenCalledWith(
        '2026-04-29',
        expect.stringContaining('src: 2026-04-29.media/img_20260429_213801.jpg'),
      )
    })
  })

  it('removes an image block without deleting the media file', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const storedJournal = {
      content: `---
date: 2026-04-29
---

# 今天

:::murmur
id: m_20260429_213800
time: 2026-04-29T21:38:00+08:00
---
窗外下雨了。

::image
id: img_20260429_213801
src: 2026-04-29.media/img_20260429_213801.jpg
caption: 雨窗
tags: [雨]
::
:::`,
      date: '2026-04-29',
      fileName: '2026-04-29.md',
      filePath: '/Users/zilin/.journal/2026-04-29.md',
      updatedAt: '2026-04-29T13:38:00.000Z',
    }
    const loadToday = vi.fn().mockResolvedValue(storedJournal)
    const saveDate = vi.fn((date: string, content: string) => Promise.resolve({ ...storedJournal, date, content }))
    const deleteImage = vi.fn()

    vi.stubGlobal('journalStore', { loadToday, saveDate, deleteImage })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('雨窗')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '移除图片' }))
    vi.advanceTimersByTime(800)

    await waitFor(() => {
      const savedContent = saveDate.mock.calls.at(-1)?.[1] ?? ''

      expect(savedContent).not.toContain('img_20260429_213801')
      expect(savedContent).toContain('窗外下雨了。')
    })
    expect(deleteImage).not.toHaveBeenCalled()
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
