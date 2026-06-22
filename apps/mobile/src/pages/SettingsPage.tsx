import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { DayFrontMatter } from '@journal/core'
import type { SyncSnapshot } from '@journal/sync'
import { radiusPixels, spacingPixels, type ResolvedSemanticColors } from '@journal/theme'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useJournalTheme } from '../ui/JournalTheme'
import { Section } from '../ui/Section'
import { PageShell } from './PageShell'
import {
  formatMobileLocationLabel,
  getMobileDiagnosticPaths,
  getMobileLocationPermissionDiagnostic,
  getMobileWeatherDiagnostic,
  requestMobileLocationDiagnostic,
  type MobileLocationDiagnostic,
} from '../services/diagnostics/status'
import {
  createMobileDiagnosticPackage,
  saveMobileDiagnosticPackageToAndroidDirectory,
} from '../services/diagnostics/package'
import type { MobileAppearance, MobileHomeMode } from '../services/mobileUiSettings'

const storedTokenMask = '••••••••'
const appearanceOptions: Array<{ label: string; value: MobileAppearance }> = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
]

function useSettingsTheme() {
  const { colors } = useJournalTheme()
  const styles = useSettingsStyles(colors)

  return { colors, styles }
}

function useSettingsStyles(colors: ResolvedSemanticColors) {
  return useMemo(() => createSettingsStyles(colors), [colors])
}

type SettingsPageProps = {
  currentFrontMatter: DayFrontMatter
  hasStoredSyncToken: boolean
  homeMode: MobileHomeMode
  isSavingSyncConfiguration: boolean
  onBack: () => void
  onChangeHomeMode: (mode: MobileHomeMode) => void
  onRefreshWeather: () => Promise<DayFrontMatter>
  onSaveSyncConfiguration: () => Promise<unknown>
  setSyncBranch: (value: string) => void
  setSyncRemoteUrl: (value: string) => void
  setSyncTokenDraft: (value: string) => void
  syncBranch: string
  syncRemoteUrl: string
  syncSnapshot: SyncSnapshot
  syncTokenDraft: string
  today: string
}

