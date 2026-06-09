#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import process from 'node:process'

const maestroCommand = resolveMaestroCommand()
const toolEnv = createToolEnv()
const expoPort = Number(process.env.JOURNAL_MOBILE_E2E_EXPO_PORT || 8081)
const expoHost = process.env.JOURNAL_MOBILE_E2E_EXPO_HOST || '127.0.0.1'
const expoUrl = process.env.JOURNAL_MOBILE_E2E_EXPO_URL || `exp://${expoHost}:${expoPort}`
const appId = process.env.JOURNAL_MOBILE_E2E_APP_ID || 'host.exp.Exponent'
const e2eRunId = process.env.JOURNAL_MOBILE_E2E_RUN_ID || `maestro-${Date.now()}`
const syncRemoteUrl = (
  process.env.JOURNAL_MOBILE_E2E_SYNC_REMOTE_URL ||
  process.env.JOURNAL_E2E_GITHUB_REMOTE_URL ||
  ''
).trim()
const syncToken = (
  process.env.JOURNAL_MOBILE_E2E_SYNC_TOKEN ||
  process.env.JOURNAL_E2E_GITHUB_TOKEN ||
  ''
).trim()
const explicitSyncBranch = process.env.JOURNAL_MOBILE_E2E_SYNC_BRANCH?.trim() || ''
const syncBranchPrefix = (
  process.env.JOURNAL_MOBILE_E2E_SYNC_BRANCH_PREFIX?.trim() || 'mobile-e2e'
).replace(/\/+$/, '') || 'mobile-e2e'
const syncBranch = explicitSyncBranch || `${syncBranchPrefix}/${sanitizeGitBranchSegment(e2eRunId)}`
const shouldKeepSyncBranch = process.env.JOURNAL_MOBILE_E2E_SYNC_KEEP_BRANCH === '1'
const hasGitHubSyncConfig = Boolean(syncRemoteUrl && syncToken)
const shouldStartExpo = process.env.JOURNAL_MOBILE_E2E_SKIP_EXPO_START !== '1'
const flowArgs = process.argv.slice(2)
const syncFlowPath = 'e2e/sync-now-flow.yaml'
const flowPaths = flowArgs.length > 0
  ? flowArgs
  : [
      'e2e/today-writing-flow.yaml',
      ...(hasGitHubSyncConfig ? [syncFlowPath] : []),
      'e2e/settings-sync-validation.yaml',
    ]
const shouldRunSyncFlow = flowPaths.some(isSyncFlowPath)
const githubRemote = syncRemoteUrl ? parseGitHubRemote(syncRemoteUrl) : null

assertCommandAvailable(maestroCommand, [
  'Maestro CLI is required for mobile native E2E.',
  'Install it from https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli',
])

if (shouldRunSyncFlow && !hasGitHubSyncConfig) {
  console.error([
    'Mobile sync E2E requires real GitHub configuration.',
    'Set JOURNAL_MOBILE_E2E_SYNC_REMOTE_URL and JOURNAL_MOBILE_E2E_SYNC_TOKEN,',
    'or reuse JOURNAL_E2E_GITHUB_REMOTE_URL and JOURNAL_E2E_GITHUB_TOKEN.',
  ].join('\n'))
  process.exit(1)
}

if (shouldRunSyncFlow && hasGitHubSyncConfig && !githubRemote) {
  console.error('JOURNAL_MOBILE_E2E_SYNC_REMOTE_URL must be an HTTPS github.com remote URL.')
  process.exit(1)
}

if (!hasGitHubSyncConfig && flowArgs.length === 0) {
  console.warn('Skipping mobile GitHub sync E2E because no GitHub remote/token env is configured.')
}

if (shouldRunSyncFlow) {
  console.info(`Mobile GitHub sync E2E will use branch ${syncBranch}.`)
}

let expoProcess = null

try {
  if (shouldStartExpo) {
    expoProcess = startExpoServer(expoPort)
    await waitForPort(expoHost, expoPort, 60_000)
  } else if (!process.env.EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID) {
    console.warn(
      'JOURNAL_MOBILE_E2E_SKIP_EXPO_START=1 is set without EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID. ' +
        'The already-running Expo server may use the default mobile data directory.',
    )
  }

  const maestroResult = spawnSync(
    maestroCommand,
    [
      'test',
      ...createMaestroEnvArgs(),
      ...flowPaths,
    ],
    {
      env: {
        ...toolEnv,
        MAESTRO_CLI_NO_ANALYTICS: process.env.MAESTRO_CLI_NO_ANALYTICS || 'true',
      },
      stdio: 'inherit',
    },
  )

  process.exitCode = maestroResult.status ?? 1

  if (
    shouldRunSyncFlow &&
    githubRemote &&
    !explicitSyncBranch &&
    !shouldKeepSyncBranch
  ) {
    await deleteGitHubE2eBranch(githubRemote, syncBranch, syncToken)
  }
} finally {
  if (expoProcess) {
    expoProcess.kill('SIGTERM')
  }
}

