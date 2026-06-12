import type { JournalWidgetSnapshot } from '@journal/core'

export async function updateNativeJournalWidgets(_snapshot: JournalWidgetSnapshot) {
  void _snapshot
  // Platform-specific files update real widgets.
}
