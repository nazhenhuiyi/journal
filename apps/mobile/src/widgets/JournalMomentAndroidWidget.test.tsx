import { describe, expect, it, vi } from 'vitest'
import { renderJournalMomentAndroidWidget } from './JournalMomentAndroidWidget'

vi.mock('react-native-android-widget', () => ({
  FlexWidget: 'FlexWidget',
  TextWidget: 'TextWidget',
}))

describe('JournalMomentAndroidWidget', () => {
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
      props: {
        clickAction?: string
        clickActionData?: { uri?: string }
      }
    }

    expect(widget.props.clickAction).toBe('OPEN_URI')
    expect(widget.props.clickActionData).toEqual({
      uri: 'journal://write?theme=sky-now',
    })
  })
})
