import { type ComponentProps, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

type IconName = ComponentProps<typeof Ionicons>['name']

type SectionHeaderProps = {
  icon: IconName
  meta?: ReactNode
  title: string
}

export function SectionHeader({ icon, meta, title }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="h-8 w-8 items-center justify-center rounded-lg bg-cloud">
        <Ionicons color="#254f43" name={icon} size={18} />
      </View>
      <Text className="text-lg font-semibold text-ink">{title}</Text>
      {meta ? <View className="ml-auto">{meta}</View> : null}
    </View>
  )
}
