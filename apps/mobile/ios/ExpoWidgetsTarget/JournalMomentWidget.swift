import WidgetKit
import SwiftUI
import UIKit
internal import ExpoWidgets

struct JournalMomentWidget: Widget {
  let name: String = "JournalMomentWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      JournalMomentWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("回看")
    .description("每日回顾与周回顾。")
    .supportedFamilies([.systemMedium])
    // WidgetKit no-ops this modifier below iOS 17.
    .contentMarginsDisabled()
  }
}

private struct JournalMomentWidgetEntryView: View {
  let entry: WidgetsTimelineEntry

  private var review: JournalMomentReviewPayload {
    JournalMomentReviewPayload(props: entry.props)
  }

  var body: some View {
    Group {
      if let image = review.displayImage {
        photoReviewCard(image: image)
      } else {
        textReviewCard
      }
    }
    .widgetURL(review.deepLink)
  }

  private func photoReviewCard(image: UIImage) -> some View {
    GeometryReader { geometry in
      ZStack {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
          .frame(width: geometry.size.width, height: geometry.size.height)
          .clipped()

        VStack {
          Spacer()

          HStack {
            Spacer()

            Text(review.displayLabel ?? review.title)
              .font(.system(size: 12, weight: .regular))
              .foregroundStyle(Color.white)
              .lineLimit(1)
              .minimumScaleFactor(0.84)
              .padding(.horizontal, 7)
              .padding(.vertical, 4)
              .background(
                Color.black.opacity(0.38),
                in: RoundedRectangle(cornerRadius: 7, style: .continuous)
              )
          }
          .padding(.trailing, 10)
          .padding(.bottom, 10)
        }
        .frame(width: geometry.size.width, height: geometry.size.height)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .journalWidgetContainerBackground(Color(red: 0.09, green: 0.08, blue: 0.07))
  }

  private var textReviewCard: some View {
    VStack(alignment: .leading, spacing: 9) {
      Rectangle()
        .fill(review.accentColor)
        .frame(width: 36, height: 4)

      reviewTextBlock(
        titleColor: Color(red: 0.96, green: 0.93, blue: 0.91),
        summaryColor: Color(red: 0.62, green: 0.58, blue: 0.54),
        subtitleColor: Color(red: 0.62, green: 0.58, blue: 0.54),
        titleSize: 27,
        summarySize: 16
      )
    }
    .padding(.horizontal, 32)
    .padding(.vertical, 24)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .journalWidgetContainerBackground(Color(red: 0.09, green: 0.08, blue: 0.07))
  }

  private func reviewTextBlock(
    titleColor: Color,
    summaryColor: Color,
    subtitleColor: Color,
    titleSize: CGFloat,
    summarySize: CGFloat
  ) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      if let subtitle = review.subtitle {
        Text(subtitle)
          .font(.system(size: 13, weight: .regular))
          .foregroundStyle(subtitleColor)
          .lineLimit(1)
      }

      Text(review.title)
        .font(.system(size: titleSize, weight: .regular))
        .foregroundStyle(titleColor)
        .lineLimit(1)
        .minimumScaleFactor(0.84)

      Text(review.summary)
        .font(.system(size: summarySize, weight: .regular))
        .foregroundStyle(summaryColor)
        .lineLimit(3)
        .lineSpacing(3)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct JournalMomentReviewPayload {
  let title: String
  let summary: String
  let subtitle: String?
  let mode: String
  let deepLink: URL?
  let displayImage: UIImage?
  let displayLabel: String?

  init(props: [String: Any]?) {
    let review = props?["review"] as? [String: Any]
    let mode = review?["mode"] as? String
    let title = review?["title"] as? String
    let summary = review?["summary"] as? String
    let backgroundImageUri = (review?["backgroundImageUri"] as? String)?.trimmedNonEmpty
    let displayLabel = (review?["displayLabel"] as? String)?.trimmedNonEmpty
    let isValidReview =
      title?.isEmpty == false &&
      (mode == "weekly-review" || mode == "daily-review" || mode == "empty-review")

    self.title = isValidReview ? title ?? "" : "今天还没有留下什么"
    self.summary = isValidReview && summary?.isEmpty == false
      ? summary ?? ""
      : "写一句也很好，未来会在这里遇见它。"
    self.subtitle = (review?["subtitle"] as? String)?.trimmedNonEmpty
    self.mode = isValidReview ? mode ?? "empty-review" : "empty-review"
    self.deepLink = JournalMomentReviewPayload.makeDeepLink(action: review?["action"] as? [String: Any])
    self.displayImage = isValidReview && mode == "daily-review"
      ? JournalMomentReviewPayload.loadImage(uri: backgroundImageUri)
      : nil
    self.displayLabel = isValidReview && mode == "daily-review" ? displayLabel : nil
  }

  var accentColor: Color {
    mode == "empty-review"
      ? Color(red: 0.50, green: 0.72, blue: 0.64)
      : Color(red: 0.72, green: 0.63, blue: 0.85)
  }

  private static func makeDeepLink(action: [String: Any]?) -> URL? {
    guard let type = action?["type"] as? String else {
      return URL(string: "journal://review")
    }

    switch type {
    case "write":
      guard let themeId = action?["themeId"] as? String,
            !themeId.isEmpty else {
        return URL(string: "journal://write?theme=small-thing")
      }
      return URL(string: "journal://write?theme=\(themeId)")
    case "reviewDay":
      guard let date = action?["date"] as? String,
            !date.isEmpty else {
        return URL(string: "journal://review")
      }
      return URL(string: "journal://review-day?date=\(date)")
    case "weeklyReview":
      guard let week = action?["week"] as? String,
            !week.isEmpty else {
        return URL(string: "journal://review")
      }
      return URL(string: "journal://weekly-review?week=\(week)")
    default:
      return URL(string: "journal://review")
    }
  }

  private static func loadImage(uri: String?) -> UIImage? {
    guard let uri,
          let url = URL(string: uri),
          let data = try? Data(contentsOf: url) else {
      return nil
    }

    return UIImage(data: data)
  }
}

private extension String {
  var trimmedNonEmpty: String? {
    let value = trimmingCharacters(in: .whitespacesAndNewlines)

    return value.isEmpty ? nil : value
  }
}

private extension View {
  @ViewBuilder
  func journalWidgetContainerBackground(_ color: Color) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      self.containerBackground(color, for: .widget)
    } else {
      self.background(color)
    }
  }
}
