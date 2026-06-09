import { type ComponentProps, useCallback, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { MurmurBlock } from '@journal/core'
import {
  getJournalSyncStatusPresentation,
  type JournalSyncStatusTone,
  type SyncSnapshot,
} from '@journal/sync'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import {
  useMobileJournal,
  type MobileLocalSaveHandler,
  type SaveState,
} from './hooks/useMobileJournal'
import { useMobileSync } from './hooks/useMobileSync'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'
import { cn } from './ui/cn'
import { JournalListPage } from './pages/JournalListPage'
import { ReviewPage } from './pages/ReviewPage'
import { SettingsPage } from './pages/SettingsPage'
import { Screen } from './ui/Screen'

type IconName = ComponentProps<typeof Ionicons>['name']
type HeaderStatusTone = 'blue' | 'green' | 'plain' | 'soil'
type HeaderStatus = {
  label: string
  tone: HeaderStatusTone
}
type RootStackParamList = {
  Today: undefined
  JournalList: undefined
  Review: undefined
  Settings: undefined
}

const weatherPlaceholder = '晴 24℃'
const Stack = createNativeStackNavigator<RootStackParamList>()

type TodayFallbackNavigation = {
  canGoBack: () => boolean
  goBack: () => void
  replace: (routeName: 'Today') => void
}

function returnToToday(navigation: TodayFallbackNavigation) {
  if (navigation.canGoBack()) {
    navigation.goBack()
    return
  }

  navigation.replace('Today')
}

export default function App() {
  const [murmurDraft, setMurmurDraft] = useState('')
  const [isMurmurPanelVisible, setIsMurmurPanelVisible] = useState(false)
  const onLocalSaveRef = useRef<MobileLocalSaveHandler | null>(null)
  const {
    addMurmur,
    checkForDateRollover,
    handleLongEntryChange,
    isLongEntryFocusedRef,
    isLongEntryInputUnstable,
    longEntryMarkdown,
    murmurs,
    record,
    reloadTodayFromDisk,
    reloadTodayFromDiskIfChanged,
    saveCurrentJournal,
    saveCurrentJournalRef,
    saveState,
    saveStateRef,
    today,
  } = useMobileJournal({ onLocalSaveRef })
  const {
    gitStatusError,
    handleSyncNow,
    hasStoredSyncToken,
    isLoadingGitStatus,
    isSavingSyncConfiguration,
    mobileGitStatus,
    refreshMobileGitStatus,
    saveSyncConfiguration,
    setSyncBranch,
    setSyncRemoteUrl,
    setSyncTokenDraft,
    syncBranch,
    syncMessage,
    syncRemoteUrl,
    syncSnapshot,
    syncTokenDraft,
  } = useMobileSync({
    checkForDateRollover,
    isLongEntryInputUnstable,
    onLocalSaveRef,
    reloadTodayFromDisk,
    reloadTodayFromDiskIfChanged,
    saveCurrentJournalRef,
    saveStateRef,
  })
  const statusLabel = getStatusLabel(saveState, record?.updatedAt ?? null)
  const markdownDiagnostics = record?.diagnostics ?? []
  const markdownErrorDiagnostics = markdownDiagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  const markdownDiagnosticSummary = formatMarkdownDiagnosticSummary(markdownErrorDiagnostics.length)
  const syncStatusLabel = getSyncStatusLabel(
    syncSnapshot,
    syncMessage,
    hasStoredSyncToken,
    syncRemoteUrl,
  )
  const isBusy = saveState === 'saving' || saveState === 'loading'
  const isSyncBusy = isSavingSyncConfiguration || syncSnapshot.status === 'syncing'
  const headerStatus = getHeaderStatus(
    saveState,
    syncSnapshot,
    hasStoredSyncToken,
    syncRemoteUrl,
  )

  const openMurmurPanel = useCallback(() => {
    setIsMurmurPanelVisible(true)
  }, [])

  const closeMurmurPanel = useCallback((shouldClearDraft = false) => {
    setIsMurmurPanelVisible(false)

    if (shouldClearDraft) {
      setMurmurDraft('')
    }
  }, [])

  const handleAddMurmur = useCallback(async () => {
    const didAdd = await addMurmur(murmurDraft)

    if (didAdd) {
      setMurmurDraft('')
    }
  }, [addMurmur, murmurDraft])

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#f4f5ef' },
          gestureEnabled: true,
          headerShown: false,
        }}
      >
        <Stack.Screen name="Today">
          {({ navigation }) => (
            <Screen bottomColor="#fffdf8">
              <View className="flex-1 gap-1.5 pt-4">
                <View className="flex-row items-center justify-between px-5">
                  <View className="flex-row items-center gap-1">
                    <TopNavButton
                      icon="calendar-outline"
                      label="日记列表"
                      onPress={() => navigation.navigate('JournalList')}
                      testID="journal-list-button"
                    />
                    <TopNavButton
                      icon="sparkles-outline"
                      label="回顾"
                      onPress={() => navigation.navigate('Review')}
                      testID="review-button"
                    />
                  </View>
                  <View className="flex-row items-center gap-1">
                    <InlineStatusButton
                      status={headerStatus}
                      onPress={() => navigation.navigate('Settings')}
                      testID="sync-status-button"
                    />
                    <HeaderIconButton
                      icon="settings-outline"
                      label="设置"
                      onPress={() => navigation.navigate('Settings')}
                      testID="settings-button"
                    />
                  </View>
                </View>

                <View
                  className="flex-1 rounded-lg bg-paper"
                  style={{
                    paddingBottom: 22,
                    paddingHorizontal: 24,
                    paddingTop: 16,
                  }}
                >
                  <View className="mb-5 flex-row items-center justify-between gap-4">
                    <View className="shrink">
                      <Text className="text-sm font-semibold text-moss">
                        {formatPaperDateLine(today)} · {weatherPlaceholder}
                      </Text>
                    </View>
                    <MurmurCountButton
                      count={murmurs.length}
                      onPress={openMurmurPanel}
                      testID="murmur-count-button"
                    />
                  </View>
                  {markdownDiagnosticSummary ? (
                    <Text className="mb-4 text-sm leading-5 text-soil">
                      {markdownDiagnosticSummary}
                    </Text>
                  ) : null}
                  <TextInput
                    accessibilityLabel="日记正文"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="flex-1 text-[18px] leading-8 text-ink"
                    importantForAutofill="no"
                    keyboardType="default"
                    multiline
                    onBlur={() => {
                      isLongEntryFocusedRef.current = false
                    }}
                    onChangeText={handleLongEntryChange}
                    onFocus={() => {
                      isLongEntryFocusedRef.current = true
                    }}
                    placeholder="写一点今天真正留下来的东西。"
                    placeholderTextColor="#9aa69f"
                    scrollEnabled
                    spellCheck={false}
                    style={{
                      margin: 0,
                      padding: 0,
                      paddingBottom: 20,
                      paddingTop: 0,
                    }}
                    textAlignVertical="top"
                    textContentType="none"
                    testID="long-entry-input"
                    value={longEntryMarkdown}
                  />
                </View>
              </View>

              <BottomSheet
                keyboardAvoiding
                onClose={() => closeMurmurPanel(true)}
                visible={isMurmurPanelVisible}
              >
                <View style={{ flex: 1 }}>
                  <View>
                    <View
                      className="border border-reed bg-paper"
                      style={{
                        borderRadius: 20,
                        paddingHorizontal: 20,
                        paddingVertical: 18,
                      }}
                    >
                      {murmurs.length === 0 ? (
                        <Text className="mb-4 text-sm leading-5 text-mossMuted">
                          今天还没有碎碎念。
                        </Text>
                      ) : null}
                      <TextInput
                        accessibilityLabel="碎碎念正文"
                        autoFocus={murmurs.length === 0}
                        className="min-h-32 text-base leading-6 text-ink"
                        multiline
                        onChangeText={setMurmurDraft}
                        placeholder={murmurs.length === 0 ? '比如：刚刚想到的一句话。' : '再补一句碎碎念。'}
                        placeholderTextColor="#9aa69f"
                        style={{
                          margin: 0,
                          minHeight: 136,
                          padding: 0,
                        }}
                        textAlignVertical="top"
                        testID="murmur-draft-input"
                        value={murmurDraft}
                      />
                    </View>
                    <View className="flex-row justify-end" style={{ marginTop: 18 }}>
                      <Button
                        className="min-h-10 rounded-full px-5"
                        disabled={!murmurDraft.trim() || isBusy}
                        icon="add"
                        onPress={() => void handleAddMurmur()}
                        testID="add-murmur-button"
                        variant="secondary"
                      >
                        加入今天
                      </Button>
                    </View>
                  </View>

                  {murmurs.length > 0 ? (
                    <View style={{ flex: 1, marginTop: 38 }}>
                      <Text className="mb-4 text-xs font-semibold text-mossMuted">今天</Text>
                      <ScrollView
                        className="flex-1"
                        contentContainerStyle={{ paddingBottom: 24 }}
                        showsVerticalScrollIndicator={false}
                      >
                        <View className="gap-3">
                          {murmurs.map((murmur) => (
                            <MurmurItem key={murmur.id} murmur={murmur} />
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              </BottomSheet>
            </Screen>
          )}
        </Stack.Screen>
        <Stack.Screen name="JournalList">
          {({ navigation }) => (
            <JournalListPage
              longEntryMarkdown={longEntryMarkdown}
              murmurCount={murmurs.length}
              onBack={() => returnToToday(navigation)}
              today={today}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Review">
          {({ navigation }) => (
            <ReviewPage
              longEntryMarkdown={longEntryMarkdown}
              murmurCount={murmurs.length}
              onBack={() => returnToToday(navigation)}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Settings">
          {({ navigation }) => (
            <SettingsPage
              hasStoredSyncToken={hasStoredSyncToken}
              isBusy={isBusy}
              isLoadingGitStatus={isLoadingGitStatus}
              isSavingSyncConfiguration={isSavingSyncConfiguration}
              isSyncBusy={isSyncBusy}
              gitStatus={mobileGitStatus}
              gitStatusError={gitStatusError}
              markdownDiagnosticSummary={markdownDiagnosticSummary}
              murmursCount={murmurs.length}
              onBack={() => returnToToday(navigation)}
              onRefreshGitStatus={refreshMobileGitStatus}
              onSaveCurrent={() => void saveCurrentJournal()}
              onSaveSyncConfiguration={saveSyncConfiguration}
              onSyncNow={handleSyncNow}
              saveState={saveState}
              setSyncBranch={setSyncBranch}
              setSyncRemoteUrl={setSyncRemoteUrl}
              setSyncTokenDraft={setSyncTokenDraft}
              statusLabel={statusLabel}
              syncBranch={syncBranch}
              syncRemoteUrl={syncRemoteUrl}
              syncSnapshot={syncSnapshot}
              syncStatusLabel={syncStatusLabel}
              syncTokenDraft={syncTokenDraft}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  )
}

function MurmurCountButton({
  count,
  onPress,
  testID,
}: {
  count: number
  onPress: () => void
  testID?: string
}) {
  return (
    <Pressable
      accessibilityLabel={`查看碎碎念，${count} 条`}
      accessibilityRole="button"
      className="min-h-7 flex-row items-center gap-1 rounded-full px-1"
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.72 : 1,
      })}
      testID={testID}
    >
      <Text className="text-sm font-semibold text-moss">碎碎念</Text>
      <Text className="text-sm font-semibold text-mossMuted">· {count} 条</Text>
    </Pressable>
  )
}

function TopNavButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: IconName
  label: string
  onPress: () => void
  testID?: string
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="h-9 w-9 items-center justify-center rounded-full bg-transparent"
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.72 : 1,
      })}
      testID={testID}
    >
      <Ionicons color="#254f43" name={icon} size={19} />
    </Pressable>
  )
}

function HeaderIconButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: IconName
  label: string
  onPress: () => void
  testID?: string
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="h-8 w-8 items-center justify-center rounded-full"
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.72 : 0.9,
      })}
      testID={testID}
    >
      <Ionicons color="#4f7469" name={icon} size={15} />
    </Pressable>
  )
}

