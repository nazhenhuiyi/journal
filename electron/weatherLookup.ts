const DEFAULT_CJK_WEATHER_COUNTRY = '中国'

export function normalizeWeatherQueryForWttr(query: string) {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return ''
  }

  if (shouldScopeCjkWeatherQuery(trimmedQuery)) {
    return `${trimmedQuery},${DEFAULT_CJK_WEATHER_COUNTRY}`
  }

  return trimmedQuery
}

function shouldScopeCjkWeatherQuery(query: string) {
  return /[\u3400-\u9fff]/.test(query) && !/[,，]/.test(query)
}
