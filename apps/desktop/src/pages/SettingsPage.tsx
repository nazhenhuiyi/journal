import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  AlertCircle,
  CheckCircle2,
  GitBranch,
  KeyRound,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router'
import type { SyncSnapshot } from '@journal/sync/scheduler'
import { panelTransition } from './markdown-preview/constants'
import { getSyncStatusPresentation } from './syncStatusPresentation'

type JournalSyncStore = NonNullable<Window['journalSync']>
type JournalSyncStatus = Awaited<ReturnType<JournalSyncStore['loadStatus']>>

const initialSyncSnapshot: SyncSnapshot = {
  lastError: null,
  lastSyncedAt: null,
  pendingReason: null,
  status: 'idle',
}

function getJournalSyncStore() {
  return typeof window === 'undefined' ? undefined : window.journalSync
}

function SettingsPage() {
  const [dirtyPaths, setDirtyPaths] = useState<string[]>([])
  const [credentialMessage, setCredentialMessage] = useState('')
  const [credentialStatus, setCredentialStatus] = useState<JournalSyncStatus['credentialStatus']>('missing')
  const [hasStoredSyncToken, setHasStoredSyncToken] = useState(false)
  const [isLoadingSyncSettings, setIsLoadingSyncSettings] = useState(true)
  const [isSavingSyncSettings, setIsSavingSyncSettings] = useState(false)
  const [isSyncingNow, setIsSyncingNow] = useState(false)
  const [recentCommits, setRecentCommits] = useState<JournalSyncStatus['recentCommits']>([])
  const [syncBranch, setSyncBranch] = useState('main')
  const [syncMessage, setSyncMessage] = useState('')
  const [syncRemoteUrl, setSyncRemoteUrl] = useState('')
  const [syncSnapshot, setSyncSnapshot] = useState<SyncSnapshot>(initialSyncSnapshot)
  const [syncTokenDraft, setSyncTokenDraft] = useState('')
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
  const dirtyPathLabel = useMemo(() => {
    if (dirtyPaths.length === 0) {
      return ''
    }

    return dirtyPaths.length === 1 ? dirtyPaths[0] : `${dirtyPaths.length} 个文件等待同步`
  }, [dirtyPaths])

  useEffect(() => {
    let isCancelled = false

    async function loadSyncStatus() {
      const journalSync = getJournalSyncStore()

      if (!journalSync) {
        setSyncSnapshot({
          ...initialSyncSnapshot,
          lastError: '当前环境还不能同步。',
          status: 'error',
        })
        setSyncMessage('当前环境还不能同步')
        setIsLoadingSyncSettings(false)
        return
      }

      try {
        const status = await journalSync.loadStatus()

        if (!isCancelled) {
          applySyncStatus(status)
        }
      } catch (error) {
        if (!isCancelled) {
          setSyncSnapshot({
            ...initialSyncSnapshot,
            lastError: getErrorMessage(error),
            status: 'error',
          })
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingSyncSettings(false)
        }
      }
    }

    void loadSyncStatus()

    return () => {
      isCancelled = true
    }
  }, [])

  function applySyncStatus(status: JournalSyncStatus) {
    setCredentialMessage(status.credentialMessage ?? '')
    setCredentialStatus(status.credentialStatus)
    setDirtyPaths(status.dirtyPaths)
    setHasStoredSyncToken(status.hasCredentials)
    setRecentCommits(status.recentCommits)
    setSyncBranch(status.branch)
    setSyncRemoteUrl(status.remoteUrl)
    setSyncSnapshot(createSyncSnapshotFromStatus(status))
  }

  async function saveSyncSettings(options: { showSuccessMessage?: boolean } = {}) {
    const journalSync = getJournalSyncStore()

    if (!journalSync) {
      setSyncSnapshot({
        ...initialSyncSnapshot,
        lastError: '当前环境还不能同步。',
        status: 'error',
      })
      setSyncMessage('当前环境还不能同步')
      return null
    }

    setIsSavingSyncSettings(true)
    setSyncMessage('')

    try {
      const status = await journalSync.saveSettings({
        syncBranch: syncBranch.trim() || 'main',
        syncRemoteUrl: syncRemoteUrl.trim(),
        syncToken: syncTokenDraft.trim(),
      })

      applySyncStatus(status)
      setSyncTokenDraft('')

      if (options.showSuccessMessage ?? true) {
        setSyncMessage('同步配置已保存')
      }

      return status
    } catch (error) {
      setSyncSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        lastError: getErrorMessage(error),
        status: 'error',
      }))
      setSyncMessage('同步配置保存失败')
      return null
    } finally {
      setIsSavingSyncSettings(false)
    }
  }

  async function handleSaveSyncSettings() {
    await saveSyncSettings({ showSuccessMessage: true })
  }

  async function handleSyncNow() {
    const journalSync = getJournalSyncStore()

    if (!journalSync) {
      setSyncSnapshot({
        ...initialSyncSnapshot,
        lastError: '当前环境还不能同步。',
        status: 'error',
      })
      setSyncMessage('当前环境还不能同步')
      return
    }

    setIsSyncingNow(true)
    setSyncMessage('')

    try {
      const savedStatus = await saveSyncSettings({ showSuccessMessage: false })

      if (!savedStatus) {
        return
      }

      if (!savedStatus.remoteUrl.trim()) {
        setSyncSnapshot({
          ...initialSyncSnapshot,
          status: 'needs-auth',
        })
        setSyncMessage('请先填写仓库地址')
        return
      }

      if (
        savedStatus.credentialStatus === 'corrupt' ||
        savedStatus.credentialStatus === 'encryption-unavailable'
      ) {
        setSyncSnapshot(createSyncSnapshotFromStatus(savedStatus))
        setSyncMessage(savedStatus.credentialMessage ?? getCredentialStatusLabel(savedStatus.credentialStatus))
        return
      }

      if (!savedStatus.hasCredentials) {
        setSyncSnapshot({
          ...initialSyncSnapshot,
          status: 'needs-auth',
        })
        setSyncMessage('请先保存 GitHub token')
        return
      }

      setSyncSnapshot({
        ...initialSyncSnapshot,
        status: 'syncing',
      })

      const result = await journalSync.syncNow()
      const refreshedStatus = await journalSync.loadStatus()

      applySyncStatus(refreshedStatus)
      setSyncMessage(result.changed ? '同步完成' : '已经是最新')
      setSyncSnapshot(refreshedStatus.dirtyPaths.length > 0
        ? createSyncSnapshotFromStatus(refreshedStatus)
        : {
            ...initialSyncSnapshot,
            lastSyncedAt: new Date().toISOString(),
            status: 'synced',
          })
    } catch (error) {
      setSyncSnapshot({
        ...initialSyncSnapshot,
        lastError: getErrorMessage(error),
        status: 'error',
      })
      setSyncMessage('同步失败')
    } finally {
      setIsSyncingNow(false)
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
        <Link className="settings-return-link" to="/preview">
          回到书写
        </Link>
      </motion.header>

      <main className="settings-stage">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          aria-label="同步设置"
          className="settings-sync-panel"
          initial={{ opacity: 0, y: 10 }}
          transition={{ ...panelTransition, delay: 0.08 }}
        >
          <div className="settings-section-heading">
            <div className={`settings-sync-status is-${syncStatus.tone}`}>
              <span aria-hidden="true">
                <SyncStatusIcon size={20} strokeWidth={2.2} />
              </span>
              <div>
                <small>Git 同步</small>
                <strong>{syncStatus.label}</strong>
                <p>{syncStatus.detail}</p>
              </div>
            </div>
            {dirtyPathLabel ? (
              <p className="settings-dirty-path" title={dirtyPaths.join('\n')}>
                {dirtyPathLabel}
              </p>
            ) : null}
          </div>

          <div className="settings-git-inspector" aria-label="Git 状态">
            <section className="settings-git-section">
              <h2>最近 commit</h2>
              {recentCommits.length > 0 ? (
                <ol className="settings-git-list">
                  {recentCommits.map((commit) => (
                    <li className="settings-commit-row" key={commit.oid}>
                      <span className="settings-commit-meta">
                        <code title={commit.oid}>{commit.shortOid}</code>
                        <time dateTime={commit.committedAt ?? undefined}>
                          {formatCommitTime(commit.committedAt)}
                        </time>
                      </span>
                      <span className="settings-commit-message">{commit.message}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="settings-empty-note">还没有本地 commit。</p>
              )}
            </section>

            <section className="settings-git-section">
              <h2>未提交文件</h2>
              {dirtyPaths.length > 0 ? (
                <ul className="settings-git-list settings-file-list">
                  {dirtyPaths.map((filepath) => (
                    <li key={filepath}>
                      <code>{filepath}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="settings-empty-note">没有未提交文件。</p>
              )}
            </section>
          </div>

          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSaveSyncSettings()
            }}
          >
            <label className="settings-field settings-field-wide">
              <span>仓库地址</span>
              <input
                disabled={disabled}
                onChange={(event) => setSyncRemoteUrl(event.target.value)}
                placeholder="https://github.com/you/journal-sync.git"
                value={syncRemoteUrl}
              />
            </label>

            <label className="settings-field">
              <span>分支</span>
              <span className="settings-input-with-icon">
                <GitBranch aria-hidden="true" size={16} strokeWidth={2.15} />
                <input
                  disabled={disabled}
                  onChange={(event) => setSyncBranch(event.target.value)}
                  placeholder="main"
                  value={syncBranch}
                />
              </span>
            </label>

            <label className="settings-field settings-field-wide">
              <span>GitHub Token</span>
              <span className="settings-input-with-icon">
                <KeyRound aria-hidden="true" size={16} strokeWidth={2.15} />
                <input
                  disabled={disabled}
                  onChange={(event) => setSyncTokenDraft(event.target.value)}
                  placeholder={hasStoredSyncToken ? '已保存，留空不改' : 'ghp_...'}
                  type="password"
                  value={syncTokenDraft}
                />
              </span>
            </label>

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
              <button className="settings-secondary-button" disabled={disabled} type="submit">
                <Save aria-hidden="true" size={16} strokeWidth={2.15} />
                {isSavingSyncSettings ? '保存中' : '保存配置'}
              </button>
              <button
                className="settings-primary-button"
                disabled={disabled}
                onClick={() => void handleSyncNow()}
                type="button"
              >
                {isSyncingNow ? (
                  <Settings2 aria-hidden="true" size={16} strokeWidth={2.15} />
                ) : (
                  <RefreshCw aria-hidden="true" size={16} strokeWidth={2.15} />
                )}
                {isSyncingNow ? '同步中' : '立即同步'}
              </button>
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

function createSyncSnapshotFromStatus(status: JournalSyncStatus): SyncSnapshot {
  if (status.credentialStatus === 'corrupt' || status.credentialStatus === 'encryption-unavailable') {
    return {
      ...initialSyncSnapshot,
      lastError: status.credentialMessage ?? getCredentialStatusLabel(status.credentialStatus),
      status: 'error',
    }
  }

  if (status.dirtyPaths.length > 0) {
    return {
      ...initialSyncSnapshot,
      pendingReason: 'local-save',
      status: 'pending',
    }
  }

  return initialSyncSnapshot
}

function getTokenHint(
  credentialStatus: JournalSyncStatus['credentialStatus'],
  credentialMessage: string,
  hasStoredSyncToken: boolean,
) {
  if (credentialStatus === 'corrupt' || credentialStatus === 'encryption-unavailable') {
    return credentialMessage || getCredentialStatusLabel(credentialStatus)
  }

  if (hasStoredSyncToken) {
    return 'Token 已保存，留空会继续使用原来的凭据。'
  }

  return '保存 Token 后才能访问私有仓库。'
}

function getCredentialStatusLabel(status: JournalSyncStatus['credentialStatus']) {
  if (status === 'corrupt') {
    return 'GitHub token 无法读取，请重新保存。'
  }

  if (status === 'encryption-unavailable') {
    return '系统加密存储不可用，无法读取 GitHub token。'
  }

  return '请先保存 GitHub token。'
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '同步过程中出现未知错误。'
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
