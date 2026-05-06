import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SketchSessionProvider,
  type SketchDocumentSummary,
  type StoredSketchDocument,
} from '../../domain/sketch'
import SketchPage from './SketchPage'

function renderSketchPage() {
  return render(
    <SketchSessionProvider>
      <MemoryRouter>
        <SketchPage />
      </MemoryRouter>
    </SketchSessionProvider>,
  )
}

afterEach(() => {
  window.sketchStore = undefined
  vi.restoreAllMocks()
})

describe('SketchPage', () => {
  it('shows the sketch toolbar, canvas, and default ratio', async () => {
    renderSketchPage()

    expect(await screen.findByLabelText('随画标题')).toHaveValue('未命名随画')
    expect(screen.getByRole('button', { name: /铅笔/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /橡皮/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('涂鸦画布')).toBeInTheDocument()
    expect(screen.getByLabelText('选择画布比例')).toHaveValue('landscape-3-2')
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重做' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /播放/ })).toBeDisabled()
  })

  it('creates a new sketch with the selected ratio', async () => {
    renderSketchPage()

    await screen.findByLabelText('随画标题')
    fireEvent.click(screen.getByRole('button', { name: /新建/ }))
    const createMenu = await screen.findByRole('listbox', { name: '新建画作比例' })
    fireEvent.click(within(createMenu).getByRole('option', { name: /1:1 方形/ }))

    await waitFor(() => expect(screen.getByLabelText('选择画布比例')).toHaveValue('square-1-1'))
  })

  it('resets the current sketch by clearing recorded events', async () => {
    const document = createStoredSketchDocument()
    const savedDocuments: StoredSketchDocument[] = []
    window.sketchStore = {
      list: vi.fn(async () => [createSketchDocumentSummary(document)]),
      create: vi.fn(async () => document),
      load: vi.fn(async () => document),
      save: vi.fn(async (nextDocument) => {
        const storedDocument = {
          ...nextDocument,
          fileName: document.fileName,
          filePath: document.filePath,
        }
        savedDocuments.push(storedDocument)

        return storedDocument
      }),
      import: vi.fn(async () => document),
      delete: vi.fn(async () => ({ id: document.id })),
    }

    renderSketchPage()

    await waitFor(() => expect(screen.getByLabelText('随画标题')).toHaveValue('测试随画'))
    expect(screen.getByRole('button', { name: /播放/ })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '重置画布' }))

    await waitFor(() => expect(screen.getByRole('button', { name: /播放/ })).toBeDisabled())
    await waitFor(() => expect(savedDocuments.at(-1)?.events).toEqual([]))
  })

  it('lets users load an existing sketch from a dropdown without opening the file import flow', async () => {
    const firstDocument = createStoredSketchDocument()
    const secondDocument = createStoredSketchDocument({
      id: 'sketch_second',
      title: '第二幅随画',
      updatedAt: '2026-05-06T09:00:00.000Z',
    })
    const sketchStore = {
      list: vi.fn(async () => [
        createSketchDocumentSummary(firstDocument),
        createSketchDocumentSummary(secondDocument),
      ]),
      create: vi.fn(async () => firstDocument),
      load: vi.fn(async (id: string) => (id === secondDocument.id ? secondDocument : firstDocument)),
      save: vi.fn(async (nextDocument) => ({
        ...nextDocument,
        fileName: firstDocument.fileName,
        filePath: firstDocument.filePath,
      })),
      import: vi.fn(async () => ({
        ...firstDocument,
        id: 'sketch_imported',
        title: '文件导入随画',
      })),
      delete: vi.fn(async () => ({ id: firstDocument.id })),
    }
    window.sketchStore = sketchStore

    renderSketchPage()

    await waitFor(() => expect(screen.getByLabelText('随画标题')).toHaveValue('测试随画'))
    fireEvent.click(screen.getByRole('button', { name: /加载/ }))
    fireEvent.click(await screen.findByRole('option', { name: /第二幅随画/ }))

    await waitFor(() => expect(screen.getByLabelText('随画标题')).toHaveValue('第二幅随画'))
    expect(sketchStore.load).toHaveBeenCalledWith(secondDocument.id)
    expect(sketchStore.import).not.toHaveBeenCalled()
  })
})

function createStoredSketchDocument(overrides: Partial<StoredSketchDocument> = {}): StoredSketchDocument {
  const id = overrides.id ?? 'sketch_test'

  return {
    schemaVersion: 1,
    id,
    title: overrides.title ?? '测试随画',
    createdAt: '2026-05-05T08:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-05-05T08:00:00.000Z',
    canvas: {
      preset: 'landscape-3-2',
      width: 660,
      height: 440,
    },
    events: [
      {
        type: 'stroke:start',
        id: 'event-1',
        at: 0,
        strokeId: 'stroke-1',
        tool: 'pencil',
        color: '#2f261f',
        size: 4,
        point: { x: 10, y: 12, t: 0 },
      },
      {
        type: 'stroke:point',
        id: 'event-2',
        at: 16,
        strokeId: 'stroke-1',
        point: { x: 20, y: 22, t: 16 },
      },
      {
        type: 'stroke:end',
        id: 'event-3',
        at: 32,
        strokeId: 'stroke-1',
      },
    ],
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
