import { useState } from 'react'
import { StyleSheet, TextInput, type TextInputProps } from 'react-native'
import { primitiveColors, semanticColors } from '@journal/theme'
import { cn } from './cn'

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
  placeholderTextColor = semanticColors['muted-fg'],
  style,
  variant = 'box',
  ...props
}: InputProps) {
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
      placeholderTextColor={placeholderTextColor}
      style={[
        isFocused && variant === 'box' ? styles.focusedBox : null,
        isFocused && variant === 'line' ? styles.focusedLine : null,
        style,
      ]}
      {...props}
    />
  )
}

const styles = StyleSheet.create({
  focusedBox: {
    borderColor: primitiveColors.ink[300],
  },
  focusedLine: {
    borderBottomColor: primitiveColors.ink[300],
  },
})
