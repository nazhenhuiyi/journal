import type { JournalWidgetBundleSnapshot } from '@journal/core'

export default {
  reload() {
    // Native widget support is platform-specific.
  },
  updateSnapshot(_snapshot: JournalWidgetBundleSnapshot) {
    void _snapshot
    // Native widget support is platform-specific.
  },
}
