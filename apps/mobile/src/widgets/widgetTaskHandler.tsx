import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import {
  androidJournalWidgetNames,
  renderJournalMomentAndroidWidget,
} from './JournalMomentAndroidWidget'
import {
  getLocalDateKey,
} from '../services/mobileJournalStore'
import { journalEffects } from '../services/journalEffects'
import { loadJournalWidgetSnapshot } from '../services/journalWidgetSnapshotStore'

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (!androidJournalWidgetNames.includes(props.widgetInfo.widgetName)) {
    return
  }

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const snapshot = await refreshSnapshotForWidgetUpdate()

      props.renderWidget(renderJournalMomentAndroidWidget(snapshot, props.widgetInfo))
      break
    }
    default:
      break
  }
}

async function refreshSnapshotForWidgetUpdate() {
  try {
    const result = await journalEffects.refreshForWidgetUpdate({
      date: getLocalDateKey(),
    })

    return result.snapshot
  } catch (error) {
    console.error(error)

    return loadJournalWidgetSnapshot()
  }
}
