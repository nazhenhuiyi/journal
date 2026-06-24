import React from 'react'
import {
  FlexWidget,
  TextWidget,
  type WidgetInfo,
} from 'react-native-android-widget'
import type {
  JournalWidgetBundleSnapshot,
  JournalWidgetMomentSnapshot,
  JournalWidgetReviewSnapshot,
} from '@journal/core'
import { getSemanticColors, type SemanticColorScheme } from '@journal/theme'
import { buildJournalWidgetDeepLink } from './journalWidgetLinks'

export const androidJournalWidgetName = 'JournalMoment'
export const androidJournalCompactWidgetName = 'JournalMomentCompact'
export const androidJournalWidgetNames = [
  androidJournalWidgetName,
  androidJournalCompactWidgetName,
]

const journalWidgetFontFamily = 'Xiaolai'
const fallbackSnapshot: JournalWidgetBundleSnapshot = {
  date: '1970-01-01',
  generatedAt: '1970-01-01T00:00:00.000Z',
  moment: {
    action: {
      themeId: 'small-thing',
      type: 'write',
    },
    footnote: '此刻',
    mode: 'theme-entry',
    subtitle: '不用很完整',
    title: '记一件小事',
  },
  review: {
    action: {
      themeId: 'small-thing',
      type: 'write',
    },
    footnote: '回看',
    mode: 'empty-review',
    summary: '写一句也很好，未来会在这里遇见它。',
    title: '今天还没有留下什么',
  },
  version: 2,
}
type AndroidWidgetColor = `#${string}` | `rgba(${number}, ${number}, ${number}, ${number})`

function getWidgetPalette(scheme: SemanticColorScheme) {
  const colors = getSemanticColors(scheme)

  if (scheme === 'dark') {
    return {
      accent: '#b7a0d8',
      background: toAndroidWidgetColor(colors.surface),
      border: toAndroidWidgetColor(colors.border),
      momentAccent: toAndroidWidgetColor(colors.primary),
      subtitle: toAndroidWidgetColor(colors['text-tertiary']),
      title: toAndroidWidgetColor(colors.foreground),
    } as const
  }

  return {
    accent: '#8F7AAE',
    background: '#F8F2E9',
    border: '#EFE6DA',
    momentAccent: toAndroidWidgetColor(colors.primary),
    subtitle: '#7B7167',
    title: '#201B16',
  } as const
}

function toAndroidWidgetColor(value: string) {
  return value as AndroidWidgetColor
}

export function renderJournalMomentAndroidWidget(
  snapshot: JournalWidgetBundleSnapshot | null,
  widgetInfo?: WidgetInfo,
) {
  const resolvedSnapshot = snapshot ?? fallbackSnapshot
  const isMomentWidget = widgetInfo?.widgetName === androidJournalCompactWidgetName

  return {
    light: isMomentWidget
      ? renderMomentAndroidWidget({
          moment: resolvedSnapshot.moment,
          scheme: 'light',
          widgetInfo,
        })
      : renderReviewAndroidWidget({
          review: resolvedSnapshot.review,
          scheme: 'light',
        }),
    dark: isMomentWidget
      ? renderMomentAndroidWidget({
          moment: resolvedSnapshot.moment,
          scheme: 'dark',
          widgetInfo,
        })
      : renderReviewAndroidWidget({
          review: resolvedSnapshot.review,
          scheme: 'dark',
        }),
  }
}

function renderReviewAndroidWidget({
  review,
  scheme,
}: {
  review: JournalWidgetReviewSnapshot
  scheme: SemanticColorScheme
}) {
  const palette = getWidgetPalette(scheme)
  const content = renderReviewTextLayer({
    palette,
    review,
  })

  return (
    <FlexWidget
      accessibilityLabel={review.title}
      clickAction="OPEN_URI"
      clickActionData={{ uri: buildJournalWidgetDeepLink(review.action) }}
      style={{
        alignItems: 'flex-start',
        backgroundColor: palette.background,
        borderColor: palette.border,
        borderRadius: 24,
        borderWidth: 1,
        flexDirection: 'column',
        height: 'match_parent',
        justifyContent: 'flex-start',
        paddingHorizontal: 20,
        paddingVertical: 13,
        width: 'match_parent',
      }}
    >
      {content}
    </FlexWidget>
  )
}

