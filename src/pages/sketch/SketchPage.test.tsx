import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SketchSessionProvider } from '../../domain/sketch'
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

describe('SketchPage', () => {
  it('shows the sketch toolbar, canvas, and playback controls', () => {
    renderSketchPage()

    expect(screen.getByRole('heading', { name: '把落笔的过程也留下' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /铅笔/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /橡皮/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('涂鸦画布')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重做' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /播放/ })).toBeDisabled()
  })
})
