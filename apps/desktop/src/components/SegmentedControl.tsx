type SegmentedControlOption<T extends string> = {
  value: T
  label: string
}

type SegmentedControlProps<T extends string> = {
  ariaLabel: string
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
}

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function SegmentedControl<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div
      aria-label={ariaLabel}
      className={classNames(
        'inline-flex h-9 items-center gap-1 rounded-[var(--journal-radius-control)] border border-[var(--journal-line-control)] bg-surface-muted p-0.5',
      )}
      role="group"
    >
      {options.map((option) => {
        const isActive = option.value === value

        return (
          <button
            aria-pressed={isActive}
            className={classNames(
              'h-8 min-w-[3.55rem] rounded-[var(--radius-sm)] border-0 bg-transparent px-3 text-[0.95rem] font-medium leading-none',
              'cursor-pointer text-muted-fg transition-[background-color,color] duration-200 ease-out',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              !isActive && 'hover:bg-surface hover:text-foreground',
              isActive && 'bg-surface text-foreground',
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default SegmentedControl
