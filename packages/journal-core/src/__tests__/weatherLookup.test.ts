import { describe, expect, it } from 'vitest'
import {
  getOpenMeteoWeatherText,
  normalizeWeatherQueryForWttr,
  parseOpenMeteoGeocoding,
  parseOpenMeteoWeather,
  parseWttrWeather,
} from '../weatherLookup'

describe('weather lookup', () => {
  it('maps Open-Meteo current weather into journal weather front matter', () => {
    const now = new Date('2026-06-10T08:30:00.000Z')

    expect(parseOpenMeteoWeather({
      current: {
        apparent_temperature: 29.1,
        relative_humidity_2m: 72,
        temperature_2m: 27.4,
        weather_code: 61,
        wind_speed_10m: 13.2,
      },
    }, {
      country: '中国',
      name: '上海',
      region: '上海',
    }, now)).toEqual({
      weather: {
        text: '小雨',
        temperature: 27.4,
        feelsLike: 29.1,
        humidity: 72,
        windSpeed: 13.2,
        updatedAt: '2026-06-10T08:30:00.000Z',
      },
      location: {
        country: '中国',
        name: '上海',
        region: '上海',
      },
    })
  })

  it('maps representative WMO weather codes to concise Chinese labels', () => {
    expect(getOpenMeteoWeatherText(0)).toBe('晴')
    expect(getOpenMeteoWeatherText(2)).toBe('多云')
    expect(getOpenMeteoWeatherText(45)).toBe('雾')
    expect(getOpenMeteoWeatherText(61)).toBe('小雨')
    expect(getOpenMeteoWeatherText(71)).toBe('小雪')
    expect(getOpenMeteoWeatherText(95)).toBe('雷暴')
    expect(getOpenMeteoWeatherText(999)).toBe('天气未知')
  })

  it('parses the first Open-Meteo geocoding result', () => {
    expect(parseOpenMeteoGeocoding({
      results: [
        {
          admin1: 'Sichuan',
          country: 'China',
          latitude: 30.67,
          longitude: 104.07,
          name: 'Chengdu',
        },
      ],
    })).toEqual({
      latitude: 30.67,
      longitude: 104.07,
      location: {
        country: 'China',
        name: 'Chengdu',
        region: 'Sichuan',
      },
    })
  })

  it('parses wttr current weather and nearest location', () => {
    expect(parseWttrWeather({
      current_condition: [
        {
          FeelsLikeC: '20',
          humidity: '88',
          lang_zh: [{ value: '小雨' }],
          temp_C: '18',
          weatherDesc: [{ value: 'Light rain' }],
          windspeedKmph: '9',
        },
      ],
      nearest_area: [
        {
          areaName: [{ value: '成都' }],
          country: [{ value: '中国' }],
          region: [{ value: '四川' }],
        },
      ],
    })).toMatchObject({
      weather: {
        text: '小雨',
        temperature: 18,
        feelsLike: 20,
        humidity: 88,
        windSpeed: 9,
      },
      location: {
        country: '中国',
        name: '成都',
        region: '四川',
      },
    })
  })

  it('scopes Chinese city names to China for wttr geocoding', () => {
    expect(normalizeWeatherQueryForWttr('成都')).toBe('成都,中国')
  })

  it('keeps explicit and non-Chinese weather queries unchanged', () => {
    expect(normalizeWeatherQueryForWttr('成都,四川')).toBe('成都,四川')
    expect(normalizeWeatherQueryForWttr('Chengdu')).toBe('Chengdu')
  })
})
