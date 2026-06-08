import { describe, expect, it } from 'vitest'
import { normalizeWeatherQueryForWttr } from './weatherLookup'

describe('weather lookup', () => {
  it('scopes Chinese city names to China for wttr geocoding', () => {
    expect(normalizeWeatherQueryForWttr('成都')).toBe('成都,中国')
  })

  it('keeps explicit and non-Chinese weather queries unchanged', () => {
    expect(normalizeWeatherQueryForWttr('成都,四川')).toBe('成都,四川')
    expect(normalizeWeatherQueryForWttr('Chengdu')).toBe('Chengdu')
  })
})
