import type { JournalWidgetSnapshot } from '@journal/core'

export default {
  reload() {
    // Native widget support is platform-specific.
  },
  updateSnapshot(_snapshot: JournalWidgetSnapshot) {
    void _snapshot
    // Native widget support is platform-specific.
  },
}
