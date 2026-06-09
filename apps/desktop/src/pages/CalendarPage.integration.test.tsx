import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import CalendarPage from './CalendarPage'

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Range.prototype.getBoundingClientRect = vi.fn(() => new DOMRect())
  Range.prototype.getClientRects = vi.fn(() => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* iterateRects() {},
  }) as DOMRectList)
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('CalendarPage route integration', () => {
  it('opens the requested date from the calendar date query', async () => {
    const loadDate = vi.fn().mockResolvedValue({
      content: '---\ndate: 2026-03-30\n---\n\n# 窗边植物\n窗边那盆植物又长出一点新叶。',
      date: '2026-03-30',
      fileName: '2026-03-30.md',
      filePath: '/Users/zilin/.journal/2026-03-30.md',
      updatedAt: null,
    })
    const listEntries = vi.fn().mockResolvedValue([
      {
        date: '2026-03-30',
        fileName: '2026-03-30.md',
        filePath: '/Users/zilin/.journal/2026-03-30.md',
        updatedAt: null,
      },
    ])

    vi.stubGlobal('journalStore', { listEntries, loadDate })

    render(
      <MemoryRouter initialEntries={['/calendar?date=2026-03-30']}>
        <CalendarPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(listEntries).toHaveBeenCalledOnce()
      expect(loadDate).toHaveBeenCalledWith('2026-03-30')
    })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '3月30日 · 周一' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: '日记正文' })).toHaveTextContent('窗边植物')
    })
  })
})
