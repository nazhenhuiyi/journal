import type { SyncSnapshot } from '../state/scheduler'
import type { SyncBlock, SyncBlockConflictPreview } from '../state/syncBlock'

export type JournalSyncStatusTone =
  | 'idle'
  | 'ready'
  | 'success'
  | 'pending'
  | 'active'
  | 'warning'
  | 'danger'

export type JournalSyncStatusKind =
  | 'blocked'
  | 'configured'
  | 'error'
  | 'local-error'
  | 'local-loading'
  | 'local-saving'
  | 'local-writing'
  | 'message'
  | 'needs-auth'
  | 'pending'
  | 'retrying'
  | 'synced'
  | 'syncing'
  | 'unconfigured'

export type JournalSyncStatusPresentation = {
  detail: string
  kind: JournalSyncStatusKind
  label: string
  tone: JournalSyncStatusTone
}

export type JournalSyncBlockPresentationAction =
  | 'resolve-content-conflict'
  | 'choose-first-sync-direction'
  | 'repair-local-repository'
  | 'manual-review'

export type JournalSyncBlockPresentation = {
  action: JournalSyncBlockPresentationAction
  conflicts: SyncBlockConflictPreview[]
  detail: string
  paths: string[]
  suggestion: string
  title: string
  tone: JournalSyncStatusTone
}

export type JournalSyncStatusPresentationOptions = {
  hasLocalSaveError?: boolean
  hasUnsavedLocalChanges?: boolean
  isLocalContentLoading?: boolean
  isLocalSaveInProgress?: boolean
  showConfigurationState?: boolean
}

export function getJournalSyncStatusPresentation(
  syncSnapshot: SyncSnapshot,
  syncMessage: string,
  remoteUrl: string,
  hasStoredToken: boolean,
  options: JournalSyncStatusPresentationOptions = {},
): JournalSyncStatusPresentation {
  if (options.hasLocalSaveError) {
    return {
      detail: '本地日记没有保存成功。',
      kind: 'local-error',
      label: '保存失败',
      tone: 'danger',
    }
  }

  if (options.isLocalContentLoading) {
    return {
      detail: '正在打开本地日记。',
      kind: 'local-loading',
      label: '打开中',
      tone: 'idle',
    }
  }

  if (options.isLocalSaveInProgress) {
    return {
      detail: '正在写入本地文件。',
      kind: 'local-saving',
      label: '保存中',
      tone: 'active',
    }
  }

  if (options.hasUnsavedLocalChanges) {
    return {
      detail: '内容还在本地编辑，停顿后会保存。',
      kind: 'local-writing',
      label: '书写中',
      tone: 'pending',
    }
  }

  if (!remoteUrl.trim()) {
    if (options.showConfigurationState) {
      return {
        detail: '添加 GitHub 仓库地址后开始同步。',
        kind: 'unconfigured',
        label: '未配置',
        tone: 'idle',
      }
    }

    return {
      detail: '本地日记已经保存。',
      kind: 'pending',
      label: '已保存',
      tone: 'success',
    }
  }

  if (!hasStoredToken || syncSnapshot.status === 'needs-auth') {
    return {
      detail: 'Token 尚未保存，无法访问远端仓库。',
      kind: 'needs-auth',
      label: '需要连接',
      tone: 'warning',
    }
  }

  if (syncSnapshot.status === 'blocked') {
    return getBlockedStatusPresentation(syncSnapshot.block, syncSnapshot.lastError)
  }

  if (syncMessage) {
    const isDanger = syncSnapshot.status === 'error'
    const isWarning = syncSnapshot.status === 'retrying'

    return {
      detail: syncSnapshot.lastError ?? (isWarning ? '完成同步配置后继续。' : '最近一次同步操作已更新状态。'),
      kind: 'message',
      label: syncMessage,
      tone: isDanger ? 'danger' : isWarning ? 'warning' : 'success',
    }
  }

  if (syncSnapshot.status === 'pending') {
    return {
      detail: getPendingReasonDetail(syncSnapshot.pendingReason),
      kind: 'pending',
      label: '已保存',
      tone: 'pending',
    }
  }

  if (syncSnapshot.status === 'syncing') {
    return {
      detail: '正在和远端仓库交换最新内容。',
      kind: 'syncing',
      label: '同步中',
      tone: 'active',
    }
  }

  if (syncSnapshot.status === 'retrying') {
    return {
      detail: syncSnapshot.lastError ?? '同步没有完成，稍后会再次尝试。',
      kind: 'retrying',
      label: '稍后重试',
      tone: 'warning',
    }
  }

  if (syncSnapshot.status === 'error') {
    return {
      detail: syncSnapshot.lastError ?? '最近一次同步没有完成。',
      kind: 'error',
      label: '同步受阻',
      tone: 'danger',
    }
  }

  if (syncSnapshot.status === 'synced' || syncSnapshot.lastSyncedAt) {
    return {
      detail: '本地日记和远端仓库保持一致。',
      kind: 'synced',
      label: '已同步',
      tone: 'success',
    }
  }

  if (options.showConfigurationState) {
    return {
      detail: '同步配置已保存，写作时会自动处理改动。',
      kind: 'configured',
      label: '已配置',
      tone: 'ready',
    }
  }

  return {
    detail: '本地日记已经保存。',
    kind: 'pending',
    label: '已保存',
    tone: 'success',
  }
}

