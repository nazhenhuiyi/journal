import { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { spacingPixels } from '@journal/theme'

type SectionProps = {
  action?: ReactNode
  children: ReactNode
  title: string
}

export function Section({ action, children, title }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text className="text-base font-semibold leading-6 text-foreground">{title}</Text>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  action: {
    flexShrink: 0,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacingPixels['3'],
    justifyContent: 'space-between',
    minHeight: spacingPixels['8'],
  },
  section: {
    gap: spacingPixels['2.5'],
  },
})
