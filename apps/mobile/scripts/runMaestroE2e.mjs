#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import net from 'node:net'
import process from 'node:process'
import {
  createExpoCliInvocation,
} from './expoEnvironment.mjs'

const maestroCommand = resolveMaestroCommand()
const toolEnv = { ...process.env }
const expoPort = Number(process.env.JOURNAL_MOBILE_E2E_EXPO_PORT || 8081)
const expoUrl = process.env.JOURNAL_MOBILE_E2E_EXPO_URL || `http://127.0.0.1:${expoPort}`
const expoOpenUrl = process.env.JOURNAL_MOBILE_E2E_OPEN_URL || createDevelopmentClientOpenUrl(expoUrl)
const appId = process.env.JOURNAL_MOBILE_E2E_APP_ID || 'app.zilin.journal.debug'
const deviceId = process.env.JOURNAL_MOBILE_E2E_DEVICE_ID?.trim() || ''
const shouldReinstallMaestroDriver = process.env.JOURNAL_MOBILE_E2E_REINSTALL_DRIVER === '1'
const publicE2eRunId = process.env.EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID?.trim() || ''
const requestedE2eRunId = process.env.JOURNAL_MOBILE_E2E_RUN_ID?.trim() || ''
const e2eRunId = requestedE2eRunId || publicE2eRunId || `maestro-${Date.now()}`
const shouldEnableSyncFlow = process.env.JOURNAL_MOBILE_E2E_ENABLE_SYNC === '1'
const syncRemoteUrl = (process.env.JOURNAL_MOBILE_E2E_SYNC_REMOTE_URL || '').trim()
const syncToken = (process.env.JOURNAL_MOBILE_E2E_SYNC_TOKEN || '').trim()
const explicitSyncBranch = process.env.JOURNAL_MOBILE_E2E_SYNC_BRANCH?.trim() || ''
const syncBranch = explicitSyncBranch || `mobile-e2e/${sanitizeGitBranchSegment(e2eRunId)}`
const shouldKeepSyncBranch = process.env.JOURNAL_MOBILE_E2E_SYNC_KEEP_BRANCH === '1'
const hasGitHubSyncConfig = Boolean(syncRemoteUrl && syncToken)
const shouldStartExpo = process.env.JOURNAL_MOBILE_E2E_SKIP_EXPO_START !== '1'
const flowArgs = process.argv.slice(2)
const syncFlowPath = 'e2e/sync-now-flow.yaml'
const flowPaths = flowArgs.length > 0
  ? flowArgs
  : [
      'e2e/today-writing-flow.yaml',
      ...(shouldEnableSyncFlow ? [syncFlowPath] : []),
      'e2e/settings-sync-validation.yaml',
    ]
const shouldRunSyncFlow = flowPaths.some(isSyncFlowPath)
const githubRemote = syncRemoteUrl ? parseGitHubRemote(syncRemoteUrl) : null
const shouldManageSyncBranch = Boolean(
  shouldRunSyncFlow &&
  hasGitHubSyncConfig &&
  githubRemote &&
  !explicitSyncBranch,
)
const runnerManagedMaestroEnvKeys = [
  'APP_ID',
  'EXPO_OPEN_URL',
  'REMOTE_URL',
  'SYNC_BRANCH',
  'SYNC_TOKEN',
]

validateMaestroFlowFiles(flowPaths)
const preflightErrors = [
  ...getAndroidDevicePreflightErrors(),
  ...getMaestroPreflightErrors(maestroCommand),
]

if (preflightErrors.length > 0) {
  console.error(preflightErrors.join('\n'))
  process.exit(1)
}

if (shouldRunSyncFlow && !shouldEnableSyncFlow) {
  console.error('Mobile sync E2E is opt-in. Set JOURNAL_MOBILE_E2E_ENABLE_SYNC=1 to run sync-now-flow.yaml.')
  process.exit(1)
}

if (shouldRunSyncFlow && !hasGitHubSyncConfig) {
  console.error([
    'Mobile sync E2E requires real GitHub configuration.',
    'Set JOURNAL_MOBILE_E2E_ENABLE_SYNC=1,',
    'JOURNAL_MOBILE_E2E_SYNC_REMOTE_URL, and JOURNAL_MOBILE_E2E_SYNC_TOKEN.',
  ].join('\n'))
  process.exit(1)
}

if (shouldRunSyncFlow && hasGitHubSyncConfig && !githubRemote) {
  console.error('JOURNAL_MOBILE_E2E_SYNC_REMOTE_URL must be an HTTPS github.com remote URL.')
  process.exit(1)
}

