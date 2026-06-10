import { type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { semanticColors } from '@journal/theme'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Section } from '../ui/Section'
import { PageShell } from './PageShell'

type SettingsPageProps = {
  hasStoredSyncToken: boolean
  isSavingSyncConfiguration: boolean
  onBack: () => void
  onSaveSyncConfiguration: () => Promise<unknown>
  setSyncBranch: (value: string) => void
  setSyncRemoteUrl: (value: string) => void
  setSyncTokenDraft: (value: string) => void
  syncBranch: string
  syncRemoteUrl: string
  syncTokenDraft: string
}

export function SettingsPage({
  hasStoredSyncToken,
  isSavingSyncConfiguration,
  onBack,
  onSaveSyncConfiguration,
  setSyncBranch,
  setSyncRemoteUrl,
  setSyncTokenDraft,
  syncBranch,
  syncRemoteUrl,
  syncTokenDraft,
}: SettingsPageProps) {
  return (
    <PageShell onBack={onBack} title="设置">
      <View style={styles.root}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <Section title="GitHub">
              <View style={styles.formCard}>
                <ConfigField label="仓库地址">
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
                </ConfigField>
                <ConfigField label="分支">
                  <Input
                    accessibilityLabel="同步分支"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setSyncBranch}
                    placeholder="main"
                    testID="sync-branch-input"
                    value={syncBranch}
                  />
                </ConfigField>
                <ConfigField label={hasStoredSyncToken ? '新的 GitHub Token' : 'GitHub Token'}>
                  <Input
                    accessibilityLabel="GitHub token"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setSyncTokenDraft}
                    placeholder={hasStoredSyncToken ? '留空不改，粘贴后替换' : '粘贴 GitHub token'}
                    secureTextEntry
                    testID="sync-token-input"
                    value={syncTokenDraft}
                  />
                  {hasStoredSyncToken ? (
                    <Text className="text-xs leading-5 text-muted-fg">
                      已保存的 token 不会显示；留空只保存仓库与分支。
                    </Text>
                  ) : null}
                </ConfigField>
                <Button
                  icon="save-outline"
                  loading={isSavingSyncConfiguration}
                  onPress={() => void onSaveSyncConfiguration()}
                  size="sm"
                  testID="save-sync-config-button"
                  variant="secondary"
                >
                  保存配置
                </Button>
              </View>
            </Section>
          </View>
        </ScrollView>
      </View>
    </PageShell>
  )
}

function ConfigField({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <View style={styles.configField}>
      <Text className="text-xs font-semibold leading-5 text-muted-fg">{label}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  configField: {
    gap: 6,
  },
  content: {
    gap: 28,
  },
  formCard: {
    backgroundColor: semanticColors.surface,
    borderRadius: 8,
    gap: 14,
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
