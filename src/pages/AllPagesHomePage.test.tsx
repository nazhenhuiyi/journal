import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import AllPagesHomePage from './AllPagesHomePage'

function renderHomePage() {
  return render(
    <MemoryRouter>
      <AllPagesHomePage />
    </MemoryRouter>,
  )
}

describe('AllPagesHomePage', () => {
  it('shows the quiet homepage prompt and compact primary actions', () => {
    renderHomePage()

    expect(screen.getByRole('heading', { name: '有些日子不必被解释，只要被留下。' })).toBeInTheDocument()
    expect(screen.getByText('4月25日 · 星期六 · 已安放 18 页')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /写日记/ })).toHaveAttribute('href', '/preview')
    expect(screen.getByRole('link', { name: /碎碎念/ })).toHaveAttribute('href', '/preview')
    expect(screen.getByRole('link', { name: /放照片/ })).toHaveAttribute('href', '/preview')
  })

  it('surfaces actual memories instead of review categories', () => {
    renderHomePage()

    expect(screen.getByRole('heading', { name: '翻到几页旧日' })).toBeInTheDocument()
    expect(screen.getByText('便利店门口的灯很亮，伞面一直滴水。')).toBeInTheDocument()
    expect(screen.queryByText('往年今日')).not.toBeInTheDocument()
    expect(screen.queryByText('同样天气')).not.toBeInTheDocument()
    expect(screen.queryByText('整理未完成')).not.toBeInTheDocument()
    expect(screen.queryByText('批注回看')).not.toBeInTheDocument()
  })
})
