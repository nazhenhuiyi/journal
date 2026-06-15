import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react'
import { motion } from 'motion/react'
import {
  AlertCircle,
  CheckCircle2,
  CloudSun,
  GitBranch,
  KeyRound,
  MapPin,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router'
import { parseJournalMarkdown, type DayFrontMatter } from '@journal/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { desktopSyncManager, type DesktopSyncManagerState } from '../services/sync/desktopSyncManager'
import { panelTransition } from './markdown-preview/constants'
import { getSyncStatusPresentation } from './syncStatusPresentation'

const storedTokenMask = '••••••••'
type JournalSettingsFile = Awaited<ReturnType<NonNullable<Window['journalSettings']>['load']>>
type JournalFile = Awaited<ReturnType<NonNullable<Window['journalStore']>['loadToday']>>
type BrowserLocationStatus = 'denied' | 'granted' | 'prompt' | 'unknown' | 'unavailable'

function SettingsPage() {
  const [browserLocationStatus, setBrowserLocationStatus] = useState<BrowserLocationStatus>('unknown')
  const [diagnosticFrontMatter, setDiagnosticFrontMatter] = useState<DayFrontMatter | null>(null)
  const [diagnosticJournalFile, setDiagnosticJournalFile] = useState<JournalFile | null>(null)
  const [diagnosticMessage, setDiagnosticMessage] = useState('')
  const [isRefreshingWeather, setIsRefreshingWeather] = useState(false)
  const [isRequestingLocation, setIsRequestingLocation] = useState(false)
  const [journalSettings, setJournalSettings] = useState<JournalSettingsFile | null>(null)
  const {
    branch: syncBranch,
    credentialMessage,
    credentialStatus,
    dirtyPaths,
    hasCredentials: hasStoredSyncToken,
    isLoadingSettings: isLoadingSyncSettings,
    isSavingSettings: isSavingSyncSettings,
    isSyncingNow,
    message: syncMessage,
    recentCommits,
    remoteUrl: syncRemoteUrl,
    snapshot: syncSnapshot,
    tokenDraft: syncTokenDraft,
  } = useSyncExternalStore(
    desktopSyncManager.subscribe,
    desktopSyncManager.getState,
    desktopSyncManager.getState,
  )
  const syncStatus = getSyncStatusPresentation(
    syncSnapshot,
    syncMessage,
    syncRemoteUrl,
    hasStoredSyncToken,
    {
      showConfigurationState: true,
    },
  )
  const SyncStatusIcon = syncStatus.icon
  const tokenHint = getTokenHint(credentialStatus, credentialMessage, hasStoredSyncToken)
  const disabled = isLoadingSyncSettings || isSavingSyncSettings || isSyncingNow
  const dirtyPathLabel = dirtyPaths.length === 1 ? dirtyPaths[0] : `${dirtyPaths.length} 个文件等待同步`

  useEffect(() => {
    void desktopSyncManager.refreshStatus()
  }, [])

  useEffect(() => {
    let isMounted = true

    void loadDesktopDiagnostics()
      .then((diagnostics) => {
        if (!isMounted) {
          return
        }

        setBrowserLocationStatus(diagnostics.locationStatus)
        setDiagnosticFrontMatter(diagnostics.frontMatter)
        setDiagnosticJournalFile(diagnostics.journalFile)
        setJournalSettings(diagnostics.settings)
      })
      .catch((error) => {
        if (isMounted) {
          setDiagnosticMessage(getErrorMessage(error))
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  async function handleRequestLocation() {
    setIsRequestingLocation(true)
    setDiagnosticMessage('')

    try {
      const result = await requestBrowserLocationDiagnostic()

      setBrowserLocationStatus(result.status)
      setDiagnosticMessage(result.message)
    } catch (error) {
      setBrowserLocationStatus('unknown')
      setDiagnosticMessage(getErrorMessage(error))
    } finally {
      setIsRequestingLocation(false)
    }
  }

  async function handleRefreshWeather() {
    const journalStore = getJournalStore()

    if (!journalStore?.refreshTodayWeather) {
      setDiagnosticMessage('当前环境还不能获取天气。')
      return
    }

    setIsRefreshingWeather(true)
    setDiagnosticMessage('')

    try {
      const location = await resolveBrowserLocationForWeather()
      const refreshedFile = await journalStore.refreshTodayWeather(location)
      const refreshedFrontMatter = parseJournalMarkdown(refreshedFile.content).frontMatter

      setDiagnosticJournalFile(refreshedFile)
      setDiagnosticFrontMatter(refreshedFrontMatter)
      setDiagnosticMessage(refreshedFrontMatter.weather?.text ? '天气已更新' : '天气未获取')
    } catch (error) {
      setDiagnosticMessage(getErrorMessage(error))
    } finally {
      setIsRefreshingWeather(false)
    }
  }

  return (
    <>
      <motion.header
        animate={{ opacity: 1, y: 0 }}
        className="journal-topbar settings-topbar"
        initial={{ opacity: 0, y: -8 }}
        transition={{ ...panelTransition, delay: 0.05 }}
      >
        <div>
          <span>偏好</span>
          <h1>设置</h1>
        </div>
        <Button asChild className="settings-return-link" size="lg" variant="outline">
          <Link to="/preview">回到书写</Link>
        </Button>
      </motion.header>

      <main className="settings-stage">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          aria-label="同步设置"
          className="settings-sync-panel"
          initial={{ opacity: 0, y: 10 }}
          transition={{ ...panelTransition, delay: 0.08 }}
        >
          <section className="settings-section">
            <h2 className="settings-section-title">状态</h2>
            <div className="settings-list-group">
              <SettingsListRow
                icon={<SyncStatusIcon size={17} strokeWidth={2.2} />}
                label="远端同步"
                tone={syncStatus.tone}
                value={syncStatus.label}
              />
              <SettingsListRow label="最近同步" value={formatLastSyncedAt(syncSnapshot.lastSyncedAt)} />
              <SettingsListRow label="待处理" value={formatPendingReason(syncSnapshot.pendingReason)} />
              {dirtyPaths.length > 0 ? (
                <SettingsMessageRow title={dirtyPaths.join('\n')}>
                  未提交文件：{dirtyPathLabel}
                </SettingsMessageRow>
              ) : null}
              {syncSnapshot.lastError ? (
                <SettingsMessageRow danger title={syncSnapshot.lastError}>
                  {syncSnapshot.lastError}
                </SettingsMessageRow>
              ) : null}
            </div>
            <p className="settings-status-detail">{syncStatus.detail}</p>
          </section>

          <section className="settings-section">
            <h2 className="settings-section-title">最近 commit</h2>
            <div className="settings-list-group">
              {recentCommits.length > 0 ? (
                recentCommits.map((commit) => (
                  <CommitRow commit={commit} key={commit.oid} />
                ))
              ) : (
                <SettingsMessageRow>还没有本地 commit。</SettingsMessageRow>
              )}
            </div>
          </section>

          <section className="settings-section">
            <h2 className="settings-section-title">诊断</h2>
            <div className="settings-list-group">
              <SettingsListRow label="定位权限" value={formatBrowserLocationStatus(browserLocationStatus)} />
              <SettingsListRow label="天气地点" value={journalSettings?.weatherLocation || '自动定位'} />
              <SettingsListRow label="今日地点" value={formatLocationLabel(diagnosticFrontMatter?.location)} />
              <SettingsListRow label="天气" value={formatWeatherLabel(diagnosticFrontMatter?.weather)} />
              <SettingsListRow label="天气时间" value={formatDiagnosticTime(diagnosticFrontMatter?.weather?.updatedAt)} />
              <SettingsListRow label="日记目录" value={journalSettings?.workingDirectory ?? '不可用'} />
              <SettingsListRow label="今日文件" value={diagnosticJournalFile?.filePath ?? '不可用'} />
              <SettingsListRow label="设置文件" value={journalSettings?.settingsPath ?? '不可用'} />
            </div>
            <div className="settings-actions">
              <Button
                className="settings-secondary-button"
                disabled={isRequestingLocation}
                onClick={() => void handleRequestLocation()}
                size="lg"
                type="button"
                variant="outline"
              >
                <MapPin aria-hidden="true" size={16} strokeWidth={2.15} />
                {isRequestingLocation ? '获取中' : '获取定位'}
              </Button>
              <Button
                className="settings-secondary-button"
                disabled={isRefreshingWeather}
                onClick={() => void handleRefreshWeather()}
                size="lg"
                type="button"
                variant="outline"
              >
                <CloudSun aria-hidden="true" size={16} strokeWidth={2.15} />
                {isRefreshingWeather ? '获取中' : '获取天气'}
              </Button>
            </div>
            {diagnosticMessage ? (
              <SettingsMessageRow>{diagnosticMessage}</SettingsMessageRow>
            ) : null}
          </section>

          <form
            className="settings-form settings-section"
            onSubmit={(event) => {
              event.preventDefault()
              void desktopSyncManager.saveConfiguration({ showSuccessMessage: true })
            }}
          >
            <h2 className="settings-section-title">配置</h2>
            <Label className="settings-field settings-field-wide">
              <span>仓库地址</span>
              <Input
                className="settings-input"
                disabled={disabled}
                onChange={(event) => desktopSyncManager.setSyncRemoteUrl(event.target.value)}
                placeholder="https://github.com/you/journal-sync.git"
                value={syncRemoteUrl}
              />
            </Label>

            <Label className="settings-field">
              <span>分支</span>
              <span className="settings-input-with-icon">
                <GitBranch aria-hidden="true" size={16} strokeWidth={2.15} />
                <Input
                  className="settings-input-inner"
                  disabled={disabled}
                  onChange={(event) => desktopSyncManager.setSyncBranch(event.target.value)}
                  placeholder="main"
                  value={syncBranch}
                />
              </span>
            </Label>

            <Label className="settings-field settings-field-wide">
              <span>GitHub Token</span>
              <span className="settings-input-with-icon">
                <KeyRound aria-hidden="true" size={16} strokeWidth={2.15} />
                <Input
                  className="settings-input-inner"
                  disabled={disabled}
                  onChange={(event) => desktopSyncManager.setSyncTokenDraft(event.target.value)}
                  placeholder={hasStoredSyncToken ? storedTokenMask : 'ghp_...'}
                  type="password"
                  value={syncTokenDraft}
                />
              </span>
            </Label>

            <p className="settings-token-hint">
              {hasStoredSyncToken ? (
                <ShieldCheck aria-hidden="true" size={15} strokeWidth={2.2} />
              ) : (
                <AlertCircle aria-hidden="true" size={15} strokeWidth={2.2} />
              )}
              <span>{tokenHint}</span>
            </p>

            {syncSnapshot.lastError ? (
              <p className="settings-sync-error" title={syncSnapshot.lastError}>
                <AlertCircle aria-hidden="true" size={15} strokeWidth={2.2} />
                <span>{syncSnapshot.lastError}</span>
              </p>
            ) : null}

            <div className="settings-actions">
              <Button className="settings-secondary-button" disabled={disabled} size="lg" type="submit" variant="outline">
                <Save aria-hidden="true" size={16} strokeWidth={2.15} />
                {isSavingSyncSettings ? '保存中' : '保存配置'}
              </Button>
              <Button
                className="settings-primary-button"
                disabled={disabled}
                onClick={() => void desktopSyncManager.syncNow()}
                size="lg"
                type="button"
                variant="default"
              >
                {isSyncingNow ? (
                  <Settings2 aria-hidden="true" size={16} strokeWidth={2.15} />
                ) : (
                  <RefreshCw aria-hidden="true" size={16} strokeWidth={2.15} />
                )}
                {isSyncingNow ? '同步中' : '立即同步'}
              </Button>
            </div>

            {syncMessage && !syncSnapshot.lastError && syncStatus.tone === 'success' ? (
              <p className="settings-success-message">
                <CheckCircle2 aria-hidden="true" size={15} strokeWidth={2.2} />
                <span>{syncMessage}</span>
              </p>
            ) : null}
          </form>
        </motion.section>
      </main>
    </>
  )
}

function SettingsListRow({
  icon,
  label,
  tone,
  value,
}: {
  icon?: ReactNode
  label: string
  tone?: string
  value: string
}) {
  const isPathLikeValue = value.length > 36 && /[/\\]/.test(value)
  const valueClassName = [
    'settings-list-value',
    tone ? `is-${tone}` : '',
    isPathLikeValue ? 'is-path' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="settings-list-row">
      <span className="settings-list-label">{label}</span>
      <span className={valueClassName} title={value}>
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        {value}
      </span>
    </div>
  )
}

async function loadDesktopDiagnostics() {
  const [settings, journalFile, locationStatus] = await Promise.all([
    getJournalSettingsStore()?.load() ?? Promise.resolve(null),
    getJournalStore()?.loadToday() ?? Promise.resolve(null),
    getBrowserLocationPermissionStatus(),
  ])

  return {
    frontMatter: journalFile ? parseJournalMarkdown(journalFile.content).frontMatter : null,
    journalFile,
    locationStatus,
    settings,
  }
}

function getJournalSettingsStore() {
  return typeof window === 'undefined' ? undefined : window.journalSettings
}

function getJournalStore() {
  return typeof window === 'undefined' ? undefined : window.journalStore
}

async function getBrowserLocationPermissionStatus(): Promise<BrowserLocationStatus> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return 'unavailable'
  }

  if (!navigator.permissions?.query) {
    return 'unknown'
  }

  try {
    const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName })

    return result.state
  } catch {
    return 'unknown'
  }
}

function requestBrowserLocationDiagnostic(): Promise<{ message: string; status: BrowserLocationStatus }> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({
      message: '当前环境没有定位能力。',
      status: 'unavailable',
    })
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => {
        resolve({
          message: '定位可用：已获取当前位置',
          status: 'granted',
        })
      },
      (error) => {
        resolve({
          message: error.message || '定位不可用。',
          status: error.code === error.PERMISSION_DENIED ? 'denied' : 'unknown',
        })
      },
      {
        enableHighAccuracy: false,
        maximumAge: 1000 * 60 * 10,
        timeout: 5000,
      },
    )
  })
}

