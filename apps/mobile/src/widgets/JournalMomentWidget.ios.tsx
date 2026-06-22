import {
  HStack,
  Spacer,
  Text,
  VStack,
} from '@expo/ui/swift-ui'
import {
  background,
  containerBackground,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  offset,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers'
import { createWidget, type WidgetEnvironment } from 'expo-widgets'
import type { JournalWidgetSnapshot } from '@journal/core'
import { getSemanticColors, type SemanticColorScheme } from '@journal/theme'

function getWidgetPalette(scheme: SemanticColorScheme, mode: JournalWidgetSnapshot['mode']) {
  const colors = getSemanticColors(scheme)
  const accent = mode === 'review-moment'
    ? scheme === 'dark' ? '#b7a0d8' : '#8F7AAE'
    : colors.primary

  if (scheme === 'dark') {
    return {
      accent,
      background: colors.surface,
      subtitle: colors['text-tertiary'],
      title: colors.foreground,
    }
  }

  return {
    accent,
    background: '#F8F2E9',
    subtitle: '#7B7167',
    title: '#201B16',
  }
}

function JournalMomentWidgetView(
  props: Partial<JournalWidgetSnapshot>,
  environment: WidgetEnvironment,
) {
  'widget'

  const journalWidgetFontFamily = 'Xiaolai'

  let action: JournalWidgetSnapshot['action'] = {
    themeId: 'small-thing',
    type: 'write',
  }
  const propsAction = props.action

  if (
    propsAction &&
    propsAction.type === 'write' &&
    typeof propsAction.themeId === 'string' &&
    propsAction.themeId.length > 0
  ) {
    action = {
      themeId: propsAction.themeId,
      type: 'write',
    }
  } else if (
    propsAction &&
    propsAction.type === 'reviewDay' &&
    typeof propsAction.date === 'string' &&
    propsAction.date.length > 0
  ) {
    action = {
      date: propsAction.date,
      type: 'reviewDay',
    }
  } else if (propsAction && propsAction.type === 'review') {
    action = {
      type: 'review',
    }
  }

  const hasValidSnapshot =
    props.version === 1 &&
    typeof props.title === 'string' &&
    props.title.length > 0 &&
    typeof props.date === 'string' &&
    props.date.length > 0 &&
    typeof props.generatedAt === 'string' &&
    props.generatedAt.length > 0 &&
    (props.mode === 'theme-entry' || props.mode === 'review-moment')

  const snapshot: JournalWidgetSnapshot = {
    action,
    date: hasValidSnapshot ? props.date! : '1970-01-01',
    footnote:
      hasValidSnapshot && typeof props.footnote === 'string'
        ? props.footnote
        : '且留',
    generatedAt: hasValidSnapshot
      ? props.generatedAt!
      : '1970-01-01T00:00:00.000Z',
    mode: hasValidSnapshot ? props.mode! : 'theme-entry',
    subtitle:
      hasValidSnapshot && typeof props.subtitle === 'string'
        ? props.subtitle
        : '不用很完整',
    title: hasValidSnapshot ? props.title! : '记一件小事',
    version: 1,
  }

  let deepLink = 'journal://review'

  if (snapshot.action.type === 'write') {
    deepLink = 'journal://write?theme=' + snapshot.action.themeId
  } else if (snapshot.action.type === 'reviewDay') {
    deepLink = 'journal://review-day?date=' + snapshot.action.date
  }

  const isSmallWidget = environment.widgetFamily === 'systemSmall'
  const palette = getWidgetPalette(environment.colorScheme === 'dark' ? 'dark' : 'light', snapshot.mode)

  return (
    <VStack
      alignment="leading"
      modifiers={[
        frame({ maxHeight: Infinity, maxWidth: Infinity, alignment: 'topLeading' }),
        containerBackground(palette.background, 'widget'),
        padding({
          horizontal: isSmallWidget ? 17 : 22,
          vertical: isSmallWidget ? 16 : 17,
        }),
        widgetURL(deepLink),
      ]}
      spacing={0}
    >
      <Spacer minLength={isSmallWidget ? 5 : 8} />

      <HStack alignment="top" spacing={isSmallWidget ? 11 : 14}>
        <VStack
          modifiers={[
            frame({ height: isSmallWidget ? 38 : 44, width: 5 }),
            background(palette.accent),
            cornerRadius(3),
            offset({ y: isSmallWidget ? 5 : 6 }),
          ]}
        >
          <Spacer minLength={1} />
        </VStack>

        <VStack
          alignment="leading"
          modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
          spacing={isSmallWidget ? 4 : 5}
        >
          <Text
            modifiers={[
              font({
                family: journalWidgetFontFamily,
                size: isSmallWidget ? 29 : 31,
                weight: 'regular',
              }),
              foregroundStyle(palette.title),
              lineLimit(2),
            ]}
          >
            {snapshot.title}
          </Text>

          {snapshot.subtitle ? (
            <Text
              modifiers={[
                font({
                  family: journalWidgetFontFamily,
                  size: isSmallWidget ? 16 : 17,
                  weight: 'regular',
                }),
                foregroundStyle(palette.subtitle),
                lineLimit(1),
              ]}
            >
              {snapshot.subtitle}
            </Text>
          ) : null}
        </VStack>
      </HStack>

      <Spacer minLength={isSmallWidget ? 15 : 20} />
    </VStack>
  )
}

export default createWidget('JournalMomentWidget', JournalMomentWidgetView)
