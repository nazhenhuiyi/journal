import type { JournalWidgetBundleSnapshot } from '@journal/core'
import JournalMomentCompactWidget from './JournalMomentCompactWidget.ios'
import JournalMomentWidget from './JournalMomentWidget.ios'

export async function updateNativeJournalWidgets(snapshot: JournalWidgetBundleSnapshot) {
  JournalMomentWidget.updateSnapshot(snapshot)
  JournalMomentCompactWidget.updateSnapshot(snapshot)
}
