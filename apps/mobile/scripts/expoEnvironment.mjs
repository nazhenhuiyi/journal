import { existsSync, readFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))

export const projectRoot = path.resolve(scriptDirectory, '..')
const workspaceRoot = path.resolve(projectRoot, '../..')
const projectExpoCli = path.join(projectRoot, 'node_modules/.bin/expo')
const workspaceExpoCli = path.join(workspaceRoot, 'node_modules/.bin/expo')
export const expoCli = existsSync(projectExpoCli) ? projectExpoCli : workspaceExpoCli
export const defaultExpoHost = '127.0.0.1'
export const defaultExpoPort = 8081

const projectExpoPackageJson = path.join(projectRoot, 'node_modules/expo/package.json')
const workspaceExpoPackageJson = path.join(workspaceRoot, 'node_modules/expo/package.json')
const expoPackageJson = existsSync(projectExpoPackageJson)
  ? projectExpoPackageJson
  : workspaceExpoPackageJson

export function createExpoCliInvocation() {
  assertMobileExpoSdk()

  return {
    args: [expoCli],
    command: process.execPath,
    cwd: projectRoot,
  }
}

export function assertMobileExpoSdk() {
  if (!existsSync(expoCli) || !existsSync(expoPackageJson)) {
    console.error('Mobile Expo CLI is missing. Run npm install from the repository root first.')
    process.exit(1)
  }

  const expoPackage = JSON.parse(readFileSync(expoPackageJson, 'utf8'))

  if (!String(expoPackage.version).startsWith('56.')) {
    console.error(`Expected the mobile workspace Expo SDK 56, but found expo ${expoPackage.version}.`)
    process.exit(1)
  }

  return expoPackage.version
}

export function createExpoEnv(overrides = {}) {
  const nodeOptions = appendNodeOption(
    overrides.NODE_OPTIONS ?? process.env.NODE_OPTIONS ?? '',
    '--dns-result-order=ipv4first',
  )

  return {
    ...process.env,
    ...overrides,
    NODE_OPTIONS: nodeOptions,
  }
}

export function appendNodeOption(currentValue, nextOption) {
  const options = currentValue.split(/\s+/).filter(Boolean)

  if (options.includes(nextOption)) {
    return currentValue
  }

  return [...options, nextOption].join(' ')
}

export function readPort(args, fallbackPort = defaultExpoPort) {
  const portIndex = args.indexOf('--port')

  if (portIndex >= 0) {
    return Number(args[portIndex + 1] ?? fallbackPort)
  }

  const inlinePort = args.find((arg) => arg.startsWith('--port='))

  if (inlinePort) {
    return Number(inlinePort.slice('--port='.length))
  }

  return fallbackPort
}

export function isExpoServerRunning(targetPort, host = defaultExpoHost) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        host,
        path: '/status',
        port: targetPort,
        timeout: 1_500,
      },
      (response) => {
        let body = ''

        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body += chunk
        })
        response.on('end', () => {
          resolve(body.trim() === 'packager-status:running')
        })
      },
    )

    request.on('error', () => resolve(false))
    request.on('timeout', () => {
      request.destroy()
      resolve(false)
    })
  })
}

export function isPortOpen(targetPort, host = defaultExpoHost) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: targetPort })

    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.setTimeout(1_500, () => {
      socket.destroy()
      resolve(false)
    })
  })
}
