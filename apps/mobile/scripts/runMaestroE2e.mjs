#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  createExpoCliInvocation,
  createExpoEnv,
} from './expoEnvironment.mjs'

const maestroCommand = resolveMaestroCommand()
const toolEnv = { ...process.env }
const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(mobileRoot, '..', '..')
const defaultAndroidArtifactAppId = 'app.zilin.journal'
const defaultAndroidDevClientAppId = 'app.zilin.journal.debug'
const defaultIosAppId = 'app.zilin.journal'
const expoPort = Number(process.env.JOURNAL_MOBILE_E2E_EXPO_PORT || 8081)
const requestedMode = process.env.JOURNAL_MOBILE_E2E_MODE?.trim().toLowerCase() || ''
const requestedPlatform = process.env.JOURNAL_MOBILE_E2E_PLATFORM?.trim().toLowerCase() || ''
const requestedDeviceId = process.env.JOURNAL_MOBILE_E2E_DEVICE_ID?.trim() || ''
const explicitAppId = process.env.JOURNAL_MOBILE_E2E_APP_ID?.trim() || ''
const e2eMode = resolveE2eMode(requestedMode)
const targetPlatform = resolveTargetPlatform(requestedPlatform, requestedDeviceId)
const appId = explicitAppId || getDefaultAppId(targetPlatform, e2eMode)
const deviceId = requestedDeviceId || resolveDefaultDeviceId(targetPlatform)
const devClientUrl = createDevelopmentClientUrl(expoPort)
const artifactPath = e2eMode === 'artifact' ? resolveNativeArtifactPath(targetPlatform) : ''
const shouldInstallArtifact = e2eMode === 'artifact' && process.env.JOURNAL_MOBILE_E2E_SKIP_INSTALL !== '1'
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
const shouldStartExpo = e2eMode === 'dev-client' && process.env.JOURNAL_MOBILE_E2E_SKIP_EXPO_START !== '1'
const flowArgs = process.argv.slice(2)

if (flowArgs.includes('--help') || flowArgs.includes('-h')) {
  printUsage()
  process.exit(0)
}

const syncFlowPath = 'e2e/sync-now-flow.yaml'
const flowPaths = flowArgs.length > 0
  ? flowArgs
  : e2eMode === 'dev-client'
    ? ['e2e/dev-client-smoke-flow.yaml']
    : [
      'e2e/today-writing-flow.yaml',
      'e2e/review-back-loop-flow.yaml',
      ...(shouldEnableSyncFlow ? [syncFlowPath] : []),
      'e2e/settings-sync-validation.yaml',
    ]
const maestroFlowPaths = flowPaths.map(resolveFlowFilePath)
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
  'EXPO_DEV_CLIENT_URL',
  'REMOTE_URL',
  'SYNC_BRANCH',
  'SYNC_TOKEN',
]