export function SettingsPage({
  currentFrontMatter,
  hasStoredSyncToken,
  homeMode,
  isSavingSyncConfiguration,
  onBack,
  onChangeHomeMode,
  onRefreshWeather,
  onSaveSyncConfiguration,
  setSyncBranch,
  setSyncRemoteUrl,
  setSyncTokenDraft,
  syncBranch,
  syncRemoteUrl,
  syncSnapshot,
  syncTokenDraft,
  today,
}: SettingsPageProps) {
  const {
    appearance,
    colors,
    resolvedAppearance,
    setAppearance,
  } = useJournalTheme()
  const styles = useSettingsStyles(colors)
  const [appearanceMessage, setAppearanceMessage] = useState('')
  const [locationDiagnostic, setLocationDiagnostic] = useState<MobileLocationDiagnostic | null>(null)
  const [locationMessage, setLocationMessage] = useState('')
  const [diagnosticFrontMatter, setDiagnosticFrontMatter] = useState(currentFrontMatter)
  const [diagnosticPackageMessage, setDiagnosticPackageMessage] = useState('')
  const [isExportingDiagnosticPackage, setIsExportingDiagnosticPackage] = useState(false)
  const [isRefreshingWeather, setIsRefreshingWeather] = useState(false)
  const [isRequestingLocation, setIsRequestingLocation] = useState(false)
  const [weatherMessage, setWeatherMessage] = useState('')
  const diagnosticPaths = useMemo(() => {
    try {
      return getMobileDiagnosticPaths(today)
    } catch (error) {
      return {
        adbLogDirectory: '不可用',
        diagnosticLogDirectory: '不可用',
        diagnosticPackageDirectory: '不可用',
        todayEntryPath: getErrorMessage(error),
        uiSettingsStorage: '不可用',
        worktreeDirectory: '不可用',
      }
    }
  }, [today])
  const weatherDiagnostic = getMobileWeatherDiagnostic(diagnosticFrontMatter)

  useEffect(() => {
    setDiagnosticFrontMatter(currentFrontMatter)
  }, [currentFrontMatter])

  useEffect(() => {
    let isMounted = true

    void getMobileLocationPermissionDiagnostic()
      .then((diagnostic) => {
        if (isMounted) {
          setLocationDiagnostic(diagnostic)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  async function handleRequestLocation() {
    setIsRequestingLocation(true)
    setLocationMessage('')

    try {
      const diagnostic = await requestMobileLocationDiagnostic()

      setLocationDiagnostic(diagnostic)
      setLocationMessage(diagnostic.locationLabel
        ? `定位可用：${diagnostic.locationLabel}`
        : formatLocationDiagnosticMessage(diagnostic))
    } finally {
      setIsRequestingLocation(false)
    }
  }

  async function handleRefreshWeather() {
    setIsRefreshingWeather(true)
    setWeatherMessage('')

    try {
      const nextFrontMatter = await onRefreshWeather()

      setDiagnosticFrontMatter(nextFrontMatter)
      setWeatherMessage('天气已更新')
    } catch (error) {
      setWeatherMessage(getErrorMessage(error))
    } finally {
      setIsRefreshingWeather(false)
    }
  }

  async function handleAppearanceChange(nextAppearance: MobileAppearance) {
    setAppearanceMessage('')

    try {
      await setAppearance(nextAppearance)
    } catch (error) {
      setAppearanceMessage(getErrorMessage(error))
    }
  }

  async function handleExportDiagnosticPackage() {
    if (Platform.OS !== 'android') {
      const message = '诊断包导出暂只支持 Android。'

      setDiagnosticPackageMessage(message)
      Alert.alert('暂不支持', message)
      return
    }

    setIsExportingDiagnosticPackage(true)
    setDiagnosticPackageMessage('')

    try {
      const diagnosticPackage = await createMobileDiagnosticPackage({
        paths: diagnosticPaths,
        sync: {
          branch: syncBranch,
          hasStoredSyncToken,
          remoteUrl: syncRemoteUrl,
          snapshot: syncSnapshot,
        },
        today,
      })

      const externalSave = await saveMobileDiagnosticPackageToAndroidDirectory(diagnosticPackage)

      if (externalSave.status === 'saved') {
        const message = `已保存：${externalSave.fileName}`

        setDiagnosticPackageMessage(message)
        Alert.alert('诊断包已保存', message)
        return
      }

      const message = `已生成：${diagnosticPackage.filePath}`

      setDiagnosticPackageMessage(message)
      Alert.alert('诊断包已生成', message)
    } catch (error) {
      const message = getErrorMessage(error)

      setDiagnosticPackageMessage(message)
      Alert.alert('诊断包没有生成', message)
    } finally {
      setIsExportingDiagnosticPackage(false)
    }
  }

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
            <Section title="偏好">
              <PreferenceCard
                enabled={homeMode === 'murmur'}
                onToggle={(enabled) => onChangeHomeMode(enabled ? 'murmur' : 'long-entry')}
              />
              <AppearancePreferenceCard
                appearance={appearance}
                message={appearanceMessage}
                onChange={(nextAppearance) => void handleAppearanceChange(nextAppearance)}
                resolvedAppearance={resolvedAppearance}
              />
            </Section>

            <Section title="诊断">
              <View style={styles.diagnosticGrid}>
                <DiagnosticCard
                  detail={formatMobileLocationLabel(diagnosticFrontMatter.location)}
                  icon="location-outline"
                  label="定位"
                  value={formatPermissionStatus(locationDiagnostic)}
                >
                  <Button
                    className="min-h-10"
                    icon="location-outline"
                    loading={isRequestingLocation}
                    onPress={() => void handleRequestLocation()}
                    size="sm"
                    testID="request-location-diagnostic-button"
                    variant="secondary"
                  >
                    获取定位
                  </Button>
                  {locationMessage ? (
                    <Text className="text-xs leading-5 text-text-tertiary">
                      {formatDiagnosticDisplayMessage(locationMessage, 'location')}
                    </Text>
                  ) : null}
                </DiagnosticCard>
                <DiagnosticCard
                  detail={weatherDiagnostic.updatedAtLabel}
                  icon="partly-sunny-outline"
                  label="天气"
                  value={weatherDiagnostic.label}
                >
                  <Button
                    className="min-h-10"
                    icon="partly-sunny-outline"
                    loading={isRefreshingWeather}
                    onPress={() => void handleRefreshWeather()}
                    size="sm"
                    testID="refresh-weather-diagnostic-button"
                    variant="secondary"
                  >
                    获取天气
                  </Button>
                  {weatherMessage ? (
                    <Text className="text-xs leading-5 text-text-tertiary">
                      {formatDiagnosticDisplayMessage(weatherMessage, 'weather')}
                    </Text>
                  ) : null}
                </DiagnosticCard>
              </View>
              <View style={styles.pathCard}>
                <DiagnosticPathRow label="日记目录" value={diagnosticPaths.worktreeDirectory} />
                <DiagnosticPathRow divider label="今日文件" value={diagnosticPaths.todayEntryPath} />
                <DiagnosticPathRow divider label="本机日志" value={diagnosticPaths.diagnosticLogDirectory} />
                <DiagnosticPathRow divider label="诊断包" value={diagnosticPaths.diagnosticPackageDirectory} />
                <DiagnosticPathRow divider label="adb 日志目录" value={diagnosticPaths.adbLogDirectory} />
                <DiagnosticPathRow divider label="本机偏好" value={diagnosticPaths.uiSettingsStorage} />
              </View>
              <View style={styles.formCard}>
                <Button
                  icon="download-outline"
                  loading={isExportingDiagnosticPackage}
                  onPress={() => void handleExportDiagnosticPackage()}
                  size="sm"
                  testID="export-diagnostic-package-button"
                  variant="secondary"
                >
                  导出诊断包
                </Button>
                {diagnosticPackageMessage ? (
                  <Text className="text-xs leading-5 text-text-tertiary">
                    {diagnosticPackageMessage}
                  </Text>
                ) : null}
              </View>
            </Section>

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
                <ConfigField label="GitHub Token">
                  <Input
                    accessibilityLabel="GitHub token"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setSyncTokenDraft}
                    placeholder={hasStoredSyncToken ? storedTokenMask : '粘贴 GitHub token'}
                    secureTextEntry
                    testID="sync-token-input"
                    value={syncTokenDraft}
                  />
                  {hasStoredSyncToken ? (
                    <Text className="text-xs leading-5 text-text-tertiary">
                      Token 已保存，粘贴新的 token 会替换。
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

function formatPermissionStatus(diagnostic: MobileLocationDiagnostic | null) {
  if (!diagnostic) {
    return '读取中'
  }

  const statusLabels: Record<MobileLocationDiagnostic['permissionStatus'], string> = {
    denied: '已拒绝',
    granted: '已允许',
    unavailable: '不可用',
    undetermined: '未询问',
    unknown: '未知',
  }

  if (diagnostic.errorMessage) {
    return diagnostic.permissionStatus === 'granted' ? '定位不可用' : statusLabels[diagnostic.permissionStatus]
  }

  return statusLabels[diagnostic.permissionStatus]
}

function formatLocationDiagnosticMessage(diagnostic: MobileLocationDiagnostic) {
  if (diagnostic.canGetLocation) {
    return '定位可用'
  }

  if (diagnostic.permissionStatus === 'denied') {
    return '权限已拒绝，可以到系统设置里重新打开。'
  }

  if (diagnostic.permissionStatus === 'undetermined') {
    return '还没有请求过定位权限。'
  }

  if (diagnostic.errorMessage) {
    return '暂时拿不到当前位置，模拟器或系统定位可能还没准备好。'
  }

  return '定位不可用'
}

function formatDiagnosticDisplayMessage(message: string, kind: 'location' | 'weather') {
  if (!message.trim()) {
    return ''
  }

  if (kind === 'location' && /getCurrentPosition|kCLErrorDomain|Cannot obtain current location/i.test(message)) {
    return '暂时拿不到当前位置，模拟器或系统定位可能还没准备好。'
  }

  if (kind === 'weather' && /failed|error|network/i.test(message)) {
    return '天气暂时没有更新成功，稍后可以再试。'
  }

  return message
}

function formatAppearanceLabel(
  appearance: MobileAppearance,
  resolvedAppearance: 'dark' | 'light',
) {
  const resolvedLabel = resolvedAppearance === 'dark' ? '深色' : '浅色'

  if (appearance === 'system') {
    return `跟随系统（当前${resolvedLabel}）`
  }

  return appearance === 'dark' ? '深色' : '浅色'
}

function PreferenceCard({
  enabled,
  onToggle,
}: {
  enabled: boolean
  onToggle: (enabled: boolean) => void
}) {
  const { styles } = useSettingsTheme()

  return (
    <Pressable
      accessibilityLabel="碎碎念模式"
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      onPress={() => onToggle(!enabled)}
      style={({ pressed }) => [
        styles.preferenceCard,
        { opacity: pressed ? 0.72 : 1 },
      ]}
      testID="home-mode-preference"
    >
      <View style={styles.preferenceHeader}>
        <Text className="text-base font-semibold leading-6 text-foreground">碎碎念模式</Text>
        <QuietSwitch enabled={enabled} />
      </View>
      <Text className="text-sm leading-5 text-text-tertiary">
        {enabled
          ? '首页先接住片刻，长文留在右上角慢慢写。'
          : '首页先铺开长文，碎碎念从独立入口进入。'}
      </Text>
    </Pressable>
  )
}

function AppearancePreferenceCard({
  appearance,
  message,
  onChange,
  resolvedAppearance,
}: {
  appearance: MobileAppearance
  message: string
  onChange: (appearance: MobileAppearance) => void
  resolvedAppearance: 'dark' | 'light'
}) {
  const { styles } = useSettingsTheme()

  return (
    <View style={styles.preferenceCard}>
      <View style={styles.preferenceHeader}>
        <View style={styles.preferenceTitleGroup}>
          <Text className="text-base font-semibold leading-6 text-foreground">外观</Text>
          <Text className="text-sm leading-5 text-text-tertiary">
            {formatAppearanceLabel(appearance, resolvedAppearance)}
          </Text>
        </View>
      </View>
      <View style={styles.appearanceOptions}>
        {appearanceOptions.map((option) => (
          <AppearanceOptionButton
            isSelected={option.value === appearance}
            key={option.value}
            label={option.label}
            onPress={() => onChange(option.value)}
            value={option.value}
          />
        ))}
      </View>
      {message ? (
        <Text className="text-xs leading-5 text-danger">{message}</Text>
      ) : null}
    </View>
  )
}

function AppearanceOptionButton({
  isSelected,
  label,
  onPress,
  value,
}: {
  isSelected: boolean
  label: string
  onPress: () => void
  value: MobileAppearance
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      testID={`appearance-option-${value}`}
      className={isSelected ? 'bg-surface text-foreground' : 'bg-transparent'}
      style={({ pressed }) => ({
        borderRadius: radiusPixels.md,
        flex: 1,
        minHeight: 36,
        justifyContent: 'center',
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Text className={isSelected ? 'text-center text-sm font-semibold text-foreground' : 'text-center text-sm font-semibold text-text-tertiary'}>
        {label}
      </Text>
    </Pressable>
  )
}

function QuietSwitch({ enabled }: { enabled: boolean }) {
  const { styles } = useSettingsTheme()

  return (
    <View
      style={[
        styles.switchTrack,
        enabled ? styles.switchTrackEnabled : styles.switchTrackDisabled,
      ]}
      testID={enabled ? 'home-mode-murmur-active' : 'home-mode-long-entry-active'}
    >
      <View
        style={[
          styles.switchThumb,
          enabled ? styles.switchThumbEnabled : styles.switchThumbDisabled,
        ]}
      />
    </View>
  )
}

function DiagnosticCard({
  children,
  detail,
  icon,
  label,
  value,
}: {
  children?: ReactNode
  detail: string
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  value: string
}) {
  const { colors, styles } = useSettingsTheme()

  return (
    <View style={styles.diagnosticCard}>
      <View style={styles.diagnosticCardHeader}>
        <View style={styles.diagnosticIcon}>
          <Ionicons color={colors['text-tertiary']} name={icon} size={16} />
        </View>
        <Text className="text-xs font-semibold leading-5 text-text-tertiary">{label}</Text>
      </View>
      <Text className="text-base font-semibold leading-6 text-foreground" numberOfLines={2}>
        {value}
      </Text>
      <Text className="text-xs leading-5 text-text-tertiary" numberOfLines={2}>
        {detail}
      </Text>
      {children ? <View style={styles.diagnosticCardAction}>{children}</View> : null}
    </View>
  )
}

function DiagnosticPathRow({
  divider = false,
  label,
  value,
}: {
  divider?: boolean
  label: string
  value: string
}) {
  const { styles } = useSettingsTheme()

  return (
    <View style={[styles.pathRow, divider ? styles.pathDivider : null]}>
      <Text className="text-xs font-semibold leading-5 text-text-tertiary">{label}</Text>
      <Text
        className="text-xs leading-5 text-foreground"
        numberOfLines={2}
        style={styles.pathValue}
      >
        {value}
      </Text>
    </View>
  )
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '诊断失败'
}

function ConfigField({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  const { styles } = useSettingsTheme()

  return (
    <View style={styles.configField}>
      <Text className="text-xs font-semibold leading-5 text-text-tertiary">{label}</Text>
      {children}
    </View>
  )
}

function createSettingsStyles(colors: ResolvedSemanticColors) {
  return StyleSheet.create({
  appearanceOptions: {
    backgroundColor: colors['surface-muted'],
    borderColor: colors.border,
    borderRadius: radiusPixels.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacingPixels['1'],
    padding: spacingPixels['1'],
  },
  configField: {
    gap: spacingPixels['1.5'],
  },
  content: {
    gap: spacingPixels['7'],
  },
  diagnosticCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radiusPixels.lg,
    flex: 1,
    gap: spacingPixels['1'],
    minWidth: 0,
    padding: spacingPixels['4'],
  },
  diagnosticCardAction: {
    gap: spacingPixels['1.5'],
    marginTop: spacingPixels['2'],
  },
  diagnosticCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacingPixels['1.5'],
  },
  diagnosticGrid: {
    flexDirection: 'row',
    gap: spacingPixels['2.5'],
  },
  diagnosticIcon: {
    alignItems: 'center',
    backgroundColor: colors['surface-muted'],
    borderRadius: radiusPixels.full,
    height: spacingPixels['7'],
    justifyContent: 'center',
    width: spacingPixels['7'],
  },
  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radiusPixels.lg,
    gap: spacingPixels['3.5'],
    padding: spacingPixels['4'],
  },
  pathCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radiusPixels.lg,
    overflow: 'hidden',
    paddingHorizontal: spacingPixels['4'],
    paddingVertical: spacingPixels['1'],
  },
  pathDivider: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pathRow: {
    gap: spacingPixels['1'],
    paddingVertical: spacingPixels['3'],
  },
  pathValue: {
    fontFamily: 'System',
  },
  preferenceCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radiusPixels.lg,
    gap: spacingPixels['1.5'],
    paddingHorizontal: spacingPixels['4'],
    paddingVertical: spacingPixels['3.5'],
  },
  preferenceHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacingPixels['3'],
    justifyContent: 'space-between',
  },
  preferenceTitleGroup: {
    flex: 1,
    gap: 2,
    minWidth: 0,
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
  switchThumb: {
    backgroundColor: colors.surface,
    borderRadius: radiusPixels.full,
    height: 28,
    shadowColor: '#000000',
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    width: 28,
  },
  switchThumbDisabled: {
    transform: [{ translateX: 2 }],
  },
  switchThumbEnabled: {
    transform: [{ translateX: 26 }],
  },
  switchTrack: {
    borderRadius: radiusPixels.full,
    height: 32,
    justifyContent: 'center',
    width: 56,
  },
  switchTrackDisabled: {
    backgroundColor: colors['surface-muted'],
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  switchTrackEnabled: {
    backgroundColor: colors.primary,
  },
  })
}
