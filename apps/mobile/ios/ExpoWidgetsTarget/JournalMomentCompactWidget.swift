import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct JournalMomentCompactWidget: Widget {
  let name: String = "JournalMomentCompactWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("此刻")
    .description("根据此刻快速记录。")
    .supportedFamilies([.systemSmall])
  }
}
