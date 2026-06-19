#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { loadE2eEnv } from '../../../e2e/loadE2eEnv.mjs'
import {
  createExpoCliInvocation,
  createExpoEnv,
} from './expoEnvironment.mjs'

loadE2eEnv()

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
const flowArgs = normalizeCliFlowArgs(process.argv.slice(2))

if (flowArgs.includes('--help') || flowArgs.includes('-h')) {
  printUsage()
  process.exit(0)
}

const e2eMode = resolveE2eMode(requestedMode)
const targetPlatform = resolveTargetPlatform(requestedPlatform)
const appId = explicitAppId || getDefaultAppId(targetPlatform, e2eMode)
const deviceId = requestedDeviceId || resolveDefaultDeviceId(targetPlatform)
const devClientUrl = createDevelopmentClientUrl(expoPort)
const artifactPath = e2eMode === 'artifact' ? resolveNativeArtifactPath(targetPlatform) : ''
const shouldInstallArtifact = e2eMode === 'artifact' && process.env.JOURNAL_MOBILE_E2E_SKIP_INSTALL !== '1'
const shouldReinstallMaestroDriver = process.env.JOURNAL_MOBILE_E2E_REINSTALL_DRIVER === '1'
const publicE2eRunId = process.env.EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID?.trim() || ''
const requestedE2eRunId = process.env.JOURNAL_MOBILE_E2E_RUN_ID?.trim() || ''
const e2eRunId = requestedE2eRunId || publicE2eRunId || `maestro-${Date.now()}`
const shouldEnableDebugFixtures = process.env.JOURNAL_MOBILE_E2E_ENABLE_DEBUG_FIXTURES === '1'
const syncRemoteUrl = (process.env.JOURNAL_E2E_GITHUB_REMOTE_URL || '').trim()
const syncToken = (process.env.JOURNAL_E2E_GITHUB_TOKEN || '').trim()
const syncBranchPrefix = normalizeGitBranchPrefix(
  process.env.JOURNAL_E2E_GITHUB_BRANCH_PREFIX?.trim() || 'mobile-e2e',
)
const syncBranch = `${syncBranchPrefix}/${sanitizeGitBranchSegment(e2eRunId)}`
const syncMarkerText = process.env.JOURNAL_MOBILE_E2E_SYNC_MARKER_TEXT?.trim() ||
  `Mobile E2E sync now saved from Maestro ${e2eRunId}`
const syncConflictScenario = createMobileSyncConflictScenario()
const hasGitHubSyncConfig = Boolean(syncRemoteUrl && syncToken)
const shouldStartExpo = e2eMode === 'dev-client' && process.env.JOURNAL_MOBILE_E2E_SKIP_EXPO_START !== '1'

const syncConflictFlowPath = 'e2e/sync-conflict-flow.yaml'
const syncConflictFixtureFlowPath = 'e2e/sync-conflict-fixture-flow.yaml'
const debugSyncBlockedFlowPath = 'e2e/sync-blocked-flow.yaml'
const murmurEditKeyboardFlowPath = 'e2e/murmur-edit-keyboard-flow.yaml'
const mobileE2eRuntimeConfigFileName = 'journal-mobile-e2e-config.json'
const murmurEditKeyboardFixtureMurmurId = 'm_mobile_e2e_keyboard_fixture'
const murmurEditKeyboardFixtureImageId = 'img_mobile_e2e_keyboard_fixture'
const murmurEditKeyboardFixtureBody = 'Mobile E2E keyboard fixture body'
const murmurEditKeyboardFixtureCaption = 'Mobile E2E keyboard image caption'
const murmurEditKeyboardFixtureImageSrc =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
const reviewBackLoopFlowPath = targetPlatform === 'ios'
  ? 'e2e/review-back-loop-ios-flow.yaml'
  : 'e2e/review-back-loop-flow.yaml'
const flowPaths = flowArgs.length > 0
  ? flowArgs
  : e2eMode === 'dev-client'
    ? [
      'e2e/dev-client-smoke-flow.yaml',
      ...(shouldEnableDebugFixtures ? [debugSyncBlockedFlowPath] : []),
    ]
    : [
      'e2e/long-entry-flow.yaml',
      'e2e/today-writing-flow.yaml',
      'e2e/murmur-edit-flow.yaml',
      murmurEditKeyboardFlowPath,
      reviewBackLoopFlowPath,
      ...(shouldEnableDebugFixtures ? [debugSyncBlockedFlowPath] : []),
      'e2e/settings-sync-validation.yaml',
    ]