if (!shouldEnableSyncFlow && flowArgs.length === 0) {
  console.info('Skipping mobile GitHub sync E2E. Set JOURNAL_MOBILE_E2E_ENABLE_SYNC=1 to run it.')
}

if (!shouldStartExpo) {
  if (!publicE2eRunId) {
    console.error([
      'JOURNAL_MOBILE_E2E_SKIP_EXPO_START=1 requires an already-running Expo server with',
      'EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID set. Restart Expo through this runner,',
      'or export the same EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID that was used to start it.',
    ].join('\n'))
    process.exit(1)
  }

  if (requestedE2eRunId && requestedE2eRunId !== publicE2eRunId) {
    console.error([
      'JOURNAL_MOBILE_E2E_RUN_ID does not match EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID.',
      'Use the same run id for the already-running Expo server and the Maestro runner.',
    ].join('\n'))
    process.exit(1)
  }
}

if (shouldRunSyncFlow) {
  console.info(`Mobile GitHub sync E2E will use branch ${syncBranch}.`)
}

let expoProcess = null
let didCreateSyncBranch = false

try {
  if (shouldManageSyncBranch) {
    console.info(`Creating GitHub E2E branch ${syncBranch}.`)
    await createGitHubE2eBranch(githubRemote, syncBranch, syncToken)
    didCreateSyncBranch = true
  }

  if (shouldStartExpo) {
    expoProcess = startExpoServer(expoPort)
    await waitForPort('127.0.0.1', expoPort, 60_000)
  }

  const maestroResult = spawnSync(
    maestroCommand,
    [
      'test',
      ...createMaestroDriverArgs(),
      ...createMaestroDeviceArgs(),
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
} finally {
  if (expoProcess) {
    expoProcess.kill('SIGTERM')
  }

  if (didCreateSyncBranch && githubRemote && !shouldKeepSyncBranch) {
    await cleanupGitHubE2eBranch(githubRemote, syncBranch, syncToken)
  }
}

function getMaestroPreflightErrors(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    env: toolEnv,
  })

  if (result.status === 0) {
    return []
  }

  const detail = (result.stderr || result.stdout || '').trim()

  return [
    'Maestro CLI with Java 17+ is required for mobile native E2E.',
    'Put maestro on PATH or set MAESTRO_CLI.',
    'Put Java 17+ on PATH or set JAVA_HOME before running this script.',
    detail ? `Maestro check failed: ${detail}` : '',
  ].filter(Boolean)
}

function getAndroidDevicePreflightErrors() {
  if (appId !== 'app.zilin.journal.debug') {
    return []
  }

  if (!deviceId) {
    return [
      'Android development build E2E requires JOURNAL_MOBILE_E2E_DEVICE_ID.',
      'Run adb devices -l and pass the target device serial explicitly.',
    ]
  }

  const result = spawnSync('adb', ['devices', '-l'], {
    encoding: 'utf8',
    env: toolEnv,
  })

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()

    return [
      'adb is required to preflight the Android development build target.',
      detail ? `adb devices failed: ${detail}` : '',
    ].filter(Boolean)
  }

  const deviceLine = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith(`${deviceId} `))

  if (!deviceLine) {
    return [
      `Android device ${deviceId} is not connected or authorized.`,
      'Run adb devices -l before mobile E2E.',
    ]
  }

  if (!new RegExp(`^${escapeRegex(deviceId)}\\s+device\\b`).test(deviceLine)) {
    return [
      `Android device ${deviceId} is not ready: ${deviceLine}`,
      'Unlock the device and accept the USB debugging prompt.',
    ]
  }

  return []
}

function resolveMaestroCommand() {
  const explicitCommand = process.env.MAESTRO_CLI?.trim()

  return explicitCommand || 'maestro'
}

