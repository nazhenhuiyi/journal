import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct JournalMomentWidget: Widget {
  let name: String = "JournalMomentWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("且留")
    .description("留下一点此刻，或看见一张旧纸条。")
    .supportedFamilies([.systemMedium])
  }
}