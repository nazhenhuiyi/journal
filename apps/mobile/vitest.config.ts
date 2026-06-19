import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    __DEV__: 'false',
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
})
