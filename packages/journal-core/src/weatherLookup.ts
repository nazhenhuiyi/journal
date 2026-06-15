import type { DayFrontMatter } from './types'

export type WeatherLookupLocation = {
  latitude?: number
  longitude?: number
  query?: string
}

export type WeatherLookupPayload = {
  weather: NonNullable<DayFrontMatter['weather']>
  location?: NonNullable<DayFrontMatter['location']>
}

export type OpenMeteoGeocodingResult = WeatherLookupLocation & {
  location?: NonNullable<DayFrontMatter['location']>
}

export function normalizeWeatherQueryForWttr(query: string) {
  const trimmedQuery = query.trim()

  if (shouldScopeCjkWeatherQuery(trimmedQuery)) {
    return `${trimmedQuery},中国`
  }

  return trimmedQuery
}

export function parseOpenMeteoGeocoding(payload: unknown): OpenMeteoGeocodingResult | null {
  const root = asRecord(payload)
  const results = Array.isArray(root.results) ? root.results : []

  for (const result of results) {
    const location = asRecord(result)
    const latitude = numberFromRecord(location, 'latitude')
    const longitude = numberFromRecord(location, 'longitude')

    if (latitude === undefined || longitude === undefined) {
      continue
    }

    const name = stringFromRecord(location, 'name')
    const region = stringFromRecord(location, 'admin1')
    const country = stringFromRecord(location, 'country')

    return {
      latitude,
      longitude,
      location: {
        name,
        region,
        country,
      },
    }
  }

  return null
}

export function parseOpenMeteoWeather(
  payload: unknown,
  location?: DayFrontMatter['location'],
  now = new Date(),
): WeatherLookupPayload {
  const root = asRecord(payload)
  const current = asRecord(root.current)
  const temperature = numberFromRecord(current, 'temperature_2m')
  const weatherCode = numberFromRecord(current, 'weather_code')

  if (temperature === undefined || weatherCode === undefined) {
    throw new Error('Open-Meteo response did not include current weather.')
  }

  return {
    weather: {
      text: getOpenMeteoWeatherText(weatherCode),
      temperature,
      feelsLike: numberFromRecord(current, 'apparent_temperature'),
      humidity: numberFromRecord(current, 'relative_humidity_2m'),
      windSpeed: numberFromRecord(current, 'wind_speed_10m'),
      updatedAt: now.toISOString(),
    },
    location: normalizeFrontMatterLocation(location),
  }
}

export function parseWttrWeather(payload: unknown): WeatherLookupPayload {
  const root = asRecord(payload)
  const currentCondition = firstRecord(root.current_condition)
  const nearestArea = firstRecord(root.nearest_area)
  const temperature = numberFromRecord(currentCondition, 'temp_C')
  const feelsLike = numberFromRecord(currentCondition, 'FeelsLikeC')
  const humidity = numberFromRecord(currentCondition, 'humidity')
  const windSpeed = numberFromRecord(currentCondition, 'windspeedKmph')
  const text = normalizeWttrWeatherDescription([
    firstLocalizedValue(currentCondition.lang_zh),
    firstLocalizedValue(currentCondition.weatherDesc),
  ])

  if (!text || temperature === undefined) {
    throw new Error('Weather response did not include current weather.')
  }

  const areaName = firstLocalizedValue(nearestArea.areaName)
  const region = firstLocalizedValue(nearestArea.region)
  const country = firstLocalizedValue(nearestArea.country)

  return {
    weather: {
      text,
      temperature,
      feelsLike,
      humidity,
      windSpeed,
      updatedAt: new Date().toISOString(),
    },
    location: {
      name: areaName,
      region,
      country,
    },
  }
}

export function getOpenMeteoWeatherText(weatherCode: number) {
  switch (weatherCode) {
    case 0:
      return '晴'
    case 1:
      return '晴间多云'
    case 2:
      return '多云'
    case 3:
      return '阴'
    case 45:
    case 48:
      return '雾'
    case 51:
    case 53:
    case 55:
      return '毛毛雨'
    case 56:
    case 57:
      return '冻毛毛雨'
    case 61:
      return '小雨'
    case 63:
      return '中雨'
    case 65:
      return '大雨'
    case 66:
    case 67:
      return '冻雨'
    case 71:
      return '小雪'
    case 73:
      return '中雪'
    case 75:
      return '大雪'
    case 77:
      return '雪粒'
    case 80:
    case 81:
      return '阵雨'
    case 82:
      return '暴雨'
    case 85:
    case 86:
      return '阵雪'
    case 95:
      return '雷暴'
    case 96:
    case 99:
      return '雷暴伴冰雹'
    default:
      return '天气未知'
  }
}

