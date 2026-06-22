import { describe, expect, it, vi } from 'vitest'
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
