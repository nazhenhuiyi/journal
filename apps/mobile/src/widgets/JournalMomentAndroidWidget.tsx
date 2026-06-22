import React from 'react'
import {
  FlexWidget,
  TextWidget,
  type WidgetInfo,
} from 'react-native-android-widget'
import type { JournalWidgetSnapshot } from '@journal/core'
import { getSemanticColors, type SemanticColorScheme } from '@journal/theme'
import { buildJournalWidgetDeepLink } from './journalWidgetLinks'

export const androidJournalWidgetName = 'JournalMoment'
export const androidJournalCompactWidgetName = 'JournalMomentCompact'
export const androidJournalWidgetNames = [
  androidJournalWidgetName,
  androidJournalCompactWidgetName,
]
const journalWidgetFontFamily = 'Xiaolai'
type AndroidWidgetColor = `#${string}` | `rgba(${number}, ${number}, ${number}, ${number})`

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

function getWidgetPalette(scheme: SemanticColorScheme, mode: JournalWidgetSnapshot['mode']) {
  const colors = getSemanticColors(scheme)
  const accent = mode === 'review-moment'
    ? scheme === 'dark' ? '#b7a0d8' : '#8F7AAE'
    : toAndroidWidgetColor(colors.primary)

  if (scheme === 'dark') {
    return {
      accent,
      background: toAndroidWidgetColor(colors.surface),
      border: toAndroidWidgetColor(colors.border),
      subtitle: toAndroidWidgetColor(colors['text-tertiary']),
      title: toAndroidWidgetColor(colors.foreground),
    } as const
  }

  return {
    accent,
    background: '#F8F2E9',
    border: '#EFE6DA',
    subtitle: '#7B7167',
    title: '#201B16',
  } as const
}

function toAndroidWidgetColor(value: string) {
  return value as AndroidWidgetColor
}

export function renderJournalMomentAndroidWidget(
  snapshot: JournalWidgetSnapshot | null,
  widgetInfo?: WidgetInfo,
) {
  const resolvedSnapshot = snapshot ?? fallbackSnapshot

  return {
    light: JournalMomentAndroidWidget({
      scheme: 'light',
      snapshot: resolvedSnapshot,
      widgetInfo,
    }),
    dark: JournalMomentAndroidWidget({
      scheme: 'dark',
      snapshot: resolvedSnapshot,
      widgetInfo,
    }),
  }
}

function JournalMomentAndroidWidget({
  scheme,
  snapshot,
  widgetInfo,
}: {
  scheme: SemanticColorScheme
  snapshot: JournalWidgetSnapshot
  widgetInfo?: WidgetInfo
}) {
  const palette = getWidgetPalette(scheme, snapshot.mode)
  const isCompact = isCompactAndroidWidget(widgetInfo)

  return (
    <FlexWidget
      accessibilityLabel={snapshot.title}
      clickAction="OPEN_URI"
      clickActionData={{ uri: buildJournalWidgetDeepLink(snapshot.action) }}
      style={{
        alignItems: 'center',
        backgroundColor: palette.background,
        borderColor: palette.border,
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
            backgroundColor: palette.accent,
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
              color: palette.title,
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
                color: palette.subtitle,
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
