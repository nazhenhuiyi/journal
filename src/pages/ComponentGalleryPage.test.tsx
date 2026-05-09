import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ComponentGalleryPage from './ComponentGalleryPage'

describe('ComponentGalleryPage', () => {
  it('shows sticky note, postcard, polaroid, movie ticket, library card, and receipt studies', () => {
    render(<ComponentGalleryPage />)

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
    render(<ComponentGalleryPage />)

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
    render(<ComponentGalleryPage />)

    expect(screen.getByRole('heading', { name: 'CD 播放器' })).toBeInTheDocument()
    expect(screen.getByText('A · 复古实物感')).toBeInTheDocument()
    expect(screen.getByText('B · 极简播放器面板')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '雨停在十点半' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '今天没发生大事' })).toBeInTheDocument()
    expect(screen.getByText('没发出去的那条消息')).toBeInTheDocument()
  })

  it('lets the receipt study switch mode, stamp, print, and tear', () => {
    render(<ComponentGalleryPage />)

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