function renderReviewTextLayer({
  palette,
  review,
}: {
  palette: ReturnType<typeof getWidgetPalette>
  review: JournalWidgetReviewSnapshot
}) {
  const titleColor = palette.title
  const subtitleColor = palette.subtitle
  const summaryColor = palette.subtitle
  const subtitle = getVisibleReviewSubtitle(review)
  const contentGap = getReviewTextGap({
    hasSubtitle: Boolean(subtitle),
  })

  return (
    <FlexWidget
      style={{
        alignItems: 'flex-start',
        flexDirection: 'column',
        flexGap: contentGap,
        height: 'match_parent',
        justifyContent: 'center',
        paddingHorizontal: 0,
        paddingVertical: 0,
        width: 'match_parent',
      }}
    >
      {subtitle ? (
        <TextWidget
          allowFontScaling={false}
          maxLines={1}
          text={subtitle}
          truncate="END"
          style={{
            color: subtitleColor,
            fontFamily: journalWidgetFontFamily,
            fontSize: 13,
            fontWeight: '400',
          }}
        />
      ) : null}

      <TextWidget
        allowFontScaling={false}
        maxLines={2}
        text={review.title}
        truncate="END"
        style={{
          color: titleColor,
          fontFamily: journalWidgetFontFamily,
          fontSize: 24,
          fontWeight: '400',
        }}
      />

      {review.summary ? (
        <TextWidget
          allowFontScaling={false}
          maxLines={3}
          text={review.summary}
          truncate="END"
          style={{
            color: summaryColor,
            fontFamily: journalWidgetFontFamily,
            fontSize: 14,
            fontWeight: '400',
          }}
        />
      ) : null}
    </FlexWidget>
  )
}

function getVisibleReviewSubtitle(review: JournalWidgetReviewSnapshot) {
  if (review.mode === 'daily-review') {
    return ''
  }

  return review.subtitle?.trim() ?? ''
}

function getReviewTextGap({
  hasSubtitle,
}: {
  hasSubtitle: boolean
}) {
  return hasSubtitle ? 6 : 8
}

function renderMomentAndroidWidget({
  moment,
  scheme,
}: {
  moment: JournalWidgetMomentSnapshot
  scheme: SemanticColorScheme
  widgetInfo?: WidgetInfo
}) {
  const palette = getWidgetPalette(scheme)

  return (
    <FlexWidget
      accessibilityLabel={moment.title}
      clickAction="OPEN_URI"
      clickActionData={{ uri: buildJournalWidgetDeepLink(moment.action) }}
      style={{
        alignItems: 'center',
        backgroundColor: palette.background,
        borderColor: palette.border,
        borderRadius: 18,
        borderWidth: 1,
        flexDirection: 'column',
        height: 'match_parent',
        justifyContent: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        width: 'match_parent',
      }}
    >
      <FlexWidget
        style={{
          alignItems: 'flex-start',
          flexDirection: 'row',
          flexGap: 8,
          width: 'match_parent',
        }}
      >
        <FlexWidget
          style={{
            backgroundColor: palette.momentAccent,
            borderRadius: 3,
            height: 30,
            marginTop: 3,
            width: 4,
          }}
        />

        <FlexWidget
          style={{
            flex: 1,
            flexDirection: 'column',
            flexGap: 4,
          }}
        >
          <TextWidget
            allowFontScaling={false}
            maxLines={1}
            text={moment.title}
            truncate="END"
            style={{
              color: palette.title,
              fontFamily: journalWidgetFontFamily,
              fontSize: 22,
              fontWeight: '400',
            }}
          />
          {moment.subtitle ? (
            <TextWidget
              allowFontScaling={false}
              maxLines={1}
              text={moment.subtitle}
              truncate="END"
              style={{
                color: palette.subtitle,
                fontFamily: journalWidgetFontFamily,
                fontSize: 13,
                fontWeight: '400',
              }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  )
}
