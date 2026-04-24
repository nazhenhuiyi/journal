import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import MarkdownPreviewPage from './MarkdownPreviewPage'

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

describe('MarkdownPreviewPage', () => {
  it('renders markdown preview as the default page experience', () => {
    render(<MarkdownPreviewPage />)

    expect(screen.getByRole('heading', { name: '2026-04-24 日记预览' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '批注目标' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '批注' })).toBeInTheDocument()
  })

  it('selects an annotation from the sidebar and marks the matching preview block active', () => {
    const { container } = render(<MarkdownPreviewPage />)

    fireEvent.click(screen.getByRole('button', { name: /这句重复出现/ }))

    const activeBlock = container.querySelector('[data-annotation-active="true"]')

    expect(activeBlock).toHaveAttribute('data-annotation-ids', 'ann_repeat')
    expect(activeBlock).toHaveTextContent('这句话会重复出现。')
  })

  it('selects an annotation by clicking an annotated preview block', () => {
    const { container } = render(<MarkdownPreviewPage />)
    const tiredBlock = container.querySelector('[data-annotation-ids="ann_tired"]')

    expect(tiredBlock).toBeInTheDocument()
    fireEvent.click(tiredBlock as Element)

    expect(tiredBlock).toHaveAttribute('data-annotation-active', 'true')
  })
})
