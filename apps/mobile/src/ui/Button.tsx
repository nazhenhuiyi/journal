import { type ComponentProps, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { cn } from './cn'

type IconName = ComponentProps<typeof Ionicons>['name']
type ButtonVariant = 'primary' | 'secondary' | 'ghost'

type ButtonProps = PressableProps & {
  children: ReactNode
  icon?: IconName
  loading?: boolean
  variant?: ButtonVariant
}

const buttonBase = 'min-h-12 flex-row items-center justify-center gap-2 rounded-lg px-4'
const buttonVariants: Record<ButtonVariant, string> = {
  ghost: 'bg-transparent',
  primary: 'bg-moss',
  secondary: 'border border-reed bg-cloud',
}
const textVariants: Record<ButtonVariant, string> = {
  ghost: 'text-moss',
  primary: 'text-white',
  secondary: 'text-moss',
}
const iconColors: Record<ButtonVariant, string> = {
  ghost: '#254f43',
  primary: '#ffffff',
  secondary: '#254f43',
}

export function Button({
  children,
  className,
  disabled,
  icon,
  loading = false,
  style,
  variant = 'primary',
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <Pressable
      accessibilityRole="button"
      className={cn(buttonBase, buttonVariants[variant], isDisabled ? 'opacity-50' : '', className)}
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
        <Ionicons color={iconColors[variant]} name={icon} size={18} />
      ) : null}
      <Text className={cn('text-base font-semibold', textVariants[variant])}>{children}</Text>
    </Pressable>
  )
}
