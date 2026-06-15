import { AppState, Platform } from 'react-native'
import {
  flushMobileDiagnosticLogs,
  formatMobileDiagnosticConsoleArgs,
  mobileDiagnosticLog,
  writeMobileDiagnosticLog,
  type MobileDiagnosticLogLevel,
} from './log'

type ErrorUtilsLike = {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void
}

type GlobalEventTargetLike = {
  addEventListener?: (type: string, listener: (event: unknown) => void) => void
}

let didInstallMobileDiagnosticLogging = false

export function installMobileDiagnosticLogging() {
  if (didInstallMobileDiagnosticLogging || isTestEnvironment()) {
    return
  }

  didInstallMobileDiagnosticLogging = true

  installConsoleBridge()
  installGlobalErrorBridge()
  installUnhandledRejectionBridge()

  AppState.addEventListener('change', (nextState) => {
    mobileDiagnosticLog.info('app-state', 'App state changed', {
      state: nextState,
    })

    if (nextState === 'background' || nextState === 'inactive') {
      void flushMobileDiagnosticLogs()
    }
  })

  mobileDiagnosticLog.info('runtime', 'Mobile diagnostic logging started', {
    platform: Platform.OS,
    platformVersion: Platform.Version,
  })
}

function installConsoleBridge() {
  bridgeConsoleMethod('warn', 'warn')
  bridgeConsoleMethod('error', 'error')
}

function bridgeConsoleMethod(method: 'error' | 'warn', level: MobileDiagnosticLogLevel) {
  const originalMethod = console[method]?.bind(console)

  console[method] = (...args: unknown[]) => {
    originalMethod?.(...args)
    writeMobileDiagnosticLog(level, `console.${method}`, formatMobileDiagnosticConsoleArgs(args), {
      argumentCount: args.length,
    })
  }
}

function installGlobalErrorBridge() {
  const errorUtils = (globalThis as typeof globalThis & {
    ErrorUtils?: ErrorUtilsLike
  }).ErrorUtils
  const previousHandler = errorUtils?.getGlobalHandler?.()

  if (!errorUtils?.setGlobalHandler) {
    return
  }

  errorUtils.setGlobalHandler((error, isFatal) => {
    mobileDiagnosticLog.error('runtime.global-error', 'Unhandled JS error', {
      error,
      isFatal: Boolean(isFatal),
    })
    void flushMobileDiagnosticLogs()
    previousHandler?.(error, isFatal)
  })
}

function installUnhandledRejectionBridge() {
  const eventTarget = globalThis as typeof globalThis & GlobalEventTargetLike

  eventTarget.addEventListener?.('unhandledrejection', (event) => {
    const reason = isRecord(event) && 'reason' in event ? event.reason : event

    mobileDiagnosticLog.error('runtime.unhandled-rejection', 'Unhandled promise rejection', {
      reason,
    })
    void flushMobileDiagnosticLogs()
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTestEnvironment() {
  return (globalThis as typeof globalThis & {
    process?: { env?: { NODE_ENV?: string } }
  }).process?.env?.NODE_ENV === 'test'
}
