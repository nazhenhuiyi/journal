import type { DayFrontMatter } from '@journal/core'

export type WeatherStatus = 'idle' | 'loading' | 'ready' | 'failed'

type JournalWeatherHeaderProps = {
  frontMatter: DayFrontMatter
  status: WeatherStatus
  variant?: 'preview' | 'writing'
}

const previewClasses = {
  root: [
    'grid grid-cols-[minmax(9rem,0.8fr)_minmax(26rem,1fr)] items-center gap-[var(--journal-space-4)]',
    'mx-[var(--journal-space-4)] mb-0 mt-[var(--journal-space-3)] min-h-[4.6rem]',
    'py-[var(--journal-space-2-5)] pl-[var(--journal-space-2-5)] pr-[var(--journal-space-3)]',
    'rounded-[var(--journal-radius-card)] border border-[var(--journal-line)] bg-surface text-text-secondary',
  ].join(' '),
  copy: 'flex min-w-0 flex-col gap-[var(--journal-space-1)]',
  summary: 'overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[0.78rem] text-text-tertiary',
  temperature: 'font-display text-[1.36rem] font-[650] leading-[1.1] text-foreground',
  details: 'm-0 grid grid-cols-4 gap-[var(--journal-space-2)]',
  detail: 'min-w-0 border-l border-[var(--journal-line-soft)] pl-[var(--journal-space-3)]',
  label: 'm-0 overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[0.68rem] text-text-quaternary',
  value: 'm-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-[0.9rem] leading-[1.45] text-text-secondary',
}

const writingClasses = {
  root: [
    'flex min-w-0 flex-1 items-center justify-start gap-[var(--journal-space-2)]',
    'border-0 bg-transparent text-text-tertiary shadow-none',
  ].join(' '),
  copy: 'flex min-w-0 flex-none flex-row items-baseline gap-[var(--journal-space-1-5)]',
  summary: 'max-w-[10rem] overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[0.76rem] font-[450] leading-none text-inherit',
  temperature: 'flex-none font-sans text-[0.76rem] font-[560] leading-none text-text-tertiary',
  details: 'm-0 flex min-w-0 flex-nowrap items-baseline gap-[var(--journal-space-2)]',
  detail: 'flex min-w-0 items-baseline gap-[var(--journal-space-1)] whitespace-nowrap border-l-0 pl-0',
  label: 'm-0 flex-none overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[0.76rem] font-[450] leading-none text-inherit',
  value: 'm-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[0.76rem] font-[450] leading-none text-inherit',
  separator: 'flex-none pr-[var(--journal-space-1)] text-text-disabled',
}

function JournalWeatherHeader({
  frontMatter,
  status,
  variant = 'preview',
}: JournalWeatherHeaderProps) {
  const weather = frontMatter.weather
  const locationLabel = formatLocationLabel(frontMatter.location)
  const classes = variant === 'writing' ? writingClasses : previewClasses
  const weatherDetails = [
    { label: '体感', value: formatTemperature(weather?.feelsLike) },
    { label: '湿度', value: formatPercent(weather?.humidity) },
    { label: '风', value: formatWindSpeed(weather?.windSpeed) },
    { label: '地点', value: locationLabel },
  ]

  return (
    <section aria-label="今日天气" className={classes.root}>
      <div className={classes.copy}>
        <span className={classes.summary}>{weather?.text ?? getWeatherStatusLabel(status)}</span>
        <strong className={classes.temperature}>{formatTemperature(weather?.temperature)}</strong>
      </div>
      <dl className={classes.details}>
        {weatherDetails.map((detail) => (
          <div
            className={variant === 'writing' ? getWritingDetailClass(detail.label) : classes.detail}
            key={detail.label}
          >
            {variant === 'writing' ? (
              <span aria-hidden="true" className={writingClasses.separator}>
                /
              </span>
            ) : null}
            <dt className={classes.label}>{detail.label}</dt>
            <dd className={classes.value}>{detail.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function getWritingDetailClass(label: string) {
  if (label === '地点') {
    return `${writingClasses.detail} flex-shrink`
  }

  return `${writingClasses.detail} flex-none`
}

function formatLocationLabel(location: DayFrontMatter['location']) {
  return location?.query ?? location?.name ?? location?.region ?? location?.country ?? '未定位'
}

function formatTemperature(temperature: number | undefined) {
  return temperature === undefined ? '--' : `${Math.round(temperature)}°C`
}

function formatPercent(value: number | undefined) {
  return value === undefined ? '--' : `${Math.round(value)}%`
}

function formatWindSpeed(value: number | undefined) {
  return value === undefined ? '--' : `${Math.round(value)} km/h`
}

function getWeatherStatusLabel(status: WeatherStatus) {
  if (status === 'loading') {
    return '天气同步中'
  }

  if (status === 'failed') {
    return '天气未同步'
  }

  return '今日天气'
}

export default JournalWeatherHeader
