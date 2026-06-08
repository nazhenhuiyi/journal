import { type ComponentProps, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  AppState,
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
  JournalSyncCoordinator,
  type JournalSyncStatusTone,
  type SyncOperationRequest,
  type SyncSnapshot,
} from '@journal/sync'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import {
  createMurmur,
  getLocalDateKey,
  loadDailyJournal,
  saveDailyJournal,
  type MobileJournalRecord,
  type SaveDailyJournalResult,
} from './services/mobileJournalStore'
import { shouldDeferBackgroundSyncForInput } from './services/inputStability'
import {
  getMobileGitSyncStatus,
  loadGitHubSyncCredentials,
  loadGitHubSyncSettings,
  pullMobileJournalUpdatesFromGitHub,
  pushMobileJournalChangesToGitHub,
  saveGitHubSyncCredentials,
  saveGitHubSyncSettings,
  syncMobileJournalWithGitHub,
} from './services/sync'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'
import { cn } from './ui/cn'
import { Input } from './ui/Input'
import { Screen } from './ui/Screen'

type IconName = ComponentProps<typeof Ionicons>['name']
type SaveState = 'dirty' | 'idle' | 'loading' | 'saving' | 'saved' | 'error'
type SaveCurrentJournalOptions = {
  scheduleSync?: boolean
  showAlert?: boolean
}
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

const dateRolloverCheckMs = 60_000
const localSaveDebounceMs = 5_000
const weatherPlaceholder = '晴 24℃'
const Stack = createNativeStackNavigator<RootStackParamList>()
const initialSyncSnapshot: SyncSnapshot = {
  lastError: null,
  lastSyncedAt: null,
  pendingReason: null,
  status: 'idle',
}

