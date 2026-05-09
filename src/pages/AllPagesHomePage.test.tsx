import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AllPagesHomePage from './AllPagesHomePage'
import type { JournalIndexEntry } from '../domain/journalIndex/types'
import { getLocalDateKey, type DailyCuration } from '../domain/dailyCuration'

function renderHomePage() {
  return render(
    <MemoryRouter>
      <AllPagesHomePage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

const indexedMemories: JournalIndexEntry[] = [
  {
    collections: ['雨天'],
    date: '2026-04-25',
    excerpt: '便利店门口的灯很亮，伞面一直滴水。',
    favorite: true,
    fileName: '2026-04-25.md',
    filePath: '/Users/zilin/.journal/2026-04-25.md',
    images: [
      {
        caption: '雨夜便利店',
        id: 'img_20260425_210000',
        murmurId: 'm_20260425_210000',
        src: '2026-04-25.media/rain.jpg',
        tags: ['雨'],
      },
    ],
    murmurs: [],
    searchableText: '便利店门口的灯很亮，伞面一直滴水。',
    stats: { imageCount: 1, murmurCount: 0, wordCount: 18 },
    tags: ['小雨'],
    title: '雨夜便利店',
    updatedAt: null,
  },
  {
    collections: [],
    date: '2026-03-30',
    favorite: false,
    fileName: '2026-03-30.md',
    filePath: '/Users/zilin/.journal/2026-03-30.md',
    images: [],
    murmurs: [],
    searchableText: '窗边那盆植物又长出一点新叶。',
    stats: { imageCount: 0, murmurCount: 0, wordCount: 14 },
    tags: [],
    updatedAt: null,
  },
]

describe('AllPagesHomePage', () => {
  it('opens directly on the daily echo without homepage or sketch distractions', async () => {
    vi.stubGlobal('journalStore', { listIndex: vi.fn().mockResolvedValue(indexedMemories) })

    renderHomePage()

    expect(screen.getByRole('heading', { name: '今日回声' })).toBeInTheDocument()
    expect(await screen.findByText(/且留 · \d+月\d+日 · 星期. · 春天 · 已安放 2 页/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '万物有迹，心事且留' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '这一幅' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('快捷入口')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /写一页/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /留一句/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /收照片/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '留一笔' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '看回放' })).not.toBeInTheDocument()
  })

  it('generates and saves one daily curation from the historical index', async () => {
    vi.stubGlobal('journalStore', { listIndex: vi.fn().mockResolvedValue(indexedMemories) })

    renderHomePage()

    expect(await screen.findByRole('heading', { name: '2026.03.30 的一页' })).toBeInTheDocument()
    expect(screen.getByText('今日翻到')).toBeInTheDocument()
    expect(screen.getByText('一页旧日子，让它和此刻并排坐一会儿。')).toBeInTheDocument()
    expect(screen.queryByText('为什么今天')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('今日与旧页的双线索')).not.toBeInTheDocument()
    expect(screen.queryByText('主题线索')).not.toBeInTheDocument()
    expect(screen.queryByText('时间线索')).not.toBeInTheDocument()
    expect(screen.getByText('ARCHIVE NOTE')).toBeInTheDocument()
    expect(screen.getByLabelText('辅助回声')).toBeInTheDocument()
    expect(screen.getByText('便签')).toBeInTheDocument()
    expect(screen.getByText('小票')).toBeInTheDocument()

    await waitFor(() => {
      expect(window.localStorage.getItem('journal:daily-curations:v6')).toContain('daily-curation')
    })
  })

  it('persists the daily curation through the filesystem store when available', async () => {
    const saveDailyCuration = vi.fn().mockImplementation((curation: DailyCuration) =>
      Promise.resolve({
        curation,
        filePath: `/Users/zilin/.journal/curations/daily/${curation.curationDate}.json`,
      }),
    )

    vi.stubGlobal('journalStore', {
      listIndex: vi.fn().mockResolvedValue(indexedMemories),
      loadDailyCuration: vi.fn().mockResolvedValue(null),
      saveDailyCuration,
    })

    renderHomePage()

    expect(await screen.findByRole('heading', { name: '2026.03.30 的一页' })).toBeInTheDocument()

    await waitFor(() => {
      expect(saveDailyCuration).toHaveBeenCalledOnce()
    })
    expect(saveDailyCuration.mock.calls[0][0]).toMatchObject({
      curationDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      version: 6,
    })
    expect(window.localStorage.getItem('journal:daily-curations:v6')).toBeNull()
  })

  it('asks Codex to refine the daily curation copy when available', async () => {
    const generateDailyCurationDraft = vi.fn().mockResolvedValue({
      draft: {
        closingQuestion: '这页现在还留下些什么？',
        curatorVoice: '这页旧日子没有急着解释什么，只把窗边的新叶和今天放在同一张桌上，让一点安静重新回来。',
        parallelConnection: '相近余味：窗边的旁证',
        receiptItems: [
          { label: '今天', value: '今天' },
          { label: '回声', value: '春天' },
          { label: '天气', value: '春天' },
          { label: '找零', value: '一点春天' },
        ],
        subtitle: '窗边那页旧日子。',
        themeNoteBody: '这张旧页先放在旁边，让今天不用立刻解释自己。',
        themeNoteTitle: '窗边便签',
      },
      threadId: 'thread_daily_curation',
      usage: null,
    })

    vi.stubGlobal('journalStore', {
      listIndex: vi.fn().mockResolvedValue([
        ...indexedMemories,
        {
          ...indexedMemories[1],
          date: '2026-04-08',
          fileName: '2026-04-08.md',
          filePath: '/Users/zilin/.journal/2026-04-08.md',
          searchableText: '旧书桌上放着一只空杯子。',
          stats: { ...indexedMemories[1].stats, wordCount: 4 },
          title: '旧书桌',
        },
      ]),
    })
    vi.stubGlobal('codex', { generateDailyCurationDraft })

    renderHomePage()

    expect(await screen.findByText('窗边那页旧日子。')).toBeInTheDocument()
    expect(screen.getByText(/这页旧日子没有急着解释什么/)).toBeInTheDocument()
    expect(screen.getByText('窗边便签')).toBeInTheDocument()
    expect(screen.getByText('这页现在还留下些什么？')).toBeInTheDocument()
    expect(screen.getByText('相近余味：窗边的旁证')).toBeInTheDocument()
    expect(screen.getAllByText('春天').length).toBeGreaterThan(0)
    expect(screen.getByText('一点春天')).toBeInTheDocument()

    await waitFor(() => {
      expect(generateDailyCurationDraft).toHaveBeenCalledWith({
        curation: expect.objectContaining({
          source: expect.objectContaining({ title: '2026.03.30 的一页' }),
          version: 6,
        }),
      })
      expect(window.localStorage.getItem('journal:daily-curations:v6')).toContain('"provider":"codex"')
    })
  })

  it('shows an error instead of falling back when Codex curation fails', async () => {
    const generateDailyCurationDraft = vi.fn().mockRejectedValue(new Error('模型暂时不可用'))

    vi.stubGlobal('journalStore', { listIndex: vi.fn().mockResolvedValue(indexedMemories) })
    vi.stubGlobal('codex', { generateDailyCurationDraft })

    renderHomePage()

    expect(await screen.findByRole('alert')).toHaveTextContent('今日回声没有生成好：模型暂时不可用。请重新生成一次。')
    expect(screen.getByRole('button', { name: '重新生成今日策展' })).toBeEnabled()
    expect(screen.queryByText('ARCHIVE NOTE')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('journal:daily-curations:v6')).toBeNull()
  })

  it('keeps selection rationale internal while rendering the curation', async () => {
    vi.stubGlobal('journalStore', {
      listIndex: vi.fn().mockResolvedValue([
        {
          ...indexedMemories[0],
          date: '2025-05-09',
          excerpt: '小雨里绕到便利店，买了一杯热咖啡。',
          searchableText: '小雨里绕到便利店，买了一杯热咖啡。',
          title: '小雨便利店',
        },
      ]),
      loadToday: vi.fn().mockResolvedValue({
        content: `---
date: 2026-05-09
title: 雨天散步
weather:
  text: 小雨
  temperature: 18
location:
  name: 成都
tags: [小雨, 散步]
---
今天在小雨里散了一会儿步。`,
        date: '2026-05-09',
        fileName: '2026-05-09.md',
        filePath: '/Users/zilin/.journal/2026-05-09.md',
        updatedAt: null,
      }),
    })

    renderHomePage()

    expect(await screen.findByRole('heading', { name: '小雨便利店' })).toBeInTheDocument()
    expect(screen.queryByText('为什么今天')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('今日与旧页的双线索')).not.toBeInTheDocument()
    expect(screen.queryByText('主题线索')).not.toBeInTheDocument()
    expect(screen.queryByText('时间线索')).not.toBeInTheDocument()
    expect(screen.queryByText(/今天的《雨天散步》让“.+”先亮起来/)).not.toBeInTheDocument()
    expect(screen.getByText(/只把相近的余味放在手边/)).toBeInTheDocument()

    await waitFor(() => {
      expect(window.localStorage.getItem('journal:daily-curations:v6')).toContain('"anchors"')
    })
  })

  it('keeps today weather in the header without repeating it as a support card', async () => {
    vi.stubGlobal('journalStore', {
      listIndex: vi.fn().mockResolvedValue(indexedMemories),
      loadToday: vi.fn().mockResolvedValue({
        content: `---
date: 2026-05-09
weather:
  text: 小雨
  temperature: 18
location:
  name: 上海
tags: [雨天, 散步]
---
今天空气有点湿。`,
        date: '2026-05-09',
        fileName: '2026-05-09.md',
        filePath: '/Users/zilin/.journal/2026-05-09.md',
        updatedAt: null,
      }),
    })

    renderHomePage()

    expect(await screen.findByText(/小雨 · 18° · 上海/)).toBeInTheDocument()
    expect(screen.queryByText('今日天气书签')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(window.localStorage.getItem('journal:daily-curations:v6')).toContain('"text":"小雨"')
    })
  })

  it('renders a paper artifact when the curated echo has no image', async () => {
    vi.stubGlobal('journalStore', { listIndex: vi.fn().mockResolvedValue([indexedMemories[1]]) })

    renderHomePage()

    expect(await screen.findByRole('heading', { name: '2026.03.30 的一页' })).toBeInTheDocument()
    expect(screen.getByText('ARCHIVE NOTE')).toBeInTheDocument()
    expect(screen.queryByText('ECHO')).not.toBeInTheDocument()
  })

  it('lets the dev regenerate today curation while keeping it saved', async () => {
    vi.stubGlobal('journalStore', { listIndex: vi.fn().mockResolvedValue(indexedMemories) })

    renderHomePage()

    expect(await screen.findByRole('heading', { name: '2026.03.30 的一页' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新生成今日策展' }))

    expect(window.localStorage.getItem('journal:daily-curations:v6')).toContain('"generation":1')
  })

  it('ignores saved curations from the previous local cache version', async () => {
    const todayDateKey = getLocalDateKey()

    window.localStorage.setItem(
      'journal:daily-curations:v6',
      JSON.stringify({
        [todayDateKey]: {
          curationDate: todayDateKey,
          generation: 0,
          source: { collections: [], date: '2024-01-01', excerpt: '旧缓存', tags: [], title: '旧缓存回声' },
          version: 5,
        },
      }),
    )
    vi.stubGlobal('journalStore', { listIndex: vi.fn().mockResolvedValue([indexedMemories[1]]) })

    renderHomePage()

    expect(await screen.findByRole('heading', { name: '2026.03.30 的一页' })).toBeInTheDocument()
    expect(screen.queryByText('旧缓存回声')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(window.localStorage.getItem('journal:daily-curations:v6')).toContain('"version":6')
    })
  })

  it('does not keep card style studies on the echo page', () => {
    renderHomePage()

    expect(screen.queryByRole('heading', { name: '先留几种手感' })).not.toBeInTheDocument()
  })
})
