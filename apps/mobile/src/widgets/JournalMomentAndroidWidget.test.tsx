import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
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

describe('JournalMomentAndroidWidget', () => {
  it('exports both regular and compact Android widget names', () => {
    expect(androidJournalWidgetNames).toEqual([
      androidJournalWidgetName,
      androidJournalCompactWidgetName,
    ])
  })

  it('renders the root widget with a deep link click action', () => {
    const widget = renderJournalMomentAndroidWidget({
      action: {
        themeId: 'sky-now',
        type: 'write',
      },
      date: '2026-06-10',
      footnote: '且留',
      generatedAt: '2026-06-10T08:00:00.000Z',
      mode: 'theme-entry',
      subtitle: '留一张现在的天',
      title: '此刻的天空',
      version: 1,
    }) as {
      light: {
        props: {
          clickAction?: string
          clickActionData?: { uri?: string }
        }
      }
      dark: {
        props: {
          style?: {
            backgroundColor?: string
          }
        }
      }
    }

    expect(widget.light.props.clickAction).toBe('OPEN_URI')
    expect(widget.light.props.clickActionData).toEqual({
      uri: 'journal://write?theme=sky-now',
    })
    expect(widget.dark.props.style).toMatchObject({
      backgroundColor: '#171412',
    })
  })

  it('allows regular Android subtitles to use up to three lines', () => {
    const widget = renderJournalMomentAndroidWidget({
      action: {
        date: '2026-06-03',
        type: 'reviewDay',
      },
      date: '2026-06-10',
      footnote: '上周',
      generatedAt: '2026-06-10T08:00:00.000Z',
      mode: 'review-moment',
      subtitle: '你写过一句：其实 95% 社交媒体内容只是当时情绪留下来的痕迹。',
      title: '上周的今天，阴',
      version: 1,
    }) as {
      light: ReactElement<{
        children: ReactElement[]
        style?: {
          paddingHorizontal?: number
          paddingVertical?: number
        }
      }>
    }
    const contentRow = widget.light.props.children[1] as ReactElement<{
      children: ReactElement[]
    }>
    const textColumn = contentRow.props.children[1] as ReactElement<{
      children: ReactElement[]
    }>
    const subtitle = textColumn.props.children[1] as ReactElement<{
      maxLines?: number
      style?: {
        fontSize?: number
      }
    }>

    expect(widget.light.props.style).toMatchObject({
      paddingHorizontal: 20,
      paddingVertical: 12,
    })
    expect(subtitle.props.maxLines).toBe(3)
    expect(subtitle.props.style).toMatchObject({
      fontSize: 16,
    })
  })

  it('keeps compact Android subtitles to one line', () => {
    const widget = renderJournalMomentAndroidWidget({
      action: {
        themeId: 'small-thing',
        type: 'write',
      },
      date: '2026-06-10',
      footnote: '且留',
      generatedAt: '2026-06-10T08:00:00.000Z',
      mode: 'theme-entry',
      subtitle: '不用很完整，也不用写很长。',
      title: '记一件小事',
      version: 1,
    }, {
      widgetName: androidJournalCompactWidgetName,
      width: 220,
    } as Parameters<typeof renderJournalMomentAndroidWidget>[1]) as {
      light: ReactElement<{
        children: ReactElement[]
      }>
    }
    const contentRow = widget.light.props.children[1] as ReactElement<{
      children: ReactElement[]
    }>
    const textColumn = contentRow.props.children[1] as ReactElement<{
      children: ReactElement[]
    }>
    const subtitle = textColumn.props.children[1] as ReactElement<{
      maxLines?: number
      style?: {
        fontSize?: number
      }
    }>

    expect(subtitle.props.maxLines).toBe(1)
    expect(subtitle.props.style).toMatchObject({
      fontSize: 13,
    })
  })

  it('uses compact root spacing for the compact widget provider', () => {
    const widget = renderJournalMomentAndroidWidget({
      action: {
        themeId: 'sky-now',
        type: 'write',
      },
      date: '2026-06-10',
      footnote: '且留',
      generatedAt: '2026-06-10T08:00:00.000Z',
      mode: 'theme-entry',
      subtitle: '留一张现在的天',
      title: '此刻的天空',
      version: 1,
    }, {
      widgetName: androidJournalCompactWidgetName,
      width: 220,
    } as Parameters<typeof renderJournalMomentAndroidWidget>[1]) as {
      light: {
        props: {
          style?: {
            borderRadius?: number
            paddingHorizontal?: number
            paddingVertical?: number
          }
        }
      }
    }

    expect(widget.light.props.style).toMatchObject({
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
    })
  })
})
