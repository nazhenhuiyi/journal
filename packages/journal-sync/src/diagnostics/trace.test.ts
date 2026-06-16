import { describe, expect, it, vi } from 'vitest'
import {
  createConsoleJournalGitTrace,
  createConsoleJournalGitTraceSink,
  createJournalGitTrace,
  formatJournalGitTraceEvent,
} from './trace'

describe('journal git trace utilities', () => {
  it('formats trace events for console logs', () => {
    const formatted = formatJournalGitTraceEvent({
      details: {
        branch: 'main',
        changedPathCount: 2,
      },
      durationMs: 42,
      errorMessage: 'push rejected',
      name: 'remote.push',
      ok: false,
    })

    expect(formatted).toBe(
      '[journal-sync] remote.push error 42ms {"branch":"main","changedPathCount":2} error=push rejected',
    )
  })

  it('creates a composed trace sink that keeps sink failures diagnostic only', () => {
    const brokenSink = vi.fn(() => {
      throw new Error('sink failed')
    })
    const workingSink = vi.fn()
    const trace = createJournalGitTrace([brokenSink, workingSink])
    const event = {
      durationMs: 3,
      name: 'repo.exists',
      ok: true,
    }

    trace?.(event)

    expect(brokenSink).toHaveBeenCalledWith(event)
    expect(workingSink).toHaveBeenCalledWith(event)
  })

  it('returns no trace when no sinks are configured', () => {
    expect(createJournalGitTrace([])).toBeUndefined()
  })

  it('creates a console trace sink', () => {
    const output = { info: vi.fn() }

    createConsoleJournalGitTraceSink(output)({
      durationMs: 5,
      name: 'status.matrix',
      ok: true,
    })

    expect(output.info).toHaveBeenCalledWith('[journal-sync] status.matrix ok 5ms')
  })

  it('creates a console trace for the common runtime case', () => {
    const output = { info: vi.fn() }
    const trace = createConsoleJournalGitTrace(output)

    trace({
      durationMs: 8,
      name: 'remote.fetch',
      ok: true,
    })

    expect(output.info).toHaveBeenCalledWith('[journal-sync] remote.fetch ok 8ms')
  })
})
