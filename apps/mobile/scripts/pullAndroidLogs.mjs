#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const defaultAppId = 'app.zilin.journal.debug'
const defaultOutDir = '/tmp/journal-mobile-logs'
const remoteLogDirectory = 'files/journal-diagnostic-logs'

const options = parseArgs(process.argv.slice(2))
const adbPrefix = options.device ? ['-s', options.device] : []

if (options.help) {
  printUsage()
  process.exit(0)
}

const fileNames = listRemoteLogFiles()

if (options.list) {
  if (fileNames.length === 0) {
    console.info(`No mobile diagnostic logs found in ${remoteLogDirectory}.`)
  } else {
    for (const fileName of fileNames) {
      console.info(`${remoteLogDirectory}/${fileName}`)
    }
  }
  process.exit(0)
}

if (fileNames.length === 0) {
  console.info(`No mobile diagnostic logs found in ${remoteLogDirectory}.`)
  process.exit(0)
}

if (options.cat) {
  for (const fileName of fileNames) {
    const contents = readRemoteFile(`${remoteLogDirectory}/${fileName}`)

    process.stdout.write(contents)
  }
  process.exit(0)
}

mkdirSync(options.outDir, { recursive: true })

for (const fileName of fileNames) {
  const contents = readRemoteFile(`${remoteLogDirectory}/${fileName}`)
  const destination = join(options.outDir, fileName)

  writeFileSync(destination, contents)
  console.info(`Wrote ${destination}`)
}

function listRemoteLogFiles() {
  const result = runAdb([
    ...adbPrefix,
    'shell',
    'run-as',
    options.appId,
    'sh',
    '-c',
    `ls -1 ${shellQuote(remoteLogDirectory)} 2>/dev/null || true`,
  ], {
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    fail([
      `Could not list ${remoteLogDirectory} for ${options.appId}.`,
      'Make sure the app is installed and debuggable, or pass --app-id for the installed package.',
      result.stderr?.trim() ? `adb stderr: ${result.stderr.trim()}` : '',
    ].filter(Boolean).join('\n'))
  }

  return result.stdout
    .split('\n')
    .map((fileName) => fileName.trim())
    .filter((fileName) => /^journal-mobile-\d{4}-\d{2}-\d{2}(?:\.\d+)?\.jsonl$/.test(fileName))
    .sort()
}

function readRemoteFile(path) {
  const result = runAdb([
    ...adbPrefix,
    'exec-out',
    'run-as',
    options.appId,
    'cat',
    path,
  ])

  if (result.status !== 0) {
    fail([
      `Could not read ${path} for ${options.appId}.`,
      result.stderr?.toString().trim() ? `adb stderr: ${result.stderr.toString().trim()}` : '',
    ].filter(Boolean).join('\n'))
  }

  return result.stdout
}

function runAdb(args, spawnOptions = {}) {
  const result = spawnSync('adb', args, {
    ...spawnOptions,
  })

  if (result.error) {
    fail(`adb failed: ${result.error.message}`)
  }

  return result
}

function parseArgs(args) {
  const parsed = {
    appId: defaultAppId,
    cat: false,
    device: '',
    help: false,
    list: false,
    outDir: defaultOutDir,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--app-id') {
      parsed.appId = readValue(args, index, arg)
      index += 1
    } else if (arg === '--cat') {
      parsed.cat = true
    } else if (arg === '--device' || arg === '-s') {
      parsed.device = readValue(args, index, arg)
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true
    } else if (arg === '--list') {
      parsed.list = true
    } else if (arg === '--out') {
      parsed.outDir = readValue(args, index, arg)
      index += 1
    } else {
      fail(`Unknown option: ${arg}`)
    }
  }

  return parsed
}

function readValue(args, index, name) {
  const value = args[index + 1]

  if (!value || value.startsWith('--')) {
    fail(`Missing value for ${name}.`)
  }

  return value
}

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function printUsage() {
  console.info(`Usage:
  pnpm --filter @journal/mobile run logs:android:pull -- [--device SERIAL] [--app-id PACKAGE] [--out DIR]
  pnpm --filter @journal/mobile run logs:android:list -- [--device SERIAL] [--app-id PACKAGE]
  pnpm --filter @journal/mobile run logs:android:cat -- [--device SERIAL] [--app-id PACKAGE]

Defaults:
  --app-id ${defaultAppId}
  --out ${defaultOutDir}`)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