function shouldScopeCjkWeatherQuery(query: string) {
  return Boolean(query && !/[,，]/.test(query) && /[\u3400-\u9FFF]/.test(query))
}

function normalizeFrontMatterLocation(location: DayFrontMatter['location']) {
  if (!location) {
    return undefined
  }

  const normalizedLocation = {
    name: normalizeString(location.name),
    region: normalizeString(location.region),
    country: normalizeString(location.country),
    query: normalizeString(location.query),
  }

  return Object.values(normalizedLocation).some(Boolean) ? normalizedLocation : undefined
}

function normalizeWttrWeatherDescription(values: readonly (string | undefined)[]) {
  const labels = values.filter((value): value is string => Boolean(value))

  for (const label of labels) {
    if (/[\u3400-\u9FFF]/.test(label)) {
      return label
    }
  }

  for (const label of labels) {
    const translatedLabel = translateWttrWeatherDescription(label)

    if (translatedLabel) {
      return translatedLabel
    }
  }

  return labels.length > 0 ? '天气未知' : undefined
}

function translateWttrWeatherDescription(value: string) {
  return wttrWeatherDescriptionLabels.get(normalizeWttrWeatherDescriptionKey(value))
}

function normalizeWttrWeatherDescriptionKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
}

const wttrWeatherDescriptionLabels = new Map<string, string>([
  ['sunny', '晴'],
  ['clear', '晴'],
  ['partly cloudy', '多云'],
  ['cloudy', '多云'],
  ['overcast', '阴'],
  ['mist', '雾'],
  ['fog', '雾'],
  ['freezing fog', '冻雾'],
  ['patchy rain nearby', '小雨'],
  ['patchy light drizzle', '毛毛雨'],
  ['light drizzle', '毛毛雨'],
  ['freezing drizzle', '冻毛毛雨'],
  ['heavy freezing drizzle', '冻毛毛雨'],
  ['patchy light rain', '小雨'],
  ['light rain', '小雨'],
  ['moderate rain at times', '中雨'],
  ['moderate rain', '中雨'],
  ['heavy rain at times', '大雨'],
  ['heavy rain', '大雨'],
  ['light freezing rain', '冻雨'],
  ['moderate or heavy freezing rain', '冻雨'],
  ['light rain shower', '阵雨'],
  ['moderate or heavy rain shower', '强阵雨'],
  ['torrential rain shower', '暴雨'],
  ['thundery outbreaks in nearby', '雷暴'],
  ['patchy light rain in area with thunder', '雷阵雨'],
  ['moderate or heavy rain in area with thunder', '强雷雨'],
  ['patchy snow nearby', '小雪'],
  ['patchy sleet nearby', '雨夹雪'],
  ['patchy freezing drizzle nearby', '冻毛毛雨'],
  ['blowing snow', '风雪'],
  ['blizzard', '暴风雪'],
  ['patchy light snow', '小雪'],
  ['light snow', '小雪'],
  ['patchy moderate snow', '中雪'],
  ['moderate snow', '中雪'],
  ['patchy heavy snow', '大雪'],
  ['heavy snow', '大雪'],
  ['light snow showers', '阵雪'],
  ['moderate or heavy snow showers', '强阵雪'],
  ['patchy light snow in area with thunder', '雷阵雪'],
  ['moderate or heavy snow in area with thunder', '强雷雪'],
  ['light sleet', '雨夹雪'],
  ['moderate or heavy sleet', '雨夹雪'],
  ['light sleet showers', '阵性雨夹雪'],
  ['moderate or heavy sleet showers', '强阵性雨夹雪'],
  ['ice pellets', '冰粒'],
  ['light showers of ice pellets', '阵性冰粒'],
  ['moderate or heavy showers of ice pellets', '强阵性冰粒'],
])

function firstRecord(value: unknown) {
  return Array.isArray(value) && value.length > 0 ? asRecord(value[0]) : {}
}

function firstLocalizedValue(value: unknown) {
  const record = firstRecord(value)

  return stringFromRecord(record, 'value')
}

function numberFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key]
  const numberValue = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(numberValue) ? numberValue : undefined
}

function stringFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key]

  return normalizeString(value)
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}
