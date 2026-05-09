import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  window.localStorage.clear()
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

  it('generates and saves one daily curation from the historical index', async () => {
    vi.stubGlobal('journalStore', { listIndex: vi.fn().mockResolvedValue(indexedMemories) })

    renderHomePage()

    expect(await screen.findByRole('heading', { name: /今天翻到：/ })).toBeInTheDocument()
    expect(screen.getByText('今日策展 · 已保存')).toBeInTheDocument()
    expect(screen.getByText('策展人旁白')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '为什么今天' })).toBeInTheDocument()

    await waitFor(() => {
      expect(window.localStorage.getItem('journal:daily-curations:v1')).toContain('daily-curation')
    })
  })

  it('lets the dev regenerate today curation while keeping it saved', async () => {
    vi.stubGlobal('journalStore', { listIndex: vi.fn().mockResolvedValue(indexedMemories) })

    renderHomePage()

    expect(await screen.findByRole('heading', { name: /今天翻到：/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新生成' }))

    expect(screen.getByText('第 2 版')).toBeInTheDocument()
    expect(window.localStorage.getItem('journal:daily-curations:v1')).toContain('"generation":1')
  })

  it('does not keep card style studies on the echo page', () => {
    renderHomePage()

    expect(screen.queryByRole('heading', { name: '先留几种手感' })).not.toBeInTheDocument()
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
