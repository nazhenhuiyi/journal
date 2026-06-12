import type { JournalWidgetSnapshot } from '@journal/core'
import JournalMomentWidget from './JournalMomentWidget.ios'

export async function updateNativeJournalWidgets(snapshot: JournalWidgetSnapshot) {
  JournalMomentWidget.updateSnapshot(snapshot)
}
