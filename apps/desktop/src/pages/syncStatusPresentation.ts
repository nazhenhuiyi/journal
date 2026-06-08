import type { LucideIcon } from 'lucide-react'
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  CloudSync,
  KeyRound,
  PencilLine,
  Save,
} from 'lucide-react'
import {
  getJournalSyncStatusPresentation,
  type JournalSyncStatusKind,
  type JournalSyncStatusPresentationOptions,
  type JournalSyncStatusTone,
} from '@journal/sync/statusPresentation'
import type { SyncSnapshot } from '@journal/sync/scheduler'

export type SyncStatusTone = JournalSyncStatusTone

export type SyncStatusPresentation = {
  detail: string
  icon: LucideIcon
  label: string
  tone: SyncStatusTone
}

export type SyncStatusPresentationOptions = JournalSyncStatusPresentationOptions

export function getSyncStatusPresentation(
  syncSnapshot: SyncSnapshot,
  syncMessage: string,
  remoteUrl: string,
  hasStoredToken: boolean,
  options: SyncStatusPresentationOptions = {},
): SyncStatusPresentation {
  const presentation = getJournalSyncStatusPresentation(
    syncSnapshot,
    syncMessage,
    remoteUrl,
    hasStoredToken,
    options,
  )

  return {
    detail: presentation.detail,
    icon: getStatusIcon(presentation.kind, presentation.tone),
    label: presentation.label,
    tone: presentation.tone,
  }
}

function getStatusIcon(kind: JournalSyncStatusKind, tone: JournalSyncStatusTone): LucideIcon {
  if (kind === 'local-writing') {
    return PencilLine
  }

  if (kind === 'local-saving' || kind === 'pending') {
    return Save
  }

  if (kind === 'syncing') {
    return CloudSync
  }

  if (kind === 'unconfigured') {
    return CloudOff
  }

  if (kind === 'needs-auth') {
    return KeyRound
  }

  if (tone === 'danger' || kind === 'retrying') {
    return AlertCircle
  }

  if (tone === 'success' || kind === 'synced') {
    return CheckCircle2
  }

  return Cloud
}