export default function App() {
  const [today, setToday] = useState(() => getLocalDateKey())
  const [record, setRecord] = useState<MobileJournalRecord | null>(null)
  const [longEntryMarkdown, setLongEntryMarkdown] = useState('')
  const [murmurs, setMurmurs] = useState<MurmurBlock[]>([])
  const [murmurDraft, setMurmurDraft] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [hasLoadedSyncConfiguration, setHasLoadedSyncConfiguration] = useState(false)
  const [syncBranch, setSyncBranch] = useState('main')
  const [isSavingSyncConfiguration, setIsSavingSyncConfiguration] = useState(false)
  const [isMurmurPanelVisible, setIsMurmurPanelVisible] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [syncRemoteUrl, setSyncRemoteUrl] = useState('')
  const [syncSnapshot, setSyncSnapshot] = useState<SyncSnapshot>(initialSyncSnapshot)
  const [syncTokenDraft, setSyncTokenDraft] = useState('')
  const [hasStoredSyncToken, setHasStoredSyncToken] = useState(false)
  const journalVersionRef = useRef(0)
  const coordinatorRef = useRef<JournalSyncCoordinator | null>(null)
  const isLongEntryFocusedRef = useRef(false)
  const journalContentRef = useRef({ longEntryMarkdown: '', murmurs: [] as MurmurBlock[] })
  const lastLongEntryEditedAtRef = useRef(0)
  const saveCurrentJournalRef = useRef<((options?: SaveCurrentJournalOptions) => Promise<SaveDailyJournalResult | null>) | null>(null)
  const saveStateRef = useRef<SaveState>('loading')
  const todayRef = useRef(today)
  const syncConfigRef = useRef({
    branch: 'main',
    hasStoredSyncToken: false,
    remoteUrl: '',
  })

  useEffect(() => {
    let isMounted = true
    const loadingVersion = journalVersionRef.current

    setSaveState('loading')

    loadDailyJournal(today)
      .then((loadedRecord) => {
        if (!isMounted) {
          return
        }

        setRecord(loadedRecord)

        if (journalVersionRef.current === loadingVersion) {
          setLongEntryMarkdown(loadedRecord.longEntryMarkdown)
          setMurmurs(loadedRecord.murmurs)
          setSaveState('idle')
        } else {
          setSaveState('dirty')
        }
      })
      .catch((error) => {
        console.error(error)

        if (isMounted) {
          setSaveState('error')
        }
      })

    return () => {
      isMounted = false
    }
  }, [today])

  useEffect(() => {
    todayRef.current = today
  }, [today])

  useEffect(() => {
    journalContentRef.current = {
      longEntryMarkdown,
      murmurs,
    }
  }, [longEntryMarkdown, murmurs])

  useEffect(() => {
    saveStateRef.current = saveState
  }, [saveState])

  useEffect(() => {
    syncConfigRef.current = {
      branch: syncBranch,
      hasStoredSyncToken,
      remoteUrl: syncRemoteUrl,
    }
  }, [hasStoredSyncToken, syncBranch, syncRemoteUrl])

  const markDirtyWorktreeForSync = useCallback(async (input?: {
    branch?: string
    hasStoredSyncToken?: boolean
    remoteUrl?: string
  }) => {
    const branch = input?.branch ?? syncConfigRef.current.branch
    const hasToken = input?.hasStoredSyncToken ?? syncConfigRef.current.hasStoredSyncToken
    const remoteUrl = input?.remoteUrl ?? syncConfigRef.current.remoteUrl

    if (!remoteUrl.trim() || !hasToken) {
      return
    }

    try {
      const status = await getMobileGitSyncStatus({
        branch: branch.trim() || 'main',
        remoteUrl: remoteUrl.trim(),
      })

      coordinatorRef.current?.markDirtyWorktree(status.dirtyPaths)
    } catch (error) {
      console.error(error)
    }
  }, [])

  const resumeConfiguredSync = useCallback(async () => {
    if (!syncConfigRef.current.remoteUrl.trim() || !syncConfigRef.current.hasStoredSyncToken) {
      return
    }

    await markDirtyWorktreeForSync()
    await coordinatorRef.current?.notifyForeground()
  }, [markDirtyWorktreeForSync])

  useEffect(() => {
    let isMounted = true

    Promise.all([
      loadGitHubSyncSettings(),
      loadGitHubSyncCredentials(),
    ])
      .then(([settings, credentials]) => {
        if (!isMounted) {
          return
        }

        if (settings) {
          setSyncBranch(settings.branch)
          setSyncRemoteUrl(settings.remoteUrl)
        }

        setHasStoredSyncToken(credentials !== null)
        setSyncSnapshot((currentSnapshot) => ({
          ...currentSnapshot,
          status: 'idle',
        }))
        setHasLoadedSyncConfiguration(true)
      })
      .catch((error) => {
        console.error(error)

        if (isMounted) {
          setSyncSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            lastError: '同步配置读取失败',
            status: 'error',
          }))
          setSyncMessage('同步配置读取失败')
          setHasLoadedSyncConfiguration(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const statusLabel = getStatusLabel(saveState, record?.updatedAt ?? null)
  const syncStatusLabel = getSyncStatusLabel(
    syncSnapshot,
    syncMessage,
    hasStoredSyncToken,
    syncRemoteUrl,
  )

  const markJournalDirty = useCallback(() => {
    journalVersionRef.current += 1
    setSaveState((currentSaveState) => {
      if (currentSaveState === 'loading' || currentSaveState === 'saving') {
        return currentSaveState
      }

      return 'dirty'
    })
  }, [])

  const handleLongEntryChange = useCallback((value: string) => {
    lastLongEntryEditedAtRef.current = Date.now()
    markJournalDirty()
    setLongEntryMarkdown(value)
  }, [markJournalDirty])

  const saveCurrentJournal = useCallback(async (
    nextLongEntryMarkdown = longEntryMarkdown,
    nextMurmurs = murmurs,
    options: SaveCurrentJournalOptions = {},
  ) => {
    const savingVersion = journalVersionRef.current
    const shouldScheduleSync = options.scheduleSync ?? true
    const shouldShowAlert = options.showAlert ?? true

    setSaveState('saving')

    try {
      const savedRecord = await saveDailyJournal({
        date: today,
        longEntryMarkdown: nextLongEntryMarkdown,
        murmurs: nextMurmurs,
      })

      setRecord(savedRecord)

      if (journalVersionRef.current === savingVersion) {
        if (savedRecord.longEntryMarkdown !== journalContentRef.current.longEntryMarkdown) {
          setLongEntryMarkdown(savedRecord.longEntryMarkdown)
        }

        if (nextMurmurs !== journalContentRef.current.murmurs) {
          setMurmurs(savedRecord.murmurs)
        }

        setSaveState('saved')
      } else {
        setSaveState('dirty')
      }

      if (shouldScheduleSync && savedRecord.didWrite) {
        coordinatorRef.current?.markLocalSave()
      }

      return savedRecord
    } catch (error) {
      console.error(error)
      setSaveState('error')

      if (shouldShowAlert) {
        Alert.alert('保存失败', '本地日记没有写入成功。')
      }

      return null
    }
  }, [longEntryMarkdown, murmurs, today])

  useEffect(() => {
    saveCurrentJournalRef.current = (options?: SaveCurrentJournalOptions) => {
      const latestContent = journalContentRef.current

      return saveCurrentJournal(
        latestContent.longEntryMarkdown,
        latestContent.murmurs,
        options,
      )
    }
  }, [saveCurrentJournal])

  const checkForDateRollover = useCallback(async () => {
    const nextToday = getLocalDateKey()

    if (nextToday === todayRef.current || saveStateRef.current === 'saving') {
      return false
    }

    if (saveStateRef.current === 'dirty') {
      const savedRecord = await saveCurrentJournalRef.current?.({
        showAlert: false,
      })

      if (!savedRecord) {
        return false
      }
    }

    setSaveState('loading')
    todayRef.current = nextToday
    setToday(nextToday)

    return true
  }, [])

  useEffect(() => {
    if (saveState !== 'dirty') {
      return undefined
    }

    const timeoutId = setTimeout(() => {
      void saveCurrentJournal()
    }, localSaveDebounceMs)

    return () => clearTimeout(timeoutId)
  }, [saveCurrentJournal, saveState])

  const isLongEntryInputUnstable = useCallback(() => (
    shouldDeferBackgroundSyncForInput({
      isFocused: isLongEntryFocusedRef.current,
      lastEditedAt: lastLongEntryEditedAtRef.current,
      now: Date.now(),
      stableWindowMs: localSaveDebounceMs,
    })
  ), [])

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
    const body = murmurDraft.trim()

    if (!body) {
      return
    }

    const previousMurmurs = murmurs
    const nextMurmurs = [...previousMurmurs, createMurmur(today, body)]

    journalVersionRef.current += 1
    setMurmurs(nextMurmurs)
    const savedRecord = await saveCurrentJournal(longEntryMarkdown, nextMurmurs)

    if (savedRecord) {
      setMurmurDraft('')
    } else {
      journalVersionRef.current += 1
      setMurmurs(previousMurmurs)
    }
  }, [longEntryMarkdown, murmurDraft, murmurs, saveCurrentJournal, today])

  const saveSyncConfiguration = useCallback(async () => {
    const remoteUrl = syncRemoteUrl.trim()
    const branch = syncBranch.trim() || 'main'
    const token = syncTokenDraft.trim()

    if (!remoteUrl) {
      Alert.alert('缺少仓库地址', '请先填写 GitHub 私有仓库地址。')
      return false
    }

    setIsSavingSyncConfiguration(true)

    try {
      await saveGitHubSyncSettings({ branch, remoteUrl })

      if (token) {
        await saveGitHubSyncCredentials({ token })
        setSyncTokenDraft('')
        setHasStoredSyncToken(true)
      }

      syncConfigRef.current = {
        branch,
        hasStoredSyncToken: token ? true : hasStoredSyncToken,
        remoteUrl,
      }
      setSyncBranch(branch)
      setSyncRemoteUrl(remoteUrl)
      setSyncMessage('同步配置已保存')
      setSyncSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        lastError: null,
        status: 'idle',
      }))
      void resumeConfiguredSync()
      return true
    } catch (error) {
      console.error(error)
      setSyncSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        lastError: '同步配置保存失败',
        status: 'error',
      }))
      setSyncMessage('同步配置保存失败')
      Alert.alert('保存失败', '同步配置没有保存成功。')
      return false
    } finally {
      setIsSavingSyncConfiguration(false)
    }
  }, [hasStoredSyncToken, resumeConfiguredSync, syncBranch, syncRemoteUrl, syncTokenDraft])

  const reloadTodayFromDisk = useCallback(async () => {
    const loadedRecord = await loadDailyJournal(today)

    journalVersionRef.current += 1
    setRecord(loadedRecord)
    setLongEntryMarkdown(loadedRecord.longEntryMarkdown)
    setMurmurs(loadedRecord.murmurs)
    setSaveState('idle')
  }, [today])

  const runMobileSyncOperation = useCallback(async ({ operation, trigger }: SyncOperationRequest) => {
    const branch = syncConfigRef.current.branch.trim() || 'main'
    const remoteUrl = syncConfigRef.current.remoteUrl.trim()

    if (!remoteUrl) {
      return {
        message: '还没有配置同步仓库',
        needsAuth: true,
      }
    }

    if (!syncConfigRef.current.hasStoredSyncToken) {
      return {
        message: '还没有保存 GitHub token',
        needsAuth: true,
      }
    }

    if (operation === 'pull') {
      if (saveStateRef.current === 'dirty' || saveStateRef.current === 'saving') {
        return {
          message: '正在编辑，稍后检查远端更新',
          skipped: true,
        }
      }

      const result = await pullMobileJournalUpdatesFromGitHub({ branch, remoteUrl })

      if (
        result.updatedWorktree &&
        canApplyRemoteUpdates(saveStateRef.current)
      ) {
        await reloadTodayFromDisk()
      }

      return {
        changed: result.updatedWorktree,
      }
    }

    if (saveStateRef.current === 'saving') {
      return {
        message: '本地保存还没有完成，稍后同步',
        skipped: true,
      }
    }

    if (saveStateRef.current === 'dirty') {
      if (trigger === 'save-idle' && isLongEntryInputUnstable()) {
        return {
          message: '正在编辑，稍后同步',
          skipped: true,
        }
      }

      const savedRecord = await saveCurrentJournalRef.current?.({
        scheduleSync: false,
        showAlert: operation === 'full',
      })

      if (!savedRecord) {
        return {
          message: '本地保存还没有完成，稍后同步',
          skipped: true,
        }
      }
    }

    if (operation === 'push') {
      const result = await pushMobileJournalChangesToGitHub({ branch, remoteUrl })

      return {
        changed: Boolean(result.localCommitOid || result.retriedPush),
      }
    }

    const result = await syncMobileJournalWithGitHub({ branch, remoteUrl })

    if (
      canApplyRemoteUpdates(saveStateRef.current)
    ) {
      await reloadTodayFromDisk()
    }

    return {
      changed: Boolean(result.localCommitOid || result.mergeResult || result.retriedPush),
    }
  }, [isLongEntryInputUnstable, reloadTodayFromDisk])

  useEffect(() => {
    const coordinator = new JournalSyncCoordinator({
      onSnapshot: (snapshot) => {
        setSyncSnapshot(snapshot)

        if (snapshot.status !== 'synced') {
          setSyncMessage('')
        }
      },
      runOperation: runMobileSyncOperation,
    })

    coordinatorRef.current = coordinator

    return () => {
      coordinator.dispose()

      if (coordinatorRef.current === coordinator) {
        coordinatorRef.current = null
      }
    }
  }, [runMobileSyncOperation])

  useEffect(() => {
    const coordinator = coordinatorRef.current

    if (!coordinator || !hasLoadedSyncConfiguration) {
      return undefined
    }

    if (syncRemoteUrl.trim() && hasStoredSyncToken) {
      let isCancelled = false

      void markDirtyWorktreeForSync().then(() => {
        if (!isCancelled) {
          coordinator.startPulling()
        }
      })

      return () => {
        isCancelled = true
        coordinator.stopPulling()
      }
    }

    coordinator.stopPulling()

    return undefined
  }, [hasLoadedSyncConfiguration, hasStoredSyncToken, markDirtyWorktreeForSync, syncRemoteUrl])

  const flushBeforeLeavingApp = useCallback(async () => {
    if (saveStateRef.current === 'dirty') {
      const savedRecord = await saveCurrentJournalRef.current?.({
        scheduleSync: false,
        showAlert: false,
      })

      if (savedRecord?.didWrite) {
        coordinatorRef.current?.markLocalSave()
      }
    }

    if (isLongEntryInputUnstable()) {
      return
    }

    await coordinatorRef.current?.flushBeforeLeave()
  }, [isLongEntryInputUnstable])

  useEffect(() => {
    const intervalId = setInterval(() => {
      void checkForDateRollover().catch((error) => {
        console.error(error)
      })
    }, dateRolloverCheckMs)

    return () => clearInterval(intervalId)
  }, [checkForDateRollover])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void checkForDateRollover()
          .catch((error) => {
            console.error(error)
          })
          .finally(() => {
            void resumeConfiguredSync()
          })
      } else if (nextState === 'background' || nextState === 'inactive') {
        void flushBeforeLeavingApp()
      }
    })

    return () => subscription.remove()
  }, [checkForDateRollover, flushBeforeLeavingApp, resumeConfiguredSync])

  const handleSyncNow = useCallback(async () => {
    const remoteUrl = syncRemoteUrl.trim()
    const branch = syncBranch.trim() || 'main'
    const token = syncTokenDraft.trim()

    if (!remoteUrl) {
      Alert.alert('缺少仓库地址', '请先填写 GitHub 私有仓库地址。')
      return
    }

    if (!token && !hasStoredSyncToken) {
      Alert.alert('缺少 GitHub token', '请先填写并保存 GitHub token。')
      return
    }

    try {
      await saveGitHubSyncSettings({ branch, remoteUrl })

      if (token) {
        await saveGitHubSyncCredentials({ token })
        setSyncTokenDraft('')
        setHasStoredSyncToken(true)
      }

      syncConfigRef.current = {
        remoteUrl,
        branch,
        hasStoredSyncToken: token ? true : hasStoredSyncToken,
      }

      setSyncBranch(branch)
      setSyncRemoteUrl(remoteUrl)
      setSyncMessage('')

      const snapshot = await coordinatorRef.current?.syncNow()

      if (snapshot?.status === 'error' || snapshot?.status === 'retrying' || snapshot?.status === 'needs-auth') {
        Alert.alert('同步失败', snapshot.lastError ?? '同步过程中出现未知错误。')
      } else {
        setSyncMessage('同步完成')
      }
    } catch (error) {
      console.error(error)
      setSyncSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        lastError: getErrorMessage(error),
        status: 'error',
      }))
      setSyncMessage('同步失败')
      Alert.alert('同步失败', getErrorMessage(error))
    }
  }, [
    hasStoredSyncToken,
    syncBranch,
    syncRemoteUrl,
    syncTokenDraft,
  ])

  const isBusy = saveState === 'saving' || saveState === 'loading'
  const isSyncBusy = isSavingSyncConfiguration || syncSnapshot.status === 'syncing'
  const headerStatus = getHeaderStatus(
    saveState,
    syncSnapshot,
    hasStoredSyncToken,
    syncRemoteUrl,
  )
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
                    />
                    <TopNavButton
                      icon="sparkles-outline"
                      label="回顾"
                      onPress={() => navigation.navigate('Review')}
                    />
                  </View>
                  <View className="flex-row items-center gap-1">
                    <InlineStatusButton
                      status={headerStatus}
                      onPress={() => navigation.navigate('Settings')}
                    />
                    <HeaderIconButton
                      icon="settings-outline"
                      label="设置"
                      onPress={() => navigation.navigate('Settings')}
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
                    />
                  </View>
                  <TextInput
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
                        value={murmurDraft}
                      />
                    </View>
                    <View className="flex-row justify-end" style={{ marginTop: 18 }}>
                      <Button
                        className="min-h-10 rounded-full px-5"
                        disabled={!murmurDraft.trim() || isBusy}
                        icon="add"
                        onPress={() => void handleAddMurmur()}
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
              onBack={navigation.goBack}
              today={today}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Review">
          {({ navigation }) => (
            <ReviewPage
              longEntryMarkdown={longEntryMarkdown}
              murmurCount={murmurs.length}
              onBack={navigation.goBack}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Settings">
          {({ navigation }) => (
            <SettingsPage
              hasStoredSyncToken={hasStoredSyncToken}
              isBusy={isBusy}
              isSavingSyncConfiguration={isSavingSyncConfiguration}
              isSyncBusy={isSyncBusy}
              murmursCount={murmurs.length}
              onBack={navigation.goBack}
              onSaveCurrent={() => void saveCurrentJournal()}
              onSaveSyncConfiguration={() => void saveSyncConfiguration()}
              onSyncNow={() => void handleSyncNow()}
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
}: {
  count: number
  onPress: () => void
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
}: {
  icon: IconName
  label: string
  onPress: () => void
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
    >
      <Ionicons color="#254f43" name={icon} size={19} />
    </Pressable>
  )
}

function HeaderIconButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName
  label: string
  onPress: () => void
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
    >
      <Ionicons color="#4f7469" name={icon} size={15} />
    </Pressable>
  )
}

