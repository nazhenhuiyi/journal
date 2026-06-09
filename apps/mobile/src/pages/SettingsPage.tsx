import { type ComponentProps, type ReactNode, useEffect } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { SyncSnapshot } from '@journal/sync'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import type { MobileGitSyncStatus } from '../services/sync'
import { PageShell } from './PageShell'

type IconName = ComponentProps<typeof Ionicons>['name']
type SaveState = 'dirty' | 'idle' | 'loading' | 'saving' | 'saved' | 'error'

type SettingsPageProps = {
  gitStatus: MobileGitSyncStatus | null
  gitStatusError: string | null
  hasStoredSyncToken: boolean
  isBusy: boolean
  isLoadingGitStatus: boolean
  isSavingSyncConfiguration: boolean
  isSyncBusy: boolean
  markdownDiagnosticSummary: string
  murmursCount: number
  onBack: () => void
  onRefreshGitStatus: () => Promise<unknown>
  onSaveCurrent: () => void
  onSaveSyncConfiguration: () => Promise<unknown>
  onSyncNow: () => Promise<unknown>
  saveState: SaveState
  setSyncBranch: (value: string) => void
  setSyncRemoteUrl: (value: string) => void
  setSyncTokenDraft: (value: string) => void
  statusLabel: string
  syncBranch: string
  syncRemoteUrl: string
  syncSnapshot: SyncSnapshot
  syncStatusLabel: string
  syncTokenDraft: string
}

export function SettingsPage({
  gitStatus,
  gitStatusError,
  hasStoredSyncToken,
  isBusy,
  isLoadingGitStatus,
  isSavingSyncConfiguration,
  isSyncBusy,
  markdownDiagnosticSummary,
  murmursCount,
  onBack,
  onRefreshGitStatus,
  onSaveCurrent,
  onSaveSyncConfiguration,
  onSyncNow,
  saveState,
  setSyncBranch,
  setSyncRemoteUrl,
  setSyncTokenDraft,
  statusLabel,
  syncBranch,
  syncRemoteUrl,
  syncSnapshot,
  syncStatusLabel,
  syncTokenDraft,
}: SettingsPageProps) {
  useEffect(() => {
    void onRefreshGitStatus()
  }, [onRefreshGitStatus])

  return (
    <PageShell icon="settings-outline" onBack={onBack} title="设置">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5">
          <View className="gap-3">
            <DetailRow
              icon="save-outline"
              label="本地保存"
              value={statusLabel}
            />
            <DetailRow
              icon="sync-outline"
              label="远端同步"
              value={syncStatusLabel}
            />
            <DetailRow
              icon="document-text-outline"
              label="本地格式"
              value={markdownDiagnosticSummary || 'Markdown'}
            />
            <DetailRow
              icon="chatbubble-ellipses-outline"
              label="碎碎念"
              value={`${murmursCount} 条`}
            />
            <Button
              disabled={isBusy}
              icon="save-outline"
              loading={saveState === 'saving'}
              onPress={onSaveCurrent}
              testID="save-current-button"
              variant="secondary"
            >
              保存当前
            </Button>
          </View>

          <MobileGitStatusPanel
            error={gitStatusError}
            isLoading={isLoadingGitStatus}
            onRefresh={onRefreshGitStatus}
            status={gitStatus}
          />

          <View className="h-px bg-reed" />

          <View className="gap-3">
            <Input
              accessibilityLabel="同步仓库地址"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={setSyncRemoteUrl}
              placeholder="https://github.com/you/journal-sync.git"
              testID="sync-remote-url-input"
              value={syncRemoteUrl}
            />
            <Input
              accessibilityLabel="同步分支"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setSyncBranch}
              placeholder="main"
              testID="sync-branch-input"
              value={syncBranch}
            />
            <View className="gap-1">
              <Input
                accessibilityLabel="GitHub token"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setSyncTokenDraft}
                placeholder={hasStoredSyncToken ? 'Token 已保存，留空不改' : 'GitHub token'}
                secureTextEntry
                testID="sync-token-input"
                value={syncTokenDraft}
              />
              {hasStoredSyncToken ? (
                <Text className="px-1 text-xs leading-5 text-mossMuted">
                  出于安全不会显示明文；粘贴新 token 后保存配置会替换。
                </Text>
              ) : null}
            </View>
            <View className="flex-row gap-3">
              <Button
                className="flex-1"
                disabled={isSyncBusy}
                icon="key-outline"
                loading={isSavingSyncConfiguration}
                onPress={() => void onSaveSyncConfiguration()}
                testID="save-sync-config-button"
                variant="secondary"
              >
                保存配置
              </Button>
              <Button
                className="flex-1"
                disabled={isSyncBusy}
                icon="sync-outline"
                loading={syncSnapshot.status === 'syncing'}
                onPress={() => void onSyncNow()}
                testID="sync-now-button"
              >
                立即同步
              </Button>
            </View>
            {syncSnapshot.lastError ? (
              <Text className="text-sm leading-5 text-soil">{syncSnapshot.lastError}</Text>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </PageShell>
  )
}

