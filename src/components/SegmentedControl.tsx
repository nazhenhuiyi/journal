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
        'inline-flex h-9 items-center gap-1 rounded-[9px] bg-transparent p-0.5',
      )}
      role="group"
    >
      {options.map((option) => {
        const isActive = option.value === value

        return (
          <button
            aria-pressed={isActive}
            className={classNames(
              'h-8 min-w-[3.55rem] rounded-[8px] border-0 bg-transparent px-3 text-[0.95rem] font-medium leading-none',
              'cursor-pointer text-[rgba(47,38,31,0.48)] transition-[background-color,color] duration-200 ease-out',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(111,126,99,0.36)]',
              !isActive && 'hover:bg-[rgba(122,79,50,0.05)] hover:text-[rgba(47,38,31,0.68)]',
              isActive && 'bg-[rgba(111,126,99,0.12)] text-ink',
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