function PageShell({
  children,
  icon,
  onBack,
  title,
}: {
  children: ReactNode
  icon: IconName
  onBack: () => void
  title: string
}) {
  return (
    <Screen>
      <View className="flex-1 px-5 pb-5 pt-4">
        <View className="mb-5 flex-row items-center gap-3">
          <Pressable
            accessibilityLabel="返回今日"
            accessibilityRole="button"
            className="h-9 w-9 items-center justify-center rounded-full bg-cloud"
            onPress={onBack}
          >
            <Ionicons color="#254f43" name="chevron-back" size={22} />
          </Pressable>
          <View className="flex-row items-center gap-2">
            <View className="h-8 w-8 items-center justify-center rounded-lg bg-cloud">
              <Ionicons color="#254f43" name={icon} size={18} />
            </View>
            <Text className="text-lg font-semibold text-ink">{title}</Text>
          </View>
        </View>
        {children}
      </View>
    </Screen>
  )
}

function JournalListPage({
  longEntryMarkdown,
  murmurCount,
  onBack,
  today,
}: {
  longEntryMarkdown: string
  murmurCount: number
  onBack: () => void
  today: string
}) {
  const trimmedEntry = longEntryMarkdown.trim()

  return (
    <PageShell icon="calendar-outline" onBack={onBack} title="日记列表">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="rounded-lg border border-reed bg-paper px-4 py-4">
          <View className="mb-3 flex-row items-center justify-between gap-3">
            <Text className="text-base font-semibold text-ink">今天</Text>
            <Text className="text-sm font-medium text-mossMuted">{formatPaperDateLine(today)}</Text>
          </View>
          <Text className="text-sm leading-5 text-mossMuted" numberOfLines={3}>
            {trimmedEntry || (murmurCount > 0 ? `${murmurCount} 条碎碎念` : '还没有写下内容')}
          </Text>
        </View>
      </ScrollView>
    </PageShell>
  )
}

