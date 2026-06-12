#!/usr/bin/env node

import { spawn } from 'node:child_process'
import process from 'node:process'
import {
  createExpoCliInvocation,
  createExpoEnv,
  defaultExpoHost,
  isExpoServerRunning,
  isPortOpen,
  readPort,
} from './expoEnvironment.mjs'

const expoArgs = process.argv.slice(2)
const invocation = createExpoCliInvocation()

if (shouldReuseIosServer(expoArgs)) {
  const port = readPort(expoArgs)
  const expoUrl = `exp://${defaultExpoHost}:${port}`

  if (await isExpoServerRunning(port)) {
    console.info(`Expo is already running on ${expoUrl}. Opening the iOS simulator.`)
    await openIosSimulator(expoUrl)
    process.exit(0)
  }

  if (await isPortOpen(port)) {
    console.error(`Port ${port} is already in use, but it is not a running Expo server.`)
    console.error('Stop that process or pass a different --port value.')
    process.exit(1)
  }
}

const child = spawn(
  invocation.command,
  [
    ...invocation.args,
    ...expoArgs,
  ],
  {
    cwd: invocation.cwd,
    env: createExpoEnv(createExpoEnvOverrides(expoArgs)),
    stdio: 'inherit',
  },
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

function shouldReuseIosServer(args) {
  return args[0] === 'start' && args.includes('--ios') && args.includes('--localhost')
}

function createExpoEnvOverrides(args) {
  if (!shouldUseIosLocalhost(args)) {
    return {}
  }

  const port = String(readPort(args))

  return {
    EXPO_PACKAGER_HOSTNAME: defaultExpoHost,
    RCT_METRO_PORT: port,
    REACT_NATIVE_PACKAGER_HOSTNAME: defaultExpoHost,
  }
}

function shouldUseIosLocalhost(args) {
  return args[0] === 'run:ios' || shouldReuseIosServer(args)
}

function openIosSimulator(url) {
  return new Promise((resolve) => {
    const opener = spawn('xcrun', ['simctl', 'openurl', 'booted', url], {
      stdio: 'inherit',
    })

    opener.on('exit', (code) => {
      if (code) {
        console.error(`Could not open ${url} in the booted iOS simulator.`)
        process.exit(code)
      }

      resolve()
    })
  })
}
