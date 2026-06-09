import { type ComponentProps, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { semanticColors } from '@journal/theme'
import { Screen } from '../ui/Screen'

export type MobileIconName = ComponentProps<typeof Ionicons>['name']

type PageShellProps = {
  children: ReactNode
  icon: MobileIconName
  onBack: () => void
  title: string
}

export function PageShell({ children, icon, onBack, title }: PageShellProps) {
  return (
    <Screen>
      <View className="flex-1 px-5 pb-5 pt-4">
        <View className="mb-5 flex-row items-center gap-3">
          <Pressable
            accessibilityLabel="返回今日"
            accessibilityRole="button"
            className="h-9 w-9 items-center justify-center rounded-full bg-primary-soft"
            onPress={onBack}
            testID="back-to-today-button"
          >
            <Ionicons color={semanticColors.primary} name="chevron-back" size={22} />
          </Pressable>
          <View className="flex-row items-center gap-2">
            <View className="h-8 w-8 items-center justify-center rounded-lg bg-primary-soft">
              <Ionicons color={semanticColors.primary} name={icon} size={18} />
            </View>
            <Text className="text-lg font-semibold text-foreground">{title}</Text>
          </View>
        </View>
        {children}
      </View>
    </Screen>
  )
}