function ReviewPage({
  longEntryMarkdown,
  murmurCount,
  onBack,
}: {
  longEntryMarkdown: string
  murmurCount: number
  onBack: () => void
}) {
  const trimmedEntry = longEntryMarkdown.trim()

  return (
    <PageShell icon="sparkles-outline" onBack={onBack} title="回顾">
      <View className="gap-3">
        <View className="rounded-lg border border-reed bg-paper px-4 py-4">
          <Text className="mb-3 text-base font-semibold text-ink">今天</Text>
          <View className="flex-row gap-3">
            <View className="flex-1 rounded-lg bg-cloud px-3 py-3">
              <Text className="text-xs font-medium text-mossMuted">长日记</Text>
              <Text className="mt-1 text-lg font-semibold text-moss">{trimmedEntry.length} 字</Text>
            </View>
            <View className="flex-1 rounded-lg bg-cloud px-3 py-3">
              <Text className="text-xs font-medium text-mossMuted">碎碎念</Text>
              <Text className="mt-1 text-lg font-semibold text-moss">{murmurCount} 条</Text>
            </View>
          </View>
        </View>
        <Text className="px-1 text-sm leading-5 text-mossMuted">
          回顾会从已有日记里慢慢长出来，先把今天留下来就好。
        </Text>
      </View>
    </PageShell>
  )
}