function startExpoServer(port) {
  const expoCli = createExpoCliInvocation()
  const env = {
    ...process.env,
    EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID: e2eRunId,
  }

  if (shouldRunSyncFlow) {
    env.EXPO_PUBLIC_JOURNAL_MOBILE_E2E_SYNC_BRANCH = syncBranch
    env.EXPO_PUBLIC_JOURNAL_MOBILE_E2E_SYNC_REMOTE_URL = syncRemoteUrl
    env.EXPO_PUBLIC_JOURNAL_MOBILE_E2E_SYNC_TOKEN = syncToken
  }

  const child = spawn(
    expoCli.command,
    [
      ...expoCli.args,
      'start',
      '--localhost',
      '--clear',
      '--port',
      String(port),
    ],
    {
      cwd: expoCli.cwd,
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
    `EXPO_OPEN_URL=${expoOpenUrl}`,
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

function createDevelopmentClientOpenUrl(url) {
  return `exp+journal-mobile://expo-development-client/?url=${encodeURIComponent(url)}`
}

function createMaestroDeviceArgs() {
  return deviceId ? ['--udid', deviceId] : []
}

function createMaestroDriverArgs() {
  return shouldReinstallMaestroDriver ? [] : ['--no-reinstall-driver']
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

async function createGitHubE2eBranch(remote, branch, token) {
  const defaultBranchSha = await getOrCreateDefaultBranchSha(remote, token)
  const response = await fetch(createGitHubApiUrl(remote, '/git/refs'), {
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: defaultBranchSha,
    }),
    headers: createGitHubHeaders(token),
    method: 'POST',
  })

  if (response.status === 201) {
    return
  }

  throw new Error(`GitHub E2E branch creation failed with ${response.status}: ${await response.text()}`)
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

  throw new Error(`GitHub E2E branch cleanup failed with ${response.status}: ${await response.text()}`)
}

async function cleanupGitHubE2eBranch(remote, branch, token) {
  const maxAttempts = 3

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await deleteGitHubE2eBranch(remote, branch, token)
      return
    } catch (error) {
      if (attempt === maxAttempts) {
        console.warn(`GitHub E2E branch cleanup failed: ${getErrorMessage(error)}`)
        return
      }

      await delay(1_000 * attempt)
    }
  }
}

async function getOrCreateDefaultBranchSha(remote, token) {
  const repository = await requestGitHubJson(remote, '', token)
  const defaultBranch = typeof repository.default_branch === 'string'
    ? repository.default_branch
    : 'main'
  const existingSha = await getGitHubBranchSha(remote, defaultBranch, token)

  if (existingSha) {
    return existingSha
  }

  const response = await fetch(createGitHubApiUrl(remote, '/contents/.journal-e2e-bootstrap.md'), {
    body: JSON.stringify({
      branch: defaultBranch,
      content: Buffer.from('Journal sync E2E bootstrap repository.\n').toString('base64'),
      message: 'Initialize Journal sync E2E repository',
    }),
    headers: createGitHubHeaders(token),
    method: 'PUT',
  })

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`GitHub E2E bootstrap failed with ${response.status}: ${await response.text()}`)
  }

  const createdSha = await getGitHubBranchSha(remote, defaultBranch, token)

  if (!createdSha) {
    throw new Error(`GitHub E2E bootstrap did not create ${defaultBranch}.`)
  }

  return createdSha
}

async function getGitHubBranchSha(remote, branch, token) {
  const response = await fetch(createGitHubApiUrl(remote, `/git/ref/${encodeGitHubRefPath(branch)}`), {
    headers: createGitHubHeaders(token),
  })

  if (response.status === 404 || response.status === 409) {
    return null
  }

  if (!response.ok) {
    throw new Error(`GitHub branch lookup failed with ${response.status}: ${await response.text()}`)
  }

  const payload = await response.json()

  return typeof payload.object?.sha === 'string' ? payload.object.sha : null
}

async function requestGitHubJson(remote, pathName, token) {
  const response = await fetch(createGitHubApiUrl(remote, pathName), {
    headers: createGitHubHeaders(token),
  })

  if (!response.ok) {
    throw new Error(`GitHub request failed with ${response.status}: ${await response.text()}`)
  }

  return await response.json()
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

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function validateMaestroFlowFiles(paths) {
  const violations = []

  for (const flowPath of paths) {
    const contents = readFileSync(flowPath, 'utf8')
    const managedEnvRegex = createManagedEnvRegex()

    for (const match of contents.matchAll(managedEnvRegex)) {
      violations.push(`${flowPath}: remove flow-level ${match[1]}; runMaestroE2e injects it`)
    }

    if (/(?:exp|https?):\/\/(?:127\.0\.0\.1|localhost|[0-9.]+):\d+/.test(contents)) {
      violations.push(`${flowPath}: use runner-managed EXPO_OPEN_URL; do not hardcode an Expo URL`)
    }
  }

  if (violations.length > 0) {
    console.error([
      'Mobile E2E flow configuration is managed by scripts/runMaestroE2e.mjs.',
      ...violations,
    ].join('\n'))
    process.exit(1)
  }
}

function createManagedEnvRegex() {
  const keys = runnerManagedMaestroEnvKeys.map(escapeRegex).join('|')

  return new RegExp(`^\\s+(${keys})\\s*:`, 'gm')
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
