import type { JournalWidgetBundleSnapshot } from '@journal/core'
import {
  getWidgetInfo,
  requestWidgetUpdateById,
} from 'react-native-android-widget'
import type { JournalWidgetSnapshotTimelineEntry } from '../services/journalWidgetSnapshotStore'
import {
  androidJournalWidgetNames,
  renderJournalMomentAndroidWidget,
} from './JournalMomentAndroidWidget'

export async function updateNativeJournalWidgets(
  snapshot: JournalWidgetBundleSnapshot,
  _timeline: readonly JournalWidgetSnapshotTimelineEntry[] = [],
) {
  void _timeline

  await Promise.all(androidJournalWidgetNames.map(async (widgetName) => {
    const widgetsInfo = await getWidgetInfo(widgetName)

    await Promise.all(widgetsInfo.map((widgetInfo) => (
      requestWidgetUpdateById({
        renderWidget: (latestWidgetInfo) => renderJournalMomentAndroidWidget(
          snapshot,
          latestWidgetInfo,
        ),
        widgetId: widgetInfo.widgetId,
        widgetName,
      })
    )))
  }))
}
