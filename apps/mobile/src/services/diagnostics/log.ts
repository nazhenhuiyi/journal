import * as FileSystem from 'expo-file-system/legacy'

export type MobileDiagnosticLogLevel = 'debug' | 'error' | 'info' | 'warn'

export type MobileDiagnosticLogDetails = Record<string, unknown>

type MobileDiagnosticLogEntry = {
  details?: unknown
  level: MobileDiagnosticLogLevel
  message: string
  scope: string
  timestamp: string
}

const diagnosticLogDirectoryName = 'journal-diagnostic-logs'
const diagnosticLogFilePrefix = 'journal-mobile'
const diagnosticLogFilePattern = /^journal-mobile-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.jsonl$/
const flushDelayMs = 350
const maxDailyLogSegments = 8
const maxLogFileBytes = 1024 * 1024
const maxStringLength = 6000
const retentionDays = 30
const sensitiveKeyPattern = /authorization|body|clientsecret|client_secret|content|longEntry|markdown|murmurs|password|secret|token/i

let didEnsureLogDirectory = false
let flushTimer: ReturnType<typeof setTimeout> | null = null
let lastPruneDateKey = ''
let pendingLogLines: string[] = []
let writeQueue: Promise<void> = Promise.resolve()

export const mobileDiagnosticLog = {
  debug: (scope: string, message: string, details?: MobileDiagnosticLogDetails) => {
    writeMobileDiagnosticLog('debug', scope, message, details)
  },
  error: (scope: string, message: string, details?: MobileDiagnosticLogDetails) => {
    writeMobileDiagnosticLog('error', scope, message, details)
  },
  info: (scope: string, message: string, details?: MobileDiagnosticLogDetails) => {
    writeMobileDiagnosticLog('info', scope, message, details)
  },
  warn: (scope: string, message: string, details?: MobileDiagnosticLogDetails) => {
    writeMobileDiagnosticLog('warn', scope, message, details)
  },
}

export function getMobileDiagnosticLogDirectory() {
  if (!FileSystem.documentDirectory) {
    throw new Error('File system document directory is unavailable.')
  }

  return `${FileSystem.documentDirectory}${diagnosticLogDirectoryName}/`
}

export function getMobileDiagnosticLogAdbRelativeDirectory() {
  return `files/${diagnosticLogDirectoryName}`
}

export function writeMobileDiagnosticLog(
  level: MobileDiagnosticLogLevel,
  scope: string,
  message: string,
  details?: MobileDiagnosticLogDetails,
) {
  const entry: MobileDiagnosticLogEntry = {
    level,
    message: sanitizeText(message),
    scope: sanitizeScope(scope),
    timestamp: new Date().toISOString(),
  }
  const normalizedDetails = normalizeLogValue(details)

  if (normalizedDetails !== undefined) {
    entry.details = normalizedDetails
  }

  pendingLogLines.push(`${JSON.stringify(entry)}\n`)
  scheduleFlush()
}

export async function flushMobileDiagnosticLogs() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }

  const lines = pendingLogLines

  if (lines.length === 0) {
    return writeQueue
  }

  pendingLogLines = []
  writeQueue = writeQueue
    .then(() => appendLogLines(lines))
    .catch(() => {
      // Diagnostics should never affect app behavior.
    })

  return writeQueue
}

export function formatMobileDiagnosticConsoleArgs(args: readonly unknown[]) {
  return args
    .map((arg) => formatLogValue(arg))
    .filter(Boolean)
    .join(' ')
}

export function sanitizeMobileDiagnosticPayload(value: unknown) {
  return normalizeLogValue(value)
}

export function sanitizeMobileDiagnosticText(value: string, options: { maxLength?: number } = {}) {
  return sanitizeText(value, options.maxLength)
}

export function sanitizeMobileDiagnosticJsonLines(value: string, options: { maxLength?: number } = {}) {
  const sanitizedLines = value
    .split(/\r?\n/)
    .map((line) => sanitizeMobileDiagnosticJsonLine(line))

  return sanitizeText(sanitizedLines.join('\n'), options.maxLength)
}

function scheduleFlush() {
  if (flushTimer) {
    return
  }

  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushMobileDiagnosticLogs()
  }, flushDelayMs)
}

async function appendLogLines(lines: readonly string[]) {
  if (lines.length === 0) {
    return
  }

  const directory = getMobileDiagnosticLogDirectory()
  const dateKey = getLocalDateKey()
  const contents = lines.join('')

  await ensureLogDirectory(directory)
  await pruneOldLogFiles(directory, dateKey)

  const filePath = await getWritableLogFilePath(directory, dateKey, contents.length)

  await FileSystem.writeAsStringAsync(filePath, contents, {
    append: true,
  })
}

