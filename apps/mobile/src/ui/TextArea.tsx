import { forwardRef } from 'react'
import { TextInput, type TextInputProps } from 'react-native'
import { cn } from './cn'
import { useJournalTheme } from './JournalTheme'

type TextAreaProps = TextInputProps & {
  minHeightClassName?: string
}

export const TextArea = forwardRef<TextInput, TextAreaProps>(function TextArea(
  {
    className,
    minHeightClassName = 'min-h-28',
    placeholderTextColor,
    ...props
  },
  ref,
) {
  const { colors } = useJournalTheme()

  return (
    <TextInput
      className={cn(
        'rounded-lg border border-border bg-surface px-4 py-3 text-[16px] leading-6 text-foreground',
        minHeightClassName,
        className,
      )}
      multiline
      placeholderTextColor={placeholderTextColor ?? colors['text-quaternary']}
      ref={ref}
      textAlignVertical="top"
      {...props}
    />
  )
})
