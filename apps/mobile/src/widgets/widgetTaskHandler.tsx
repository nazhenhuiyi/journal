import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import {
  androidJournalWidgetNames,
  renderJournalMomentAndroidWidget,
} from './JournalMomentAndroidWidget'
import { loadJournalWidgetSnapshot } from '../services/journalWidgetSnapshotStore'

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (!androidJournalWidgetNames.includes(props.widgetInfo.widgetName)) {
    return
  }

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const snapshot = await loadJournalWidgetSnapshot()

      props.renderWidget(renderJournalMomentAndroidWidget(snapshot, props.widgetInfo))
      break
    }
    default:
      break
  }
}
