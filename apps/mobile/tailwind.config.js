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
        canvas: '#f4f5ef',
        cloud: '#eef3f4',
        ink: '#17231f',
        moss: '#254f43',
        mossMuted: '#4f7469',
        paper: '#fffdf8',
        reed: '#d8ded5',
        sage: '#86a99a',
        skyWash: '#dce9f5',
        soil: '#8b6656',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
}
