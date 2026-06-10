import { type ComponentProps, useCallback, useState } from 'react'
import {
  Alert,
  Image as NativeImage,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Ionicons } from '@expo/vector-icons'
import type { ImageBlock, MurmurBlock } from '@journal/core'
import { semanticColors } from '@journal/theme'
import {
  getJournalSyncStatusPresentation,
  type JournalSyncStatusTone,
  type SyncSnapshot,
} from '@journal/sync'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import {
  useMobileJournal,
  type SaveState,
} from './hooks/useMobileJournal'
import { useMobileSync } from './hooks/useMobileSync'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'
import { cn } from './ui/cn'
import { JournalListPage } from './pages/JournalListPage'
import { ReviewPage } from './pages/ReviewPage'
import { SettingsPage } from './pages/SettingsPage'
import { SyncSettingsPage } from './pages/SyncSettingsPage'
import { Screen } from './ui/Screen'
import {
  importMobileJournalImagesForDate,
  resolveJournalMediaFileUri,
} from './services/mobileJournalStore'

type IconName = ComponentProps<typeof Ionicons>['name']
type HeaderStatusTone = 'blue' | 'danger' | 'green' | 'plain'
type HeaderStatus = {
  label: string
  tone: HeaderStatusTone
}
type RootStackParamList = {
  Today: undefined
  JournalList: undefined
  Review: undefined
  Settings: undefined
  SyncSettings: undefined
}
type ImageImportSource = 'camera' | 'library'

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
  const [activeImageImport, setActiveImageImport] = useState<ImageImportSource | null>(null)
  const [isMurmurPanelVisible, setIsMurmurPanelVisible] = useState(false)
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
    updateMurmurImageCaption,
  } = useMobileJournal()
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
      })

      if (didAdd && !murmurId) {
        setMurmurDraft('')
      }
    } catch (error) {
      console.error(error)
      Alert.alert('图片没有放进去', source === 'camera'
        ? '刚才拍下的照片没有保存成功。'
        : '刚才选择的图片没有保存成功。')
    } finally {
      setActiveImageImport(null)
    }
  }, [addImagesToMurmur, isBusy, isImportingImages, murmurDraft, today])

  return (
    <NavigationContainer>
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
            <Screen bottomColor={semanticColors.surface}>
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
                      onPress={() => navigation.navigate('SyncSettings')}
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
                  className="flex-1 rounded-lg bg-surface"
                  style={{
                    paddingBottom: 22,
                    paddingHorizontal: 24,
                    paddingTop: 16,
                  }}
                >
                  <View className="mb-5 flex-row items-center justify-between gap-4">
                    <View className="shrink">
                      <Text className="text-sm font-semibold text-foreground">
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
                    onChangeText={handleLongEntryChange}
                    onFocus={() => {
                      isLongEntryFocusedRef.current = true
                    }}
                    placeholder="写一点今天真正留下来的东西。"
                    placeholderTextColor={semanticColors['muted-fg']}
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
                      className="border border-border bg-surface"
                      style={{
                        borderRadius: 20,
                        paddingHorizontal: 20,
                        paddingVertical: 18,
                      }}
                    >
                      {murmurs.length === 0 ? (
                        <Text className="mb-4 text-sm leading-5 text-muted-fg">
                          今天还没有碎碎念。
                        </Text>
                      ) : null}
                      <TextInput
                        accessibilityLabel="碎碎念正文"
                        autoFocus={murmurs.length === 0}
                        className="min-h-32 text-base leading-6 text-foreground"
                        multiline
                        onChangeText={setMurmurDraft}
                        placeholder={murmurs.length === 0 ? '比如：刚刚想到的一句话。' : '再补一句碎碎念。'}
                        placeholderTextColor={semanticColors['muted-fg']}
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
                    <View className="flex-row items-center justify-between gap-2" style={{ marginTop: 18 }}>
                      <View className="flex-row gap-2">
                        <Button
                          className="min-h-10 rounded-full px-3"
                          disabled={isBusy || isImportingImages}
                          icon="camera-outline"
                          loading={activeImageImport === 'camera'}
                          onPress={() => void handleImportMurmurImages('camera')}
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
                          onPress={() => void handleImportMurmurImages('library')}
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
                      <Text className="mb-4 text-xs font-semibold text-muted-fg">今天</Text>
                      <ScrollView
                        className="flex-1"
                        contentContainerStyle={{ paddingBottom: 24 }}
                        showsVerticalScrollIndicator={false}
                      >
                        <View className="gap-3">
                          {murmurs.map((murmur) => (
                            <MurmurItem
                              isAddingImages={isImportingImages}
                              key={murmur.id}
                              murmur={murmur}
                              onAddImages={(murmurId) => void handleImportMurmurImages('library', murmurId)}
                              onRemoveImage={removeMurmurImage}
                              onTakePhoto={(murmurId) => void handleImportMurmurImages('camera', murmurId)}
                              onUpdateImageCaption={updateMurmurImageCaption}
                            />
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
              isSavingSyncConfiguration={isSavingSyncConfiguration}
              onBack={() => returnToToday(navigation)}
              onSaveSyncConfiguration={saveSyncConfiguration}
              setSyncBranch={setSyncBranch}
              setSyncRemoteUrl={setSyncRemoteUrl}
              setSyncTokenDraft={setSyncTokenDraft}
              syncBranch={syncBranch}
              syncRemoteUrl={syncRemoteUrl}
              syncTokenDraft={syncTokenDraft}
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
              onBack={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack()
                  return
                }

                navigation.replace('Settings')
              }}
              onOpenSyncConfiguration={() => navigation.navigate('Settings')}
              onRefreshGitStatus={refreshMobileGitStatus}
              onSyncNow={handleSyncNow}
              syncRemoteUrl={syncRemoteUrl}
              syncSnapshot={syncSnapshot}
              syncStatusLabel={syncStatusLabel}
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
      <Text className="text-sm font-semibold text-foreground">碎碎念</Text>
      <Text className="text-sm font-semibold text-muted-fg">· {count} 条</Text>
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
      <Ionicons color={semanticColors['muted-fg']} name={icon} size={19} />
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
      <Ionicons color={semanticColors['muted-fg']} name={icon} size={15} />
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
  isAddingImages,
  murmur,
  onAddImages,
  onRemoveImage,
  onTakePhoto,
  onUpdateImageCaption,
}: {
  isAddingImages: boolean
  murmur: MurmurBlock
  onAddImages: (murmurId: string) => void
  onRemoveImage: (murmurId: string, imageId: string) => void
  onTakePhoto: (murmurId: string) => void
  onUpdateImageCaption: (murmurId: string, imageId: string, caption: string) => void
}) {
  return (
    <View
      className="border border-border bg-surface px-4 py-4"
      style={{ borderRadius: 18 }}
    >
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <Text className="text-xs font-semibold text-muted-fg">{formatTime(murmur.time)}</Text>
        <View className="flex-row items-center gap-1">
          <Pressable
            accessibilityLabel="给这条碎碎念拍照"
            accessibilityRole="button"
            className="min-h-8 flex-row items-center gap-1 rounded-full px-2"
            disabled={isAddingImages}
            onPress={() => onTakePhoto(murmur.id)}
            style={({ pressed }) => ({
              opacity: isAddingImages ? 0.45 : pressed ? 0.72 : 1,
            })}
          >
            <Ionicons color={semanticColors['muted-fg']} name="camera-outline" size={15} />
            <Text className="text-xs font-semibold text-muted-fg">拍照</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="给这条碎碎念从相册加图片"
            accessibilityRole="button"
            className="min-h-8 flex-row items-center gap-1 rounded-full px-2"
            disabled={isAddingImages}
            onPress={() => onAddImages(murmur.id)}
            style={({ pressed }) => ({
              opacity: isAddingImages ? 0.45 : pressed ? 0.72 : 1,
            })}
          >
            <Ionicons color={semanticColors['muted-fg']} name="image-outline" size={15} />
            <Text className="text-xs font-semibold text-muted-fg">相册</Text>
          </Pressable>
        </View>
      </View>
      {murmur.body.trim() ? (
        <Text className="text-base leading-6 text-foreground">{murmur.body}</Text>
      ) : null}
      {murmur.images.length > 0 ? (
        <View className="gap-3" style={{ marginTop: murmur.body.trim() ? 14 : 0 }}>
          {murmur.images.map((image) => (
            <MurmurImageItem
              image={image}
              key={image.id}
              murmurId={murmur.id}
              onRemove={onRemoveImage}
              onUpdateCaption={onUpdateImageCaption}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

function MurmurImageItem({
  image,
  murmurId,
  onRemove,
  onUpdateCaption,
}: {
  image: ImageBlock
  murmurId: string
  onRemove: (murmurId: string, imageId: string) => void
  onUpdateCaption: (murmurId: string, imageId: string, caption: string) => void
}) {
  const imageUri = resolveJournalMediaFileUri(image.src) ?? image.src
  const imageMeta = formatImageMeta(image)

  return (
    <View className="gap-2">
      <NativeImage
        accessibilityLabel={image.caption?.trim() || '碎碎念图片'}
        resizeMode="cover"
        source={{ uri: imageUri }}
        style={{
          aspectRatio: 4 / 3,
          backgroundColor: semanticColors['surface-muted'],
          borderRadius: 14,
          width: '100%',
        }}
      />
      <View className="flex-row items-center gap-2">
        <TextInput
          accessibilityLabel="图片说明"
          className="min-h-10 flex-1 rounded-lg border border-border bg-surface-muted px-3 text-sm text-foreground"
          onChangeText={(value) => onUpdateCaption(murmurId, image.id, value)}
          placeholder="给这张图留一句说明"
          placeholderTextColor={semanticColors['muted-fg']}
          value={image.caption ?? ''}
        />
        <Pressable
          accessibilityLabel="移除图片"
          accessibilityRole="button"
          className="h-10 w-10 items-center justify-center rounded-full border border-border"
          onPress={() => onRemove(murmurId, image.id)}
          style={({ pressed }) => ({
            opacity: pressed ? 0.72 : 1,
          })}
        >
          <Ionicons color={semanticColors.danger} name="trash-outline" size={16} />
        </Pressable>
      </View>
      {imageMeta ? (
        <Text className="text-xs leading-4 text-muted-fg">{imageMeta}</Text>
      ) : null}
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

function formatImageMeta(image: ImageBlock) {
  const tags = image.tags.length > 0 ? image.tags.join(', ') : ''
  const location = image.location?.name?.trim() ?? ''
  const latitude = image.location?.latitude
  const longitude = image.location?.longitude
  const coordinates = typeof latitude === 'number' && typeof longitude === 'number'
    ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
    : ''

  return [location, coordinates, tags].filter(Boolean).join(' · ')
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
  blue: 'text-muted-fg',
  danger: 'text-danger',
  green: 'text-muted-fg',
  plain: 'text-muted-fg',
}
