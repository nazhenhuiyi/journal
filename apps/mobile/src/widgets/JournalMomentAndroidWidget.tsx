import React from 'react'
import {
  FlexWidget,
  TextWidget,
  type WidgetInfo,
} from 'react-native-android-widget'
import type { JournalWidgetSnapshot } from '@journal/core'
import { buildJournalWidgetDeepLink } from './journalWidgetLinks'

export const androidJournalWidgetName = 'JournalMoment'
export const androidJournalCompactWidgetName = 'JournalMomentCompact'
export const androidJournalWidgetNames = [
  androidJournalWidgetName,
  androidJournalCompactWidgetName,
]
const journalWidgetFontFamily = 'Xiaolai'

const fallbackSnapshot: JournalWidgetSnapshot = {
  action: {
    themeId: 'small-thing',
    type: 'write',
  },
  date: '1970-01-01',
  footnote: '且留',
  generatedAt: '1970-01-01T00:00:00.000Z',
  mode: 'theme-entry',
  subtitle: '不用很完整',
  title: '记一件小事',
  version: 1,
}

export function renderJournalMomentAndroidWidget(
  snapshot: JournalWidgetSnapshot | null,
  widgetInfo?: WidgetInfo,
) {
  return JournalMomentAndroidWidget({
    snapshot: snapshot ?? fallbackSnapshot,
    widgetInfo,
  })
}

function JournalMomentAndroidWidget({
  snapshot,
  widgetInfo,
}: {
  snapshot: JournalWidgetSnapshot
  widgetInfo?: WidgetInfo
}) {
  const accentColor = snapshot.mode === 'review-moment' ? '#8F7AAE' : '#4C8B7D'
  const isCompact = isCompactAndroidWidget(widgetInfo)

  return (
    <FlexWidget
      accessibilityLabel={snapshot.title}
      clickAction="OPEN_URI"
      clickActionData={{ uri: buildJournalWidgetDeepLink(snapshot.action) }}
      style={{
        alignItems: 'center',
        backgroundColor: '#F8F2E9',
        borderColor: '#EFE6DA',
        borderWidth: 1,
        borderRadius: isCompact ? 18 : 24,
        flexDirection: 'column',
        flexGap: 0,
        height: 'match_parent',
        justifyContent: 'flex-start',
        paddingHorizontal: isCompact ? 14 : 22,
        paddingVertical: isCompact ? 10 : 17,
        width: 'match_parent',
      }}
    >
      <FlexWidget
        style={{
          height: isCompact ? 2 : 8,
          width: 'match_parent',
        }}
      />

      <FlexWidget
        style={{
          alignItems: 'flex-start',
          flexDirection: 'row',
          flexGap: isCompact ? 8 : 13,
          width: 'match_parent',
        }}
      >
        <FlexWidget
          style={{
            backgroundColor: accentColor,
            borderRadius: 3,
            height: isCompact ? 30 : 44,
            marginTop: isCompact ? 3 : 6,
            width: isCompact ? 4 : 5,
          }}
        />

        <FlexWidget
          style={{
            flex: 1,
            flexDirection: 'column',
            flexGap: isCompact ? 4 : 5,
          }}
        >
          <TextWidget
            allowFontScaling={false}
            maxLines={isCompact ? 1 : 2}
            text={snapshot.title}
            truncate="END"
            style={{
              color: '#201B16',
              fontFamily: journalWidgetFontFamily,
              fontSize: isCompact ? 22 : 31,
              fontWeight: '400',
            }}
          />
          {snapshot.subtitle ? (
            <TextWidget
              allowFontScaling={false}
              maxLines={1}
              text={snapshot.subtitle}
              truncate="END"
              style={{
                color: '#7B7167',
                fontFamily: journalWidgetFontFamily,
                fontSize: isCompact ? 13 : 17,
                fontWeight: '400',
              }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>

      <FlexWidget
        style={{
          height: isCompact ? 6 : 20,
          width: 'match_parent',
        }}
      />
    </FlexWidget>
  )
}

function isCompactAndroidWidget(widgetInfo?: WidgetInfo) {
  return widgetInfo?.widgetName === androidJournalCompactWidgetName ||
    (widgetInfo?.width ?? 320) < 300
}
