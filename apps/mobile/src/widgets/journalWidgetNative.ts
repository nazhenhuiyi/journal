import type { JournalWidgetBundleSnapshot } from '@journal/core'

export async function updateNativeJournalWidgets(_snapshot: JournalWidgetBundleSnapshot) {
  void _snapshot
  // Platform-specific files update real widgets.
}
