import type { DayFrontMatter } from '@journal/core'

export function isFreshWeather(weather: DayFrontMatter['weather'], date: string) {
  return Boolean(weather?.text && getWeatherUpdatedLocalDateKey(weather.updatedAt) === date)
}

export function isFreshWeatherForLocation(
  frontMatter: DayFrontMatter,
  date: string,
  weatherLocation: string,
) {
  if (!isFreshWeather(frontMatter.weather, date)) {
    return false
  }

  const query = weatherLocation.trim()

  return !query || (frontMatter.location?.query === query && frontMatter.location?.name === query)
}

function getWeatherUpdatedLocalDateKey(updatedAt: string | undefined) {
  if (!updatedAt) {
    return null
  }

  const trimmedUpdatedAt = updatedAt.trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedUpdatedAt)) {
    return trimmedUpdatedAt
  }

  const updatedDate = new Date(trimmedUpdatedAt)

  if (Number.isNaN(updatedDate.getTime())) {
    return null
  }

  return formatLocalDateKey(updatedDate)
}

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}
