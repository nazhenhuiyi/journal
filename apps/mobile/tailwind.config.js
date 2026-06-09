const themeTokens = require('../../packages/journal-theme/tokens.json')

function resolveTokenValue(value) {
  const match = /^\{([a-z]+)\.(\d+)\}$/.exec(value)

  if (!match) {
    return value
  }

  const [, family, shade] = match
  return themeTokens.primitive[family][shade]
}

function resolveTokenMap(tokenMap) {
  return Object.fromEntries(
    Object.entries(tokenMap).map(([name, value]) => [name, resolveTokenValue(value)]),
  )
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.ts',
    './src/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ...themeTokens.primitive,
        ...resolveTokenMap(themeTokens.semantic),
        ...resolveTokenMap(themeTokens.legacy),
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
}