validateMaestroFlowFiles(maestroFlowPaths)
const preflightErrors = [
  ...getNativeDevicePreflightErrors(),
  ...getArtifactPreflightErrors(),
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

console.info(
  `Running mobile E2E (${e2eMode}) on ${targetPlatform} with ${appId}${deviceId ? ` (${deviceId})` : ''}.`,
)

if (e2eMode === 'dev-client' && !shouldStartExpo) {
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

  if (e2eMode === 'artifact') {
    installNativeArtifact()
  }

  if (e2eMode === 'dev-client' && shouldStartExpo) {
    setupAndroidPortReverse(expoPort)
    expoProcess = startExpoServer(expoPort)
    await waitForPort('127.0.0.1', expoPort, 60_000)
    await prewarmMetroBundle(expoPort, targetPlatform)
  }

  if (e2eMode === 'dev-client') {
    openDevelopmentClient()
    await delay(getAppLaunchWaitMs())
  }

  const maestroResult = spawnSync(
    maestroCommand,
    [
      'test',
      ...createMaestroDriverArgs(),
      ...createMaestroDeviceArgs(),
      ...createMaestroEnvArgs(),
      ...maestroFlowPaths,
    ],
    {
      cwd: mobileRoot,
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

function getNativeDevicePreflightErrors() {
  if (targetPlatform === 'ios') {
    return getIosDevicePreflightErrors()
  }

  if (targetPlatform === 'android') {
    return getAndroidDevicePreflightErrors()
  }

  return []
}

function getArtifactPreflightErrors() {
  if (e2eMode !== 'artifact' || !shouldInstallArtifact) {
    return []
  }

  if (artifactPath && existsSync(artifactPath)) {
    return []
  }

  if (targetPlatform === 'ios') {
    return [
      'iOS artifact E2E requires a built simulator .app.',
      'Set JOURNAL_MOBILE_E2E_IOS_APP_PATH or JOURNAL_MOBILE_E2E_ARTIFACT_PATH to the .app path.',
      'Example: JOURNAL_MOBILE_E2E_IOS_APP_PATH=apps/mobile/build/ios/Build/Products/Release-iphonesimulator/app.app npm run e2e:mobile:ios',
    ]
  }

  return [
    'Android artifact E2E requires a built .apk.',
    'Set JOURNAL_MOBILE_E2E_ANDROID_APK_PATH or JOURNAL_MOBILE_E2E_ARTIFACT_PATH to the .apk path.',
    'Example: JOURNAL_MOBILE_E2E_ANDROID_APK_PATH=apps/mobile/android/app/build/outputs/apk/release/app-release.apk npm run e2e:mobile:android',
  ]
}

function getAndroidDevicePreflightErrors() {
  if (!deviceId) {
    return [
      'Android mobile E2E requires JOURNAL_MOBILE_E2E_DEVICE_ID.',
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
      'adb is required to preflight the Android mobile E2E target.',
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

function getIosDevicePreflightErrors() {
  const bootedSimulators = getBootedIosSimulators()

  if (bootedSimulators.error) {
    return [
      'xcrun simctl is required to find the iOS Simulator target.',
      bootedSimulators.error,
    ]
  }

  if (!deviceId) {
    return [
      'iOS mobile E2E requires a booted iOS Simulator.',
      'Open Simulator and boot an iPhone, or set JOURNAL_MOBILE_E2E_DEVICE_ID to a simulator UDID.',
    ]
  }

  const device = bootedSimulators.devices.find((simulator) => simulator.udid === deviceId)

  if (!device) {
    return [
      `iOS simulator ${deviceId} is not booted.`,
      'Open Simulator and boot that device before running mobile E2E.',
    ]
  }

  if (e2eMode === 'artifact') {
    return []
  }

  const appContainer = spawnSync('xcrun', ['simctl', 'get_app_container', deviceId, appId], {
    encoding: 'utf8',
    env: toolEnv,
  })

  if (appContainer.status === 0) {
    return []
  }

  const detail = (appContainer.stderr || appContainer.stdout || '').trim()

  return [
    `iOS app ${appId} is not installed on ${device.name || deviceId}.`,
    `Run: npm --workspace @journal/mobile run ios:dev -- --no-bundler --device ${deviceId}`,
    detail ? `simctl get_app_container failed: ${detail}` : '',
  ].filter(Boolean)
}

function resolveMaestroCommand() {
  const explicitCommand = process.env.MAESTRO_CLI?.trim()

  return explicitCommand || 'maestro'
}

function startExpoServer(port) {
  const expoCli = createExpoCliInvocation()
  const env = createExpoEnv({
    EXPO_PACKAGER_HOSTNAME: '127.0.0.1',
    EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID: e2eRunId,
    RCT_METRO_PORT: String(port),
    REACT_NATIVE_PACKAGER_HOSTNAME: '127.0.0.1',
  })

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
    `APP_ID=${appId}`,
  ]

  if (e2eMode === 'dev-client') {
    args.push('-e', `EXPO_DEV_CLIENT_URL=${devClientUrl}`)
  }

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

function createMaestroDeviceArgs() {
  return deviceId ? ['--udid', deviceId] : []
}

function setupAndroidPortReverse(port) {
  if (targetPlatform !== 'android' || !deviceId) {
    return
  }

  const result = spawnSync(
    'adb',
    ['-s', deviceId, 'reverse', `tcp:${port}`, `tcp:${port}`],
    {
      encoding: 'utf8',
      env: toolEnv,
    },
  )

  if (result.status === 0) {
    return
  }

  const detail = (result.stderr || result.stdout || '').trim()

  throw new Error([
    `Failed to configure adb reverse for ${deviceId} on tcp:${port}.`,
    detail,
  ].filter(Boolean).join('\n'))
}

function openDevelopmentClient() {
  console.info(`Opening ${targetPlatform} development build.`)

  if (targetPlatform === 'ios') {
    runRequiredCommand('xcrun', ['simctl', 'openurl', deviceId, devClientUrl], {
      failureMessage: `Failed to open iOS development build on ${deviceId}.`,
    })
    return
  }

  if (targetPlatform === 'android') {
    runRequiredCommand('adb', [
      '-s',
      deviceId,
      'shell',
      'am',
      'start',
      '-W',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      devClientUrl,
    ], {
      failureMessage: `Failed to open Android development build on ${deviceId}.`,
    })
  }
}

function installNativeArtifact() {
  if (!shouldInstallArtifact) {
    console.info('Skipping app artifact install because JOURNAL_MOBILE_E2E_SKIP_INSTALL=1.')
    return
  }

  console.info(`Installing ${targetPlatform} E2E artifact: ${artifactPath}`)

  if (targetPlatform === 'ios') {
    runOptionalCommand('xcrun', ['simctl', 'uninstall', deviceId, appId])
    runRequiredCommand('xcrun', ['simctl', 'install', deviceId, artifactPath], {
      failureMessage: `Failed to install iOS E2E artifact on ${deviceId}.`,
    })
    return
  }

  runOptionalCommand('adb', ['-s', deviceId, 'uninstall', appId])
  runRequiredCommand('adb', ['-s', deviceId, 'install', '-r', '-d', artifactPath], {
    failureMessage: `Failed to install Android E2E artifact on ${deviceId}.`,
  })
}

function runOptionalCommand(command, args) {
  spawnSync(command, args, {
    encoding: 'utf8',
    env: toolEnv,
  })
}

function runRequiredCommand(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: toolEnv,
  })

  if (result.status === 0) {
    return
  }

  const detail = (result.stderr || result.stdout || '').trim()

  throw new Error([
    options.failureMessage,
    detail,
  ].filter(Boolean).join('\n'))
}

function createMaestroDriverArgs() {
  return shouldReinstallMaestroDriver ? [] : ['--no-reinstall-driver']
}

function isSyncFlowPath(flowPath) {
  return /(^|[/\\])sync-now-flow\.ya?ml$/.test(flowPath)
}

function createDevelopmentClientUrl(port) {
  const metroUrl = encodeURIComponent(`http://127.0.0.1:${port}`)

  return `exp+journal-mobile://expo-development-client/?url=${metroUrl}`
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

async function prewarmMetroBundle(port, platform) {
  const bundleUrl = createMetroBundleUrl(port, platform)
  const timeoutMs = 120_000
  const startedAt = Date.now()
  let lastError = ''

  console.info(`Prewarming ${platform} bundle from Expo dev server.`)

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(bundleUrl, {
        headers: {
          Accept: 'application/javascript',
        },
      })

      if (response.ok) {
        await response.arrayBuffer()
        return
      }

      lastError = `${response.status} ${response.statusText}`.trim()
    } catch (error) {
      lastError = getErrorMessage(error)
    }

    await delay(1_000)
  }

  throw new Error([
    `Timed out prewarming ${platform} bundle from Expo dev server.`,
    `URL: ${bundleUrl}`,
    lastError ? `Last error: ${lastError}` : '',
  ].filter(Boolean).join('\n'))
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

function getAppLaunchWaitMs() {
  const value = Number(process.env.JOURNAL_MOBILE_E2E_APP_LAUNCH_WAIT_MS || 8_000)

  return Number.isFinite(value) && value >= 0 ? value : 8_000
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function resolveTargetPlatform(platformValue, requestedId) {
  if (!platformValue) {
    if (isIosSimulatorUdid(requestedId)) {
      return 'ios'
    }

    if (!requestedId && getBootedIosSimulators().devices.length > 0) {
      return 'ios'
    }

    return 'android'
  }

  if (platformValue === 'ios' || platformValue === 'android') {
    return platformValue
  }

  console.error('JOURNAL_MOBILE_E2E_PLATFORM must be either ios or android.')
  process.exit(1)
}

function resolveE2eMode(modeValue) {
  if (!modeValue || modeValue === 'artifact') {
    return 'artifact'
  }

  if (modeValue === 'dev-client') {
    return modeValue
  }

  console.error('JOURNAL_MOBILE_E2E_MODE must be either artifact or dev-client.')
  process.exit(1)
}

function getDefaultAppId(platform, mode) {
  if (platform === 'ios') {
    return defaultIosAppId
  }

  return mode === 'dev-client' ? defaultAndroidDevClientAppId : defaultAndroidArtifactAppId
}

function resolveNativeArtifactPath(platform) {
  const explicitPlatformPath = platform === 'ios'
    ? process.env.JOURNAL_MOBILE_E2E_IOS_APP_PATH?.trim()
    : process.env.JOURNAL_MOBILE_E2E_ANDROID_APK_PATH?.trim()
  const explicitGenericPath = process.env.JOURNAL_MOBILE_E2E_ARTIFACT_PATH?.trim()
  const explicitPath = explicitPlatformPath || explicitGenericPath

  if (explicitPath) {
    return resolveUserPath(explicitPath)
  }

  return findExistingPath(getDefaultArtifactPathCandidates(platform))
}

function getDefaultArtifactPathCandidates(platform) {
  if (platform === 'ios') {
    return [
      'build/ios/Build/Products/Release-iphonesimulator/app.app',
      'build/ios/Build/Products/Release-iphonesimulator/Journal.app',
      'ios/build/Build/Products/Release-iphonesimulator/app.app',
      'ios/build/Build/Products/Release-iphonesimulator/Journal.app',
    ]
  }

  return [
    'android/app/build/outputs/apk/release/app-release.apk',
    'android/app/build/outputs/apk/preview/app-preview.apk',
    'build/android/app-release.apk',
  ]
}

function findExistingPath(candidates) {
  for (const candidate of candidates) {
    const absolutePath = path.resolve(mobileRoot, candidate)

    if (existsSync(absolutePath)) {
      return absolutePath
    }
  }

  return ''
}

function resolveFlowFilePath(flowPath) {
  if (path.isAbsolute(flowPath)) {
    return flowPath
  }

  const cwdPath = path.resolve(process.cwd(), flowPath)

  if (existsSync(cwdPath)) {
    return cwdPath
  }

  return path.resolve(mobileRoot, flowPath)
}

function resolveUserPath(value) {
  if (path.isAbsolute(value)) {
    return value
  }

  const candidates = [
    path.resolve(process.cwd(), value),
    path.resolve(mobileRoot, value),
    path.resolve(repoRoot, value),
  ]
  const existingPath = candidates.find((candidate) => existsSync(candidate))

  return existingPath || candidates[0]
}

function resolveDefaultDeviceId(platform) {
  if (platform !== 'ios') {
    return ''
  }

  const bootedSimulators = getBootedIosSimulators()

  if (bootedSimulators.error) {
    return ''
  }

  const iPhone = bootedSimulators.devices.find((device) => device.name?.startsWith('iPhone'))

  return iPhone?.udid || bootedSimulators.devices[0]?.udid || ''
}

function getBootedIosSimulators() {
  const result = spawnSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], {
    encoding: 'utf8',
    env: toolEnv,
  })

  if (result.status !== 0) {
    return {
      devices: [],
      error: (result.stderr || result.stdout || '').trim(),
    }
  }

  try {
    const payload = JSON.parse(result.stdout)
    const deviceGroups = Object.values(payload.devices ?? {})
    const devices = deviceGroups
      .flat()
      .filter((device) => device?.state === 'Booted' && device.isAvailable !== false)

    return { devices, error: '' }
  } catch (error) {
    return {
      devices: [],
      error: `Could not parse simctl output: ${getErrorMessage(error)}`,
    }
  }
}

function isIosSimulatorUdid(value) {
  return /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(value)
}

function validateMaestroFlowFiles(paths) {
  const violations = []

  for (const flowPath of paths) {
    if (!existsSync(flowPath)) {
      violations.push(`${flowPath}: flow file does not exist`)
      continue
    }

    const contents = readFileSync(flowPath, 'utf8')
    const managedEnvRegex = createManagedEnvRegex()

    for (const match of contents.matchAll(managedEnvRegex)) {
      violations.push(`${flowPath}: remove flow-level ${match[1]}; runMaestroE2e injects it`)
    }

    if (/(?:exp|https?):\/\/(?:127\.0\.0\.1|localhost|[0-9.]+):\d+/.test(contents)) {
      violations.push(`${flowPath}: do not hardcode an Expo or development-client URL; use _launch-app.yaml`)
    }

    if (e2eMode === 'artifact' && /\b(EXPO_DEV_CLIENT_URL|openLink)\b/.test(contents)) {
      violations.push(`${flowPath}: artifact E2E must use launchApp; move Dev Client startup to a dev-client smoke flow`)
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

function printUsage() {
  console.info(`
Usage:
  npm --workspace @journal/mobile run e2e:ios -- [flow.yaml ...]
  npm --workspace @journal/mobile run e2e:android -- [flow.yaml ...]
  npm --workspace @journal/mobile run e2e:ios:dev -- [flow.yaml ...]
  npm --workspace @journal/mobile run e2e:android:dev -- [flow.yaml ...]

Environment:
  JOURNAL_MOBILE_E2E_MODE=artifact|dev-client
  JOURNAL_MOBILE_E2E_PLATFORM=ios|android
  JOURNAL_MOBILE_E2E_DEVICE_ID=<simulator-udid-or-android-serial>
  JOURNAL_MOBILE_E2E_IOS_APP_PATH=<built-simulator-app>
  JOURNAL_MOBILE_E2E_ANDROID_APK_PATH=<built-apk>
  JOURNAL_MOBILE_E2E_APP_ID=<bundle-id-or-package-name>
  JOURNAL_MOBILE_E2E_ENABLE_SYNC=1
`.trim())
}

function createManagedEnvRegex() {
  const keys = runnerManagedMaestroEnvKeys.map(escapeRegex).join('|')

  return new RegExp(`^\\s+(${keys})\\s*:`, 'gm')
}

function createMetroBundleUrl(port, platform) {
  const params = new URLSearchParams({
    dev: 'true',
    minify: 'false',
    platform,
  })

  return `http://127.0.0.1:${port}/apps/mobile/index.bundle?${params.toString()}`
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
