import { type ReactNode, useEffect } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { radiusPixels, semanticColors, spacingPixels } from '@journal/theme'
import {
  getJournalSyncBlockPresentation,
  type JournalGitConflictResolutionStrategy,
  type SyncSnapshot,
} from '@journal/sync'
import { Button } from '../ui/Button'
import { ListGroup, ListRow } from '../ui/ListRow'
import { Section } from '../ui/Section'
import type { MobileGitSyncStatus } from '../services/sync'
import { PageShell } from './PageShell'

const recentCommitDisplayLimit = 3

type SyncSettingsPageProps = {
  gitStatus: MobileGitSyncStatus | null
  gitStatusError: string | null
  hasStoredSyncToken: boolean
  isLoadingGitStatus: boolean
  isSyncBusy: boolean
  onBack: () => void
  onOpenSyncConfiguration: () => void
  onRefreshGitStatus: () => Promise<unknown>
  onResolveConflict: (strategy: JournalGitConflictResolutionStrategy) => Promise<{
    alertMessage?: string
    alertTitle?: string
    ok: boolean
  }>
  onSyncNow: () => Promise<unknown>
  syncRemoteUrl: string
  syncSnapshot: SyncSnapshot
  syncStatusLabel: string
}

export function SyncSettingsPage({
  gitStatus,
  gitStatusError,
  hasStoredSyncToken,
  isLoadingGitStatus,
  isSyncBusy,
  onBack,
  onOpenSyncConfiguration,
  onRefreshGitStatus,
  onResolveConflict,
  onSyncNow,
  syncRemoteUrl,
  syncSnapshot,
  syncStatusLabel,
}: SyncSettingsPageProps) {
  useEffect(() => {
    void onRefreshGitStatus()
  }, [onRefreshGitStatus])

  const isConfigured = Boolean(syncRemoteUrl.trim()) && hasStoredSyncToken
  const recentCommits = gitStatus?.recentCommits.slice(0, recentCommitDisplayLimit) ?? []
  const blockPresentation = syncSnapshot.status === 'blocked'
    ? getJournalSyncBlockPresentation(syncSnapshot.block, syncSnapshot.lastError)
    : null
  const blockPaths = blockPresentation
    ? blockPresentation.paths.filter((path) => !blockPresentation.conflicts.some((conflict) => conflict.path === path))
    : []
  const shouldShowSnapshotError = Boolean(syncSnapshot.lastError && syncSnapshot.status !== 'blocked')

  function confirmResolveConflict(strategy: JournalGitConflictResolutionStrategy) {
    const copy = getConflictResolutionCopy(strategy)

    Alert.alert(
      copy.title,
      copy.message,
      [
        { style: 'cancel', text: '取消' },
        {
          style: copy.confirmStyle,
          text: copy.confirmText,
          onPress: () => {
            void onResolveConflict(strategy).then((result) => {
              if (!result.ok && result.alertTitle && result.alertMessage) {
                Alert.alert(result.alertTitle, result.alertMessage)
              }
            })
          },
        },
      ],
    )
  }

  return (
    <PageShell onBack={onBack} testID="sync-settings-page" title="同步">
      <View style={styles.root}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <Section title="状态">
              <ListGroup>
                <ListRow label="远端同步" value={syncStatusLabel} />
                <ListRow divider label="最近同步" value={formatLastSyncedAt(syncSnapshot.lastSyncedAt)} />
                <ListRow divider label="待处理" value={formatPendingReason(syncSnapshot.pendingReason)} />
                {shouldShowSnapshotError ? (
                  <MessageRow danger divider>
                    {syncSnapshot.lastError}
                  </MessageRow>
                ) : null}
              </ListGroup>
            </Section>

            {blockPresentation ? (
              <Section title="处理同步阻断">
                <View style={styles.blockCard} testID="sync-blocked-card">
                  <Text className="text-sm font-semibold leading-5 text-foreground">
                    {blockPresentation.title}
                  </Text>
                  <Text className="text-sm leading-6 text-text-tertiary">
                    {blockPresentation.detail}
                  </Text>
                  <Text className="text-sm leading-6 text-text-tertiary">
                    {blockPresentation.suggestion}
                  </Text>
                  {blockPresentation.conflicts.length > 0 ? (
                    <View style={styles.conflictPreviewList}>
                      {blockPresentation.conflicts.slice(0, 2).map((conflict, index) => (
                        <View key={`${conflict.path}-${index}`} style={styles.conflictPreview}>
                          <Text className="font-mono text-xs leading-5 text-text-tertiary" numberOfLines={1}>
                            {conflict.path}
                          </Text>
                          <ConflictSide
                            label="本机"
                            testID={`sync-conflict-preview-${index}-local-text`}
                            value={conflict.ours}
                          />
                          <ConflictSide
                            label="远端"
                            testID={`sync-conflict-preview-${index}-remote-text`}
                            value={conflict.theirs}
                          />
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {blockPaths.length > 0 ? (
                    <View style={styles.pathList}>
                      {blockPaths.slice(0, 6).map((path) => (
                        <Text className="font-mono text-xs leading-5 text-text-tertiary" key={path} numberOfLines={1}>
                          {path}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {blockPresentation.action === 'resolve-content-conflict' ? (
                    <View style={styles.conflictActions}>
                      <Button
                        disabled={isSyncBusy}
                        icon="phone-portrait-outline"
                        onPress={() => confirmResolveConflict('keep-local')}
                        size="sm"
                        testID="resolve-conflict-keep-local-button"
                        variant="secondary"
                      >
                        保留本机
                      </Button>
                      <Button
                        disabled={isSyncBusy}
                        icon="albums-outline"
                        onPress={() => confirmResolveConflict('keep-both')}
                        size="sm"
                        testID="resolve-conflict-keep-both-button"
                        variant="secondary"
                      >
                        两者都保留
                      </Button>
                      <Button
                        disabled={isSyncBusy}
                        icon="cloud-download-outline"
                        onPress={() => confirmResolveConflict('keep-remote')}
                        size="sm"
                        testID="resolve-conflict-keep-remote-button"
                        variant="secondary"
                      >
                        保留远端
                      </Button>
                    </View>
                  ) : null}
                </View>
              </Section>
            ) : null}

            <Section title="最近 commit">
              <ListGroup>
                {gitStatusError ? (
                  <MessageRow danger>
                    {gitStatusError}
                  </MessageRow>
                ) : isLoadingGitStatus ? (
                  <MessageRow>读取中...</MessageRow>
                ) : recentCommits.length > 0 ? (
                  recentCommits.map((commit, index) => (
                    <CommitRow
                      commit={commit}
                      divider={index > 0}
                      key={commit.oid}
                    />
                  ))
                ) : (
                  <MessageRow>还没有本地 commit。</MessageRow>
                )}
              </ListGroup>
            </Section>

            {!isConfigured ? (
              <Section title="配置">
                <View style={styles.promptCard}>
                  <Text className="text-sm font-semibold leading-5 text-foreground">
                    还没有配置完整同步
                  </Text>
                  <Text className="text-sm leading-6 text-text-tertiary">
                    需要 GitHub 仓库地址和 GitHub Token 后，才能开始同步。
                  </Text>
                  <Button
                    icon="settings-outline"
                    onPress={onOpenSyncConfiguration}
                    size="sm"
                    testID="open-sync-configuration-button"
                    variant="secondary"
                  >
                    去配置
                  </Button>
                </View>
              </Section>
            ) : (
              <Section title="操作">
                <View style={styles.actionCard}>
                  <Button
                    disabled={isSyncBusy}
                    icon="sync-outline"
                    loading={syncSnapshot.status === 'syncing'}
                    onPress={() => void onSyncNow()}
                    size="sm"
                    testID="sync-now-button"
                  >
                    立即同步
                  </Button>
                  <Button
                    disabled={isSyncBusy}
                    icon="settings-outline"
                    onPress={onOpenSyncConfiguration}
                    size="sm"
                    testID="open-sync-configuration-button"
                    variant="secondary"
                  >
                    配置
                  </Button>
                </View>
              </Section>
            )}
          </View>
        </ScrollView>
      </View>
    </PageShell>
  )
}

function CommitRow({
  commit,
  divider = false,
}: {
  commit: MobileGitSyncStatus['recentCommits'][number]
  divider?: boolean
}) {
  return (
    <View style={[styles.commitRow, divider ? styles.divider : null]}>
      <View style={styles.commitSummary}>
        <Text className="font-mono text-sm font-semibold leading-5 text-foreground" numberOfLines={1}>
          {commit.shortOid}
        </Text>
        <Text className="text-xs leading-5 text-text-tertiary" numberOfLines={2}>
          {commit.message}
        </Text>
      </View>
      <Text className="text-right text-xs leading-5 text-text-tertiary" numberOfLines={1} style={styles.commitTime}>
        {formatCommitTime(commit.committedAt)}
      </Text>
    </View>
  )
}

function getConflictResolutionCopy(strategy: JournalGitConflictResolutionStrategy) {
  if (strategy === 'keep-local') {
    return {
      confirmStyle: 'default' as const,
      confirmText: '保留本机',
      message: '会用本机内容解决这次同步冲突，并尝试推送到 GitHub。不会 force push。',
      title: '保留本机内容？',
    }
  }

  if (strategy === 'keep-remote') {
    return {
      confirmStyle: 'destructive' as const,
      confirmText: '保留远端',
      message: '会用远端内容覆盖本机同步范围内的冲突内容。不会推送到 GitHub。',
      title: '保留远端内容？',
    }
  }

  return {
    confirmStyle: 'default' as const,
    confirmText: '两者都保留',
    message: '会把本机和远端的冲突段落都写入日记，并尝试推送到 GitHub。不会 force push。',
    title: '两者都保留？',
  }
}

function ConflictSide({
  label,
  testID,
  value,
}: {
  label: string
  testID?: string
  value: string
}) {
  return (
    <View style={styles.conflictSide}>
      <Text className="text-xs font-semibold leading-5 text-text-tertiary">
        {label}
      </Text>
      <Text className="font-mono text-xs leading-5 text-foreground" testID={testID}>
        {value || '（空）'}
      </Text>
    </View>
  )
}

function MessageRow({
  children,
  danger = false,
  divider = false,
}: {
  children: ReactNode
  danger?: boolean
  divider?: boolean
}) {
  return (
    <View style={[styles.messageRow, divider ? styles.divider : null]}>
      <Text className={danger ? 'text-sm leading-5 text-danger' : 'text-sm leading-5 text-text-tertiary'}>
        {children}
      </Text>
    </View>
  )
}

function formatLastSyncedAt(value: string | null) {
  if (!value) {
    return '还没有同步'
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

function formatPendingReason(value: string | null) {
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

const styles = StyleSheet.create({
  actionCard: {
    backgroundColor: semanticColors.surface,
    borderRadius: radiusPixels.lg,
    gap: spacingPixels['2.5'],
    padding: spacingPixels['4'],
  },
  blockCard: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.danger,
    borderRadius: radiusPixels.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacingPixels['2.5'],
    padding: spacingPixels['4'],
  },
  commitRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacingPixels['3.5'],
    justifyContent: 'space-between',
    minHeight: 52,
  },
  commitSummary: {
    flex: 1,
    minWidth: 0,
  },
  commitTime: {
    minWidth: 86,
  },
  conflictActions: {
    gap: spacingPixels['2.5'],
  },
  conflictPreview: {
    backgroundColor: semanticColors['surface-muted'],
    borderRadius: radiusPixels.md,
    gap: spacingPixels['2'],
    padding: spacingPixels['3'],
  },
  conflictPreviewList: {
    gap: spacingPixels['2'],
  },
  conflictSide: {
    gap: spacingPixels['1'],
  },
  content: {
    gap: spacingPixels['7'],
  },
  divider: {
    borderTopColor: semanticColors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  messageRow: {
    justifyContent: 'center',
    minHeight: 44,
  },
  pathList: {
    backgroundColor: semanticColors['surface-muted'],
    borderRadius: radiusPixels.md,
    gap: spacingPixels['1'],
    padding: spacingPixels['3'],
  },
  promptCard: {
    backgroundColor: semanticColors.surface,
    borderRadius: radiusPixels.lg,
    gap: spacingPixels['2.5'],
    padding: spacingPixels['4'],
  },
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacingPixels['7'],
  },
})