function SettingsPage({
  hasStoredSyncToken,
  isBusy,
  isSavingSyncConfiguration,
  isSyncBusy,
  murmursCount,
  onBack,
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
}: {
  hasStoredSyncToken: boolean
  isBusy: boolean
  isSavingSyncConfiguration: boolean
  isSyncBusy: boolean
  murmursCount: number
  onBack: () => void
  onSaveCurrent: () => void
  onSaveSyncConfiguration: () => void
  onSyncNow: () => void
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
}) {
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
              value="Markdown"
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
              variant="secondary"
            >
              保存当前
            </Button>
          </View>

          <View className="h-px bg-reed" />

          <View className="gap-3">
            <Input
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={setSyncRemoteUrl}
              placeholder="https://github.com/you/journal-sync.git"
              value={syncRemoteUrl}
            />
            <Input
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setSyncBranch}
              placeholder="main"
              value={syncBranch}
            />
            <View className="gap-1">
              <Input
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setSyncTokenDraft}
                placeholder={hasStoredSyncToken ? 'Token 已保存，留空不改' : 'GitHub token'}
                secureTextEntry
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
                onPress={onSaveSyncConfiguration}
                variant="secondary"
              >
                保存配置
              </Button>
              <Button
                className="flex-1"
                disabled={isSyncBusy}
                icon="sync-outline"
                loading={syncSnapshot.status === 'syncing'}
                onPress={onSyncNow}
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

function InlineStatusButton({
  onPress,
  status,
}: {
  onPress: () => void
  status: HeaderStatus
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
    >
      <Text className={cn('text-xs font-semibold', headerStatusTextClasses[status.tone])}>
        {status.label}
      </Text>
    </Pressable>
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

function canApplyRemoteUpdates(saveState: SaveState) {
  return saveState !== 'dirty' && saveState !== 'saving'
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '同步过程中出现未知错误。'
}

const headerStatusTextClasses: Record<HeaderStatusTone, string> = {
  blue: 'text-mossMuted',
  green: 'text-mossMuted',
  plain: 'text-mossMuted',
  soil: 'text-soil',
}