async function resolveBrowserLocationForWeather() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return undefined
  }

  return new Promise<{ latitude: number; longitude: number } | undefined>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      () => resolve(undefined),
      {
        enableHighAccuracy: false,
        maximumAge: 1000 * 60 * 10,
        timeout: 5000,
      },
    )
  })
}

function SettingsMessageRow({
  children,
  danger = false,
  title,
}: {
  children: ReactNode
  danger?: boolean
  title?: string
}) {
  return (
    <p className={danger ? 'settings-message-row is-danger' : 'settings-message-row'} title={title}>
      {children}
    </p>
  )
}

function CommitRow({
  commit,
}: {
  commit: DesktopSyncManagerState['recentCommits'][number]
}) {
  return (
    <div className="settings-commit-row">
      <div className="settings-commit-summary">
        <code title={commit.oid}>{commit.shortOid}</code>
        <span>{commit.message}</span>
      </div>
      <time dateTime={commit.committedAt ?? undefined}>{formatCommitTime(commit.committedAt)}</time>
    </div>
  )
}

function getTokenHint(
  credentialStatus: DesktopSyncManagerState['credentialStatus'],
  credentialMessage: string,
  hasStoredSyncToken: boolean,
) {
  if (credentialStatus === 'corrupt' || credentialStatus === 'encryption-unavailable') {
    return credentialMessage || getCredentialStatusLabel(credentialStatus)
  }

  if (hasStoredSyncToken) {
    return 'Token 已保存，粘贴新的 token 会替换。'
  }

  return '保存 Token 后才能访问私有仓库。'
}

