import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSketchCanvas,
  SKETCH_DOCUMENT_SCHEMA_VERSION,
  SketchSessionProvider,
  type SketchDocumentSummary,
  type StoredSketchDocument,
} from '../domain/sketch'
import AllPagesHomePage from './AllPagesHomePage'
import type { JournalIndexEntry } from '../domain/journalIndex/types'

function renderHomePage() {
  return render(
    <SketchSessionProvider>
      <MemoryRouter>
        <AllPagesHomePage />
      </MemoryRouter>
    </SketchSessionProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.sketchStore = undefined
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
  it('shows the quiet homepage prompt without action shortcuts', async () => {
    vi.stubGlobal('journalStore', { listIndex: vi.fn().mockResolvedValue(indexedMemories) })

    renderHomePage()

    expect(screen.getByRole('heading', { name: '万物有迹，心事且留' })).toBeInTheDocument()
    expect(await screen.findByText(/且留 · \d+月\d+日 · 星期. · 已安放 2 页/)).toBeInTheDocument()
    expect(screen.queryByLabelText('快捷入口')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /写一页/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /留一句/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /收照片/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '这一幅' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '留一笔' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '看回放' })).not.toBeInTheDocument()
  })

  it('previews the newest sketch with drawing events instead of the newest blank sketch', async () => {
    const blankDocument = createStoredSketchDocument({
      id: 'sketch_20260506090000_blank',
      updatedAt: '2026-05-06T09:00:00.000Z',
    })
    const drawnDocument = createStoredSketchDocument({
      id: 'sketch_20260505190000_drawn',
      updatedAt: '2026-05-05T19:00:00.000Z',
      events: [
        {
          type: 'stroke:start',
          id: 'event_1',
          at: 0,
          strokeId: 'stroke_1',
          tool: 'pencil',
          color: '#2f261f',
          size: 8,
          point: { x: 80, y: 90, t: 0 },
        },
        {
          type: 'stroke:point',
          id: 'event_2',
          at: 120,
          strokeId: 'stroke_1',
          point: { x: 140, y: 130, t: 120 },
        },
        {
          type: 'stroke:end',
          id: 'event_3',
          at: 160,
          strokeId: 'stroke_1',
        },
      ],
    })
    const olderDrawnDocument = createStoredSketchDocument({
      id: 'sketch_20260504190000_older',
      updatedAt: '2026-05-04T19:00:00.000Z',
      events: [
        {
          type: 'stroke:start',
          id: 'event_old_1',
          at: 0,
          strokeId: 'stroke_old_1',
          tool: 'pencil',
          color: '#2f261f',
          size: 8,
          point: { x: 60, y: 70, t: 0 },
        },
        {
          type: 'stroke:end',
          id: 'event_old_2',
          at: 80,
          strokeId: 'stroke_old_1',
        },
      ],
    })
    const sketchDocuments = [blankDocument, drawnDocument, olderDrawnDocument]
    window.sketchStore = {
      list: vi.fn(async () => [
        createSketchDocumentSummary(blankDocument),
        createSketchDocumentSummary(drawnDocument),
        createSketchDocumentSummary(olderDrawnDocument),
      ]),
      create: vi.fn(),
      load: vi.fn(async (id: string) =>
        sketchDocuments.find((document) => document.id === id) ?? blankDocument,
      ),
      save: vi.fn(),
      import: vi.fn(),
      delete: vi.fn(),
    }

    renderHomePage()

    expect(await screen.findByText('一张旧画，正在这里慢慢浮出来。')).toBeInTheDocument()
    expect(screen.getByText(/5月\d+日 \d{2}:00 留下/)).toBeInTheDocument()
    expect(screen.queryByText(/个事件/)).not.toBeInTheDocument()
    expect(screen.queryByText(/原始/)).not.toBeInTheDocument()
    expect(screen.queryByText(/回放 \d/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上一幅' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下一幅' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '播放' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '播放' }))
    fireEvent.click(screen.getByRole('button', { name: '下一幅' }))
    expect(screen.getByRole('button', { name: '上一幅' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '下一幅' })).toBeDisabled()
    expect(screen.queryByText('空白画纸')).not.toBeInTheDocument()
  })

  it('surfaces indexed memories instead of review categories', async () => {
    vi.stubGlobal('journalStore', { listIndex: vi.fn().mockResolvedValue(indexedMemories) })

    const { container } = renderHomePage()

    expect(screen.getByRole('heading', { name: '翻到几声回声' })).toBeInTheDocument()
    expect(await screen.findByText('雨夜便利店')).toBeInTheDocument()
    expect(screen.getByText('窗边那盆植物又长出一点新叶。')).toBeInTheDocument()
    expect(container.querySelectorAll('.all-pages-memory-board img')).toHaveLength(1)
    expect(container.querySelectorAll('.all-pages-memory-card.is-text-only')).toHaveLength(1)
    expect(screen.queryByText('往年今日')).not.toBeInTheDocument()
    expect(screen.queryByText('同样天气')).not.toBeInTheDocument()
    expect(screen.queryByText('整理未完成')).not.toBeInTheDocument()
    expect(screen.queryByText('批注回看')).not.toBeInTheDocument()
  })

  it('shows an empty memory state when index loading fails', async () => {
    vi.stubGlobal('journalStore', { listIndex: vi.fn().mockRejectedValue(new Error('broken')) })

    const { container } = renderHomePage()

    expect(await screen.findByText('索引没有读出来，但今天仍然可以继续写。')).toBeInTheDocument()
    expect(container.querySelector('.all-pages-memory-board img')).not.toBeInTheDocument()
  })

  it('shows sticky note, postcard, polaroid, movie ticket, library card, and receipt studies', () => {
    renderHomePage()

    expect(screen.getByRole('heading', { name: '先留几种手感' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '便利贴' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '明信片' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '拍立得卡片' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '电影票' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '回忆借阅卡' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '今日小票' })).toBeInTheDocument()
    expect(screen.getByText('今天的风把窗帘吹得很轻，像有人在旁边翻书。')).toBeInTheDocument()
    expect(screen.getByText('桥下有人吹口琴，傍晚慢慢落到杯沿上。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '便利店门口' })).toBeInTheDocument()
    expect(screen.getByText('伞面一直滴水，灯却很亮。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '雨停以后' })).toBeInTheDocument()
    expect(screen.getByText('去买一杯热咖啡')).toBeInTheDocument()
    expect(screen.getByText('我 / 雨后的路灯 / 一条没发出去的消息')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '旧书店门口等雨停' })).toBeInTheDocument()
    expect(screen.getByText('门口雨棚')).toBeInTheDocument()
    expect(screen.getByText('车窗起雾，票根夹在第 27 页')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'DAILY RECEIPT' })).toBeInTheDocument()
    expect(screen.getByText('热咖啡前的勇气')).toBeInTheDocument()
    expect(screen.getByText('Thank you for staying.')).toBeInTheDocument()
  })

  it('lets the polaroid study switch snapshots and flip over', () => {
    renderHomePage()

    fireEvent.click(screen.getByRole('button', { name: '窗边' }))

    expect(screen.getByRole('heading', { name: '新叶长出来' })).toBeInTheDocument()
    expect(screen.getByText('有些变化很小，但不是没有。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '翻到背面' }))

    expect(screen.getByRole('button', { name: '翻回正面' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('窗边那盆植物又长出一点新叶。那一瞬间突然觉得，慢一点也可以算是在往前。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '按下快门' }))

    expect(screen.getByRole('button', { name: '翻到背面' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('heading', { name: '新叶长出来' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '书页' }))

    expect(screen.getByRole('button', { name: '翻到背面' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('heading', { name: '风把纸页吹起' })).toBeInTheDocument()
  })

  it('shows both CD player display concepts', () => {
    renderHomePage()

    expect(screen.getByRole('heading', { name: 'CD 播放器' })).toBeInTheDocument()
    expect(screen.getByText('A · 复古实物感')).toBeInTheDocument()
    expect(screen.getByText('B · 极简播放器面板')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '雨停在十点半' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '今天没发生大事' })).toBeInTheDocument()
    expect(screen.getByText('没发出去的那条消息')).toBeInTheDocument()
  })

  it('lets the receipt study switch mode, stamp, print, and tear', () => {
    renderHomePage()

    fireEvent.click(screen.getByRole('button', { name: '情绪' }))

    expect(screen.getByRole('heading', { name: 'EMOTIONAL RECEIPT' })).toBeInTheDocument()
    expect(screen.getByText('焦虑库存')).toBeInTheDocument()
    expect(screen.getByText('情绪结算')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'SURVIVED' }))

    expect(screen.getByLabelText('当前盖章 SURVIVED')).toBeInTheDocument()

    const tearButton = screen.getByRole('button', { name: '撕下' })
    fireEvent.click(tearButton)

    expect(screen.getByRole('button', { name: '复原' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '重新结算' }))

    expect(screen.getByRole('heading', { name: 'SOFT RECEIPT' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '打印' }))

    expect(screen.getByRole('heading', { name: 'SOFT RECEIPT' })).toBeInTheDocument()
  })
})

function createStoredSketchDocument(
  overrides: Partial<StoredSketchDocument> = {},
): StoredSketchDocument {
  const createdAt = overrides.createdAt ?? '2026-05-05T10:00:00.000Z'
  const id = overrides.id ?? 'sketch_20260505100000_test'

  return {
    schemaVersion: SKETCH_DOCUMENT_SCHEMA_VERSION,
    id,
    title: '未命名随画',
    createdAt,
    updatedAt: createdAt,
    canvas: createSketchCanvas(),
    events: [],
    fileName: `${id}.json`,
    filePath: `/Users/zilin/.journal/sketches/${id}.json`,
    ...overrides,
  }
}

function createSketchDocumentSummary(document: StoredSketchDocument): SketchDocumentSummary {
  return {
    id: document.id,
    title: document.title,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    canvas: document.canvas,
    eventCount: document.events.length,
    fileName: document.fileName,
    filePath: document.filePath,
  }
}
