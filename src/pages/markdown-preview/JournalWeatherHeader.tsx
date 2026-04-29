import { weatherPack } from '../../assets/theme-packs/weather'
import type { DayFrontMatter } from '../../domain/markdown'

export type WeatherStatus = 'idle' | 'loading' | 'ready' | 'failed'

type JournalWeatherHeaderProps = {
  frontMatter: DayFrontMatter
  status: WeatherStatus
  variant?: 'preview' | 'writing'
}

const previewClasses = {
  root: [
    'grid grid-cols-[3.3rem_minmax(9rem,0.8fr)_minmax(26rem,1fr)] items-center gap-[1.05rem]',
    'mx-[1.05rem] mb-0 mt-[0.8rem] min-h-[4.6rem] py-[0.62rem] pl-[0.65rem] pr-[0.8rem]',
    'rounded-[14px_10px_16px_9px] border border-[rgba(122,79,50,0.13)] text-[rgba(47,38,31,0.72)]',
    'bg-[radial-gradient(circle_at_11%_28%,rgba(215,166,75,0.13),transparent_4.8rem),linear-gradient(135deg,rgba(255,253,244,0.78),rgba(241,232,210,0.54))]',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.48),0_8px_24px_rgba(86,58,35,0.05)]',
  ].join(' '),
  image: 'h-[3.1rem] w-[3.1rem] object-contain drop-shadow-[0_4px_6px_rgba(86,58,35,0.1)]',
  copy: 'flex min-w-0 flex-col gap-[0.12rem]',
  summary: 'overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[0.78rem] text-[rgba(47,38,31,0.58)]',
  temperature: 'font-display text-[1.36rem] font-[650] leading-[1.1] text-walnut',
  details: 'm-0 grid grid-cols-4 gap-[0.45rem]',
  detail: 'min-w-0 border-l border-[rgba(122,79,50,0.13)] pl-[0.72rem]',
  label: 'm-0 overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[0.68rem] text-[rgba(47,38,31,0.44)]',
  value: 'm-0 overflow-hidden text-ellipsis whitespace-nowrap font-display text-[0.9rem] leading-[1.45] text-[rgba(47,38,31,0.7)]',
}

const writingClasses = {
  root: [
    'flex min-w-0 flex-1 items-center justify-start gap-[0.55rem]',
    'border-0 bg-transparent text-[rgba(47,38,31,0.5)] shadow-none',
  ].join(' '),
  image: 'h-[0.98rem] w-[0.98rem] flex-none object-contain opacity-[0.58] [filter:none]',
  copy: 'flex min-w-0 flex-none flex-row items-baseline gap-[0.34rem]',
  summary: 'max-w-[10rem] overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[0.76rem] font-[450] leading-none text-inherit',
  temperature: 'flex-none font-sans text-[0.76rem] font-[560] leading-none text-[rgba(122,79,50,0.58)]',
  details: 'm-0 flex min-w-0 flex-nowrap items-baseline gap-[0.46rem]',
  detail: 'flex min-w-0 items-baseline gap-[0.14rem] whitespace-nowrap border-l-0 pl-0',
  label: 'm-0 flex-none overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[0.76rem] font-[450] leading-none text-inherit',
  value: 'm-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[0.76rem] font-[450] leading-none text-inherit',
  separator: 'flex-none pr-[0.08rem] text-[rgba(122,79,50,0.24)]',
}

function JournalWeatherHeader({
  frontMatter,
  status,
  variant = 'preview',
}: JournalWeatherHeaderProps) {
  const weather = frontMatter.weather
  const locationLabel = formatLocationLabel(frontMatter.location)
  const weatherImage = getWeatherImage(weather?.text)
  const classes = variant === 'writing' ? writingClasses : previewClasses
  const weatherDetails = [
    { label: '体感', value: formatTemperature(weather?.feelsLike) },
    { label: '湿度', value: formatPercent(weather?.humidity) },
    { label: '风', value: formatWindSpeed(weather?.windSpeed) },
    { label: '地点', value: locationLabel },
  ]

  return (
    <section aria-label="今日天气" className={classes.root}>
      <img alt="" aria-hidden="true" className={classes.image} src={weatherImage} />
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
  return location?.name ?? location?.region ?? location?.country ?? '未定位'
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

function getWeatherImage(weatherText: string | undefined) {
  const normalizedText = weatherText ?? ''
  const item = weatherPack.items.find((weatherItem) => {
    const searchableText = [weatherItem.label, ...weatherItem.keywords].join(' ')

    return searchableText.includes(normalizedText) || normalizedText.includes(weatherItem.label)
  })

  if (item) {
    return item.image
  }

  if (/雷|暴/.test(normalizedText)) {
    return weatherPack.items.find((weatherItem) => weatherItem.id === 'weather.thunder')?.image ?? weatherPack.previewImage
  }

  if (/雨|淋|阵雨/.test(normalizedText)) {
    return weatherPack.items.find((weatherItem) => weatherItem.id === 'weather.rain')?.image ?? weatherPack.previewImage
  }

  if (/雪|冰/.test(normalizedText)) {
    return weatherPack.items.find((weatherItem) => weatherItem.id === 'weather.snow')?.image ?? weatherPack.previewImage
  }

  if (/雾|霾|阴/.test(normalizedText)) {
    return weatherPack.items.find((weatherItem) => weatherItem.id === 'weather.fog')?.image ?? weatherPack.previewImage
  }

  if (/风/.test(normalizedText)) {
    return weatherPack.items.find((weatherItem) => weatherItem.id === 'weather.wind')?.image ?? weatherPack.previewImage
  }

  return weatherPack.items.find((weatherItem) => weatherItem.id === 'weather.sunny')?.image ?? weatherPack.previewImage
}

export default JournalWeatherHeader
