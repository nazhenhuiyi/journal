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
  const text = firstLocalizedValue(currentCondition.lang_zh) ?? firstLocalizedValue(currentCondition.weatherDesc)

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
