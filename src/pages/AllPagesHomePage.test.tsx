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

  it('shows sticky note, postcard, movie ticket, library card, and receipt studies', () => {
    renderHomePage()

    expect(screen.getByRole('heading', { name: '先留几种手感' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '便利贴' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '明信片' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '电影票' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '回忆借阅卡' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '今日小票' })).toBeInTheDocument()
    expect(screen.getByText('今天的风把窗帘吹得很轻，像有人在旁边翻书。')).toBeInTheDocument()
    expect(screen.getByText('桥下有人吹口琴，傍晚慢慢落到杯沿上。')).toBeInTheDocument()
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

  it('shows both CD player display concepts', () => {
    renderHomePage()

    expect(screen.getByRole('heading', { name: 'CD 播放器' })).toBeInTheDocument()
    expect(screen.getByText('A · 复古实物感')).toBeInTheDocument()
    expect(screen.getByText('B · 极简播放器面板')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '雨停在十点半' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '今天没发生大事' })).toBeInTheDocument()
    expect(screen.getByText('没发出去的那条消息')).toBeInTheDocument()
  })
})