export function getJournalSyncBlockPresentation(
  block: SyncBlock | null,
  fallbackMessage: string | null = null,
): JournalSyncBlockPresentation {
  const detail = block?.message ?? fallbackMessage ?? '同步受阻，需要处理后再继续。'
  const conflicts = block?.conflicts ?? []
  const paths = block?.paths ?? []

  if (block?.reason === 'content-conflict') {
    return {
      action: 'resolve-content-conflict',
      conflicts,
      detail: '本机和远端改到了同一段内容，同步已暂停。',
      paths,
      suggestion: '选择保留本机、保留远端，或把两段都留下后继续。',
      title: '内容有冲突',
      tone: 'danger',
    }
  }

  if (block?.reason === 'first-sync-needs-choice') {
    return {
      action: 'choose-first-sync-direction',
      conflicts,
      detail: '本机和远端都已有内容，需要先选择同步方向。',
      paths,
      suggestion: '这版先不自动处理，请确认方向后再继续同步。',
      title: '首次同步需要选择方向',
      tone: 'warning',
    }
  }

  if (block?.reason === 'unrelated-histories') {
    return {
      action: 'manual-review',
      conflicts,
      detail: '本机和远端不是同一条同步历史，同步已暂停。',
      paths,
      suggestion: '请先确认要保留的内容，再做一次性迁移修复。',
      title: '同步历史不兼容',
      tone: 'danger',
    }
  }

  if (block?.reason === 'object-store-corrupt') {
    return {
      action: 'repair-local-repository',
      conflicts,
      detail: block.retryAfterMs
        ? '本地同步仓库暂时不可读，同步已暂停。'
        : '本地同步仓库不可读，同步已暂停。',
      paths,
      suggestion: block.retryAfterMs
        ? '稍后可以再次手动同步。'
        : '可以稍后重试，或导出本地日记后重建同步仓库。',
      title: '本地同步仓库需要修复',
      tone: 'danger',
    }
  }

  return {
    action: 'manual-review',
    detail,
    conflicts,
    paths,
    suggestion: '请先查看同步状态，处理完成后再手动同步。',
    title: '同步受阻',
    tone: 'danger',
  }
}

function getBlockedStatusPresentation(
  block: SyncBlock | null,
  fallbackMessage: string | null,
): JournalSyncStatusPresentation {
  if (block?.reason === 'content-conflict') {
    return {
      detail: '本机和远端改到了同一段内容，同步已暂停。',
      kind: 'blocked',
      label: '需要处理冲突',
      tone: 'danger',
    }
  }

  if (block?.reason === 'first-sync-needs-choice') {
    return {
      detail: '本机和远端都已有内容，需要选择同步方向。',
      kind: 'blocked',
      label: '需要选择方向',
      tone: 'warning',
    }
  }

  if (block?.reason === 'unrelated-histories') {
    return {
      detail: '本机和远端不是同一条同步历史。',
      kind: 'blocked',
      label: '历史不兼容',
      tone: 'danger',
    }
  }

  if (block?.reason === 'object-store-corrupt') {
    return {
      detail: '本地同步仓库不可读。',
      kind: 'blocked',
      label: '本地仓库需修复',
      tone: 'danger',
    }
  }

  return {
    detail: fallbackMessage ?? '同步受阻，需要处理后再继续。',
    kind: 'blocked',
    label: '同步受阻',
    tone: 'danger',
  }
}

function getPendingReasonDetail(reason: SyncSnapshot['pendingReason']) {
  if (reason === 'remote-check') {
    return '正在等待下一次远端检查。'
  }

  if (reason === 'retry') {
    return '同步没有完成，稍后会再次尝试。'
  }

  return '本地已经保存，会在下一次同步时上传。'
}
