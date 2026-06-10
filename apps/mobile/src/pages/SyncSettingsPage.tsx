import { type ReactNode, useEffect } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { semanticColors } from '@journal/theme'
import type { SyncSnapshot } from '@journal/sync'
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

  return (
    <PageShell onBack={onBack} title="同步">
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
                {syncSnapshot.lastError ? (
                  <MessageRow danger divider>
                    {syncSnapshot.lastError}
                  </MessageRow>
                ) : null}
              </ListGroup>
            </Section>

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
                  <Text className="text-sm leading-6 text-muted-fg">
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
        <Text className="text-xs leading-5 text-muted-fg" numberOfLines={2}>
          {commit.message}
        </Text>
      </View>
      <Text className="text-right text-xs leading-5 text-muted-fg" numberOfLines={1} style={styles.commitTime}>
        {formatCommitTime(commit.committedAt)}
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
      <Text className={danger ? 'text-sm leading-5 text-danger' : 'text-sm leading-5 text-muted-fg'}>
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
    borderRadius: 8,
    padding: 16,
  },
  commitRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
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
  content: {
    gap: 28,
  },
  divider: {
    borderTopColor: semanticColors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  messageRow: {
    justifyContent: 'center',
    minHeight: 44,
  },
  promptCard: {
    backgroundColor: semanticColors.surface,
    borderRadius: 8,
    gap: 10,
    padding: 16,
  },
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 28,
  },
})
