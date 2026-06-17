import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HashRouter } from 'react-router'
import SettingsPage from './SettingsPage'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SettingsPage diagnostics', () => {
  it('shows location, weather, and data path diagnostics', async () => {
    const permissionsQuery = vi.fn().mockResolvedValue({ state: 'prompt' })

    stubNavigator({
      geolocation: createGeolocationMock(),
      permissions: { query: permissionsQuery },
    })
    stubDesktopStores()

    renderSettingsPage()

    expect(await screen.findByText('/Users/zilin/.journal')).toBeInTheDocument()
    expect(screen.getByText('/Users/zilin/.journal/settings.json')).toBeInTheDocument()
    expect(screen.getByText('/Users/zilin/.journal/entries/2026/06/2026-06-08.md')).toBeInTheDocument()
    expect(screen.getByText('成都 · 四川 · 中国')).toBeInTheDocument()
    expect(screen.getByText('多云 24°C')).toBeInTheDocument()
    expect(screen.getByText('未询问')).toBeInTheDocument()
    expect(permissionsQuery).toHaveBeenCalledWith({ name: 'geolocation' })
  })

  it('runs manual location and weather diagnostics without rendering coordinates', async () => {
    const geolocation = createGeolocationMock()
    const refreshTodayWeather = vi.fn().mockResolvedValue({
      content: [
        '---',
        'date: 2026-06-08',
        'weather:',
        '  text: 晴',
        '  temperature: 26',
        '  updatedAt: 2026-06-08T10:00:00.000Z',
        'location:',
        '  name: 成都',
        '  region: 四川',
        '  country: 中国',
        '---',
        '',
        '今天写一点。',
      ].join('\n'),
      date: '2026-06-08',
      didWrite: true,
      fileName: '2026-06-08.md',
      filePath: '/Users/zilin/.journal/entries/2026/06/2026-06-08.md',
      updatedAt: '2026-06-08T10:00:00.000Z',
    })

    stubNavigator({
      geolocation,
      permissions: { query: vi.fn().mockResolvedValue({ state: 'granted' }) },
    })
    stubDesktopStores({ refreshTodayWeather })

    renderSettingsPage()

    await screen.findByText('已允许')
    fireEvent.click(screen.getByRole('button', { name: '获取定位' }))

    expect(await screen.findByText('定位可用：已获取当前位置')).toBeInTheDocument()
    expect(screen.queryByText(/30\.67/)).not.toBeInTheDocument()
    expect(screen.queryByText(/104\.07/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '获取天气' }))

    await waitFor(() => {
      expect(refreshTodayWeather).toHaveBeenCalledWith({
        latitude: 30.67,
        longitude: 104.07,
      })
    })
    expect(await screen.findByText('天气已更新')).toBeInTheDocument()
    expect(screen.getByText('晴 26°C')).toBeInTheDocument()
    expect(screen.queryByText(/30\.67/)).not.toBeInTheDocument()
    expect(screen.queryByText(/104\.07/)).not.toBeInTheDocument()
  })

  it('shows content conflict actions and confirms keeping local content', async () => {
    type DesktopSaveState = NonNullable<Window['journalSync']>['saveState']
    type DesktopSaveStateResult = Awaited<ReturnType<DesktopSaveState>>

    let finishSaveState: () => void = () => {
      throw new Error('saveState was not called.')
    }
    const resolveConflict = vi.fn().mockResolvedValue({
      changed: true,
      dirtyPaths: [],
      message: 'Conflict resolved with local content',
    })
    const saveState = vi.fn<DesktopSaveState>(() =>
      new Promise<DesktopSaveStateResult>((resolve) => {
        finishSaveState = () => resolve(null)
      }))

    vi.stubGlobal('confirm', vi.fn(() => true))
    stubNavigator({
      geolocation: createGeolocationMock(),
      permissions: { query: vi.fn().mockResolvedValue({ state: 'prompt' }) },
    })
    stubDesktopStores({
      resolveConflict,
      saveState,
      syncRemoteUrl: 'https://github.com/example/journal-sync.git',
      syncSnapshot: {
        block: {
          conflicts: [{
            ours: '本机片段',
            path: 'entries/2026/06/2026-06-08.md',
            theirs: '远端片段',
          }],
          message: '日记内容存在需要人工处理的合并冲突。',
          paths: ['entries/2026/06/2026-06-08.md'],
          reason: 'content-conflict',
        },
        lastError: '日记内容存在需要人工处理的合并冲突。',
        lastSyncedAt: null,
        pendingReason: null,
        status: 'blocked',
      },
    })
    const journalSync = window.journalSync!

    renderSettingsPage()

    expect(await screen.findByText('内容有冲突')).toBeInTheDocument()
    expect(screen.getByText('本机片段')).toBeInTheDocument()
    expect(screen.getByText('远端片段')).toBeInTheDocument()
    expect(screen.getByText('entries/2026/06/2026-06-08.md')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '两者都保留' })).toBeInTheDocument()
    expect(screen.queryByText('日记内容存在需要人工处理的合并冲突。')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '保留本机' }))

    await waitFor(() => {
      expect(resolveConflict).toHaveBeenCalledWith('keep-local')
    })
    await waitFor(() => {
      expect(saveState).toHaveBeenCalled()
    })
    expect(journalSync.loadStatus).toHaveBeenCalledTimes(1)

    finishSaveState()

    await waitFor(() => {
      expect(journalSync.loadStatus).toHaveBeenCalledTimes(2)
    })
  })
})

