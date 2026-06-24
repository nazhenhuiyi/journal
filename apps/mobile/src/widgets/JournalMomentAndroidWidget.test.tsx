import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import type { JournalWidgetBundleSnapshot } from '@journal/core'
import {
  androidJournalCompactWidgetName,
  androidJournalWidgetName,
  androidJournalWidgetNames,
  renderJournalMomentAndroidWidget,
} from './JournalMomentAndroidWidget'

vi.mock('react-native-android-widget', () => ({
  FlexWidget: 'FlexWidget',
  TextWidget: 'TextWidget',
}))

const bundleSnapshot: JournalWidgetBundleSnapshot = {
  date: '2026-06-23',
  generatedAt: '2026-06-23T08:00:00.000Z',
  moment: {
    action: {
      themeId: 'sky-now',
      type: 'write',
    },
    footnote: '此刻',
    mode: 'theme-entry',
    subtitle: '留一张现在的天',
    title: '此刻的天空',
  },
  review: {
    action: {
      type: 'weeklyReview',
      week: '2026-W25',
    },
    backgroundImageSrc: 'media/2026/06/img_20260620_210717.webp',
    mode: 'weekly-review',
    subtitle: '6月15日 - 6月21日',
    summary: '在快的时代里，给自己留一扇漏窗。',
    title: '漏窗外的一点绿',
  },
  version: 2,
}

describe('JournalMomentAndroidWidget', () => {
  it('exports both regular and compact Android widget names', () => {
    expect(androidJournalWidgetNames).toEqual([
      androidJournalWidgetName,
      androidJournalCompactWidgetName,
    ])
  })

  it('renders the regular provider as a weekly review text card', () => {
    const widget = renderJournalMomentAndroidWidget(bundleSnapshot, {
      height: 140,
      widgetName: androidJournalWidgetName,
      width: 320,
    } as Parameters<typeof renderJournalMomentAndroidWidget>[1]) as {
      light: ReactElement<{
        children: ReactElement<{
          children: ReactElement[]
        }>
        clickAction?: string
        clickActionData?: { uri?: string }
        style?: {
          backgroundColor?: string
        }
      }>
    }
    const content = widget.light.props.children as ReactElement<{
      children: ReactElement[]
      style?: {
        flexGap?: number
        justifyContent?: string
      }
    }>
    const textChildren = content.props.children.filter(Boolean) as ReactElement<{
      text?: string
    }>[]

    expect(widget.light.type).toBe('FlexWidget')
    expect(widget.light.props.clickAction).toBe('OPEN_URI')
    expect(widget.light.props.clickActionData).toEqual({
      uri: 'journal://weekly-review?week=2026-W25',
    })
    expect(widget.light.props.style).toMatchObject({
      backgroundColor: '#F8F2E9',
    })
    expect(content.props.style).toMatchObject({
      flexGap: 6,
      justifyContent: 'center',
    })
    expect(textChildren.map((child) => child.props.text)).toEqual([
      '6月15日 - 6月21日',
      '漏窗外的一点绿',
      '在快的时代里，给自己留一扇漏窗。',
    ])
  })

  it('keeps regular review summaries to three lines when there is no background image', () => {
    const widget = renderJournalMomentAndroidWidget({
      ...bundleSnapshot,
      review: {
        action: {
          date: '2026-06-03',
          type: 'reviewDay',
        },
        mode: 'daily-review',
        subtitle: '上周',
        summary: '你写过一句：其实 95% 社交媒体内容只是当时情绪留下来的痕迹。',
        title: '上周的今天，阴',
      },
    }, {
      widgetName: androidJournalWidgetName,
      width: 320,
    } as Parameters<typeof renderJournalMomentAndroidWidget>[1]) as {
      light: ReactElement<{
        children: ReactElement<{
          children: ReactElement[]
        }>
        style?: {
          backgroundColor?: string
        }
      }>
    }
    const content = widget.light.props.children as ReactElement<{
      children: ReactElement[]
      style?: {
        flexGap?: number
        justifyContent?: string
      }
    }>
    const textChildren = content.props.children.filter(Boolean) as ReactElement<{
      maxLines?: number
      style?: {
        fontSize?: number
      }
      text?: string
    }>[]
    const summary = textChildren[1] as ReactElement<{
      maxLines?: number
      style?: {
        fontSize?: number
      }
    }>

    expect(widget.light.type).toBe('FlexWidget')
    expect(widget.light.props.style).toMatchObject({
      backgroundColor: '#F8F2E9',
    })
    expect(content.props.style).toMatchObject({
      flexGap: 8,
      justifyContent: 'center',
    })
    expect(textChildren.map((child) => child.props.text)).toEqual([
      '上周的今天，阴',
      '你写过一句：其实 95% 社交媒体内容只是当时情绪留下来的痕迹。',
    ])
    expect(summary.props.maxLines).toBe(3)
    expect(summary.props.style).toMatchObject({
      fontSize: 14,
    })
  })

  it('renders the compact provider as a moment theme entry', () => {
    const widget = renderJournalMomentAndroidWidget(bundleSnapshot, {
      widgetName: androidJournalCompactWidgetName,
      width: 220,
    } as Parameters<typeof renderJournalMomentAndroidWidget>[1]) as {
      light: ReactElement<{
        accessibilityLabel?: string
        children: ReactElement<{
          children: ReactElement[]
        }>
        clickActionData?: { uri?: string }
      }>
    }
    const row = widget.light.props.children as ReactElement<{
      children: ReactElement[]
    }>
    const textColumn = row.props.children[1] as ReactElement<{
      children: ReactElement[]
    }>
    const subtitle = textColumn.props.children[1] as ReactElement<{
      maxLines?: number
    }>

    expect(widget.light.props.accessibilityLabel).toBe('此刻的天空')
    expect(widget.light.props.clickActionData).toEqual({
      uri: 'journal://write?theme=sky-now',
    })
    expect(subtitle.props.maxLines).toBe(1)
  })
})