const maestroFlowPaths = flowPaths.map(resolveFlowFilePath)
const shouldRunSyncNowFlow = flowPaths.some(isSyncNowFlowPath)
const shouldRunSyncConflictFlow = flowPaths.some(isSyncConflictFlowPath)
const shouldRunDebugSyncBlockedFlow = flowPaths.some(isDebugSyncBlockedFlowPath)
const shouldRunSyncFlow = shouldRunSyncNowFlow || shouldRunSyncConflictFlow
const shouldUseMobileE2eRuntimeConfig = e2eMode === 'artifact' && (
  shouldRunSyncFlow ||
  shouldEnableDebugFixtures ||
  shouldRunDebugSyncBlockedFlow
)
const shouldEnableRuntimeDebugFixtures = shouldEnableDebugFixtures ||
  shouldRunSyncConflictFlow ||
  shouldRunDebugSyncBlockedFlow
const regularMaestroFlowPaths = maestroFlowPaths.filter((flowPath) => !isSyncConflictFlowPath(flowPath))
const syncConflictMaestroFlowPath = resolveFlowFilePath(syncConflictFlowPath)
const syncConflictFixtureMaestroFlowPath = resolveFlowFilePath(syncConflictFixtureFlowPath)
const githubRemote = syncRemoteUrl ? parseGitHubRemote(syncRemoteUrl) : null
const shouldManageSyncBranch = Boolean(
  shouldRunSyncFlow &&
  hasGitHubSyncConfig &&
  githubRemote,
)
const runnerManagedMaestroEnvKeys = [
  'APP_ID',
  'EXPO_DEV_CLIENT_URL',
  'REMOTE_URL',
  'SYNC_BRANCH',
  'SYNC_CONFLICT_BASE_MATCH_TEXT',
  'SYNC_CONFLICT_BASE_TEXT',
  'SYNC_CONFLICT_DATE',
  'SYNC_CONFLICT_ENTRY_PATH',
  'SYNC_CONFLICT_LOCAL_MATCH_TEXT',
  'SYNC_CONFLICT_LOCAL_TEXT',
  'SYNC_CONFLICT_LOCAL_TEXT_ENCODED',
  'SYNC_CONFLICT_REMOTE_MATCH_TEXT',
  'SYNC_CONFLICT_REMOTE_TEXT',
  'SYNC_MARKER_TEXT',
  'SYNC_TOKEN',
]

validateMaestroFlowFiles([
  ...maestroFlowPaths,
  ...(shouldRunSyncConflictFlow ? [syncConflictFixtureMaestroFlowPath] : []),
])
const preflightErrors = [
  ...getNativeDevicePreflightErrors(),
  ...getArtifactPreflightErrors(),
  ...getMaestroPreflightErrors(maestroCommand),
]

if (preflightErrors.length > 0) {
  console.error(preflightErrors.join('\n'))
  process.exit(1)
}

if (shouldRunSyncNowFlow && shouldRunSyncConflictFlow) {
  console.error('Run sync-now-flow.yaml and sync-conflict-flow.yaml in separate E2E runs so each scenario gets its own branch.')
  process.exit(1)
}

if (shouldRunSyncFlow && !hasGitHubSyncConfig) {
  console.error([
    'Mobile sync E2E requires real GitHub configuration.',
    'Set JOURNAL_E2E_GITHUB_REMOTE_URL and JOURNAL_E2E_GITHUB_TOKEN.',
  ].join('\n'))
  process.exit(1)
}