function InlineStatusButton({
  onPress,
  status,
  testID,
}: {
  onPress: () => void
  status: HeaderStatus
  testID?: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        'min-h-8 shrink-0 flex-row items-center justify-center rounded-full px-2',
        status.tone === 'soil' ? 'opacity-95' : 'opacity-90',
      )}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.72 : 1,
      })}
      testID={testID}
    >
      <Text className={cn('text-xs font-semibold', headerStatusTextClasses[status.tone])}>
        {status.label}
      </Text>
    </Pressable>
  )
}

function MurmurItem({ murmur }: { murmur: MurmurBlock }) {
  return (
    <View
      className="border border-reed bg-paper px-4 py-4"
      style={{ borderRadius: 18 }}
    >
      <Text className="mb-3 text-xs font-semibold text-sage">{formatTime(murmur.time)}</Text>
      <Text className="text-base leading-6 text-ink">{murmur.body}</Text>
    </View>
  )
}

function formatPaperDateLine(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return dateKey
  }

  const weekday = date.toLocaleDateString('zh-CN', { weekday: 'long' })
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}月${day}日 · ${weekday}`
}

function formatTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStatusLabel(saveState: SaveState, updatedAt: string | null) {
  if (saveState === 'loading') {
    return '正在打开'
  }

  if (saveState === 'saving') {
    return '正在保存'
  }

  if (saveState === 'saved') {
    return '已保存'
  }

  if (saveState === 'dirty') {
    return '有未保存更改'
  }

  if (saveState === 'error') {
    return '保存失败'
  }

  return updatedAt ? `上次保存 ${formatTime(updatedAt)}` : '还没有保存'
}

function getHeaderStatus(
  saveState: SaveState,
  syncSnapshot: SyncSnapshot,
  hasStoredToken: boolean,
  remoteUrl: string,
): HeaderStatus {
  const presentation = getJournalSyncStatusPresentation(
    syncSnapshot,
    '',
    remoteUrl,
    hasStoredToken,
    {
      hasLocalSaveError: saveState === 'error',
      hasUnsavedLocalChanges: saveState === 'dirty',
      isLocalContentLoading: saveState === 'loading',
      isLocalSaveInProgress: saveState === 'saving',
      showConfigurationState: false,
    },
  )

  return {
    label: presentation.label,
    tone: getHeaderTone(presentation.tone),
  }
}

function getSyncStatusLabel(
  syncSnapshot: SyncSnapshot,
  syncMessage: string,
  hasStoredToken: boolean,
  remoteUrl: string,
) {
  return getJournalSyncStatusPresentation(
    syncSnapshot,
    syncMessage,
    remoteUrl,
    hasStoredToken,
    { showConfigurationState: true },
  ).label
}

function getHeaderTone(tone: JournalSyncStatusTone): HeaderStatusTone {
  if (tone === 'danger' || tone === 'warning') {
    return 'soil'
  }

  if (tone === 'active' || tone === 'pending') {
    return 'blue'
  }

  if (tone === 'success') {
    return 'green'
  }

  return 'plain'
}

function formatMarkdownDiagnosticSummary(errorCount: number) {
  if (errorCount === 0) {
    return ''
  }

  return errorCount === 1 ? 'Markdown 有 1 个格式问题' : `Markdown 有 ${errorCount} 个格式问题`
}

const headerStatusTextClasses: Record<HeaderStatusTone, string> = {
  blue: 'text-mossMuted',
  green: 'text-mossMuted',
  plain: 'text-mossMuted',
  soil: 'text-soil',
}
