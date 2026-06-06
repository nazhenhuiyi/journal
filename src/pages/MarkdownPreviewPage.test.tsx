import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownPreviewPage from './MarkdownPreviewPage'

vi.mock('./markdown-preview/JournalMarkdownEditor', () => ({
  default: ({
    onChange,
    value,
  }: {
    onChange: (value: string) => void
    value: string
  }) => (
    <textarea
      aria-label="日记正文"
      onChange={(event) => onChange(event.currentTarget.value)}
      value={value}
    />
  ),
}))

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
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function insertEditorText(text: string) {
  const textbox = screen.getByRole('textbox', { name: '日记正文' }) as HTMLTextAreaElement

  fireEvent.change(textbox, { target: { value: `${textbox.value}${text}` } })
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
    expect(screen.queryByText('页边批注')).not.toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: '碎碎念' })).toBeInTheDocument()
    expect(saveToday).not.toHaveBeenCalled()
  })

  it('renders the journal body in review mode without annotation controls', async () => {
    const storedJournal = {
      content: '---\ndate: 2026-04-28\n---\n\n# 窗边植物\n窗边那盆植物又长出一点新叶。',
      date: '2026-04-28',
      fileName: '2026-04-28.md',
      filePath: '/Users/zilin/.journal/2026-04-28.md',
      updatedAt: null,
    }

    vi.stubGlobal('journalStore', {
      loadToday: vi.fn().mockResolvedValue(storedJournal),
      saveToday: vi.fn().mockResolvedValue(storedJournal),
    })

    render(<MarkdownPreviewPage />)

    await screen.findByRole('textbox', { name: '日记正文' })
    fireEvent.click(screen.getByRole('button', { name: '回看' }))

    expect(screen.getByRole('heading', { name: '窗边植物' })).toBeInTheDocument()
    expect(screen.getByText('窗边那盆植物又长出一点新叶。')).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: /批注/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: '碎碎念' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '日记正文' })).not.toBeInTheDocument()
  })

  it('creates and saves a murmur from the writing panel', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 3, 28, 10, 12, 5))

    const storedJournal = {
      content: '---\ndate: 2026-04-28\n---\n\n# 正文\n',
      date: '2026-04-28',
      fileName: '2026-04-28.md',
      filePath: '/Users/zilin/.journal/2026-04-28.md',
      updatedAt: null,
    }
    const saveDate = vi.fn(async (date: string, content: string) => ({
      ...storedJournal,
      content,
      date,
      updatedAt: '2026-04-28T10:13:00.000Z',
    }))

    vi.stubGlobal('journalStore', {
      loadToday: vi.fn().mockResolvedValue(storedJournal),
      saveDate,
      saveToday: vi.fn(),
    })

    render(<MarkdownPreviewPage />)

    await screen.findByRole('complementary', { name: '碎碎念' })
    fireEvent.click(screen.getByRole('button', { name: '添一条' }))
    fireEvent.change(screen.getByRole('textbox', { name: '碎碎念正文' }), {
      target: { value: '地铁上突然想到的一句。' },
    })

    act(() => {
      vi.advanceTimersByTime(800)
    })

    await waitFor(() => {
      expect(saveDate).toHaveBeenCalledWith(
        '2026-04-28',
        expect.stringContaining('地铁上突然想到的一句。'),
      )
    })
    expect(saveDate.mock.calls[0][1]).toContain(':::murmur')
    expect(saveDate.mock.calls[0][1]).toContain('id: m_20260428_101205')
  })

  it('preserves existing murmur blocks when saving long-entry edits', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 3, 28, 10, 0, 0))

    const storedJournal = {
      content: [
        '---',
        'date: 2026-04-28',
        '---',
        '',
        '# 正文',
        '原来的长日记。',
        '',
        ':::murmur',
        'id: m_20260428_101000',
        'time: 2026-04-28T10:10:00.000Z',
        '---',
        '旧碎碎念。',
        ':::',
      ].join('\n'),
      date: '2026-04-28',
      fileName: '2026-04-28.md',
      filePath: '/Users/zilin/.journal/2026-04-28.md',
      updatedAt: null,
    }
    const saveDate = vi.fn(async (date: string, content: string) => ({
      ...storedJournal,
      content,
      date,
      updatedAt: '2026-04-28T10:01:00.000Z',
    }))

    vi.stubGlobal('journalStore', {
      loadToday: vi.fn().mockResolvedValue(storedJournal),
      saveDate,
      saveToday: vi.fn(),
    })

    render(<MarkdownPreviewPage />)

    await screen.findByRole('textbox', { name: '日记正文' })
    insertEditorText('\n新写的一句。')

    act(() => {
      vi.advanceTimersByTime(800)
    })

    await waitFor(() => {
      expect(saveDate).toHaveBeenCalledWith(
        '2026-04-28',
        expect.stringContaining('新写的一句。'),
      )
    })
    expect(saveDate.mock.calls[0][1]).toContain(':::murmur')
    expect(saveDate.mock.calls[0][1]).toContain('旧碎碎念。')
  })
})
