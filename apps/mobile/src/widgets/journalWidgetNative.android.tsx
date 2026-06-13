import type { JournalWidgetSnapshot } from '@journal/core'
import { requestWidgetUpdate } from 'react-native-android-widget'
import {
  androidJournalWidgetNames,
  renderJournalMomentAndroidWidget,
} from './JournalMomentAndroidWidget'

export async function updateNativeJournalWidgets(snapshot: JournalWidgetSnapshot) {
  await Promise.all(androidJournalWidgetNames.map((widgetName) => (
    requestWidgetUpdate({
      renderWidget: (widgetInfo) => renderJournalMomentAndroidWidget(snapshot, widgetInfo),
      widgetName,
    })
  )))
}
