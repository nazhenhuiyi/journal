const themeTokens = require('../../packages/journal-theme/tokens.json')

function semanticColorVariableMap(tokenMap) {
  return Object.fromEntries(
    Object.keys(tokenMap).map((name) => [name, `rgb(var(--color-${name}) / <alpha-value>)`]),
  )
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.ts',
    './src/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ...themeTokens.primitive,
        ...semanticColorVariableMap(themeTokens.semantic),
      },
      borderRadius: themeTokens.radius,
      spacing: themeTokens.spacing,
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
}
