import type { JournalGitTrace, JournalGitTraceEvent } from './gitCore'

export type JournalGitTraceSink = (event: JournalGitTraceEvent) => void

export type JournalGitTraceConsole = {
  info: (message: string) => void
}

export function createJournalGitTrace(
  sinks: readonly JournalGitTraceSink[],
): JournalGitTrace | undefined {
  if (sinks.length === 0) {
    return undefined
  }

  return (event) => {
    for (const sink of sinks) {
      try {
        sink(event)
      } catch {
        // Trace sinks are diagnostic only; they must not affect sync.
      }
    }
  }
}

export function createConsoleJournalGitTrace(
  output?: JournalGitTraceConsole,
): JournalGitTrace {
  const sink = createConsoleJournalGitTraceSink(output)

  return (event) => {
    try {
      sink(event)
    } catch {
      // Trace sinks are diagnostic only; they must not affect sync.
    }
  }
}

export function createConsoleJournalGitTraceSink(
  output: JournalGitTraceConsole = console,
): JournalGitTraceSink {
  return (event) => {
    output.info(formatJournalGitTraceEvent(event))
  }
}

export function formatJournalGitTraceEvent(event: JournalGitTraceEvent) {
  const details = event.details ? ` ${JSON.stringify(event.details)}` : ''
  const error = event.errorMessage ? ` error=${event.errorMessage}` : ''
  const status = event.ok ? 'ok' : 'error'

  return `[journal-sync] ${event.name} ${status} ${event.durationMs}ms${details}${error}`
}
