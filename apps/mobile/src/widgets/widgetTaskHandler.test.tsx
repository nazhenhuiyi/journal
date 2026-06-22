import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import {
  androidJournalWidgetName,
} from './JournalMomentAndroidWidget'
import { widgetTaskHandler } from './widgetTaskHandler'

const mockLoadJournalWidgetSnapshot = vi.hoisted(() => vi.fn())

vi.mock('react-native-android-widget', () => ({
  FlexWidget: 'FlexWidget',
  TextWidget: 'TextWidget',
}))

vi.mock('../services/journalWidgetSnapshotStore', () => ({
  loadJournalWidgetSnapshot: mockLoadJournalWidgetSnapshot,
}))

describe('widgetTaskHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadJournalWidgetSnapshot.mockResolvedValue({
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
    })
  })

  it('renders Android widgets from the cached snapshot during background updates', async () => {
    const renderWidget = vi.fn()

    await widgetTaskHandler(createWidgetTaskProps({
      renderWidget,
      widgetAction: 'WIDGET_UPDATE',
      widgetName: androidJournalWidgetName,
    }))

    expect(mockLoadJournalWidgetSnapshot).toHaveBeenCalledOnce()
    expect(renderWidget).toHaveBeenCalledOnce()
    expect(renderWidget.mock.calls[0]?.[0]?.light).toMatchObject({
      props: {
        accessibilityLabel: '此刻的天空',
      },
    })
    expect(renderWidget.mock.calls[0]?.[0]?.dark).toMatchObject({
      props: {
        style: {
          backgroundColor: '#171412',
        },
      },
    })
  })

  it('renders the fallback widget when no cached snapshot exists', async () => {
    const renderWidget = vi.fn()

    mockLoadJournalWidgetSnapshot.mockResolvedValueOnce(null)

    await widgetTaskHandler(createWidgetTaskProps({
      renderWidget,
      widgetAction: 'WIDGET_UPDATE',
      widgetName: androidJournalWidgetName,
    }))

    expect(renderWidget.mock.calls[0]?.[0]?.light).toMatchObject({
      props: {
        accessibilityLabel: '记一件小事',
      },
    })
  })

  it('ignores widget actions for unrelated widget providers', async () => {
    const renderWidget = vi.fn()

    await widgetTaskHandler(createWidgetTaskProps({
      renderWidget,
      widgetAction: 'WIDGET_UPDATE',
      widgetName: 'OtherWidget',
    }))

    expect(mockLoadJournalWidgetSnapshot).not.toHaveBeenCalled()
    expect(renderWidget).not.toHaveBeenCalled()
  })
})

function createWidgetTaskProps({
  renderWidget,
  widgetAction,
  widgetName,
}: {
  renderWidget: WidgetTaskHandlerProps['renderWidget']
  widgetAction: WidgetTaskHandlerProps['widgetAction']
  widgetName: string
}) {
  return {
    renderWidget,
    widgetAction,
    widgetInfo: {
      widgetName,
    },
  } as WidgetTaskHandlerProps
}
