import * as Location from 'expo-location'
import {
  parseOpenMeteoWeather,
  parseWttrWeather,
  type WeatherLookupLocation,
  type WeatherLookupPayload,
} from '@journal/core'

const weatherRequestTimeoutMs = 4500
const locationRequestTimeoutMs = 5000

export async function fetchTodayMobileWeather(): Promise<WeatherLookupPayload> {
  const location = await resolveMobileWeatherLocation()

  if (hasCoordinates(location)) {
    try {
      return await fetchOpenMeteoWeather(location)
    } catch {
      return fetchWttrWeather(location)
    }
  }

  return fetchWttrWeather({})
}

async function resolveMobileWeatherLocation(): Promise<WeatherLookupLocation> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync()

    if (!permission.granted) {
      return {}
    }

    const position = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      locationRequestTimeoutMs,
    )

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    }
  } catch {
    return {}
  }
}

async function fetchOpenMeteoWeather(location: WeatherLookupLocation): Promise<WeatherLookupPayload> {
  if (!hasCoordinates(location)) {
    throw new Error('Weather coordinates unavailable.')
  }

  const requestUrl = new URL('https://api.open-meteo.com/v1/forecast')

  requestUrl.searchParams.set('latitude', `${location.latitude}`)
  requestUrl.searchParams.set('longitude', `${location.longitude}`)
  requestUrl.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
  )
  requestUrl.searchParams.set('wind_speed_unit', 'kmh')
  requestUrl.searchParams.set('timezone', 'auto')
  requestUrl.searchParams.set('forecast_days', '1')

  return parseOpenMeteoWeather(await fetchJson(requestUrl.toString()))
}

async function fetchWttrWeather(location: WeatherLookupLocation): Promise<WeatherLookupPayload> {
  const weatherTarget = hasCoordinates(location) ? encodeWeatherTarget(`${location.latitude},${location.longitude}`) : ''
  const requestUrl = `https://wttr.in/${weatherTarget}?format=j1&lang=zh`

  return parseWttrWeather(await fetchJson(requestUrl))
}

async function fetchJson(input: string | URL) {
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), weatherRequestTimeoutMs)

  try {
    const response = await fetch(input, {
      signal: abortController.signal,
    })

    if (!response.ok) {
      throw new Error(`Weather request failed with ${response.status}.`)
    }

    return response.json() as Promise<unknown>
  } finally {
    clearTimeout(timeoutId)
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Timed out.')), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

function encodeWeatherTarget(target: string) {
  return encodeURIComponent(target).replace(/%2C/g, ',')
}

function hasCoordinates(
  location: WeatherLookupLocation,
): location is WeatherLookupLocation & { latitude: number; longitude: number } {
  return location.latitude !== undefined && location.longitude !== undefined
}
