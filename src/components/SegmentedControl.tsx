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
        'inline-flex rounded-[10px] border border-[rgba(122,79,50,0.14)] bg-[rgba(255,250,240,0.46)] p-[0.18rem]',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.62),0_1px_2px_rgba(47,38,31,0.04)]',
      )}
      role="group"
    >
      {options.map((option, index) => {
        const isActive = option.value === value

        return (
          <button
            aria-pressed={isActive}
            className={classNames(
              'relative h-[2.1rem] min-w-[4.2rem] rounded-[7px] border-0 bg-transparent px-3.5 text-[0.95rem] leading-none',
              'cursor-pointer text-[rgba(47,38,31,0.58)] transition-[background-color,color,box-shadow] duration-200 ease-out',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(111,126,99,0.36)]',
              !isActive && 'hover:bg-[rgba(255,253,246,0.42)] hover:text-[rgba(47,38,31,0.76)]',
              isActive &&
                'z-10 bg-[rgba(255,253,246,0.9)] text-ink shadow-[inset_0_0_0_1px_rgba(122,79,50,0.08),0_1px_3px_rgba(47,38,31,0.08)]',
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={classNames(
                  'absolute bottom-[0.45rem] left-0 top-[0.45rem] w-px bg-[rgba(122,79,50,0.12)]',
                  isActive && 'opacity-0',
                )}
              />
            ) : null}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default SegmentedControl
