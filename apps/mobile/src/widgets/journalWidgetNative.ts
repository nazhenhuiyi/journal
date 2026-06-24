import type { JournalWidgetBundleSnapshot } from '@journal/core'
import type { JournalWidgetSnapshotTimelineEntry } from '../services/journalWidgetSnapshotStore'

export async function updateNativeJournalWidgets(
  _snapshot: JournalWidgetBundleSnapshot,
  _timeline: readonly JournalWidgetSnapshotTimelineEntry[] = [],
) {
  void _snapshot
  void _timeline
  // Platform-specific files update real widgets.
}