if (shouldRunSyncFlow && hasGitHubSyncConfig && !githubRemote) {
  console.error('JOURNAL_E2E_GITHUB_REMOTE_URL must be an HTTPS github.com remote URL.')
  process.exit(1)
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

  if (shouldRunSyncConflictFlow && githubRemote) {
    console.info(`Seeding mobile sync conflict base on ${syncBranch}.`)
    await seedMobileSyncConflictBase(githubRemote, syncBranch, syncToken, syncConflictScenario)
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

  let maestroStatus = 0

  if (regularMaestroFlowPaths.length > 0) {
    maestroStatus = await runMaestroFlows(regularMaestroFlowPaths)
  }

  if (maestroStatus === 0 && shouldRunSyncConflictFlow && githubRemote) {
    maestroStatus = await runMobileSyncConflictScenario(githubRemote)
  }

  process.exitCode = maestroStatus

  if (maestroStatus === 0 && shouldRunSyncNowFlow && githubRemote) {
    try {
      await assertMobileSyncRemoteFact(githubRemote, syncBranch, syncToken, syncMarkerText)
    } catch (error) {
      console.error(`Mobile sync E2E remote verification failed: ${getErrorMessage(error)}`)
      process.exitCode = 1
    }
  }

  if (maestroStatus === 0 && shouldRunSyncConflictFlow && githubRemote) {
    try {
      await assertMobileSyncConflictRemoteFact(githubRemote, syncBranch, syncToken, syncConflictScenario)
    } catch (error) {
      console.error(`Mobile sync conflict E2E remote verification failed: ${getErrorMessage(error)}`)
      process.exitCode = 1
    }
  }
} finally {
  if (expoProcess) {
    expoProcess.kill('SIGTERM')
  }

  if (didCreateSyncBranch && githubRemote) {
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
      'Example: JOURNAL_MOBILE_E2E_IOS_APP_PATH=apps/mobile/build/ios/Build/Products/Release-iphonesimulator/app.app pnpm run e2e:mobile:ios:artifact',
    ]
  }

  return [
    'Android artifact E2E requires a built .apk.',
    'Set JOURNAL_MOBILE_E2E_ANDROID_APK_PATH or JOURNAL_MOBILE_E2E_ARTIFACT_PATH to the .apk path.',
    'Example: JOURNAL_MOBILE_E2E_ANDROID_APK_PATH=apps/mobile/android/app/build/outputs/apk/release/eas-preview-local.apk pnpm run e2e:mobile:android:artifact',
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
    `Run: pnpm --filter @journal/mobile run ios:dev -- --no-bundler --device ${deviceId}`,
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
      `SYNC_CONFLICT_BASE_MATCH_TEXT=${createMaestroVisibleMatchText(syncConflictScenario.baseText)}`,
      '-e',
      `SYNC_CONFLICT_BASE_TEXT=${syncConflictScenario.baseText}`,
      '-e',
      `SYNC_CONFLICT_DATE=${syncConflictScenario.date}`,
      '-e',
      `SYNC_CONFLICT_ENTRY_PATH=${syncConflictScenario.entryPath}`,
      '-e',
      `SYNC_CONFLICT_LOCAL_MATCH_TEXT=${createMaestroVisibleMatchText(syncConflictScenario.localText)}`,
      '-e',
      `SYNC_CONFLICT_LOCAL_TEXT=${syncConflictScenario.localText}`,
      '-e',
      `SYNC_CONFLICT_LOCAL_TEXT_ENCODED=${encodeURIComponent(syncConflictScenario.localText)}`,
      '-e',
      `SYNC_CONFLICT_REMOTE_MATCH_TEXT=${createMaestroVisibleMatchText(syncConflictScenario.remoteText)}`,
      '-e',
      `SYNC_CONFLICT_REMOTE_TEXT=${syncConflictScenario.remoteText}`,
      '-e',
      `SYNC_MARKER_TEXT=${syncMarkerText}`,
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

function terminateMobileApp() {
  if (targetPlatform === 'ios') {
    runOptionalCommand('xcrun', ['simctl', 'terminate', deviceId, appId])
    return
  }

  runOptionalCommand('adb', ['-s', deviceId, 'shell', 'am', 'force-stop', appId])
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

async function runMaestroFlows(flowPathsToRun) {
  if (flowPathsToRun.length === 0) {
    return 0
  }

  const shouldRunIndividually = shouldUseMobileE2eRuntimeConfig ||
    flowPathsToRun.some(isMurmurEditKeyboardFlowPath)

  if (shouldRunIndividually) {
    for (const flowPath of flowPathsToRun) {
      const shouldSeedMurmurEditKeyboardFixture = isMurmurEditKeyboardFlowPath(flowPath)

      if (shouldSeedMurmurEditKeyboardFixture) {
        terminateMobileApp()
      }

      if (shouldUseMobileE2eRuntimeConfig) {
        writeMobileE2eRuntimeConfig()
      }

      if (shouldSeedMurmurEditKeyboardFixture) {
        writeMurmurEditKeyboardFixture()

        if (e2eMode === 'dev-client') {
          openDevelopmentClient()
          await delay(getAppLaunchWaitMs())
        }
      }

      const status = runMaestroCommand([flowPath])

      if (status !== 0) {
        return status
      }
    }

    return 0
  }

  return runMaestroCommand(flowPathsToRun)
}

function runMaestroCommand(flowPathsToRun) {
  const maestroResult = spawnSync(
    maestroCommand,
    [
      'test',
      ...createMaestroDriverArgs(),
      ...createMaestroDeviceArgs(),
      ...createMaestroEnvArgs(),
      ...flowPathsToRun,
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

  return maestroResult.status ?? 1
}

function writeMobileE2eRuntimeConfig() {
  const contents = `${JSON.stringify({
    debugFixturesEnabled: shouldEnableRuntimeDebugFixtures,
    runId: e2eRunId,
    version: 1,
  })}\n`

  if (targetPlatform === 'ios') {
    writeIosMobileE2eRuntimeConfig(contents)
    return
  }

  writeAndroidMobileE2eRuntimeConfig(contents)
}

function writeMurmurEditKeyboardFixture() {
  const date = getLocalDateKey()
  const entryPath = getEntryRepositoryPath(date)
  const contents = createMurmurEditKeyboardFixtureEntry(date)

  console.info(`Seeding murmur keyboard fixture in ${entryPath}.`)

  if (targetPlatform === 'ios') {
    writeIosMurmurEditKeyboardFixture(entryPath, contents)
    return
  }

  writeAndroidMurmurEditKeyboardFixture(entryPath, contents)
}

function createMurmurEditKeyboardFixtureEntry(date) {
  const timestamp = new Date().toISOString()

  return `---
date: ${date}
createdAt: ${timestamp}
updatedAt: ${timestamp}
---

:::murmur
id: ${murmurEditKeyboardFixtureMurmurId}
time: ${timestamp}
---
${murmurEditKeyboardFixtureBody}

::image
id: ${murmurEditKeyboardFixtureImageId}
src: ${murmurEditKeyboardFixtureImageSrc}
caption: ${murmurEditKeyboardFixtureCaption}
::
:::
`
}

function writeIosMurmurEditKeyboardFixture(entryRepositoryPath, contents) {
  const entryPath = path.join(
    getIosAppDataContainer(),
    'Documents',
    getMobileJournalWorktreeDirectoryName(),
    ...entryRepositoryPath.split('/'),
  )

  mkdirSync(path.dirname(entryPath), { recursive: true })
  writeFileSync(entryPath, contents)
}

function writeAndroidMurmurEditKeyboardFixture(entryRepositoryPath, contents) {
  const entryPath = path.posix.join(
    'files',
    getMobileJournalWorktreeDirectoryName(),
    ...entryRepositoryPath.split('/'),
  )
  const entryDirectory = path.posix.dirname(entryPath)
  const result = spawnSync(
    'adb',
    [
      '-s',
      deviceId,
      'shell',
      'run-as',
      appId,
      'sh',
      '-c',
      `mkdir -p ${quoteShellArgument(entryDirectory)} && cat > ${quoteShellArgument(entryPath)}`,
    ],
    {
      encoding: 'utf8',
      env: toolEnv,
      input: contents,
    },
  )

  if (result.status === 0) {
    return
  }

  throw new Error([
    `Could not write Android murmur keyboard fixture for ${appId}.`,
    (result.stderr || result.stdout || '').trim(),
  ].filter(Boolean).join(' '))
}

function writeIosMobileE2eRuntimeConfig(contents) {
  const documentsDirectory = path.join(getIosAppDataContainer(), 'Documents')

  mkdirSync(documentsDirectory, { recursive: true })
  writeFileSync(path.join(documentsDirectory, mobileE2eRuntimeConfigFileName), contents)
}

function getIosAppDataContainer() {
  const result = spawnSync('xcrun', ['simctl', 'get_app_container', deviceId, appId, 'data'], {
    encoding: 'utf8',
    env: toolEnv,
  })
  const dataContainer = result.status === 0 ? result.stdout.trim() : ''

  if (!dataContainer) {
    throw new Error([
      `Could not find iOS app sandbox for ${appId}.`,
      (result.stderr || result.stdout || '').trim(),
    ].filter(Boolean).join(' '))
  }

  return dataContainer
}

function getMobileJournalWorktreeDirectoryName() {
  const runId = shouldAppUseMobileE2eRunId() ? getMobileAppE2eRunId() : ''

  return runId ? `journal-e2e-worktree-${runId}` : 'journal-worktree'
}

function shouldAppUseMobileE2eRunId() {
  return e2eMode === 'dev-client' || shouldUseMobileE2eRuntimeConfig
}

function quoteShellArgument(value) {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function writeAndroidMobileE2eRuntimeConfig(contents) {
  const result = spawnSync(
    'adb',
    [
      '-s',
      deviceId,
      'shell',
      'run-as',
      appId,
      'sh',
      '-c',
      `mkdir -p files && cat > files/${mobileE2eRuntimeConfigFileName}`,
    ],
    {
      encoding: 'utf8',
      env: toolEnv,
      input: contents,
    },
  )

  if (result.status === 0) {
    return
  }

  throw new Error([
    `Could not write Android E2E runtime config for ${appId}.`,
    (result.stderr || result.stdout || '').trim(),
  ].filter(Boolean).join(' '))
}

async function runMobileSyncConflictScenario(remote) {
  const fixtureStatus = await runMaestroFlows([syncConflictFixtureMaestroFlowPath])

  if (fixtureStatus !== 0) {
    return fixtureStatus
  }

  const localEntryContent = await waitForMobileSyncConflictLocalEntry(syncConflictScenario)
  console.info(`Advancing GitHub branch ${syncBranch} with remote conflict content.`)
  await commitMobileSyncConflictRemote(remote, syncBranch, syncToken, syncConflictScenario, localEntryContent)

  const conflictStatus = await runMaestroFlows([syncConflictMaestroFlowPath])

  if (conflictStatus !== 0) {
    return conflictStatus
  }

  try {
    assertMobileSyncConflictBlockedSnapshot(syncConflictScenario)
    return 0
  } catch (error) {
    console.error(`Mobile sync conflict blocked snapshot verification failed: ${getErrorMessage(error)}`)
    return 1
  }
}

function createMaestroDriverArgs() {
  return shouldReinstallMaestroDriver ? [] : ['--no-reinstall-driver']
}

function isSyncNowFlowPath(flowPath) {
  return /(^|[/\\])sync-now-flow\.ya?ml$/.test(flowPath)
}

function isSyncConflictFlowPath(flowPath) {
  return /(^|[/\\])sync-conflict-flow\.ya?ml$/.test(flowPath)
}

function isDebugSyncBlockedFlowPath(flowPath) {
  return /(^|[/\\])sync-blocked-flow\.ya?ml$/.test(flowPath)
}

function isMurmurEditKeyboardFlowPath(flowPath) {
  return /(^|[/\\])murmur-edit-keyboard-flow\.ya?ml$/.test(flowPath)
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

function normalizeGitBranchPrefix(value) {
  const segments = value
    .split('/')
    .map(sanitizeGitBranchSegment)
    .filter(Boolean)

  return segments.join('/') || 'mobile-e2e'
}

function createMobileSyncConflictScenario() {
  const date = getLocalDateKey()

  return {
    baseText: process.env.JOURNAL_MOBILE_E2E_SYNC_CONFLICT_BASE_TEXT?.trim() ||
      `Mobile E2E conflict base ${e2eRunId}`,
    date,
    entryPath: getEntryRepositoryPath(date),
    localText: process.env.JOURNAL_MOBILE_E2E_SYNC_CONFLICT_LOCAL_TEXT?.trim() ||
      `Mobile E2E local conflict ${e2eRunId}`,
    remoteText: process.env.JOURNAL_MOBILE_E2E_SYNC_CONFLICT_REMOTE_TEXT?.trim() ||
      `Mobile E2E remote conflict ${e2eRunId}`,
  }
}

function createMaestroVisibleMatchText(text) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 4) {
    return words.slice(0, 4).join(' ')
  }

  return text.trim().slice(0, 32)
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getEntryRepositoryPath(date) {
  const [year, month] = date.split('-')

  return `entries/${year}/${month}/${date}.md`
}

function createMobileSyncConflictEntry(date, body) {
  const timestamp = `${date}T00:00:00.000Z`

  return `---
date: ${date}
createdAt: ${timestamp}
updatedAt: ${timestamp}
---

${body}
`
}

function createMobileSyncConflictEntryFromLocal(localEntryContent, body) {
  const frontMatterMatch = localEntryContent.match(/^(---\r?\n[\s\S]*?\r?\n---)(?:\r?\n)*/)

  if (!frontMatterMatch) {
    return `${body}\n`
  }

  return `${frontMatterMatch[1]}\n\n${body}\n`
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

async function seedMobileSyncConflictBase(remote, branch, token, scenario) {
  await commitGitHubE2eFiles(remote, branch, token, {
    [scenario.entryPath]: createMobileSyncConflictEntry(scenario.date, scenario.baseText),
  }, 'Seed mobile sync conflict base')
}

async function commitMobileSyncConflictRemote(remote, branch, token, scenario, localEntryContent = '') {
  await commitGitHubE2eFiles(remote, branch, token, {
    [scenario.entryPath]: localEntryContent
      ? createMobileSyncConflictEntryFromLocal(localEntryContent, scenario.remoteText)
      : createMobileSyncConflictEntry(scenario.date, scenario.remoteText),
  }, 'Create mobile sync conflict remote side')
}

function readMobileSyncConflictLocalEntry(scenario) {
  const relativePath = path.join(`journal-e2e-worktree-${getMobileAppE2eRunId()}`, ...scenario.entryPath.split('/'))

  if (targetPlatform === 'ios') {
    const result = spawnSync('xcrun', ['simctl', 'get_app_container', deviceId, appId, 'data'], {
      encoding: 'utf8',
      env: toolEnv,
    })
    const dataContainer = result.status === 0 ? result.stdout.trim() : ''
    const entryPath = dataContainer ? path.join(dataContainer, 'Documents', relativePath) : ''

    if (entryPath && existsSync(entryPath)) {
      return readFileSync(entryPath, 'utf8')
    }

    throw new Error([
      `Could not read local mobile conflict entry ${scenario.entryPath} from iOS app sandbox.`,
      result.status === 0 ? `Checked ${entryPath}.` : (result.stderr || result.stdout || '').trim(),
    ].filter(Boolean).join(' '))
  }

  const androidPaths = [
    `/data/user/0/${appId}/files/${relativePath}`,
    `/data/data/${appId}/files/${relativePath}`,
  ]

  for (const androidPath of androidPaths) {
    const result = spawnSync('adb', ['-s', deviceId, 'shell', 'run-as', appId, 'cat', androidPath], {
      encoding: 'utf8',
      env: toolEnv,
    })

    if (result.status === 0 && result.stdout) {
      return result.stdout
    }
  }

  throw new Error(`Could not read local mobile conflict entry ${scenario.entryPath} from Android app sandbox.`)
}

async function waitForMobileSyncConflictLocalEntry(scenario) {
  const timeoutMs = 45_000
  const startedAt = Date.now()
  let lastContent = ''
  let lastError = ''

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const content = readMobileSyncConflictLocalEntry(scenario)

      lastContent = content

      if (content.includes(scenario.localText)) {
        return content
      }
    } catch (error) {
      lastError = getErrorMessage(error)
    }

    await delay(500)
  }

  const contentHint = lastContent.trim()
    ? ` Last entry content started with: ${lastContent.trim().slice(0, 120)}`
    : ''
  const errorHint = lastError ? ` Last read error: ${lastError}` : ''

  throw new Error(
    `Timed out waiting for local mobile conflict text in ${scenario.entryPath}.${contentHint}${errorHint}`,
  )
}

function assertMobileSyncConflictBlockedSnapshot(scenario) {
  console.info('Verifying mobile sync conflict blocked snapshot contains conflict previews.')

  const contents = readMobileSyncStateFile()
  const parsed = parseJsonObject(contents, 'mobile sync state')
  const snapshot = getPersistedSyncSnapshot(parsed)
  const block = snapshot.block

  if (snapshot.status !== 'blocked') {
    throw new Error(`Expected persisted sync status blocked, got ${String(snapshot.status)}.`)
  }

  if (!block || block.reason !== 'content-conflict') {
    throw new Error('Expected persisted sync block reason content-conflict.')
  }

  const paths = Array.isArray(block.paths) ? block.paths : []

  if (!paths.includes(scenario.entryPath)) {
    throw new Error(`Expected blocked paths to include ${scenario.entryPath}.`)
  }

  const conflicts = Array.isArray(block.conflicts) ? block.conflicts : []
  const conflict = conflicts.find((candidate) => candidate?.path === scenario.entryPath)

  if (!conflict) {
    throw new Error(`Expected conflict preview for ${scenario.entryPath}.`)
  }

  const ours = typeof conflict.ours === 'string' ? conflict.ours : ''
  const theirs = typeof conflict.theirs === 'string' ? conflict.theirs : ''

  if (!ours.includes(scenario.localText)) {
    throw new Error(`Expected local conflict preview text for ${scenario.entryPath}.`)
  }

  if (!theirs.includes(scenario.remoteText)) {
    throw new Error(`Expected remote conflict preview text for ${scenario.entryPath}.`)
  }
}

function readMobileSyncStateFile() {
  const fileNames = getMobileSyncStateFileNames()

  if (targetPlatform === 'ios') {
    const result = spawnSync('xcrun', ['simctl', 'get_app_container', deviceId, appId, 'data'], {
      encoding: 'utf8',
      env: toolEnv,
    })
    const dataContainer = result.status === 0 ? result.stdout.trim() : ''
    const checkedPaths = dataContainer
      ? fileNames.map((fileName) => path.join(dataContainer, 'Documents', fileName))
      : []

    for (const filePath of checkedPaths) {
      if (existsSync(filePath)) {
        return readFileSync(filePath, 'utf8')
      }
    }

    throw new Error([
      'Could not read mobile sync state from iOS app sandbox.',
      checkedPaths.length > 0
        ? `Checked ${checkedPaths.join(', ')}.`
        : (result.stderr || result.stdout || '').trim(),
    ].filter(Boolean).join(' '))
  }

  const androidPaths = fileNames.flatMap((fileName) => [
    `/data/user/0/${appId}/files/${fileName}`,
    `/data/data/${appId}/files/${fileName}`,
  ])

  for (const androidPath of androidPaths) {
    const result = spawnSync('adb', ['-s', deviceId, 'shell', 'run-as', appId, 'cat', androidPath], {
      encoding: 'utf8',
      env: toolEnv,
    })

    if (result.status === 0 && result.stdout) {
      return result.stdout
    }
  }

  throw new Error(`Could not read mobile sync state from Android app sandbox. Checked ${androidPaths.join(', ')}.`)
}

function getMobileSyncStateFileNames() {
  const e2eSuffix = getMobileAppE2eRunId()

  return [
    ...(e2eSuffix ? [`journal-mobile-sync-state.json.${e2eSuffix}`] : []),
    'journal-mobile-sync-state.json',
  ]
}

function getMobileAppE2eRunId() {
  return e2eRunId
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .slice(0, 80)
}

function parseJsonObject(contents, label) {
  try {
    const parsed = JSON.parse(contents)

    if (parsed && typeof parsed === 'object') {
      return parsed
    }
  } catch (error) {
    throw new Error(`Could not parse ${label}: ${getErrorMessage(error)}`)
  }

  throw new Error(`Expected ${label} to be a JSON object.`)
}

function getPersistedSyncSnapshot(parsed) {
  const snapshot = parsed.snapshot && typeof parsed.snapshot === 'object'
    ? parsed.snapshot
    : parsed

  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Expected persisted sync snapshot object.')
  }

  return snapshot
}

async function commitGitHubE2eFiles(remote, branch, token, files, message) {
  const parentSha = await getGitHubBranchSha(remote, branch, token)

  if (!parentSha) {
    throw new Error(`GitHub branch ${branch} does not exist.`)
  }

  const parentCommit = await requestGitHubJson(remote, `/git/commits/${encodeURIComponent(parentSha)}`, token)
  const baseTreeSha = typeof parentCommit.tree?.sha === 'string' ? parentCommit.tree.sha : ''

  if (!baseTreeSha) {
    throw new Error(`GitHub branch ${branch} does not point to a commit tree.`)
  }

  const tree = await writeGitHubJson(remote, '/git/trees', token, 'POST', {
    base_tree: baseTreeSha,
    tree: Object.entries(files).map(([filePath, contents]) => ({
      content: Buffer.isBuffer(contents) ? contents.toString('utf8') : contents,
      mode: '100644',
      path: filePath,
      type: 'blob',
    })),
  })
  const treeSha = typeof tree.sha === 'string' ? tree.sha : ''

  if (!treeSha) {
    throw new Error(`GitHub did not return a tree sha while preparing ${branch}.`)
  }

  const commit = await writeGitHubJson(remote, '/git/commits', token, 'POST', {
    message,
    parents: [parentSha],
    tree: treeSha,
  })
  const commitSha = typeof commit.sha === 'string' ? commit.sha : ''

  if (!commitSha) {
    throw new Error(`GitHub did not return a commit sha while preparing ${branch}.`)
  }

  await writeGitHubJson(remote, `/git/refs/${encodeGitHubRefPath(branch)}`, token, 'PATCH', {
    force: false,
    sha: commitSha,
  })
}

async function assertMobileSyncRemoteFact(remote, branch, token, expectedText) {
  console.info(`Verifying mobile sync content on GitHub branch ${branch}.`)

  const branchSha = await getGitHubBranchSha(remote, branch, token)

  if (!branchSha) {
    throw new Error(`GitHub branch ${branch} does not exist after mobile sync.`)
  }

  const commit = await requestGitHubJson(remote, `/git/commits/${encodeURIComponent(branchSha)}`, token)
  const treeSha = typeof commit.tree?.sha === 'string' ? commit.tree.sha : ''

  if (!treeSha) {
    throw new Error(`GitHub branch ${branch} does not point to a commit tree.`)
  }

  const tree = await requestGitHubJson(remote, `/git/trees/${encodeURIComponent(treeSha)}?recursive=1`, token)
  const items = Array.isArray(tree.tree) ? tree.tree : []
  const candidateBlobs = items.filter(isMobileSyncTextBlob)

  for (const item of candidateBlobs) {
    const blobText = await getGitHubBlobText(remote, item.sha, token)

    if (blobText.includes(expectedText)) {
      console.info(`Verified mobile sync content in ${item.path}.`)
      return
    }
  }

  const truncatedHint = tree.truncated
    ? ' GitHub returned a truncated tree; keep the branch and inspect it manually.'
    : ''

  throw new Error(
    `Expected sync marker was not found on ${branch}. Checked ${candidateBlobs.length} synced text file(s).${truncatedHint}`,
  )
}

async function assertMobileSyncConflictRemoteFact(remote, branch, token, scenario) {
  console.info(`Verifying mobile sync conflict did not pollute GitHub branch ${branch}.`)

  const remoteContent = await getGitHubTextFile(remote, branch, token, scenario.entryPath)

  if (!remoteContent.includes(scenario.remoteText)) {
    throw new Error(`Expected remote conflict text was not found in ${scenario.entryPath}.`)
  }

  if (remoteContent.includes(scenario.localText)) {
    throw new Error(`Local conflict text was unexpectedly pushed to ${scenario.entryPath}.`)
  }

  if (remoteContent.includes('<<<<<<<') || remoteContent.includes('>>>>>>>')) {
    throw new Error(`Conflict markers were unexpectedly pushed to ${scenario.entryPath}.`)
  }
}

function isMobileSyncTextBlob(item) {
  if (!item || item.type !== 'blob' || typeof item.path !== 'string' || typeof item.sha !== 'string') {
    return false
  }

  if (typeof item.size === 'number' && item.size > 1_000_000) {
    return false
  }

  return item.path === 'manifest.json' ||
    /^entries\/.+\.(?:md|json)$/.test(item.path) ||
    /^reviews\/.+\.json$/.test(item.path) ||
    /^annotations\/.+\.json$/.test(item.path)
}

async function getGitHubBlobText(remote, sha, token) {
  const blob = await requestGitHubJson(remote, `/git/blobs/${encodeURIComponent(sha)}`, token)

  if (blob.encoding !== 'base64' || typeof blob.content !== 'string') {
    return ''
  }

  return Buffer.from(blob.content.replace(/\s/g, ''), 'base64').toString('utf8')
}

async function getGitHubTextFile(remote, branch, token, filePath) {
  const branchSha = await getGitHubBranchSha(remote, branch, token)

  if (!branchSha) {
    throw new Error(`GitHub branch ${branch} does not exist.`)
  }

  const commit = await requestGitHubJson(remote, `/git/commits/${encodeURIComponent(branchSha)}`, token)
  const treeSha = typeof commit.tree?.sha === 'string' ? commit.tree.sha : ''

  if (!treeSha) {
    throw new Error(`GitHub branch ${branch} does not point to a commit tree.`)
  }

  const tree = await requestGitHubJson(remote, `/git/trees/${encodeURIComponent(treeSha)}?recursive=1`, token)
  const items = Array.isArray(tree.tree) ? tree.tree : []
  const item = items.find((candidate) => (
    candidate?.type === 'blob' &&
    candidate.path === filePath &&
    typeof candidate.sha === 'string'
  ))

  if (!item) {
    throw new Error(`Expected ${filePath} on GitHub branch ${branch}.`)
  }

  return getGitHubBlobText(remote, item.sha, token)
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

async function writeGitHubJson(remote, pathName, token, method, payload) {
  const response = await fetch(createGitHubApiUrl(remote, pathName), {
    body: JSON.stringify(payload),
    headers: createGitHubHeaders(token),
    method,
  })

  if (!response.ok) {
    throw new Error(`GitHub ${method} request failed with ${response.status}: ${await response.text()}`)
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

function resolveTargetPlatform(platformValue) {
  if (!platformValue) {
    console.error([
      'JOURNAL_MOBILE_E2E_PLATFORM is required for mobile E2E.',
      'Use pnpm run e2e:mobile:ios or pnpm run e2e:mobile:android instead of relying on device inference.',
    ].join('\n'))
    process.exit(1)
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
    'android/app/build/outputs/apk/release/eas-preview-local.apk',
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

    if (e2eMode === 'artifact' && /\bEXPO_DEV_CLIENT_URL\b/.test(contents)) {
      violations.push(`${flowPath}: artifact E2E must use launchApp; move Dev Client startup to a dev-client smoke flow`)
    }

    if (
      e2eMode === 'artifact' &&
      /\bopenLink\b/.test(contents) &&
      !/openLink:\s*journal:\/\/debug\//.test(contents)
    ) {
      violations.push(`${flowPath}: artifact E2E openLink is only allowed for journal://debug fixture links`)
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

function normalizeCliFlowArgs(args) {
  return args[0] === '--' ? args.slice(1) : args
}

function printUsage() {
  console.info(`
Usage:
  pnpm --filter @journal/mobile run e2e:ios:artifact -- [flow.yaml ...]
  pnpm --filter @journal/mobile run e2e:android:artifact -- [flow.yaml ...]
  pnpm --filter @journal/mobile run e2e:ios:dev -- [flow.yaml ...]
  pnpm --filter @journal/mobile run e2e:android:dev -- [flow.yaml ...]

Environment:
  JOURNAL_MOBILE_E2E_MODE=artifact|dev-client
  JOURNAL_MOBILE_E2E_PLATFORM=ios|android
  JOURNAL_MOBILE_E2E_DEVICE_ID=<simulator-udid-or-android-serial>
  JOURNAL_MOBILE_E2E_IOS_APP_PATH=<built-simulator-app>
  JOURNAL_MOBILE_E2E_ANDROID_APK_PATH=<built-apk>
  JOURNAL_MOBILE_E2E_APP_ID=<bundle-id-or-package-name>
  JOURNAL_MOBILE_E2E_RUN_ID=<optional-stable-run-id>
  JOURNAL_MOBILE_E2E_ENABLE_DEBUG_FIXTURES=1
  JOURNAL_E2E_GITHUB_REMOTE_URL=<https-github-remote>
  JOURNAL_E2E_GITHUB_TOKEN=<github-token>
  JOURNAL_E2E_GITHUB_BRANCH_PREFIX=<branch-prefix>
  JOURNAL_MOBILE_E2E_SYNC_MARKER_TEXT=<remote-verification-marker>
  JOURNAL_MOBILE_E2E_SYNC_CONFLICT_BASE_TEXT=<base-marker>
  JOURNAL_MOBILE_E2E_SYNC_CONFLICT_LOCAL_TEXT=<local-marker>
  JOURNAL_MOBILE_E2E_SYNC_CONFLICT_REMOTE_TEXT=<remote-marker>
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
