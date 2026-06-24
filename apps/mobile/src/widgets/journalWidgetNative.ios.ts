import type { JournalWidgetBundleSnapshot } from '@journal/core'
import type { JournalWidgetSnapshotTimelineEntry } from '../services/journalWidgetSnapshotStore'
import JournalMomentCompactWidget from './JournalMomentCompactWidget.ios'
import JournalMomentWidget from './JournalMomentWidget.ios'

export async function updateNativeJournalWidgets(
  snapshot: JournalWidgetBundleSnapshot,
  timeline: readonly JournalWidgetSnapshotTimelineEntry[] = [],
) {
  JournalMomentWidget.updateSnapshot(snapshot)
  JournalMomentCompactWidget.updateTimeline(
    (timeline.length > 0 ? timeline : [{ date: new Date(snapshot.generatedAt), snapshot }])
      .map((entry) => ({
        date: entry.date,
        props: entry.snapshot,
      })),
  )
}
