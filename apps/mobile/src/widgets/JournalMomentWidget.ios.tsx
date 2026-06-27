import {
  Image,
  Rectangle,
  Text,
  VStack,
  ZStack,
} from '@expo/ui/swift-ui'
import {
  aspectRatio,
  background,
  clipped,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  fixedSize,
  layoutPriority,
  lineHeight,
  lineLimit,
  minimumScaleFactor,
  padding,
  resizable,
  shapes,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers'
import { createWidget, type WidgetEnvironment } from 'expo-widgets'
import type { JournalWidgetBundleSnapshot } from '@journal/core'

type NativeWidgetReview = NonNullable<Partial<JournalWidgetBundleSnapshot>['review']> & {
  backgroundImageUri?: unknown
}

function JournalMomentWidgetView(
  props: Partial<JournalWidgetBundleSnapshot>,
  environment: WidgetEnvironment,
) {
  'widget'

  const journalWidgetFontFamily = 'Xiaolai'
  const review = props.review as NativeWidgetReview | undefined
  const hasValidReview =
    review &&
    (review.mode === 'weekly-review' || review.mode === 'daily-review' || review.mode === 'empty-review') &&
    typeof review.title === 'string' &&
    review.title.length > 0
  const reviewMode = hasValidReview ? review.mode : 'empty-review'
  const title = hasValidReview ? review.title : '今天还没有留下什么'
  const summary = hasValidReview && typeof review.summary === 'string' && review.summary.length > 0
    ? review.summary
    : '写一句也很好，未来会在这里遇见它。'
  const action = hasValidReview ? review.action : { themeId: 'small-thing', type: 'write' as const }
  let deepLink = 'journal://review'

  if (action?.type === 'write' && action.themeId) {
    deepLink = 'journal://write?theme=' + action.themeId
  } else if (action?.type === 'reviewDay' && action.date) {
    deepLink = 'journal://review-day?date=' + action.date
  } else if (action?.type === 'weeklyReview' && action.week) {
    deepLink = 'journal://weekly-review?week=' + action.week
  }

  const isSmallWidget = environment.widgetFamily === 'systemSmall'
  const isDark = environment.colorScheme === 'dark'
  const accent = reviewMode !== 'empty-review'
    ? isDark ? '#b7a0d8' : '#8F7AAE'
    : isDark ? '#7FB7A3' : '#3F8F78'
  const backgroundColor = isDark ? '#171412' : '#F8F2E9'
  const subtitleColor = isDark ? '#9F958C' : '#7B7167'
  const titleColor = isDark ? '#F4EEE7' : '#201B16'
  const photoUri = reviewMode === 'daily-review' && typeof review?.backgroundImageUri === 'string'
    ? review.backgroundImageUri.trim()
    : ''
  const photoDisplayLabel = reviewMode === 'daily-review' && typeof review?.displayLabel === 'string'
    ? review.displayLabel.trim()
    : ''
  const photoLabel = photoDisplayLabel || title

  if (photoUri) {
    return (
      <ZStack
        alignment="bottomTrailing"
        modifiers={[
          frame({ maxHeight: Infinity, maxWidth: Infinity }),
          containerBackground(backgroundColor, 'widget'),
          widgetURL(deepLink),
        ]}
      >
        <Image
          uiImage={photoUri}
          modifiers={[
            resizable(),
            aspectRatio({ contentMode: 'fill' }),
            frame({ maxHeight: Infinity, maxWidth: Infinity }),
            clipped(),
          ]}
        />

        <Text
          modifiers={[
            font({
              family: journalWidgetFontFamily,
              size: isSmallWidget ? 11 : 12,
              weight: 'regular',
            }),
            foregroundStyle('#FFFFFF'),
            lineLimit(1),
            lineHeight(isSmallWidget ? 14 : 15),
            minimumScaleFactor(0.84),
            padding({ horizontal: isSmallWidget ? 6 : 7, vertical: 4 }),
            background('#66000000', shapes.roundedRectangle({ cornerRadius: 7 })),
            padding({ bottom: isSmallWidget ? 9 : 10, trailing: isSmallWidget ? 9 : 10 }),
          ]}
        >
          {photoLabel}
        </Text>
      </ZStack>
    )
  }

  return (
    <VStack
      alignment="leading"
      modifiers={[
        frame({ maxHeight: Infinity, maxWidth: Infinity, alignment: 'topLeading' }),
        containerBackground(backgroundColor, 'widget'),
        padding({ horizontal: isSmallWidget ? 10 : 16, vertical: isSmallWidget ? 10 : 12 }),
        widgetURL(deepLink),
      ]}
      spacing={isSmallWidget ? 7 : 9}
    >
      <Rectangle
        modifiers={[
          frame({ height: 4, width: isSmallWidget ? 28 : 36 }),
          foregroundStyle(accent),
        ]}
      />

      <VStack
        alignment="leading"
        modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
        spacing={isSmallWidget ? 7 : 11}
      >
        <Text
          modifiers={[
            font({
              family: journalWidgetFontFamily,
              size: isSmallWidget ? 20 : 27,
              weight: 'regular',
            }),
            foregroundStyle(titleColor),
            lineLimit(isSmallWidget ? 2 : 1),
            lineHeight(isSmallWidget ? 25 : 33),
            minimumScaleFactor(0.82),
          ]}
        >
          {title}
        </Text>

        <Text
          modifiers={[
            font({
              family: journalWidgetFontFamily,
              size: isSmallWidget ? 14 : 16,
              weight: 'regular',
            }),
            foregroundStyle(subtitleColor),
            lineLimit(isSmallWidget ? 2 : 3),
            lineHeight(isSmallWidget ? 19 : 22),
            fixedSize({ horizontal: false, vertical: true }),
            layoutPriority(1),
          ]}
        >
          {summary}
        </Text>
      </VStack>
    </VStack>
  )
}

export default createWidget('JournalMomentWidget', JournalMomentWidgetView)
