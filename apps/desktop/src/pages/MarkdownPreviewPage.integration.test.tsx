import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownPreviewPage from './MarkdownPreviewPage'

vi.mock('./markdown-preview/JournalMarkdownEditor', () => ({
  default: ({
    onChange,
    onCompositionChange,
    value,
  }: {
    onChange: (value: string) => void
    onCompositionChange?: (isComposing: boolean, value: string) => void
    value: string
  }) => (
    <textarea
      aria-label="日记正文"
      onChange={(event) => onChange(event.currentTarget.value)}
      onCompositionEnd={(event) => {
        const target = event.target as HTMLTextAreaElement
        onCompositionChange?.(false, target.value)
      }}
      onCompositionStart={(event) => {
        const target = event.target as HTMLTextAreaElement
        onCompositionChange?.(true, target.value)
      }}
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
      expect(screen.queryByText('~/.journal/2026-04-28.md')).not.toBeInTheDocument()
      expect(screen.queryByTitle(storedJournal.filePath)).not.toBeInTheDocument()
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

  it('shows markdown diagnostics from the loaded journal', async () => {
    const storedJournal = {
      content: '---\ndate: 2026-04-28\n\n# 没有结束标记\n',
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

    expect(await screen.findByText('Markdown 格式需要处理')).toBeInTheDocument()
    expect(screen.getByText(/Front Matter 缺少结束标记/)).toBeInTheDocument()
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
      vi.advanceTimersByTime(5_100)
    })

    await waitFor(() => {
      expect(saveDate).toHaveBeenCalledWith(
        '2026-04-28',
        expect.stringContaining('地铁上突然想到的一句。'),
      )
    })
    const savedMurmurCall = saveDate.mock.calls.find(([, content]) =>
      content.includes('地铁上突然想到的一句。'),
    )

    expect(savedMurmurCall?.[1]).toContain(':::murmur')
    expect(savedMurmurCall?.[1]).toContain('id: m_20260428_101205')
  })

  it('keeps imported image metadata internal in the murmur editor', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 5, 8, 21, 38, 0))

    const storedJournal = {
      content: '---\ndate: 2026-06-08\n---\n\n',
      date: '2026-06-08',
      fileName: '2026-06-08.md',
      filePath: '/Users/zilin/.journal/entries/2026/06/2026-06-08.md',
      updatedAt: null,
    }
    const saveDate = vi.fn(async (date: string, content: string) => ({
      ...storedJournal,
      content,
      date,
      updatedAt: '2026-06-08T21:38:05.000Z',
    }))
    const importImages = vi.fn(async () => [
      {
        id: 'img_20260608_213800',
        src: 'media/2026/06/img_20260608_213800.jpg',
        fileName: 'img_20260608_213800.jpg',
        filePath: '/Users/zilin/.journal/media/2026/06/img_20260608_213800.jpg',
        location: {
          latitude: 30.123456,
          longitude: 104.654321,
          name: '青龙湖',
          source: 'exif' as const,
        },
      },
    ])

    vi.stubGlobal('journalStore', {
      importImages,
      loadToday: vi.fn().mockResolvedValue(storedJournal),
      saveDate,
      saveToday: vi.fn(),
    })

    render(<MarkdownPreviewPage />)

    await screen.findByRole('complementary', { name: '碎碎念' })
    fireEvent.click(screen.getByRole('button', { name: '添一条' }))
    fireEvent.click(screen.getByRole('button', { name: '加图片' }))

    const captionInput = await screen.findByRole('textbox', { name: '图片说明' })

    expect(captionInput).toHaveValue('')
    expect(screen.getByRole('button', { name: '移除图片' })).toBeInTheDocument()
    expect(screen.queryByText('media/2026/06/img_20260608_213800.jpg')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('图片标签')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('图片地点')).not.toBeInTheDocument()
    expect(screen.queryByText('青龙湖')).not.toBeInTheDocument()
    expect(screen.queryByText(/30\.12346/)).not.toBeInTheDocument()

    fireEvent.change(captionInput, {
      target: { value: '湖边那张晚饭。' },
    })

    act(() => {
      vi.advanceTimersByTime(5_100)
    })

    await waitFor(() => {
      expect(saveDate).toHaveBeenCalledWith(
        '2026-06-08',
        expect.stringContaining('caption: 湖边那张晚饭。'),
      )
    })
    const savedImageCall = saveDate.mock.calls.find(([, content]) =>
      content.includes('caption: 湖边那张晚饭。'),
    )

    expect(savedImageCall?.[1]).toContain('src: media/2026/06/img_20260608_213800.jpg')
    expect(savedImageCall?.[1]).toContain('location: 青龙湖')
    expect(savedImageCall?.[1]).toContain('locationSource: exif')
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
      vi.advanceTimersByTime(5_100)
    })

    await waitFor(() => {
      expect(saveDate).toHaveBeenCalledWith(
        '2026-04-28',
        expect.stringContaining('新写的一句。'),
      )
    })
    const savedEditCall = saveDate.mock.calls.find(([, content]) =>
      content.includes('新写的一句。'),
    )

    expect(savedEditCall?.[1]).toContain(':::murmur')
    expect(savedEditCall?.[1]).toContain('旧碎碎念。')
  })

  it('waits for IME composition to finish before autosaving journal edits', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 5, 8, 22, 16, 0))

    const storedJournal = {
      content: '---\ndate: 2026-06-08\n---\n\n',
      date: '2026-06-08',
      fileName: '2026-06-08.md',
      filePath: '/Users/zilin/.journal/entries/2026/06/2026-06-08.md',
      updatedAt: null,
    }
    const saveDate = vi.fn(async (date: string, content: string) => ({
      ...storedJournal,
      content,
      date,
      updatedAt: '2026-06-08T14:16:05.000Z',
    }))

    vi.stubGlobal('journalStore', {
      loadToday: vi.fn().mockResolvedValue(storedJournal),
      saveDate,
      saveToday: vi.fn(),
    })

    render(<MarkdownPreviewPage />)

    const textbox = await screen.findByRole('textbox', { name: '日记正文' })

    fireEvent.compositionStart(textbox)
    fireEvent.change(textbox, {
      target: { value: '最近在想一个问题ne' },
    })

    act(() => {
      vi.advanceTimersByTime(5_100)
    })

    expect(saveDate).not.toHaveBeenCalled()

    fireEvent.compositionEnd(textbox, {
      target: { value: '最近在想一个问题呢' },
    })

    act(() => {
      vi.advanceTimersByTime(5_100)
    })

    await waitFor(() => {
      expect(saveDate).toHaveBeenCalledWith(
        '2026-06-08',
        expect.stringContaining('最近在想一个问题呢'),
      )
    })
    expect(saveDate.mock.calls.some(([, content]) =>
      content.includes('最近在想一个问题ne'),
    )).toBe(false)
  })

})