function renderSettingsPage() {
  render(
    <HashRouter>
      <SettingsPage />
    </HashRouter>,
  )
}

function stubDesktopStores(options: {
  refreshTodayWeather?: NonNullable<Window['journalStore']>['refreshTodayWeather']
  resolveConflict?: NonNullable<Window['journalSync']>['resolveConflict']
  saveState?: NonNullable<Window['journalSync']>['saveState']
  syncRemoteUrl?: string
  syncSnapshot?: import('@journal/sync').SyncSnapshot | null
} = {}) {
  vi.stubGlobal('journalSettings', {
    load: vi.fn().mockResolvedValue({
      settingsPath: '/Users/zilin/.journal/settings.json',
      settingsStatus: 'ready',
      syncBranch: 'main',
      syncRemoteUrl: options.syncRemoteUrl ?? '',
      version: 1,
      weatherLocation: '',
      workingDirectory: '/Users/zilin/.journal',
    }),
    save: vi.fn(),
  } satisfies Window['journalSettings'])
  vi.stubGlobal('journalStore', {
    importImages: vi.fn(),
    listEntries: vi.fn(),
    loadDate: vi.fn(),
    loadToday: vi.fn().mockResolvedValue({
      content: [
        '---',
        'date: 2026-06-08',
        'weather:',
        '  text: 多云',
        '  temperature: 24',
        '  updatedAt: 2026-06-08T09:00:00.000Z',
        'location:',
        '  name: 成都',
        '  region: 四川',
        '  country: 中国',
        '---',
        '',
        '今天写一点。',
      ].join('\n'),
      date: '2026-06-08',
      didWrite: false,
      fileName: '2026-06-08.md',
      filePath: '/Users/zilin/.journal/entries/2026/06/2026-06-08.md',
      updatedAt: '2026-06-08T09:00:00.000Z',
    }),
    readAnnotations: vi.fn(),
    refreshTodayWeather: options.refreshTodayWeather ?? vi.fn(),
    saveAnnotations: vi.fn(),
    saveDate: vi.fn(),
    saveToday: vi.fn(),
  } satisfies Window['journalStore'])
  vi.stubGlobal('journalSync', {
    loadStatus: vi.fn().mockResolvedValue({
      branch: 'main',
      credentialStatus: 'missing',
      dirtyPaths: [],
      hasCredentials: Boolean(options.syncRemoteUrl),
      hasRepository: false,
      recentCommits: [],
      remoteUrl: options.syncRemoteUrl ?? '',
      syncSnapshot: options.syncSnapshot ?? null,
    }),
    pull: vi.fn(),
    push: vi.fn(),
    saveState: options.saveState ?? vi.fn(),
    saveSettings: vi.fn(),
    syncNow: vi.fn(),
    resolveConflict: options.resolveConflict ?? vi.fn(),
  } satisfies Window['journalSync'])
}

function stubNavigator({
  geolocation,
  permissions,
}: {
  geolocation: Pick<Geolocation, 'getCurrentPosition'>
  permissions: Pick<Permissions, 'query'>
}) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: geolocation,
  })
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: permissions,
  })
}

function createGeolocationMock() {
  return {
    getCurrentPosition: vi.fn((success: PositionCallback) => {
      success({
        coords: {
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          latitude: 30.67,
          longitude: 104.07,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      })
    }),
  }
}
