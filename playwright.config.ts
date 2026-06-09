import { defineConfig } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

loadLocalE2eEnv()

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

function loadLocalE2eEnv() {
  const configDirectory = path.dirname(fileURLToPath(import.meta.url))
  const envPath = path.join(configDirectory, '.env.e2e.local')

  if (!existsSync(envPath)) {
    return
  }

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmedLine = line.trim()

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf('=')

    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) {
      continue
    }

    process.env[key] = parseEnvValue(trimmedLine.slice(separatorIndex + 1).trim())
  }
}

function parseEnvValue(value: string) {
  const firstCharacter = value[0]
  const lastCharacter = value[value.length - 1]

  if (
    value.length >= 2 &&
    ((firstCharacter === '"' && lastCharacter === '"') ||
      (firstCharacter === '\'' && lastCharacter === '\''))
  ) {
    return value.slice(1, -1)
  }

  return value
}
