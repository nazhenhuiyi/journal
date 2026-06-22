import { type ComponentProps, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { cn } from './cn'
import { useJournalTheme } from './JournalTheme'

type IconName = ComponentProps<typeof Ionicons>['name']
type ButtonSize = 'md' | 'sm'
type ButtonVariant = 'primary' | 'secondary' | 'ghost'

type ButtonProps = PressableProps & {
  children: ReactNode
  icon?: IconName
  loading?: boolean
  size?: ButtonSize
  variant?: ButtonVariant
}

const buttonBase = 'flex-row items-center justify-center gap-2 rounded-lg'
const buttonSizes: Record<ButtonSize, string> = {
  md: 'min-h-12 px-4',
  sm: 'min-h-11 px-3',
}
const buttonVariants: Record<ButtonVariant, string> = {
  ghost: 'bg-transparent',
  primary: 'bg-primary',
  secondary: 'border border-border bg-surface',
}
const textSizes: Record<ButtonSize, string> = {
  md: 'text-base',
  sm: 'text-sm',
}
const textVariants: Record<ButtonVariant, string> = {
  ghost: 'text-text-tertiary',
  primary: 'text-primary-fg',
  secondary: 'text-foreground',
}
export function Button({
  children,
  className,
  disabled,
  icon,
  loading = false,
  size = 'md',
  style,
  variant = 'primary',
  ...props
}: ButtonProps) {
  const { colors } = useJournalTheme()
  const isDisabled = disabled || loading
  const iconColors: Record<ButtonVariant, string> = {
    ghost: colors['text-tertiary'],
    primary: colors['primary-fg'],
    secondary: colors['text-tertiary'],
  }

  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        buttonBase,
        buttonSizes[size],
        buttonVariants[variant],
        isDisabled ? 'opacity-50' : '',
        className,
      )}
      disabled={isDisabled}
      style={(state) => [
        { transform: [{ scale: state.pressed && !isDisabled ? 0.99 : 1 }] },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={iconColors[variant]} size="small" />
      ) : icon ? (
        <Ionicons color={iconColors[variant]} name={icon} size={size === 'sm' ? 17 : 18} />
      ) : null}
      <Text className={cn('font-semibold', textSizes[size], textVariants[variant])}>{children}</Text>
    </Pressable>
  )
}
