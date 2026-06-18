#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { defaultExpoHost, defaultExpoPort, isExpoServerRunning } from './expoEnvironment.mjs'

const appIdentifier = 'app.zilin.journal'

if (!await isExpoServerRunning(defaultExpoPort)) {
  console.error(`Expo Metro is not running on http://${defaultExpoHost}:${defaultExpoPort}.`)
  console.error('Start it in another terminal with: pnpm --filter @journal/mobile run start')
  process.exit(1)
}

await assertBootedSimulator()
await assertAppInstalled()
await runSimctl(['terminate', 'booted', appIdentifier], { allowFailure: true })
await runSimctl(['launch', 'booted', appIdentifier])

console.info(`Launched ${appIdentifier} in the booted iOS simulator without opening a dev-client URL.`)

async function assertBootedSimulator() {
  const result = await runSimctl(['list', 'devices', 'booted', '--json'], { capture: true })
  const payload = JSON.parse(result.stdout || '{}')
  const devices = Object.values(payload.devices ?? {}).flat()
  const bootedDevice = devices.find((device) => device?.state === 'Booted')

  if (!bootedDevice) {
    console.error('No booted iOS simulator found. Open Simulator first, then run ios:launch again.')
    process.exit(1)
  }
}

async function assertAppInstalled() {
  const result = await runSimctl(
    ['get_app_container', 'booted', appIdentifier, 'app'],
    { allowFailure: true, capture: true },
  )

  if (result.code !== 0) {
    console.error(`${appIdentifier} is not installed in the booted iOS simulator.`)
    console.error('Install or rebuild the development client with: pnpm --filter @journal/mobile run ios:dev')
    process.exit(1)
  }
}

function runSimctl(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn('xcrun', ['simctl', ...args], {
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    let stdout = ''
    let stderr = ''

    if (options.capture) {
      child.stdout?.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr?.on('data', (chunk) => {
        stderr += chunk
      })
    }

    child.on('exit', (code) => {
      const exitCode = code ?? 0

      if (exitCode !== 0 && !options.allowFailure) {
        if (options.capture && stderr.trim()) {
          console.error(stderr.trim())
        }

        process.exit(exitCode)
      }

      resolve({ code: exitCode, stderr, stdout })
    })
  })
}
