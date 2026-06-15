import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFileSystem = vi.hoisted(() => ({
  deleteAsync: vi.fn(),
  documentDirectory: 'file:///app/',
  getInfoAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  readDirectoryAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
}))

vi.mock('expo-file-system/legacy', () => mockFileSystem)

describe('mobile diagnostic log', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'))
    vi.clearAllMocks()

    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: false })
    mockFileSystem.makeDirectoryAsync.mockResolvedValue(undefined)
    mockFileSystem.readDirectoryAsync.mockResolvedValue([])
    mockFileSystem.writeAsStringAsync.mockResolvedValue(undefined)
    mockFileSystem.deleteAsync.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes JSONL diagnostic entries to the app documents log directory', async () => {
    const {
      flushMobileDiagnosticLogs,
      writeMobileDiagnosticLog,
    } = await import('./log')

    writeMobileDiagnosticLog('error', 'sync manual', 'Failed with ghp_12345678901234567890', {
      remoteUrl: 'https://github.com/example/repo.git?token=secret',
      token: 'github_pat_12345678901234567890',
    })
    await flushMobileDiagnosticLogs()

    expect(mockFileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
      'file:///app/journal-diagnostic-logs/',
      { intermediates: true },
    )
    expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///app/journal-diagnostic-logs/journal-mobile-2026-06-15.jsonl',
      expect.any(String),
      { append: true },
    )

    const contents = mockFileSystem.writeAsStringAsync.mock.calls[0][1]
    const entry = JSON.parse(contents.trim()) as {
      details: Record<string, unknown>
      message: string
      scope: string
    }

    expect(entry.scope).toBe('sync-manual')
    expect(entry.message).toBe('Failed with [redacted-token]')
    expect(entry.details.token).toBe('[redacted]')
    expect(entry.details.remoteUrl).toBe('https://github.com/example/repo.git?token=[redacted]')
  })

  it('rotates within the current day when the base log file is full', async () => {
    const {
      flushMobileDiagnosticLogs,
      writeMobileDiagnosticLog,
    } = await import('./log')

    mockFileSystem.getInfoAsync.mockImplementation(async (path: string) => ({
      exists: path.endsWith('journal-mobile-2026-06-15.jsonl'),
      size: 1024 * 1024,
    }))

    writeMobileDiagnosticLog('info', 'runtime', 'started')
    await flushMobileDiagnosticLogs()

    expect(mockFileSystem.writeAsStringAsync.mock.calls[0][0])
      .toBe('file:///app/journal-diagnostic-logs/journal-mobile-2026-06-15.1.jsonl')
  })

  it('prunes old diagnostic log files once per day', async () => {
    const {
      flushMobileDiagnosticLogs,
      writeMobileDiagnosticLog,
    } = await import('./log')

    mockFileSystem.readDirectoryAsync.mockResolvedValue([
      'journal-mobile-2026-05-01.jsonl',
      'journal-mobile-2026-06-15.jsonl',
      'notes.txt',
    ])

    writeMobileDiagnosticLog('info', 'runtime', 'started')
    await flushMobileDiagnosticLogs()

    expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(
      'file:///app/journal-diagnostic-logs/journal-mobile-2026-05-01.jsonl',
      { idempotent: true },
    )
    expect(mockFileSystem.deleteAsync).not.toHaveBeenCalledWith(
      'file:///app/journal-diagnostic-logs/journal-mobile-2026-06-15.jsonl',
      expect.anything(),
    )
  })
})
