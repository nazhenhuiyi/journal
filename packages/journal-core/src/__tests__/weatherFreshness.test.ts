import { describe, expect, it } from 'vitest'
import {
  isFreshWeather,
  isFreshWeatherForLocation,
} from '../weatherFreshness'

describe('weather freshness', () => {
  it('treats an ISO timestamp from the current local day as fresh', () => {
    const earlyLocalMorning = new Date(2026, 5, 9, 0, 30, 0).toISOString()

    expect(isFreshWeather({
      text: '晴',
      updatedAt: earlyLocalMorning,
    }, '2026-06-09')).toBe(true)
  })

  it('rejects weather from a previous local day', () => {
    const previousLocalNight = new Date(2026, 5, 8, 23, 59, 0).toISOString()

    expect(isFreshWeather({
      text: '晴',
      updatedAt: previousLocalNight,
    }, '2026-06-09')).toBe(false)
  })

  it('requires configured weather locations to match the cached location query', () => {
    const updatedAt = new Date(2026, 5, 9, 12, 0, 0).toISOString()
    const frontMatter = {
      location: {
        name: '上海',
        query: '上海',
      },
      weather: {
        text: '多云',
        updatedAt,
      },
    }

    expect(isFreshWeatherForLocation(frontMatter, '2026-06-09', ' 上海 ')).toBe(true)
    expect(isFreshWeatherForLocation(frontMatter, '2026-06-09', '北京')).toBe(false)
  })
})
