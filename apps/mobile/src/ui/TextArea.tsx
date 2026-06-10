import { forwardRef } from 'react'
import { TextInput, type TextInputProps } from 'react-native'
import { semanticColors } from '@journal/theme'
import { cn } from './cn'

type TextAreaProps = TextInputProps & {
  minHeightClassName?: string
}

export const TextArea = forwardRef<TextInput, TextAreaProps>(function TextArea(
  {
    className,
    minHeightClassName = 'min-h-28',
    placeholderTextColor = semanticColors['text-quaternary'],
    ...props
  },
  ref,
) {
  return (
    <TextInput
      className={cn(
        'rounded-lg border border-border bg-surface px-4 py-3 text-[16px] leading-6 text-foreground',
        minHeightClassName,
        className,
      )}
      multiline
      placeholderTextColor={placeholderTextColor}
      ref={ref}
      textAlignVertical="top"
      {...props}
    />
  )
})
