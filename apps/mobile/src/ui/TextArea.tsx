import { forwardRef } from 'react'
import { TextInput, type TextInputProps } from 'react-native'
import { cn } from './cn'

type TextAreaProps = TextInputProps & {
  minHeightClassName?: string
}

export const TextArea = forwardRef<TextInput, TextAreaProps>(function TextArea(
  {
    className,
    minHeightClassName = 'min-h-28',
    placeholderTextColor = '#8a968f',
    ...props
  },
  ref,
) {
  return (
    <TextInput
      className={cn(
        'rounded-lg border border-reed bg-paper px-4 py-3 text-[16px] leading-6 text-ink',
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
