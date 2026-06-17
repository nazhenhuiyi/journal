import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultEnvPath = path.join(repoRoot, '.env.e2e.local')

export function loadE2eEnv(envPath = defaultEnvPath) {
  if (!existsSync(envPath)) {
    return {
      loaded: false,
      path: envPath,
    }
  }

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const parsed = parseEnvLine(line)

    if (!parsed || process.env[parsed.key] !== undefined) {
      continue
    }

    process.env[parsed.key] = parsed.value
  }

  return {
    loaded: true,
    path: envPath,
  }
}

function parseEnvLine(line) {
  const trimmedLine = line.trim()

  if (!trimmedLine || trimmedLine.startsWith('#')) {
    return null
  }

  const normalizedLine = trimmedLine.startsWith('export ')
    ? trimmedLine.slice('export '.length).trim()
    : trimmedLine
  const separatorIndex = normalizedLine.indexOf('=')

  if (separatorIndex <= 0) {
    return null
  }

  const key = normalizedLine.slice(0, separatorIndex).trim()

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null
  }

  return {
    key,
    value: parseEnvValue(normalizedLine.slice(separatorIndex + 1).trim()),
  }
}

function parseEnvValue(value) {
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
