import { type ComponentProps, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useJournalTheme } from './JournalTheme'

type IconName = ComponentProps<typeof Ionicons>['name']

type SectionHeaderProps = {
  icon: IconName
  meta?: ReactNode
  title: string
}

export function SectionHeader({ icon, meta, title }: SectionHeaderProps) {
  const { colors } = useJournalTheme()

  return (
    <View className="flex-row items-center gap-2">
      <View className="h-8 w-8 items-center justify-center rounded-lg bg-surface-muted">
        <Ionicons color={colors['text-tertiary']} name={icon} size={18} />
      </View>
      <Text className="text-lg font-semibold text-foreground">{title}</Text>
      {meta ? <View className="ml-auto">{meta}</View> : null}
    </View>
  )
}
