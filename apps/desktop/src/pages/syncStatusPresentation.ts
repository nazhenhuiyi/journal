import type { LucideIcon } from 'lucide-react'
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  CloudSync,
  KeyRound,
} from 'lucide-react'
import type { SyncSnapshot } from '@journal/sync/scheduler'

export type SyncStatusTone = 'idle' | 'ready' | 'success' | 'pending' | 'active' | 'warning' | 'danger'

export type SyncStatusPresentation = {
  detail: string
  icon: LucideIcon
  label: string
  tone: SyncStatusTone
}

export function getSyncStatusPresentation(
  syncSnapshot: SyncSnapshot,
  syncMessage: string,
  remoteUrl: string,
  hasStoredToken: boolean,
): SyncStatusPresentation {
  if (syncMessage) {
    const isDanger = syncSnapshot.status === 'error'
    const isWarning = syncSnapshot.status === 'needs-auth' || syncSnapshot.status === 'retrying'

    return {
      detail: syncSnapshot.lastError ?? (isWarning ? '完成同步配置后继续。' : '最近一次同步操作已更新状态。'),
      icon: isDanger ? AlertCircle : isWarning ? KeyRound : CheckCircle2,
      label: syncMessage,
      tone: isDanger ? 'danger' : isWarning ? 'warning' : 'success',
    }
  }

  if (!remoteUrl.trim()) {
    return {
      detail: '添加 GitHub 仓库地址后开始同步。',
      icon: CloudOff,
      label: '未配置',
      tone: 'idle',
    }
  }

  if (!hasStoredToken) {
    return {
      detail: 'Token 尚未保存，无法访问远端仓库。',
      icon: KeyRound,
      label: '需要连接',
      tone: 'warning',
    }
  }

  if (syncSnapshot.status === 'pending') {
    return {
      detail: getPendingReasonDetail(syncSnapshot.pendingReason),
      icon: Cloud,
      label: '待同步',
      tone: 'pending',
    }
  }

  if (syncSnapshot.status === 'syncing') {
    return {
      detail: '正在和远端仓库交换最新内容。',
      icon: CloudSync,
      label: '同步中',
      tone: 'active',
    }
  }

  if (syncSnapshot.status === 'synced') {
    return {
      detail: '本地日记和远端仓库保持一致。',
      icon: CheckCircle2,
      label: syncSnapshot.lastSyncedAt ? `已同步 ${formatShortTime(syncSnapshot.lastSyncedAt)}` : '已同步',
      tone: 'success',
    }
  }

  if (syncSnapshot.status === 'retrying') {
    return {
      detail: syncSnapshot.lastError ?? '同步没有完成，稍后会再次尝试。',
      icon: AlertCircle,
      label: '稍后重试',
      tone: 'warning',
    }
  }

  if (syncSnapshot.status === 'error') {
    return {
      detail: syncSnapshot.lastError ?? '最近一次同步没有完成。',
      icon: AlertCircle,
      label: '同步受阻',
      tone: 'danger',
    }
  }

  if (syncSnapshot.status === 'needs-auth') {
    return {
      detail: '需要更新 Token 后才能继续同步。',
      icon: KeyRound,
      label: '需要连接',
      tone: 'warning',
    }
  }

  return {
    detail: '同步配置已保存，写作时会自动处理改动。',
    icon: Cloud,
    label: '已配置',
    tone: 'ready',
  }
}

function getPendingReasonDetail(reason: SyncSnapshot['pendingReason']) {
  if (reason === 'remote-check') {
    return '正在等待下一次远端检查。'
  }

  if (reason === 'retry') {
    return '同步没有完成，稍后会再次尝试。'
  }

  return '本地改动会在下一次同步时上传。'
}

function formatShortTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}
