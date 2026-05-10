import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PhotosPage from './PhotosPage'
import type { JournalIndexEntry } from '../domain/journalIndex/types'

function renderPhotosPage() {
  return render(
    <MemoryRouter>
      <PhotosPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const indexedEntries: JournalIndexEntry[] = [
  {
    collections: ['窗台'],
    date: '2026-05-01',
    favorite: false,
    fileName: '2026-05-01.md',
    filePath: '/Users/zilin/.journal/2026-05-01.md',
    images: [
      {
        caption: '窗边植物',
        id: 'img_window',
        murmurId: 'm_may_window',
        src: '2026-05-01.media/window plant.jpg',
        tags: ['绿意', '清晨'],
      },
    ],
    murmurs: [
      {
        excerpt: '新叶贴着玻璃，早晨的光很轻。',
        id: 'm_may_window',
        imageCount: 1,
        time: '2026-05-01T08:20:00.000Z',
      },
    ],
    searchableText: '新叶贴着玻璃，早晨的光很轻。',
    stats: { imageCount: 1, murmurCount: 1, wordCount: 18 },
    tags: ['植物'],
    title: '五月窗台',
    updatedAt: null,
  },
  {
    collections: ['雨天'],
    date: '2026-04-25',
    favorite: true,
    fileName: '2026-04-25.md',
    filePath: '/Users/zilin/.journal/2026-04-25.md',
    images: [
      {
        caption: '雨夜便利店',
        id: 'img_rain',
        murmurId: 'm_april_rain',
        src: '2026-04-25.media/rain.jpg',
        tags: ['雨', '路灯'],
      },
      {
        caption: '台灯边的书',
        id: 'img_lamp',
        murmurId: 'm_april_lamp',
        src: '2026-04-25.media/lamp.jpg',
        tags: ['台灯', '夜晚'],
      },
    ],
    murmurs: [
      {
        excerpt: '便利店门口的灯很亮，伞面一直滴水，还有一条没发出去的消息。',
        id: 'm_april_rain',
        imageCount: 1,
        time: '2026-04-25T21:00:00.000Z',
      },
      {
        excerpt: '桌上那盏灯把书页照得很暖。',
        id: 'm_april_lamp',
        imageCount: 1,
        time: '2026-04-25T23:10:00.000Z',
      },
    ],
    searchableText: '便利店门口的灯很亮，伞面一直滴水。桌上那盏灯把书页照得很暖。',
    stats: { imageCount: 2, murmurCount: 2, wordCount: 28 },
    tags: ['小雨', '台灯'],
    title: '雨夜和台灯',
    updatedAt: null,
  },
]

describe('PhotosPage', () => {
  it('loads indexed journal photos into a monthly photo wall', async () => {
    const listIndex = vi.fn().mockResolvedValue(indexedEntries)
    vi.stubGlobal('journalStore', { listIndex })

    renderPhotosPage()

    expect(screen.getByRole('status')).toHaveTextContent('正在整理照片...')

    const wall = await screen.findByLabelText('照片墙')

    expect(listIndex).toHaveBeenCalledOnce()
    expect(screen.getByRole('heading', { name: '照片' })).toBeInTheDocument()
    expect(screen.getAllByText('3 张').length).toBeGreaterThan(0)
    expect(screen.getByText('2 天')).toBeInTheDocument()
    expect(screen.getAllByText('2026.05.01').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /全部照片/ })).toHaveTextContent('3')
    expect(screen.getByRole('button', { name: /2026年5月/ })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /2026年4月/ })).toHaveTextContent('2')
    expect(within(wall).getByRole('img', { name: '窗边植物' })).toHaveAttribute(
      'src',
      'journal-media://local/2026-05-01.media/window%20plant.jpg',
    )
    expect(within(wall).getByText('新叶贴着玻璃，早晨的光很轻。')).toBeInTheDocument()
    expect(within(wall).getByRole('link', { name: /打开 2026-05-01 的照片：窗边植物/ })).toHaveAttribute(
      'href',
      '/calendar?date=2026-05-01',
    )
  })

  it('filters photos by search text from captions, tags, dates, titles, and murmur excerpts', async () => {
    vi.stubGlobal('journalStore', { listIndex: vi.fn().mockResolvedValue(indexedEntries) })

    renderPhotosPage()

    const wall = await screen.findByLabelText('照片墙')

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索照片' }), {
      target: { value: '没发出去' },
    })

    expect(within(wall).getByRole('img', { name: '雨夜便利店' })).toBeInTheDocument()
    expect(within(wall).queryByRole('img', { name: '窗边植物' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索照片' }), {
      target: { value: '2026.05.01' },
    })

    expect(within(wall).getByRole('img', { name: '窗边植物' })).toBeInTheDocument()
    expect(within(wall).queryByRole('img', { name: '雨夜便利店' })).not.toBeInTheDocument()
  })

  it('filters by month and tag while keeping each photo card directly openable', async () => {
    vi.stubGlobal('journalStore', { listIndex: vi.fn().mockResolvedValue(indexedEntries) })

    renderPhotosPage()

    const wall = await screen.findByLabelText('照片墙')

    fireEvent.click(screen.getByRole('button', { name: /2026年4月/ }))

    expect(within(wall).getByRole('img', { name: '雨夜便利店' })).toBeInTheDocument()
    expect(within(wall).getByRole('img', { name: '台灯边的书' })).toBeInTheDocument()
    expect(within(wall).queryByRole('img', { name: '窗边植物' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '筛选标签 台灯' }))

    expect(within(wall).getByRole('img', { name: '台灯边的书' })).toBeInTheDocument()
    expect(within(wall).queryByRole('img', { name: '雨夜便利店' })).not.toBeInTheDocument()
    expect(within(wall).getByText('桌上那盏灯把书页照得很暖。')).toBeInTheDocument()
    expect(within(wall).getByRole('link', { name: /打开 2026-04-25 的照片：台灯边的书/ })).toHaveAttribute(
      'href',
      '/calendar?date=2026-04-25',
    )
  })

  it('shows empty and failed states', async () => {
    vi.stubGlobal('journalStore', { listIndex: vi.fn().mockResolvedValue([]) })

    const emptyRender = renderPhotosPage()

    expect(await screen.findByText('还没有照片。写日记时放进几张，照片墙就会亮起来。')).toBeInTheDocument()

    emptyRender.unmount()
    vi.unstubAllGlobals()
    vi.stubGlobal('journalStore', { listIndex: vi.fn().mockRejectedValue(new Error('no index')) })

    renderPhotosPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('照片索引暂时没有读出来。')
    })
  })
})
