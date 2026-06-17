import { defineConfig } from '@playwright/test'
import { loadE2eEnv } from './e2e/loadE2eEnv.mjs'

loadE2eEnv()

export default defineConfig({
  fullyParallel: false,
  reporter: [['list']],
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  use: {
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
})
