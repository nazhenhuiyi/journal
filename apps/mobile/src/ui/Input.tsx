import { TextInput, type TextInputProps } from 'react-native'
import { cn } from './cn'

type InputProps = TextInputProps & {
  className?: string
}

export function Input({ className, placeholderTextColor = '#8f9d95', ...props }: InputProps) {
  return (
    <TextInput
      className={cn(
        'min-h-12 rounded-lg border border-reed bg-paper px-4 text-base leading-6 text-ink',
        className,
      )}
      placeholderTextColor={placeholderTextColor}
      {...props}
    />
  )
}
