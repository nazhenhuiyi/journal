import { useState } from 'react'
import { TextInput, type TextInputProps } from 'react-native'
import { cn } from './cn'
import { useJournalTheme } from './JournalTheme'

type InputProps = TextInputProps & {
  className?: string
  variant?: 'box' | 'line' | 'plain'
}

const inputVariants: Record<NonNullable<InputProps['variant']>, string> = {
  box: 'min-h-12 rounded-lg border border-border bg-surface px-4 text-base leading-6 text-foreground',
  line: 'min-h-12 border-b border-border bg-transparent px-0 text-base leading-6 text-foreground',
  plain: 'min-h-9 bg-transparent px-0 text-base leading-6 text-foreground',
}

export function Input({
  className,
  onBlur,
  onFocus,
  placeholderTextColor,
  style,
  variant = 'box',
  ...props
}: InputProps) {
  const { colors } = useJournalTheme()
  const [isFocused, setIsFocused] = useState(false)

  return (
    <TextInput
      className={cn(inputVariants[variant], className)}
      onBlur={(event) => {
        setIsFocused(false)
        onBlur?.(event)
      }}
      onFocus={(event) => {
        setIsFocused(true)
        onFocus?.(event)
      }}
      placeholderTextColor={placeholderTextColor ?? colors['text-quaternary']}
      style={[
        isFocused && variant === 'box' ? { borderColor: colors.ring } : null,
        isFocused && variant === 'line' ? { borderBottomColor: colors.ring } : null,
        style,
      ]}
      {...props}
    />
  )
}
