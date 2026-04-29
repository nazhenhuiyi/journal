import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import AppLayout from './AppLayout'

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/preview']}>
      <AppLayout />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('AppLayout', () => {
  it('shows today menu date from the current day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-28T09:30:00'))

    renderLayout()

    expect(screen.getByRole('link', { name: /今日/ })).toHaveTextContent('4月28日')
    expect(screen.getByRole('link', { name: /设置/ })).toHaveAttribute('href', '/settings')
  })

  it('refreshes the today menu date after midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-28T23:59:59'))

    renderLayout()

    expect(screen.getByRole('link', { name: /今日/ })).toHaveTextContent('4月28日')

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByRole('link', { name: /今日/ })).toHaveTextContent('4月29日')
  })
})
