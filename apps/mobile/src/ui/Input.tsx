import { TextInput, type TextInputProps } from 'react-native'
import { semanticColors } from '@journal/theme'
import { cn } from './cn'

type InputProps = TextInputProps & {
  className?: string
}

export function Input({ className, placeholderTextColor = semanticColors['muted-fg'], ...props }: InputProps) {
  return (
    <TextInput
      className={cn(
        'min-h-12 rounded-lg border border-border bg-surface px-4 text-base leading-6 text-foreground',
        className,
      )}
      placeholderTextColor={placeholderTextColor}
      {...props}
    />
  )
}
