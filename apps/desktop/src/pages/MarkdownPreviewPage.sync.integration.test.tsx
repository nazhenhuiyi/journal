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

describe('MarkdownPreviewPage desktop sync integration', () => {
  it('continues pending sync when tracked git files are dirty on startup', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const storedJournal = {
      content: '---\ndate: 2026-06-08\n---\n\n已经保存但还没同步。',
      date: '2026-06-08',
      fileName: '2026-06-08.md',
      filePath: '/Users/zilin/.journal/entries/2026/06/2026-06-08.md',
      updatedAt: '2026-06-08T14:10:00.000Z',
    }
    const push = vi.fn(async () => ({
      changed: true,
      dirtyPaths: [],
    }))

    vi.stubGlobal('journalStore', {
      loadToday: vi.fn().mockResolvedValue(storedJournal),
      saveToday: vi.fn(),
    })
    vi.stubGlobal('journalSync', {
      loadStatus: vi.fn().mockResolvedValue({
        branch: 'main',
        dirtyPaths: ['entries/2026/06/2026-06-08.md'],
        hasCredentials: true,
        hasRepository: true,
        recentCommits: [],
        remoteUrl: 'https://github.com/example/journal-sync.git',
        syncSnapshot: null,
        worktreeDirectory: '/Users/zilin/.journal',
      }),
      pull: vi.fn().mockResolvedValue({
        changed: false,
        dirtyPaths: ['entries/2026/06/2026-06-08.md'],
      }),
      push,
      saveState: vi.fn(),
      syncNow: vi.fn(),
    })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(window.journalSync?.loadStatus).toHaveBeenCalledOnce()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })

    await waitFor(() => {
      expect(push).toHaveBeenCalledOnce()
    })
    expect(push).toHaveBeenCalledWith({
      changedPaths: ['entries/2026/06/2026-06-08.md'],
      collectDirtyPathsAfterSync: false,
    })
  })

  it('flushes pending push when leaving the writing page before the debounce fires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const storedJournal = {
      content: '---\ndate: 2026-06-09\n---\n\n开头。',
      date: '2026-06-09',
      fileName: '2026-06-09.md',
      filePath: '/Users/zilin/.journal/entries/2026/06/2026-06-09.md',
      updatedAt: null,
    }
    const saveDate = vi.fn(async (date: string, content: string) => ({
      ...storedJournal,
      content,
      date,
      didWrite: true,
      updatedAt: '2026-06-09T03:16:05.000Z',
    }))
    const push = vi.fn(async () => ({
      changed: true,
      dirtyPaths: [],
    }))

    vi.stubGlobal('journalStore', {
      loadToday: vi.fn().mockResolvedValue(storedJournal),
      saveDate,
      saveToday: vi.fn(),
    })
    vi.stubGlobal('journalSync', {
      loadStatus: vi.fn().mockResolvedValue({
        branch: 'main',
        dirtyPaths: [],
        hasCredentials: true,
        hasRepository: true,
        recentCommits: [],
        remoteUrl: 'https://github.com/example/journal-sync.git',
        syncSnapshot: null,
        worktreeDirectory: '/Users/zilin/.journal',
      }),
      pull: vi.fn().mockResolvedValue({
        changed: false,
        dirtyPaths: [],
      }),
      push,
      saveState: vi.fn(),
      syncNow: vi.fn(),
    })

    const view = render(<MarkdownPreviewPage />)

    await screen.findByRole('textbox', { name: '日记正文' })
    insertEditorText('\n准备切到设置页。')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100)
    })

    await waitFor(() => {
      expect(saveDate).toHaveBeenCalledOnce()
    })

    view.unmount()

    await waitFor(() => {
      expect(push).toHaveBeenCalledOnce()
    })
    expect(push).toHaveBeenCalledWith({
      changedPaths: ['entries/2026/06/2026-06-09.md'],
      collectDirtyPathsAfterSync: false,
    })
  })

  it('includes imported media paths when pushing image murmurs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 5, 8, 10, 0, 0))

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
      didWrite: true,
      updatedAt: '2026-06-08T10:00:05.000Z',
    }))
    const importImages = vi.fn(async () => [
      {
        id: 'img_20260608_100001',
        src: 'media/2026/06/img_20260608_100001.jpg',
        fileName: 'img_20260608_100001.jpg',
        filePath: '/Users/zilin/.journal/media/2026/06/img_20260608_100001.jpg',
      },
    ])
    const push = vi.fn(async () => ({
      changed: true,
      dirtyPaths: [],
    }))

    vi.stubGlobal('journalStore', {
      importImages,
      loadToday: vi.fn().mockResolvedValue(storedJournal),
      saveDate,
      saveToday: vi.fn(),
    })
    vi.stubGlobal('journalSync', {
      loadStatus: vi.fn().mockResolvedValue({
        branch: 'main',
        dirtyPaths: [],
        hasCredentials: true,
        hasRepository: true,
        recentCommits: [],
        remoteUrl: 'https://github.com/example/journal-sync.git',
        syncSnapshot: null,
        worktreeDirectory: '/Users/zilin/.journal',
      }),
      pull: vi.fn().mockResolvedValue({
        changed: false,
        dirtyPaths: [],
      }),
      push,
      saveState: vi.fn(),
      syncNow: vi.fn(),
    })

    render(<MarkdownPreviewPage />)

    await screen.findByRole('complementary', { name: '碎碎念' })
    fireEvent.click(screen.getByRole('button', { name: '添一条' }))
    fireEvent.click(screen.getByRole('button', { name: '加图片' }))

    await waitFor(() => {
      expect(importImages).toHaveBeenCalledOnce()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100)
    })

    await waitFor(() => {
      expect(saveDate).toHaveBeenCalledOnce()
    })
    expect(saveDate.mock.calls[0][1]).toContain('src: media/2026/06/img_20260608_100001.jpg')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_100)
    })

    await waitFor(() => {
      expect(push).toHaveBeenCalledOnce()
    })
    expect(push).toHaveBeenCalledWith({
      changedPaths: [
        'entries/2026/06/2026-06-08.md',
        'media/2026/06/img_20260608_100001.jpg',
      ],
      collectDirtyPathsAfterSync: false,
    })
  })

  it('reloads the open journal after remote pull instead of autosaving stale content', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const staleJournal = {
      content: '---\ndate: 2026-06-09\n---\n\n旧正文。',
      date: '2026-06-09',
      fileName: '2026-06-09.md',
      filePath: '/Users/zilin/.journal/entries/2026/06/2026-06-09.md',
      updatedAt: '2026-06-09T01:00:00.000Z',
    }
    const pulledJournal = {
      ...staleJournal,
      content: '---\ndate: 2026-06-09\n---\n\n旧正文。\n\n移动端新正文。',
      updatedAt: '2026-06-09T02:00:00.000Z',
    }
    const loadToday = vi.fn()
      .mockResolvedValueOnce(staleJournal)
      .mockResolvedValue(pulledJournal)
    const saveDate = vi.fn(async (date: string, content: string) => ({
      ...pulledJournal,
      content,
      date,
      didWrite: true,
    }))
    const pull = vi.fn(async () => ({
      changed: true,
      dirtyPaths: [],
    }))

    vi.stubGlobal('journalStore', {
      loadToday,
      saveDate,
      saveToday: vi.fn(),
    })
    vi.stubGlobal('journalSync', {
      loadStatus: vi.fn().mockResolvedValue({
        branch: 'main',
        dirtyPaths: [],
        hasCredentials: true,
        hasRepository: true,
        recentCommits: [],
        remoteUrl: 'https://github.com/example/journal-sync.git',
        syncSnapshot: null,
        worktreeDirectory: '/Users/zilin/.journal',
      }),
      pull,
      push: vi.fn(),
      saveState: vi.fn(),
      syncNow: vi.fn(),
    })

    render(<MarkdownPreviewPage />)

    await waitFor(() => {
      expect(pull).toHaveBeenCalledOnce()
      expect(loadToday).toHaveBeenCalledTimes(2)
    })

    expect(screen.getByRole('textbox', { name: '日记正文' })).toHaveTextContent('移动端新正文。')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100)
    })

    expect(saveDate).not.toHaveBeenCalled()
  })

  it('defers automatic push instead of flushing dirty editor content mid-writing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const storedJournal = {
      content: '---\ndate: 2026-06-08\n---\n\n开头。',
      date: '2026-06-08',
      fileName: '2026-06-08.md',
      filePath: '/Users/zilin/.journal/entries/2026/06/2026-06-08.md',
      updatedAt: null,
    }
    const saveDate = vi.fn(async (date: string, content: string) => ({
      ...storedJournal,
      content,
      date,
      didWrite: true,
      updatedAt: '2026-06-08T14:16:05.000Z',
    }))
    const push = vi.fn(async () => ({
      changed: true,
      dirtyPaths: [],
    }))

    vi.stubGlobal('journalStore', {
      loadToday: vi.fn().mockResolvedValue(storedJournal),
      saveDate,
      saveToday: vi.fn(),
    })
    vi.stubGlobal('journalSync', {
      loadStatus: vi.fn().mockResolvedValue({
        branch: 'main',
        dirtyPaths: [],
        hasCredentials: true,
        hasRepository: true,
        recentCommits: [],
        remoteUrl: 'https://github.com/example/journal-sync.git',
        syncSnapshot: null,
        worktreeDirectory: '/Users/zilin/.journal',
      }),
      pull: vi.fn().mockResolvedValue({
        changed: false,
        dirtyPaths: [],
      }),
      push,
      saveState: vi.fn(),
      syncNow: vi.fn(),
    })

    render(<MarkdownPreviewPage />)

    await screen.findByRole('textbox', { name: '日记正文' })
    insertEditorText('\n第一段。')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100)
    })

    await waitFor(() => {
      expect(saveDate).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(19_000)
    })
    insertEditorText('\n第二段。')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })

    expect(saveDate).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100)
    })

    await waitFor(() => {
      expect(saveDate).toHaveBeenCalledTimes(2)
    })
    expect(push).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })

    await waitFor(() => {
      expect(push).toHaveBeenCalledOnce()
    })
  })
})
