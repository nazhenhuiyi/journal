import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from './vite.config'

export default mergeConfig(baseConfig, defineConfig({
  test: {
    exclude: configDefaults.exclude,
    include: [
      'src/**/*.integration.test.{ts,tsx}',
      'electron/**/*.integration.test.{ts,tsx}',
    ],
  },
}))
