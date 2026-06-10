import { type ReactNode } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { radiusPixels, semanticColors, spacingPixels } from '@journal/theme'

type ListGroupProps = {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

type ListRowProps = {
  accessibilityLabel?: string
  children?: ReactNode
  disabled?: boolean
  divider?: boolean
  label: string
  onPress?: () => void
  showChevron?: boolean
  testID?: string
  value?: string
  valueNumberOfLines?: number
}

export function ListGroup({ children, style }: ListGroupProps) {
  return <View style={[styles.group, style]}>{children}</View>
}

export function ListRow({
  accessibilityLabel,
  children,
  disabled = false,
  divider = false,
  label,
  onPress,
  showChevron = false,
  testID,
  value,
  valueNumberOfLines = 1,
}: ListRowProps) {
  const rowContent = (
    <>
      <Text className="text-sm font-medium leading-5 text-text-tertiary">{label}</Text>
      {children ? (
        <View style={styles.trailing}>{children}</View>
      ) : (
        <View style={styles.trailingValue}>
          <Text
            className="text-right text-sm font-semibold leading-5 text-foreground"
            numberOfLines={valueNumberOfLines}
            style={styles.value}
          >
            {value}
          </Text>
          {showChevron ? (
            <Ionicons color={semanticColors['text-quaternary']} name="chevron-forward" size={17} />
          ) : null}
        </View>
      )}
    </>
  )

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          divider ? styles.divider : null,
          { opacity: disabled ? 0.45 : pressed ? 0.66 : 1 },
        ]}
        testID={testID}
      >
        {rowContent}
      </Pressable>
    )
  }

  return (
    <View style={[styles.row, divider ? styles.divider : null]} testID={testID}>
      {rowContent}
    </View>
  )
}

const styles = StyleSheet.create({
  divider: {
    borderTopColor: semanticColors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  group: {
    backgroundColor: semanticColors.surface,
    borderRadius: radiusPixels.lg,
    overflow: 'hidden',
    paddingHorizontal: spacingPixels['4'],
    paddingVertical: spacingPixels['1'],
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacingPixels['3.5'],
    minHeight: spacingPixels['12'],
  },
  trailing: {
    alignItems: 'flex-end',
    flex: 1,
    minWidth: 0,
  },
  trailingValue: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacingPixels['1'],
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  value: {
    flexShrink: 1,
    minWidth: 0,
  },
})