async function ensureLogDirectory(directory: string) {
  if (didEnsureLogDirectory) {
    return
  }

  await FileSystem.makeDirectoryAsync(directory, {
    intermediates: true,
  })
  didEnsureLogDirectory = true
}

async function getWritableLogFilePath(directory: string, dateKey: string, incomingBytes: number) {
  for (let segment = 0; segment < maxDailyLogSegments; segment += 1) {
    const filePath = `${directory}${formatLogFileName(dateKey, segment)}`
    const info = await FileSystem.getInfoAsync(filePath)
    const currentSize = info.exists && typeof info.size === 'number' ? info.size : 0

    if (!info.exists || currentSize + incomingBytes <= maxLogFileBytes || segment === maxDailyLogSegments - 1) {
      return filePath
    }
  }

  return `${directory}${formatLogFileName(dateKey, maxDailyLogSegments - 1)}`
}

async function pruneOldLogFiles(directory: string, currentDateKey: string) {
  if (lastPruneDateKey === currentDateKey) {
    return
  }

  lastPruneDateKey = currentDateKey

  let fileNames: string[]

  try {
    fileNames = await FileSystem.readDirectoryAsync(directory)
  } catch {
    return
  }

  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000

  await Promise.all(
    fileNames.map(async (fileName) => {
      const match = diagnosticLogFilePattern.exec(fileName)

      if (!match) {
        return
      }

      const fileTime = Date.parse(`${match[1]}T00:00:00.000Z`)

      if (Number.isNaN(fileTime) || fileTime >= cutoffTime) {
        return
      }

      await FileSystem.deleteAsync(`${directory}${fileName}`, {
        idempotent: true,
      })
    }),
  )
}

function formatLogFileName(dateKey: string, segment: number) {
  return segment === 0
    ? `${diagnosticLogFilePrefix}-${dateKey}.jsonl`
    : `${diagnosticLogFilePrefix}-${dateKey}.${segment}.jsonl`
}

function formatLogValue(value: unknown) {
  const normalizedValue = normalizeLogValue(value)

  if (normalizedValue === undefined) {
    return ''
  }

  if (typeof normalizedValue === 'string') {
    return normalizedValue
  }

  try {
    return sanitizeText(JSON.stringify(normalizedValue))
  } catch {
    return '[unserializable]'
  }
}

function normalizeLogValue(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (value === undefined) {
    return undefined
  }

  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value === 'string') {
    return sanitizeText(value)
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return `[${typeof value}]`
  }

  if (value instanceof Error) {
    return {
      message: sanitizeText(value.message),
      name: value.name,
      stack: value.stack ? sanitizeText(value.stack) : undefined,
    }
  }

  if (depth >= 4) {
    return '[max-depth]'
  }

  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => normalizeLogValue(item, seen, depth + 1))
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[circular]'
    }

    seen.add(value)

    const result: Record<string, unknown> = {}

    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      result[key] = sensitiveKeyPattern.test(key)
        ? '[redacted]'
        : normalizeLogValue(nestedValue, seen, depth + 1)
    }

    seen.delete(value)

    return result
  }

  return sanitizeText(String(value))
}

function sanitizeMobileDiagnosticJsonLine(line: string) {
  if (!line.trim()) {
    return line
  }

  try {
    return JSON.stringify(sanitizeMobileDiagnosticPayload(JSON.parse(line) as unknown))
  } catch {
    return sanitizeText(line)
  }
}

function sanitizeScope(scope: string) {
  return scope
    .trim()
    .replace(/[^A-Za-z0-9:._-]/g, '-')
    .slice(0, 80) || 'app'
}

function sanitizeText(value: string, maxLength = maxStringLength) {
  return truncateString(redactSensitiveText(value), maxLength)
}

function redactSensitiveText(value: string) {
  return value
    .replace(/\b(Authorization\s*[:=]\s*)(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{12,}\b/g, '[redacted-token]')
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{12,}\b/g, '[redacted-token]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted-token]')
    .replace(/([?&](?:access_token|auth|client_secret|password|token)=)[^&#\s"']+/gi, '$1[redacted]')
    .replace(/((?:body|client_secret|content|longEntryMarkdown|markdown|murmurs|password|secret|token)["']?\s*[:=]\s*["']?)[^"',}\s]+/gi, '$1[redacted]')
}

function truncateString(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength)}...[truncated]`
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}
