import { type ComponentProps, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AppState,
  BackHandler,
  Image as NativeImage,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Ionicons } from '@expo/vector-icons'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import {
  getBuiltInThemeById,
  normalizeThemeIds,
  orderMurmursByNewest,
  type DayFrontMatter,
  type ImageBlock,
  type MurmurBlock,
} from '@journal/core'
import { radiusPixels, semanticColors, spacingPixels } from '@journal/theme'
import {
  getJournalSyncStatusPresentation,
  type JournalSyncStatusTone,
  type SyncSnapshot,
} from '@journal/sync'
import {
  CommonActions,
  NavigationContainer,
  type NavigationContainerRef,
} from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import {
  useMobileJournal,
  type SaveState,
} from './hooks/useMobileJournal'
import { useMobileSync } from './hooks/useMobileSync'
import { useMobileWeather } from './hooks/useMobileWeather'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'
import { cn } from './ui/cn'
import { ImagePreviewModal } from './ui/ImagePreviewModal'
import { JournalListPage } from './pages/JournalListPage'
import { ReviewPage } from './pages/ReviewPage'
import { ReviewDayPage } from './pages/ReviewDayPage'
import { SettingsPage } from './pages/SettingsPage'
import { SyncSettingsPage } from './pages/SyncSettingsPage'
import { PageShell } from './pages/PageShell'
import { Screen } from './ui/Screen'
import {
  importMobileJournalImagesForDate,
  resolveJournalMediaFileUri,
} from './services/mobileJournalStore'
import { fetchTodayMobileWeather } from './services/mobileWeather'
import {
  loadMobileUiSettings,
  saveMobileUiSettings,
  type MobileHomeMode,
} from './services/mobileUiSettings'
import { journalEffects } from './services/journalEffects'
import { isMobileE2eDebugLinkEnabled } from './services/e2eEnvironment'
import { loadMobileE2eRuntimeConfig } from './services/mobileE2eRuntimeConfig'
import {
  parseJournalDeepLink,
  type ParsedJournalDeepLink,
} from './widgets/journalWidgetLinks'

type IconName = ComponentProps<typeof Ionicons>['name']
type HeaderStatusTone = 'blue' | 'danger' | 'green' | 'plain'
type HeaderStatus = {
  label: string
  tone: HeaderStatusTone
}
type RootStackParamList = {
  Today: undefined
  Murmurs: undefined
  LongEntry: undefined
  JournalList: undefined
  Review: undefined
  ReviewDay: { date: string }
  Settings: undefined
  SyncSettings: undefined
}
type ImageImportSource = 'camera' | 'library'
type ImagePreviewState = {
  accessibilityLabel: string
  caption: string | null
  uri: string
}

const Stack = createNativeStackNavigator<RootStackParamList>()
const murmurDraftInputMinHeight = 92

type ResetNavigation = {
  dispatch: (action: ReturnType<typeof CommonActions.reset>) => void
}
type BackNavigation = ResetNavigation & {
  canGoBack: () => boolean
  goBack: () => void
}
type RootStackResetRoute =
  | { name: 'Today' }
  | { name: 'Murmurs' }
  | { name: 'LongEntry' }
  | { name: 'JournalList' }
  | { name: 'Review' }
  | { name: 'ReviewDay', params: RootStackParamList['ReviewDay'] }
  | { name: 'Settings' }
  | { name: 'SyncSettings' }

function returnToToday(navigation: ResetNavigation) {
  resetNavigationStack(navigation, [{ name: 'Today' }])
}

function resetNavigationStack(
  navigation: ResetNavigation,
  routes: RootStackResetRoute[],
) {
  navigation.dispatch(CommonActions.reset({
    index: routes.length - 1,
    routes,
  }))
}

function goBackOrReturnToToday(navigation: BackNavigation) {
  if (navigation.canGoBack()) {
    navigation.goBack()
    return
  }

  returnToToday(navigation)
}