function MobileGitStatusPanel({
  error,
  isLoading,
  onRefresh,
  status,
}: {
  error: string | null
  isLoading: boolean
  onRefresh: () => Promise<unknown>
  status: MobileGitSyncStatus | null
}) {
  const dirtyPaths = status?.dirtyPaths ?? []
  const recentCommits = status?.recentCommits ?? []

  return (
    <View className="gap-4 rounded-lg border border-reed bg-paper px-4 py-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0">
          <Text className="text-base font-semibold text-ink">Git 状态</Text>
          <Text className="mt-1 text-xs font-medium text-mossMuted">
            {status?.hasRepository ? status.branch : '还没有本地仓库'}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="刷新 Git 状态"
          accessibilityRole="button"
          className="h-9 w-9 items-center justify-center rounded-lg bg-cloud"
          disabled={isLoading}
          onPress={() => void onRefresh()}
          style={({ pressed }) => ({
            opacity: pressed || isLoading ? 0.62 : 1,
          })}
        >
          <Ionicons color="#254f43" name="refresh-outline" size={18} />
        </Pressable>
      </View>

      {isLoading ? (
        <Text className="text-sm leading-5 text-mossMuted">正在读取 Git 状态...</Text>
      ) : null}

      {error ? (
        <Text className="text-sm leading-5 text-soil">{error}</Text>
      ) : null}

      <View className="gap-2">
        <Text className="text-xs font-semibold text-sage">最近 commit</Text>
        {recentCommits.length > 0 ? (
          <View className="gap-2">
            {recentCommits.map((commit) => (
              <View className="border-t border-reed pt-2" key={commit.oid}>
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="font-mono text-xs font-semibold text-moss">
                    {commit.shortOid}
                  </Text>
                  <Text className="text-xs font-medium text-mossMuted">
                    {formatGitCommitTime(commit.committedAt)}
                  </Text>
                </View>
                <Text className="mt-1 text-sm leading-5 text-ink">
                  {commit.message}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-sm leading-5 text-mossMuted">还没有本地 commit。</Text>
        )}
      </View>

      <View className="gap-2">
        <Text className="text-xs font-semibold text-sage">未提交文件</Text>
        {dirtyPaths.length > 0 ? (
          <View className="gap-2">
            {dirtyPaths.map((filepath) => (
              <Text className="font-mono text-xs leading-5 text-ink" key={filepath} selectable>
                {filepath}
              </Text>
            ))}
          </View>
        ) : (
          <Text className="text-sm leading-5 text-mossMuted">没有未提交文件。</Text>
        )}
      </View>
    </View>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: IconName
  label: string
  value: ReactNode
}) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-cloud">
        <Ionicons color="#254f43" name={icon} size={18} />
      </View>
      <Text className="text-sm font-medium text-mossMuted">{label}</Text>
      <Text className="ml-auto shrink text-right text-sm font-semibold text-ink">{value}</Text>
    </View>
  )
}

function formatGitCommitTime(value: string | null) {
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
