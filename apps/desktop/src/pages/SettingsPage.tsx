import { useEffect, useMemo, useSyncExternalStore } from 'react'
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
import { desktopSyncManager, type DesktopSyncManagerState } from '../services/sync/desktopSyncManager'
import { panelTransition } from './markdown-preview/constants'
import { getSyncStatusPresentation } from './syncStatusPresentation'

function SettingsPage() {
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
  const dirtyPathLabel = useMemo(() => {
    if (dirtyPaths.length === 0) {
      return ''
    }

    return dirtyPaths.length === 1 ? dirtyPaths[0] : `${dirtyPaths.length} 个文件等待同步`
  }, [dirtyPaths])

  useEffect(() => {
    void desktopSyncManager.refreshStatus()
  }, [])

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
              void desktopSyncManager.saveConfiguration({ showSuccessMessage: true })
            }}
          >
            <label className="settings-field settings-field-wide">
              <span>仓库地址</span>
              <input
                disabled={disabled}
                onChange={(event) => desktopSyncManager.setSyncRemoteUrl(event.target.value)}
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
                  onChange={(event) => desktopSyncManager.setSyncBranch(event.target.value)}
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
                  onChange={(event) => desktopSyncManager.setSyncTokenDraft(event.target.value)}
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
                onClick={() => void desktopSyncManager.syncNow()}
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

function getTokenHint(
  credentialStatus: DesktopSyncManagerState['credentialStatus'],
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

function getCredentialStatusLabel(status: DesktopSyncManagerState['credentialStatus']) {
  if (status === 'corrupt') {
    return 'GitHub token 无法读取，请重新保存。'
  }

  if (status === 'encryption-unavailable') {
    return '系统加密存储不可用，无法读取 GitHub token。'
  }

  return '请先保存 GitHub token。'
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
