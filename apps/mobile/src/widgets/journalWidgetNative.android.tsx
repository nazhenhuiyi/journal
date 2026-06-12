import type { JournalWidgetSnapshot } from '@journal/core'
import { requestWidgetUpdate } from 'react-native-android-widget'
import {
  androidJournalWidgetName,
  renderJournalMomentAndroidWidget,
} from './JournalMomentAndroidWidget'

export async function updateNativeJournalWidgets(snapshot: JournalWidgetSnapshot) {
  await requestWidgetUpdate({
    renderWidget: (widgetInfo) => renderJournalMomentAndroidWidget(snapshot, widgetInfo),
    widgetName: androidJournalWidgetName,
  })
}