function assertCommandAvailable(command, messageLines) {
  const result = spawnSync(command, ['--version'], {
    env: toolEnv,
    stdio: 'ignore',
  })

  if (result.status === 0) {
    return
  }

  console.error(messageLines.join('\n'))
  process.exit(1)
}

function resolveMaestroCommand() {
  const explicitCommand = process.env.MAESTRO_CLI?.trim()

  if (explicitCommand) {
    return explicitCommand
  }

  const homeCommand = process.env.HOME ? `${process.env.HOME}/.maestro/bin/maestro` : ''

  return homeCommand && existsSync(homeCommand) ? homeCommand : 'maestro'
}

function createToolEnv() {
  const javaHome = process.env.JAVA_HOME?.trim() || resolveJavaHome()
  const env = {
    ...process.env,
  }

  if (javaHome) {
    env.JAVA_HOME = javaHome
    env.PATH = `${javaHome}/bin:${env.PATH ?? ''}`
  }

  return env
}

function resolveJavaHome() {
  const candidates = [
    '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
  ]

  return candidates.find((candidate) => existsSync(`${candidate}/bin/java`)) ?? ''
}

function startExpoServer(port) {
  const env = {
    ...process.env,
    EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID: e2eRunId,
  }
  const child = spawn(
    'npx',
    [
      'expo',
      'start',
      '--localhost',
      '--clear',
      '--port',
      String(port),
    ],
    {
      env,
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  )

  child.on('exit', (code, signal) => {
    if (process.exitCode === undefined && code !== null && code !== 0) {
      console.error(`Expo dev server exited with code ${code}.`)
      process.exitCode = code
    }

    if (signal && signal !== 'SIGTERM') {
      console.error(`Expo dev server exited from signal ${signal}.`)
      process.exitCode = 1
    }
  })

  return child
}

function createMaestroEnvArgs() {
  const args = [
    '-e',
    `EXPO_URL=${expoUrl}`,
    '-e',
    `APP_ID=${appId}`,
  ]

  if (shouldRunSyncFlow) {
    args.push(
      '-e',
      `REMOTE_URL=${syncRemoteUrl}`,
      '-e',
      `SYNC_BRANCH=${syncBranch}`,
      '-e',
      `SYNC_TOKEN=${syncToken}`,
    )
  }

  return args
}

function isSyncFlowPath(flowPath) {
  return /(^|[/\\])sync-now-flow\.ya?ml$/.test(flowPath)
}

function sanitizeGitBranchSegment(value) {
  return value
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .slice(0, 80) || `run-${Date.now()}`
}

function parseGitHubRemote(remoteUrl) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remoteUrl.trim())

  if (!match) {
    return null
  }

  return {
    owner: match[1],
    repo: match[2],
  }
}

async function deleteGitHubE2eBranch(remote, branch, token) {
  const response = await fetch(
    createGitHubApiUrl(remote, `/git/refs/${encodeGitHubRefPath(branch)}`),
    {
      headers: createGitHubHeaders(token),
      method: 'DELETE',
    },
  )

  if (response.status === 204 || response.status === 404 || response.status === 422) {
    return
  }

  console.warn(`GitHub E2E branch cleanup failed with ${response.status}: ${await response.text()}`)
}

function createGitHubApiUrl(remote, pathName) {
  return `https://api.github.com/repos/${encodeURIComponent(remote.owner)}/${encodeURIComponent(remote.repo)}${pathName}`
}

function createGitHubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function encodeGitHubRefPath(branch) {
  return ['heads', ...branch.split('/')]
    .map((part) => encodeURIComponent(part))
    .join('/')
}

async function waitForPort(host, port, timeoutMs) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await canConnect(host, port)) {
      return
    }

    await delay(500)
  }

  throw new Error(`Timed out waiting for Expo dev server at ${host}:${port}.`)
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })

    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
