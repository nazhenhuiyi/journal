import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import {
  androidJournalWidgetNames,
  renderJournalMomentAndroidWidget,
} from './JournalMomentAndroidWidget'
import {
  loadJournalWidgetSnapshot,
  refreshJournalWidgetSnapshot,
} from '../services/journalWidgetSnapshotStore'

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (!androidJournalWidgetNames.includes(props.widgetInfo.widgetName)) {
    return
  }

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const snapshot = await loadSnapshotForAndroidWidgetUpdate()

      props.renderWidget(renderJournalMomentAndroidWidget(snapshot, props.widgetInfo))
      break
    }
    default:
      break
  }
}

async function loadSnapshotForAndroidWidgetUpdate() {
  try {
    const result = await refreshJournalWidgetSnapshot(undefined, {
      updateNativeWidgets: false,
    })

    return result.snapshot
  } catch (error) {
    console.error(error)
    return loadJournalWidgetSnapshot()
  }
}