export default function App() {
  const [hasLoadedE2eRuntimeConfig, setHasLoadedE2eRuntimeConfig] = useState(false)

  useEffect(() => {
    let isMounted = true

    void loadMobileE2eRuntimeConfig()
      .catch((error) => {
        console.error(error)
      })
      .finally(() => {
        if (isMounted) {
          setHasLoadedE2eRuntimeConfig(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  if (!hasLoadedE2eRuntimeConfig) {
    return null
  }

  return <JournalApp />
}

function JournalApp() {
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null)
  const pendingDeepLinkRef = useRef<ParsedJournalDeepLink | null>(null)
  const hasRequestedInitialUrlRef = useRef(false)
  const initialActiveEventDateRef = useRef<string | null>(null)
  const homeModeRef = useRef<MobileHomeMode>('long-entry')
  const homeModeSaveRequestRef = useRef(0)
  const [murmurDraft, setMurmurDraft] = useState('')
  const [murmurDraftInputHeight, setMurmurDraftInputHeight] = useState(murmurDraftInputMinHeight)
  const [selectedMurmurThemeIds, setSelectedMurmurThemeIds] = useState<string[]>([])
  const [activeImageImport, setActiveImageImport] = useState<ImageImportSource | null>(null)
  const [previewImage, setPreviewImage] = useState<ImagePreviewState | null>(null)
  const [homeMode, setHomeModeState] = useState<MobileHomeMode>('long-entry')
  const [hasLoadedUiSettings, setHasLoadedUiSettings] = useState(false)
  const [editingMurmurId, setEditingMurmurId] = useState<string | null>(null)
  const {
    addMurmur,
    addImagesToMurmur,
    checkForDateRollover,
    handleLongEntryChange,
    isLongEntryFocusedRef,
    isLongEntryInputUnstable,
    longEntryMarkdown,
    murmurs,
    record,
    reloadTodayFromDisk,
    reloadTodayFromDiskIfChanged,
    saveCurrentJournalRef,
    saveState,
    saveStateRef,
    removeMurmurImage,
    today,
    updateTodayFrontMatter,
    updateMurmurBody,
    updateMurmurImageCaption,
  } = useMobileJournal()
  const {
    gitStatusError,
    handleSyncNow,
    hasStoredSyncToken,
    isLoadingGitStatus,
    isSavingSyncConfiguration,
    mobileGitStatus,
    prepareDebugSyncConflictFixture,
    refreshMobileGitStatus,
    resolveSyncConflict,
    saveSyncConfiguration,
    setSyncBranch,
    setSyncRemoteUrl,
    setSyncTokenDraft,
    showDebugSyncBlocked,
    syncBranch,
    syncMessage,
    syncRemoteUrl,
    syncSnapshot,
    syncTokenDraft,
  } = useMobileSync({
    checkForDateRollover,
    isLongEntryInputUnstable,
    reloadTodayFromDisk,
    reloadTodayFromDiskIfChanged,
    saveCurrentJournalRef,
    saveStateRef,
  })
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
  const isImportingImages = activeImageImport !== null
  const isSyncBusy = isSavingSyncConfiguration || syncSnapshot.status === 'syncing'
  const headerStatus = getHeaderStatus(
    saveState,
    syncSnapshot,
    hasStoredSyncToken,
    syncRemoteUrl,
  )
  const paperDateLine = formatPaperDateLine(today)
  const weatherLineLabel = formatWeatherLineLabel(record?.frontMatter.weather)
  const paperHeaderLine = [paperDateLine, weatherLineLabel].filter(Boolean).join(' · ')
  const selectedMurmurTheme = selectedMurmurThemeIds[0]
    ? getBuiltInThemeById(selectedMurmurThemeIds[0])
    : null
  const orderedMurmurs = useMemo(() => orderMurmursByNewest(murmurs), [murmurs])
  const editingMurmur = useMemo(() => (
    editingMurmurId
      ? murmurs.find((murmur) => murmur.id === editingMurmurId) ?? null
      : null
  ), [editingMurmurId, murmurs])

  const currentDayForEvents = useMemo(() => {
    if (!record) {
      return null
    }

    return {
      date: today,
      frontMatter: record.frontMatter,
      longEntryMarkdown,
      murmurs,
    }
  }, [longEntryMarkdown, murmurs, record, today])

  const emitAppActiveEvent = useCallback(() => {
    if (!currentDayForEvents) {
      return
    }

    void journalEffects.refreshForAppActive({
      currentDay: currentDayForEvents,
      date: today,
    })
  }, [currentDayForEvents, today])

  useMobileWeather({
    frontMatter: record?.frontMatter ?? null,
    isLongEntryInputUnstable,
    record,
    saveState,
    saveStateRef,
    today,
    updateTodayFrontMatter,
  })

  const setHomeMode = useCallback((nextHomeMode: MobileHomeMode) => {
    const previousHomeMode = homeModeRef.current
    const requestId = homeModeSaveRequestRef.current + 1

    homeModeSaveRequestRef.current = requestId
    homeModeRef.current = nextHomeMode
    setHomeModeState(nextHomeMode)

    void saveMobileUiSettings({ homeMode: nextHomeMode })
      .then((settings) => {
        if (homeModeSaveRequestRef.current !== requestId) {
          return
        }

        homeModeRef.current = settings.homeMode
        setHomeModeState(settings.homeMode)
      })
      .catch((error) => {
        if (homeModeSaveRequestRef.current !== requestId) {
          return
        }

        console.error(error)
        homeModeRef.current = previousHomeMode
        setHomeModeState(previousHomeMode)
      })
  }, [])

  const openMurmurEntryForTheme = useCallback((navigation: ResetNavigation, themeId: string) => {
    setSelectedMurmurThemeIds(normalizeThemeIds([themeId]))
    resetNavigationStack(navigation, homeMode === 'murmur'
      ? [{ name: 'Today' }]
      : [{ name: 'Today' }, { name: 'Murmurs' }])
  }, [homeMode])

  const handleRefreshWeatherForDiagnostics = useCallback(async () => {
    const weatherPayload = await fetchTodayMobileWeather()
    const updatedRecord = await updateTodayFrontMatter({
      weather: weatherPayload.weather,
      location: weatherPayload.location,
    })

    return updatedRecord.frontMatter
  }, [updateTodayFrontMatter])

  const applyJournalDeepLink = useCallback((deepLink: ParsedJournalDeepLink) => {
    if (!hasLoadedUiSettings) {
      pendingDeepLinkRef.current = deepLink
      return
    }

    const navigation = navigationRef.current

    if (!navigation?.isReady()) {
      pendingDeepLinkRef.current = deepLink
      return
    }

    if (deepLink.type === 'write') {
      openMurmurEntryForTheme(navigation, deepLink.themeId)
      return
    }

    if (deepLink.type === 'reviewDay') {
      resetNavigationStack(navigation, [
        { name: 'Today' },
        { name: 'ReviewDay', params: { date: deepLink.date } },
      ])
      return
    }

    if (deepLink.type === 'debugSyncBlocked') {
      if (!isMobileE2eDebugLinkEnabled()) {
        return
      }

      showDebugSyncBlocked(deepLink.reason)
      resetNavigationStack(navigation, [
        { name: 'Today' },
        { name: 'SyncSettings' },
      ])
      return
    }

    if (deepLink.type === 'debugSyncConflictFixture') {
      if (!isMobileE2eDebugLinkEnabled()) {
        return
      }

      resetNavigationStack(navigation, [
        { name: 'Today' },
        { name: 'SyncSettings' },
      ])
      void prepareDebugSyncConflictFixture({
        date: deepLink.date,
        localText: deepLink.localText,
      })
      return
    }

    resetNavigationStack(navigation, [
      { name: 'Today' },
      { name: 'Review' },
    ])
  }, [hasLoadedUiSettings, openMurmurEntryForTheme, prepareDebugSyncConflictFixture, showDebugSyncBlocked])

  const handleJournalDeepLink = useCallback((url: string | null) => {
    if (!url) {
      return
    }

    const deepLink = parseJournalDeepLink(url)

    if (deepLink) {
      applyJournalDeepLink(deepLink)
    }
  }, [applyJournalDeepLink])

  const flushPendingDeepLink = useCallback(() => {
    if (!hasLoadedUiSettings) {
      return
    }

    const pendingDeepLink = pendingDeepLinkRef.current

    if (!pendingDeepLink) {
      return
    }

    pendingDeepLinkRef.current = null
    applyJournalDeepLink(pendingDeepLink)
  }, [applyJournalDeepLink, hasLoadedUiSettings])

  const closeMurmurEditor = useCallback(() => {
    setEditingMurmurId(null)
  }, [])

  const openImagePreview = useCallback((image: ImageBlock) => {
    const imageUri = resolveJournalMediaFileUri(image.src) ?? image.src
    const caption = image.caption?.trim() || null

    setPreviewImage({
      accessibilityLabel: caption ?? '日记图片预览',
      caption,
      uri: imageUri,
    })
  }, [])

  const handleAddMurmur = useCallback(async () => {
    const didAdd = await addMurmur(murmurDraft, selectedMurmurThemeIds)

    if (didAdd) {
      setMurmurDraft('')
      setSelectedMurmurThemeIds([])
    }
  }, [addMurmur, murmurDraft, selectedMurmurThemeIds])

  const handleImportMurmurImages = useCallback(async (
    source: ImageImportSource,
    murmurId?: string | null,
  ) => {
    if (isBusy || isImportingImages) {
      return
    }

    setActiveImageImport(source)

    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync(false)

      if (!permission.granted) {
        Alert.alert(
          source === 'camera' ? '无法打开相机' : '无法打开相册',
          source === 'camera'
            ? '请允许 Journal 使用相机后再拍照。'
            : '请允许 Journal 访问照片后再添加图片。',
        )
        return
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            exif: true,
            mediaTypes: ['images'],
            quality: 1,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsMultipleSelection: true,
            exif: true,
            mediaTypes: ['images'],
            preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
            quality: 1,
          })

      if (result.canceled) {
        return
      }

      const importedImages = await importMobileJournalImagesForDate(today, result.assets)

      if (importedImages.length === 0) {
        Alert.alert('没有可用图片', source === 'camera'
          ? '刚才拍下的照片没有能放进日记的图片文件。'
          : '刚才选择的内容里没有能放进日记的图片。')
        return
      }

      const didAdd = await addImagesToMurmur({
        body: murmurDraft,
        images: importedImages,
        murmurId,
        themes: murmurId ? [] : selectedMurmurThemeIds,
      })

      if (didAdd && !murmurId) {
        setMurmurDraft('')
        setSelectedMurmurThemeIds([])
      }
    } catch (error) {
      console.error(error)
      Alert.alert('图片没有放进去', source === 'camera'
        ? '刚才拍下的照片没有保存成功。'
        : '刚才选择的图片没有保存成功。')
    } finally {
      setActiveImageImport(null)
    }
  }, [addImagesToMurmur, isBusy, isImportingImages, murmurDraft, selectedMurmurThemeIds, today])

  useEffect(() => {
    let isMounted = true

    void loadMobileUiSettings()
      .then((settings) => {
        if (isMounted) {
          homeModeRef.current = settings.homeMode
          setHomeModeState(settings.homeMode)
          setHasLoadedUiSettings(true)
        }
      })
      .catch((error) => {
        console.error(error)

        if (isMounted) {
          setHasLoadedUiSettings(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!hasLoadedUiSettings || hasRequestedInitialUrlRef.current) {
      return
    }

    hasRequestedInitialUrlRef.current = true

    void Linking.getInitialURL()
      .then(handleJournalDeepLink)
      .catch((error) => {
        console.error(error)
      })
  }, [handleJournalDeepLink, hasLoadedUiSettings])

  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => {
      handleJournalDeepLink(event.url)
    })

    return () => subscription.remove()
  }, [handleJournalDeepLink])

  useEffect(() => {
    flushPendingDeepLink()
  }, [flushPendingDeepLink])

  useEffect(() => {
    if (!currentDayForEvents || saveState !== 'idle' || initialActiveEventDateRef.current === today) {
      return
    }

    initialActiveEventDateRef.current = today
    emitAppActiveEvent()
  }, [currentDayForEvents, emitAppActiveEvent, saveState, today])

  useEffect(() => {
    if (editingMurmurId && !editingMurmur) {
      setEditingMurmurId(null)
    }
  }, [editingMurmur, editingMurmurId])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        emitAppActiveEvent()
      }
    })

    return () => subscription.remove()
  }, [emitAppActiveEvent])

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const navigation = navigationRef.current

      if (!navigation?.isReady() || navigation.getCurrentRoute()?.name === 'Today') {
        return false
      }

      goBackOrReturnToToday(navigation)
      return true
    })

    return () => subscription.remove()
  }, [])

  return (
    <>
      <NavigationContainer
        onReady={() => {
          flushPendingDeepLink()
        }}
        ref={navigationRef}
      >
      <Stack.Navigator
        screenOptions={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: semanticColors.background },
          gestureEnabled: true,
          headerShown: false,
        }}
      >
        <Stack.Screen name="Today">
          {({ navigation }) => (
            <Screen
              bottomColor={semanticColors.surface}
              keyboardAvoidingEnabled={false}
            >
              {homeMode === 'murmur' ? (
                <TodayMurmurMode
                  activeImageImport={activeImageImport}
                  headerStatus={headerStatus}
                  isBusy={isBusy}
                  isImportingImages={isImportingImages}
                  murmurDraft={murmurDraft}
                  murmurDraftInputHeight={murmurDraftInputHeight}
                  murmurs={orderedMurmurs}
                  murmurCount={murmurs.length}
                  longEntryMarkdown={longEntryMarkdown}
                  onAddMurmur={() => void handleAddMurmur()}
                  onChangeMurmurDraft={setMurmurDraft}
                  onClearTheme={() => setSelectedMurmurThemeIds([])}
                  onContentSizeChange={(height) => setMurmurDraftInputHeight(height)}
                  onImportImages={(source) => void handleImportMurmurImages(source)}
                  onPreviewImage={openImagePreview}
                  onEditMurmur={setEditingMurmurId}
                  onOpenJournalList={() => navigation.navigate('JournalList')}
                  onOpenLongEntry={() => navigation.navigate('LongEntry')}
                  onOpenReview={() => navigation.navigate('Review')}
                  onOpenSettings={() => navigation.navigate('Settings')}
                  onOpenSyncSettings={() => navigation.navigate('SyncSettings')}
                  paperHeaderLine={paperHeaderLine}
                  selectedMurmurTheme={selectedMurmurTheme}
                />
              ) : (
                <KeyboardAwareScrollView
                  bottomOffset={spacingPixels['8']}
                  contentContainerStyle={{ flexGrow: 1 }}
                  disableScrollOnKeyboardHide
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={{ flex: 1 }}
                >
                  <View className="flex-1 gap-1.5 pt-4" style={{ minHeight: 0 }}>
                    <TodayTopBar
                      headerStatus={headerStatus}
                      onOpenJournalList={() => navigation.navigate('JournalList')}
                      onOpenReview={() => navigation.navigate('Review')}
                      onOpenSettings={() => navigation.navigate('Settings')}
                      onOpenSyncSettings={() => navigation.navigate('SyncSettings')}
                    />
                    <LongEntryPaper
                      isLongEntryFocusedRef={isLongEntryFocusedRef}
                      longEntryMarkdown={longEntryMarkdown}
                      markdownDiagnosticSummary={markdownDiagnosticSummary}
                      onChangeLongEntry={handleLongEntryChange}
                      paperHeaderLine={paperHeaderLine}
                      rightAction={(
                        <MurmurCountButton
                          count={murmurs.length}
                          onPress={() => navigation.navigate('Murmurs')}
                          testID="murmur-count-button"
                        />
                      )}
                    />
                  </View>
                </KeyboardAwareScrollView>
              )}
            </Screen>
          )}
        </Stack.Screen>
        <Stack.Screen name="Murmurs">
          {({ navigation }) => (
            <MurmurPage
              activeImageImport={activeImageImport}
              isBusy={isBusy}
              isImportingImages={isImportingImages}
              murmurDraft={murmurDraft}
              murmurDraftInputHeight={murmurDraftInputHeight}
              murmurs={orderedMurmurs}
              murmurCount={murmurs.length}
              onAddMurmur={() => void handleAddMurmur()}
              onBack={() => goBackOrReturnToToday(navigation)}
              onChangeMurmurDraft={setMurmurDraft}
              onClearTheme={() => setSelectedMurmurThemeIds([])}
              onContentSizeChange={(height) => setMurmurDraftInputHeight(height)}
              onEditMurmur={setEditingMurmurId}
              onImportImages={(source) => void handleImportMurmurImages(source)}
              onPreviewImage={openImagePreview}
              paperHeaderLine={paperHeaderLine}
              selectedMurmurTheme={selectedMurmurTheme}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="LongEntry">
          {({ navigation }) => (
            <LongEntryPage
              isLongEntryFocusedRef={isLongEntryFocusedRef}
              longEntryMarkdown={longEntryMarkdown}
              markdownDiagnosticSummary={markdownDiagnosticSummary}
              onBack={() => goBackOrReturnToToday(navigation)}
              onChangeLongEntry={handleLongEntryChange}
              paperHeaderLine={paperHeaderLine}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="JournalList">
          {({ navigation }) => (
            <JournalListPage
              longEntryMarkdown={longEntryMarkdown}
              murmurCount={murmurs.length}
              onBack={() => goBackOrReturnToToday(navigation)}
              onOpenDay={(date) => navigation.navigate('ReviewDay', { date })}
              onOpenToday={() => returnToToday(navigation)}
              today={today}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Review">
          {({ navigation }) => (
            <ReviewPage
              currentFrontMatter={record?.frontMatter ?? { date: today }}
              longEntryMarkdown={longEntryMarkdown}
              onBack={() => goBackOrReturnToToday(navigation)}
              onOpenSourceDay={(date) => navigation.navigate('ReviewDay', { date })}
              onStartThemeEntry={(themeId) => {
                openMurmurEntryForTheme(navigation, themeId)
              }}
              murmurs={murmurs}
              today={today}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="ReviewDay">
          {({ navigation, route }) => (
            <ReviewDayPage
              date={route.params.date}
              onBack={() => goBackOrReturnToToday(navigation)}
              onPreviewImage={openImagePreview}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Settings">
          {({ navigation }) => (
            <SettingsPage
              hasStoredSyncToken={hasStoredSyncToken}
              isSavingSyncConfiguration={isSavingSyncConfiguration}
              currentFrontMatter={record?.frontMatter ?? { date: today }}
              homeMode={homeMode}
              onBack={() => goBackOrReturnToToday(navigation)}
              onChangeHomeMode={setHomeMode}
              onRefreshWeather={handleRefreshWeatherForDiagnostics}
              onSaveSyncConfiguration={saveSyncConfiguration}
              setSyncBranch={setSyncBranch}
              setSyncRemoteUrl={setSyncRemoteUrl}
              setSyncTokenDraft={setSyncTokenDraft}
              syncBranch={syncBranch}
              syncRemoteUrl={syncRemoteUrl}
              syncSnapshot={syncSnapshot}
              syncTokenDraft={syncTokenDraft}
              today={today}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="SyncSettings">
          {({ navigation }) => (
            <SyncSettingsPage
              gitStatus={mobileGitStatus}
              gitStatusError={gitStatusError}
              hasStoredSyncToken={hasStoredSyncToken}
              isLoadingGitStatus={isLoadingGitStatus}
              isSyncBusy={isSyncBusy}
              onBack={() => goBackOrReturnToToday(navigation)}
              onOpenSyncConfiguration={() => navigation.navigate('Settings')}
              onRefreshGitStatus={refreshMobileGitStatus}
              onResolveConflict={resolveSyncConflict}
              onSyncNow={handleSyncNow}
              syncRemoteUrl={syncRemoteUrl}
              syncSnapshot={syncSnapshot}
              syncStatusLabel={syncStatusLabel}
            />
          )}
        </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
      <BottomSheet
        keyboardAvoiding
        height="88%"
        onClose={closeMurmurEditor}
        visible={Boolean(editingMurmur)}
      >
        {editingMurmur ? (
          <MurmurEditPanel
            activeImageImport={activeImageImport}
            isBusy={isBusy}
            isImportingImages={isImportingImages}
            murmur={editingMurmur}
            onAddImages={(murmurId) => void handleImportMurmurImages('library', murmurId)}
            onChangeBody={updateMurmurBody}
            onClose={closeMurmurEditor}
            onRemoveImage={removeMurmurImage}
            onPreviewImage={openImagePreview}
            onTakePhoto={(murmurId) => void handleImportMurmurImages('camera', murmurId)}
            onUpdateImageCaption={updateMurmurImageCaption}
          />
        ) : null}
      </BottomSheet>
      <ImagePreviewModal
        accessibilityLabel={previewImage?.accessibilityLabel}
        caption={previewImage?.caption}
        onClose={() => setPreviewImage(null)}
        uri={previewImage?.uri ?? null}
      />
    </>
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
      <Text className="text-sm font-semibold text-foreground">碎碎念</Text>
      <Text className="text-sm font-semibold text-text-tertiary">· {count} 条</Text>
    </Pressable>
  )
}

function LongEntryStatusButton({
  longEntryMarkdown,
  onPress,
}: {
  longEntryMarkdown: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel="打开长文"
      accessibilityRole="button"
      className="min-h-8 max-w-[180px] shrink-0 flex-row items-center gap-1.5 rounded-full px-1"
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.72 : 1,
      })}
      testID="long-entry-summary-button"
    >
      <Ionicons color={semanticColors['text-tertiary']} name="document-text-outline" size={17} />
      <Text className="shrink text-xs font-semibold text-text-tertiary" numberOfLines={1}>
        {formatLongEntryStatusLabel(longEntryMarkdown)}
      </Text>
    </Pressable>
  )
}

function TodayTopBar({
  headerStatus,
  onOpenJournalList,
  onOpenReview,
  onOpenSettings,
  onOpenSyncSettings,
}: {
  headerStatus: HeaderStatus
  onOpenJournalList: () => void
  onOpenReview: () => void
  onOpenSettings: () => void
  onOpenSyncSettings: () => void
}) {
  return (
    <View className="flex-row items-center justify-between px-5">
      <View className="flex-row items-center gap-1">
        <TopNavButton
          icon="calendar-outline"
          label="日记列表"
          onPress={onOpenJournalList}
          testID="journal-list-button"
        />
        <TopNavButton
          icon="sparkles-outline"
          label="回顾"
          onPress={onOpenReview}
          testID="review-button"
        />
      </View>
      <View className="flex-row items-center gap-1">
        <InlineStatusButton
          status={headerStatus}
          onPress={onOpenSyncSettings}
          testID="sync-status-button"
        />
        <HeaderIconButton
          icon="settings-outline"
          label="设置"
          onPress={onOpenSettings}
          testID="settings-button"
        />
      </View>
    </View>
  )
}

function LongEntryPage({
  isLongEntryFocusedRef,
  longEntryMarkdown,
  markdownDiagnosticSummary,
  onBack,
  onChangeLongEntry,
  paperHeaderLine,
}: {
  isLongEntryFocusedRef: { current: boolean }
  longEntryMarkdown: string
  markdownDiagnosticSummary: string
  onBack: () => void
  onChangeLongEntry: (value: string) => void
  paperHeaderLine: string
}) {
  return (
    <Screen
      bottomColor={semanticColors.surface}
      keyboardAvoidingEnabled={false}
    >
      <KeyboardAwareScrollView
        bottomOffset={spacingPixels['8']}
        contentContainerStyle={{ flexGrow: 1 }}
        disableScrollOnKeyboardHide
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <View className="flex-1 gap-1.5 pt-4" style={{ minHeight: 0 }}>
          <SimplePageTopBar
            onBack={onBack}
            title="长文"
          />
          <LongEntryPaper
            isLongEntryFocusedRef={isLongEntryFocusedRef}
            longEntryMarkdown={longEntryMarkdown}
            markdownDiagnosticSummary={markdownDiagnosticSummary}
            onChangeLongEntry={onChangeLongEntry}
            paperHeaderLine={paperHeaderLine}
          />
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  )
}

function SimplePageTopBar({
  onBack,
  title,
}: {
  onBack: () => void
  title: string
}) {
  return (
    <View className="flex-row items-center px-5">
      <Pressable
        accessibilityLabel="返回"
        accessibilityRole="button"
        className="h-9 w-9 items-center justify-center rounded-full"
        onPress={onBack}
        style={({ pressed }) => ({
          opacity: pressed ? 0.72 : 1,
        })}
      >
        <Ionicons color={semanticColors['text-tertiary']} name="chevron-back" size={24} />
      </Pressable>
      <Text
        className="flex-1 text-lg font-semibold text-foreground"
        style={{ textAlign: 'center' }}
      >
        {title}
      </Text>
      <View className="h-9 w-9" />
    </View>
  )
}

function MurmurPage({
  activeImageImport,
  isBusy,
  isImportingImages,
  murmurDraft,
  murmurDraftInputHeight,
  murmurCount,
  murmurs,
  onAddMurmur,
  onBack,
  onChangeMurmurDraft,
  onClearTheme,
  onContentSizeChange,
  onEditMurmur,
  onImportImages,
  onPreviewImage,
  paperHeaderLine,
  selectedMurmurTheme,
}: {
  activeImageImport: ImageImportSource | null
  isBusy: boolean
  isImportingImages: boolean
  murmurDraft: string
  murmurDraftInputHeight: number
  murmurCount: number
  murmurs: MurmurBlock[]
  onAddMurmur: () => void
  onBack: () => void
  onChangeMurmurDraft: (value: string) => void
  onClearTheme: () => void
  onContentSizeChange: (height: number) => void
  onEditMurmur: (murmurId: string) => void
  onImportImages: (source: ImageImportSource) => void
  onPreviewImage: (image: ImageBlock) => void
  paperHeaderLine: string
  selectedMurmurTheme: ReturnType<typeof getBuiltInThemeById> | null
}) {
  return (
    <PageShell onBack={onBack} title="碎碎念">
      <KeyboardAwareScrollView
        bottomOffset={spacingPixels['8']}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: spacingPixels['6'] }}
        disableScrollOnKeyboardHide
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <MurmurWritingSurface
          activeImageImport={activeImageImport}
          headerRight={(
            <Text className="text-sm font-semibold text-text-tertiary">
              {murmurCount} 条
            </Text>
          )}
          isBusy={isBusy}
          isImportingImages={isImportingImages}
          murmurDraft={murmurDraft}
          murmurDraftInputHeight={murmurDraftInputHeight}
          murmurCount={murmurCount}
          murmurs={murmurs}
          onAddMurmur={onAddMurmur}
          onChangeMurmurDraft={onChangeMurmurDraft}
          onClearTheme={onClearTheme}
          onContentSizeChange={onContentSizeChange}
          onEditMurmur={onEditMurmur}
          onImportImages={onImportImages}
          onPreviewImage={onPreviewImage}
          paperHeaderLine={paperHeaderLine}
          selectedMurmurTheme={selectedMurmurTheme}
        />
      </KeyboardAwareScrollView>
    </PageShell>
  )
}

function LongEntryPaper({
  isLongEntryFocusedRef,
  longEntryMarkdown,
  markdownDiagnosticSummary,
  onChangeLongEntry,
  paperHeaderLine,
  rightAction,
}: {
  isLongEntryFocusedRef: { current: boolean }
  longEntryMarkdown: string
  markdownDiagnosticSummary: string
  onChangeLongEntry: (value: string) => void
  paperHeaderLine: string
  rightAction?: ReactNode
}) {
  return (
    <View
      className="flex-1 rounded-lg bg-surface"
      style={{
        minHeight: 0,
        paddingBottom: spacingPixels['6'],
        paddingHorizontal: spacingPixels['6'],
        paddingTop: spacingPixels['4'],
      }}
    >
      <View className="mb-5 flex-row items-center justify-between gap-4">
        <View className="shrink">
          <Text className="text-sm font-semibold text-foreground">
            {paperHeaderLine}
          </Text>
        </View>
        {rightAction}
      </View>
      {markdownDiagnosticSummary ? (
        <Text className="mb-4 text-sm leading-5 text-danger">
          {markdownDiagnosticSummary}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel="日记正文"
        autoCapitalize="none"
        autoCorrect={false}
        className="flex-1 text-[18px] leading-8 text-foreground"
        importantForAutofill="no"
        keyboardType="default"
        multiline
        onBlur={() => {
          isLongEntryFocusedRef.current = false
        }}
        onChangeText={onChangeLongEntry}
        onFocus={() => {
          isLongEntryFocusedRef.current = true
        }}
        placeholder="写一点今天真正留下来的东西。"
        placeholderTextColor={semanticColors['text-quaternary']}
        scrollEnabled
        spellCheck={false}
        style={{
          margin: 0,
          minHeight: 0,
          padding: 0,
          paddingBottom: spacingPixels['8'],
          paddingTop: 0,
        }}
        textAlignVertical="top"
        textContentType="none"
        testID="long-entry-input"
        value={longEntryMarkdown}
      />
    </View>
  )
}

function TodayMurmurMode({
  activeImageImport,
  headerStatus,
  isBusy,
  isImportingImages,
  murmurDraft,
  murmurDraftInputHeight,
  murmurCount,
  murmurs,
  longEntryMarkdown,
  onAddMurmur,
  onChangeMurmurDraft,
  onClearTheme,
  onContentSizeChange,
  onEditMurmur,
  onImportImages,
  onOpenJournalList,
  onOpenLongEntry,
  onOpenReview,
  onOpenSettings,
  onOpenSyncSettings,
  onPreviewImage,
  paperHeaderLine,
  selectedMurmurTheme,
}: {
  activeImageImport: ImageImportSource | null
  headerStatus: HeaderStatus
  isBusy: boolean
  isImportingImages: boolean
  murmurDraft: string
  murmurDraftInputHeight: number
  murmurCount: number
  murmurs: MurmurBlock[]
  longEntryMarkdown: string
  onAddMurmur: () => void
  onChangeMurmurDraft: (value: string) => void
  onClearTheme: () => void
  onContentSizeChange: (height: number) => void
  onEditMurmur: (murmurId: string) => void
  onImportImages: (source: ImageImportSource) => void
  onOpenJournalList: () => void
  onOpenLongEntry: () => void
  onOpenReview: () => void
  onOpenSettings: () => void
  onOpenSyncSettings: () => void
  onPreviewImage: (image: ImageBlock) => void
  paperHeaderLine: string
  selectedMurmurTheme: ReturnType<typeof getBuiltInThemeById> | null
}) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={spacingPixels['8']}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: spacingPixels['6'] }}
      disableScrollOnKeyboardHide
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
    >
      <View className="flex-1 gap-1.5 pt-4" style={{ minHeight: 0 }}>
        <TodayTopBar
          headerStatus={headerStatus}
          onOpenJournalList={onOpenJournalList}
          onOpenReview={onOpenReview}
          onOpenSettings={onOpenSettings}
          onOpenSyncSettings={onOpenSyncSettings}
        />
        <MurmurWritingSurface
          activeImageImport={activeImageImport}
          headerRight={(
            <LongEntryStatusButton
              longEntryMarkdown={longEntryMarkdown}
              onPress={onOpenLongEntry}
            />
          )}
          isBusy={isBusy}
          isImportingImages={isImportingImages}
          murmurDraft={murmurDraft}
          murmurDraftInputHeight={murmurDraftInputHeight}
          murmurCount={murmurCount}
          murmurs={murmurs}
          onAddMurmur={onAddMurmur}
          onChangeMurmurDraft={onChangeMurmurDraft}
          onClearTheme={onClearTheme}
          onContentSizeChange={onContentSizeChange}
          onEditMurmur={onEditMurmur}
          onImportImages={onImportImages}
          onPreviewImage={onPreviewImage}
          paperHeaderLine={paperHeaderLine}
          selectedMurmurTheme={selectedMurmurTheme}
        />
      </View>
    </KeyboardAwareScrollView>
  )
}

function MurmurWritingSurface({
  activeImageImport,
  headerRight,
  isBusy,
  isImportingImages,
  murmurDraft,
  murmurDraftInputHeight,
  murmurCount,
  murmurs,
  onAddMurmur,
  onChangeMurmurDraft,
  onClearTheme,
  onContentSizeChange,
  onEditMurmur,
  onImportImages,
  onPreviewImage,
  paperHeaderLine,
  selectedMurmurTheme,
}: {
  activeImageImport: ImageImportSource | null
  headerRight: ReactNode
  isBusy: boolean
  isImportingImages: boolean
  murmurDraft: string
  murmurDraftInputHeight: number
  murmurCount: number
  murmurs: MurmurBlock[]
  onAddMurmur: () => void
  onChangeMurmurDraft: (value: string) => void
  onClearTheme: () => void
  onContentSizeChange: (height: number) => void
  onEditMurmur: (murmurId: string) => void
  onImportImages: (source: ImageImportSource) => void
  onPreviewImage: (image: ImageBlock) => void
  paperHeaderLine: string
  selectedMurmurTheme: ReturnType<typeof getBuiltInThemeById> | null
}) {
  return (
    <View
      className="flex-1 rounded-lg bg-surface"
      style={{
        minHeight: 0,
        paddingBottom: spacingPixels['6'],
        paddingHorizontal: spacingPixels['6'],
        paddingTop: spacingPixels['4'],
      }}
    >
      <View className="mb-5 flex-row items-center justify-between gap-4">
        <Text className="shrink text-sm font-semibold text-foreground">
          {paperHeaderLine}
        </Text>
        {headerRight}
      </View>
      <MurmurComposer
        activeImageImport={activeImageImport}
        autoFocus={murmurCount === 0}
        isBusy={isBusy}
        isImportingImages={isImportingImages}
        murmurDraft={murmurDraft}
        murmurDraftInputHeight={murmurDraftInputHeight}
        murmurCount={murmurCount}
        onAddMurmur={onAddMurmur}
        onChangeMurmurDraft={onChangeMurmurDraft}
        onClearTheme={onClearTheme}
        onContentSizeChange={onContentSizeChange}
        onImportImages={onImportImages}
        selectedMurmurTheme={selectedMurmurTheme}
      />
      <MurmurFeed
        murmurCount={murmurCount}
        murmurs={murmurs}
        onEditMurmur={onEditMurmur}
        onPreviewImage={onPreviewImage}
      />
    </View>
  )
}

function MurmurComposer({
  activeImageImport,
  autoFocus = false,
  isBusy,
  isImportingImages,
  murmurDraft,
  murmurDraftInputHeight,
  murmurCount,
  onAddMurmur,
  onChangeMurmurDraft,
  onClearTheme,
  onContentSizeChange,
  onImportImages,
  selectedMurmurTheme,
}: {
  activeImageImport: ImageImportSource | null
  autoFocus?: boolean
  isBusy: boolean
  isImportingImages: boolean
  murmurDraft: string
  murmurDraftInputHeight: number
  murmurCount: number
  onAddMurmur: () => void
  onChangeMurmurDraft: (value: string) => void
  onClearTheme: () => void
  onContentSizeChange: (height: number) => void
  onImportImages: (source: ImageImportSource) => void
  selectedMurmurTheme: ReturnType<typeof getBuiltInThemeById> | null
}) {
  return (
    <View>
      <View
        className="border border-border bg-surface"
        style={{
          borderRadius: radiusPixels['2xl'],
          paddingHorizontal: spacingPixels['5'],
          paddingVertical: spacingPixels['4'],
        }}
      >
        {murmurCount === 0 ? (
          <Text className="mb-4 text-sm leading-5 text-text-tertiary">
            今天还没有碎碎念。
          </Text>
        ) : null}
        {selectedMurmurTheme ? (
          <ThemeSelectionBanner
            label={selectedMurmurTheme.label}
            onClear={onClearTheme}
          />
        ) : null}
        <TextInput
          accessibilityLabel="碎碎念正文"
          autoFocus={autoFocus}
          className="text-base leading-6 text-foreground"
          multiline
          onContentSizeChange={(event) => {
            onContentSizeChange(Math.max(
              murmurDraftInputMinHeight,
              Math.ceil(event.nativeEvent.contentSize.height),
            ))
          }}
          onChangeText={onChangeMurmurDraft}
          placeholder={murmurCount === 0 ? '比如：刚刚想到的一句话。' : '再补一句碎碎念。'}
          placeholderTextColor={semanticColors['text-quaternary']}
          scrollEnabled={false}
          style={{
            height: murmurDraftInputHeight,
            margin: 0,
            padding: 0,
          }}
          textAlignVertical="top"
          testID="murmur-draft-input"
          value={murmurDraft}
        />
      </View>
      <View className="flex-row items-center justify-between gap-2" style={{ marginTop: spacingPixels['5'] }}>
        <View className="flex-row gap-2">
          <Button
            className="min-h-10 rounded-full px-3"
            disabled={isBusy || isImportingImages}
            icon="camera-outline"
            loading={activeImageImport === 'camera'}
            onPress={() => onImportImages('camera')}
            testID="take-murmur-photo-button"
            variant="secondary"
          >
            拍照
          </Button>
          <Button
            className="min-h-10 rounded-full px-3"
            disabled={isBusy || isImportingImages}
            icon="images-outline"
            loading={activeImageImport === 'library'}
            onPress={() => onImportImages('library')}
            testID="add-murmur-images-button"
            variant="secondary"
          >
            相册
          </Button>
        </View>
        <Button
          className="min-h-10 rounded-full px-4"
          disabled={!murmurDraft.trim() || isBusy}
          icon="add"
          onPress={onAddMurmur}
          testID="add-murmur-button"
          variant="secondary"
        >
          加入今天
        </Button>
      </View>
    </View>
  )
}

function MurmurFeed({
  murmurCount,
  murmurs,
  onEditMurmur,
  onPreviewImage,
}: {
  murmurCount: number
  murmurs: MurmurBlock[]
  onEditMurmur: (murmurId: string) => void
  onPreviewImage: (image: ImageBlock) => void
}) {
  if (murmurs.length === 0) {
    return null
  }

  return (
    <View style={{ marginTop: spacingPixels['8'] }}>
      <Text className="mb-4 text-xs font-semibold text-text-tertiary">
        今天 · {murmurCount} 条
      </Text>
      <View className="gap-3">
        {murmurs.map((murmur) => (
          <MurmurItem
            key={murmur.id}
            murmur={murmur}
            onEdit={() => onEditMurmur(murmur.id)}
            onPreviewImage={onPreviewImage}
          />
        ))}
      </View>
    </View>
  )
}

function ThemeSelectionBanner({
  label,
  onClear,
}: {
  label: string
  onClear: () => void
}) {
  return (
    <View className="mb-4 flex-row items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2">
      <Text className="shrink text-sm font-semibold text-foreground">
        放进「{label}」
      </Text>
      <Pressable
        accessibilityLabel="清除已选此刻入口"
        accessibilityRole="button"
        className="h-7 w-7 items-center justify-center rounded-full"
        onPress={onClear}
        style={({ pressed }) => ({
          opacity: pressed ? 0.72 : 1,
        })}
      >
        <Ionicons color={semanticColors['text-tertiary']} name="close" size={16} />
      </Pressable>
    </View>
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
      <Ionicons color={semanticColors['text-tertiary']} name={icon} size={19} />
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
      <Ionicons color={semanticColors['text-tertiary']} name={icon} size={15} />
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
        status.tone === 'danger' ? 'opacity-95' : 'opacity-90',
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

function MurmurItem({
  murmur,
  onEdit,
  onPreviewImage,
}: {
  murmur: MurmurBlock
  onEdit: () => void
  onPreviewImage: (image: ImageBlock) => void
}) {
  return (
    <View
      className="border border-border bg-surface px-4 py-4"
      style={{ borderRadius: radiusPixels['2xl'] }}
    >
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <Text className="text-xs font-semibold text-text-tertiary">{formatTime(murmur.time)}</Text>
        <Pressable
          accessibilityLabel="编辑这条碎碎念"
          accessibilityRole="button"
          className="h-9 w-9 items-center justify-center rounded-full"
          hitSlop={6}
          onPress={onEdit}
          style={({ pressed }) => ({
            opacity: pressed ? 0.72 : 1,
          })}
          testID="murmur-edit-button"
        >
          <Ionicons color={semanticColors['text-tertiary']} name="create-outline" size={17} />
        </Pressable>
      </View>
      {murmur.body.trim() ? (
        <Text className="text-base leading-6 text-foreground">{murmur.body}</Text>
      ) : null}
      {murmur.themes.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {murmur.themes.map((themeId) => (
            <View className="rounded-full bg-surface-muted px-2.5 py-1" key={themeId}>
              <Text className="text-xs font-semibold text-text-tertiary">
                {getBuiltInThemeById(themeId)?.label ?? themeId}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {murmur.images.length > 0 ? (
        <View className="gap-3" style={{ marginTop: murmur.body.trim() || murmur.themes.length > 0 ? spacingPixels['3.5'] : 0 }}>
          {murmur.images.map((image) => (
            <MurmurImageItem
              image={image}
              key={image.id}
              onPreviewImage={onPreviewImage}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

function MurmurImageItem({
  image,
  onPreviewImage,
}: {
  image: ImageBlock
  onPreviewImage: (image: ImageBlock) => void
}) {
  const imageUri = resolveJournalMediaFileUri(image.src) ?? image.src
  const imageLabel = image.caption?.trim() || '碎碎念图片'

  return (
    <View className="gap-2">
      <Pressable
        accessibilityLabel={`查看大图：${imageLabel}`}
        accessibilityRole="button"
        onPress={() => onPreviewImage(image)}
        style={({ pressed }) => ({
          opacity: pressed ? 0.82 : 1,
        })}
      >
        <NativeImage
          accessibilityLabel={imageLabel}
          resizeMode="cover"
          source={{ uri: imageUri }}
          style={{
            aspectRatio: 4 / 3,
            backgroundColor: semanticColors['surface-muted'],
            borderRadius: radiusPixels.xl,
            width: '100%',
          }}
        />
      </Pressable>
      {image.caption?.trim() ? (
        <Text className="text-sm leading-5 text-text-secondary">{image.caption}</Text>
      ) : null}
    </View>
  )
}

function MurmurEditPanel({
  activeImageImport,
  isBusy,
  isImportingImages,
  murmur,
  onAddImages,
  onChangeBody,
  onClose,
  onRemoveImage,
  onPreviewImage,
  onTakePhoto,
  onUpdateImageCaption,
}: {
  activeImageImport: ImageImportSource | null
  isBusy: boolean
  isImportingImages: boolean
  murmur: MurmurBlock
  onAddImages: (murmurId: string) => void
  onChangeBody: (murmurId: string, body: string) => void
  onClose: () => void
  onRemoveImage: (murmurId: string, imageId: string) => void
  onPreviewImage: (image: ImageBlock) => void
  onTakePhoto: (murmurId: string) => void
  onUpdateImageCaption: (murmurId: string, imageId: string, caption: string) => void
}) {
  return (
    <View className="flex-1">
      <View className="mb-5 flex-row items-start justify-between gap-4">
        <View className="shrink">
          <Text className="text-2xl font-semibold text-foreground">编辑碎碎念</Text>
          <Text className="mt-1 text-xs font-semibold text-text-tertiary">
            {formatTime(murmur.time)}
          </Text>
        </View>
        <Button
          className="min-h-10 rounded-full px-4"
          onPress={onClose}
          size="sm"
          testID="murmur-edit-done-button"
          variant="secondary"
        >
          完成
        </Button>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: spacingPixels['6'] }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5">
          <View
            className="border border-border bg-surface"
            style={{
              borderRadius: radiusPixels['2xl'],
              paddingHorizontal: spacingPixels['4'],
              paddingVertical: spacingPixels['4'],
            }}
          >
            <Text className="mb-3 text-xs font-semibold text-text-tertiary">文字</Text>
            <TextInput
              accessibilityLabel="编辑碎碎念正文"
              autoFocus
              className="min-h-28 text-base leading-6 text-foreground"
              multiline
              onChangeText={(value) => onChangeBody(murmur.id, value)}
              placeholder="写下这条碎碎念。"
              placeholderTextColor={semanticColors['text-quaternary']}
              scrollEnabled={false}
              style={{
                margin: 0,
                padding: 0,
              }}
              textAlignVertical="top"
              testID="murmur-edit-body-input"
              value={murmur.body}
            />
          </View>

          <View>
            <View className="mb-3 flex-row items-center justify-between gap-3">
              <Text className="text-xs font-semibold text-text-tertiary">
                图片 · {murmur.images.length}
              </Text>
              <View className="flex-row gap-2">
                <Button
                  className="min-h-10 rounded-full px-3"
                  disabled={isBusy || isImportingImages}
                  icon="camera-outline"
                  loading={activeImageImport === 'camera'}
                  onPress={() => onTakePhoto(murmur.id)}
                  size="sm"
                  variant="secondary"
                >
                  拍照
                </Button>
                <Button
                  className="min-h-10 rounded-full px-3"
                  disabled={isBusy || isImportingImages}
                  icon="images-outline"
                  loading={activeImageImport === 'library'}
                  onPress={() => onAddImages(murmur.id)}
                  size="sm"
                  variant="secondary"
                >
                  上传图片
                </Button>
              </View>
            </View>
            {murmur.images.length > 0 ? (
              <View className="gap-4">
                {murmur.images.map((image) => (
                  <MurmurEditableImageItem
                    image={image}
                    key={image.id}
                    murmurId={murmur.id}
                    onPreviewImage={onPreviewImage}
                    onRemove={onRemoveImage}
                    onUpdateCaption={onUpdateImageCaption}
                  />
                ))}
              </View>
            ) : (
              <View
                className="items-center justify-center border border-dashed border-border bg-surface"
                style={{
                  borderRadius: radiusPixels['2xl'],
                  minHeight: 112,
                  paddingHorizontal: spacingPixels['5'],
                }}
              >
                <Text className="text-sm leading-5 text-text-tertiary">
                  还没有图片。
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

function MurmurEditableImageItem({
  image,
  murmurId,
  onPreviewImage,
  onRemove,
  onUpdateCaption,
}: {
  image: ImageBlock
  murmurId: string
  onPreviewImage: (image: ImageBlock) => void
  onRemove: (murmurId: string, imageId: string) => void
  onUpdateCaption: (murmurId: string, imageId: string, caption: string) => void
}) {
  const imageUri = resolveJournalMediaFileUri(image.src) ?? image.src
  const imageLabel = image.caption?.trim() || '碎碎念图片'

  return (
    <View
      className="gap-3 border border-border bg-surface p-3"
      style={{ borderRadius: radiusPixels['2xl'] }}
    >
      <Pressable
        accessibilityLabel={`查看大图：${imageLabel}`}
        accessibilityRole="button"
        onPress={() => onPreviewImage(image)}
        style={({ pressed }) => ({
          opacity: pressed ? 0.82 : 1,
        })}
      >
        <NativeImage
          accessibilityLabel={imageLabel}
          resizeMode="cover"
          source={{ uri: imageUri }}
          style={{
            aspectRatio: 4 / 3,
            backgroundColor: semanticColors['surface-muted'],
            borderRadius: radiusPixels.xl,
            width: '100%',
          }}
        />
      </Pressable>
      <View className="flex-row items-center gap-2" style={{ minWidth: 0 }}>
        <TextInput
          accessibilityLabel="编辑图片说明"
          className="min-h-11 flex-1 rounded-lg border border-border bg-surface-muted px-3 text-sm text-foreground"
          onChangeText={(value) => onUpdateCaption(murmurId, image.id, value)}
          placeholder="给这张图留一句说明"
          placeholderTextColor={semanticColors['text-quaternary']}
          style={{ minWidth: 0 }}
          value={image.caption ?? ''}
        />
        <Pressable
          accessibilityLabel="移除图片"
          accessibilityRole="button"
          className="h-11 w-11 items-center justify-center rounded-full border border-border bg-surface"
          onPress={() => onRemove(murmurId, image.id)}
          style={({ pressed }) => ({
            opacity: pressed ? 0.72 : 1,
          })}
        >
          <Ionicons color={semanticColors.danger} name="trash-outline" size={17} />
        </Pressable>
      </View>
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

function formatWeatherLineLabel(weather: DayFrontMatter['weather']) {
  if (!weather?.text) {
    return ''
  }

  const temperature = typeof weather.temperature === 'number'
    ? `${Math.round(weather.temperature)}℃`
    : ''

  return [weather.text, temperature].filter(Boolean).join(' ')
}

function formatLongEntryStatusLabel(markdown: string) {
  const characterCount = markdown.replace(/\s+/g, '').length

  if (characterCount === 0) {
    return '长文还没落笔'
  }

  return `长文留了 ${characterCount} 字`
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
    return 'danger'
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
  blue: 'text-text-tertiary',
  danger: 'text-danger',
  green: 'text-text-tertiary',
  plain: 'text-text-tertiary',
}
