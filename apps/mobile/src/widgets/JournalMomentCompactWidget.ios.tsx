import {
  Rectangle,
  Spacer,
  Text,
  VStack,
} from '@expo/ui/swift-ui'
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineHeight,
  lineLimit,
  minimumScaleFactor,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers'
import { createWidget, type WidgetEnvironment } from 'expo-widgets'
import type { JournalWidgetBundleSnapshot } from '@journal/core'

function JournalMomentCompactWidgetView(
  props: Partial<JournalWidgetBundleSnapshot>,
  environment: WidgetEnvironment,
) {
  'widget'

  const journalWidgetFontFamily = 'Xiaolai'
  const moment = props.moment
  const hasValidMoment =
    moment &&
    moment.mode === 'theme-entry' &&
    typeof moment.title === 'string' &&
    moment.title.length > 0 &&
    moment.action?.type === 'write' &&
    typeof moment.action.themeId === 'string' &&
    moment.action.themeId.length > 0
  const title = hasValidMoment ? moment.title : '记一件小事'
  const subtitle = hasValidMoment && typeof moment.subtitle === 'string' && moment.subtitle.length > 0
    ? moment.subtitle
    : '不用很完整'
  const themeId = hasValidMoment ? moment.action.themeId : 'small-thing'
  const isDark = environment.colorScheme === 'dark'
  const accent = isDark ? '#7FB7A3' : '#3F8F78'
  const backgroundColor = isDark ? '#171412' : '#F8F2E9'
  const subtitleColor = isDark ? '#9F958C' : '#7B7167'
  const titleColor = isDark ? '#F4EEE7' : '#201B16'

  return (
    <VStack
      alignment="leading"
      modifiers={[
        frame({ maxHeight: Infinity, maxWidth: Infinity, alignment: 'leading' }),
        containerBackground(backgroundColor, 'widget'),
        padding({ horizontal: 9, vertical: 10 }),
        widgetURL('journal://write?theme=' + themeId),
      ]}
      spacing={5}
    >
      <Spacer minLength={0} />

      <Rectangle
        modifiers={[
          frame({ height: 4, width: 28 }),
          foregroundStyle(accent),
        ]}
      />

      <Text
        modifiers={[
          font({
            family: journalWidgetFontFamily,
            size: 17,
            weight: 'regular',
          }),
          foregroundStyle(titleColor),
          lineLimit(1),
          lineHeight(22),
          minimumScaleFactor(0.64),
        ]}
      >
        {title}
      </Text>

      <Text
        modifiers={[
          font({
            family: journalWidgetFontFamily,
            size: 13,
            weight: 'regular',
          }),
          foregroundStyle(subtitleColor),
          lineLimit(1),
          lineHeight(18),
          minimumScaleFactor(0.9),
        ]}
      >
        {subtitle}
      </Text>

      <Spacer minLength={0} />
    </VStack>
  )
}

export default createWidget('JournalMomentCompactWidget', JournalMomentCompactWidgetView)
