import { type ComponentProps, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { semanticColors } from '@journal/theme'
import { cn } from './cn'

type IconName = ComponentProps<typeof Ionicons>['name']
type PillTone = 'blue' | 'green' | 'plain'

type PillProps = {
  children: ReactNode
  className?: string
  icon?: IconName
  tone?: PillTone
}

const tones: Record<PillTone, string> = {
  blue: 'border-border bg-muted',
  green: 'border-border bg-primary-soft',
  plain: 'border-border bg-surface',
}

export function Pill({ children, className, icon, tone = 'plain' }: PillProps) {
  return (
    <View className={cn('flex-row items-center gap-1.5 rounded-full border px-3 py-1.5', tones[tone], className)}>
      {icon ? <Ionicons color={semanticColors['text-tertiary']} name={icon} size={14} /> : null}
      <Text className="text-xs font-medium text-text-tertiary">{children}</Text>
    </View>
  )
}