function getCredentialStatusLabel(status: DesktopSyncManagerState['credentialStatus']) {
  if (status === 'corrupt') {
    return 'GitHub token 无法读取，请重新保存。'
  }

  if (status === 'encryption-unavailable') {
    return '系统加密存储不可用，无法读取 GitHub token。'
  }

  return '请先保存 GitHub token。'
}

function formatBrowserLocationStatus(status: BrowserLocationStatus) {
  const statusLabels: Record<BrowserLocationStatus, string> = {
    denied: '已拒绝',
    granted: '已允许',
    prompt: '未询问',
    unavailable: '不可用',
    unknown: '未知',
  }

  return statusLabels[status]
}

function formatLocationLabel(location: DayFrontMatter['location'] | undefined) {
  if (location?.query) {
    return location.query
  }

  const locationLabel = [location?.name, location?.region, location?.country].filter(Boolean).join(' · ')

  return locationLabel || '未记录'
}

function formatWeatherLabel(weather: DayFrontMatter['weather'] | undefined) {
  if (!weather?.text) {
    return '未获取'
  }

  return [
    weather.text,
    typeof weather.temperature === 'number' ? `${Math.round(weather.temperature)}°C` : '',
  ].filter(Boolean).join(' ')
}

function formatDiagnosticTime(value: string | undefined) {
  return formatCommitTime(value ?? null)
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '诊断失败'
}

function formatLastSyncedAt(value: string | null) {
  if (!value) {
    return '还没有同步'
  }

  return formatCommitTime(value)
}

function formatPendingReason(value: DesktopSyncManagerState['snapshot']['pendingReason']) {
  if (!value) {
    return '无'
  }

  if (value === 'local-save') {
    return '本地保存'
  }

  if (value === 'remote-check') {
    return '远端检查'
  }

  if (value === 'retry') {
    return '等待重试'
  }

  return value
}

function formatCommitTime(value: string | null) {
  if (!value) {
    return '时间未知'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  })
}

export default SettingsPage
