import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  StyleSheet,
  useColorScheme as useSystemColorScheme,
  View,
  type ColorSchemeName,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import {
  getNativeWindColorVariables,
  getSemanticColors,
  type ResolvedSemanticColors,
  type SemanticColorScheme,
} from '@journal/theme'
import { useColorScheme as useNativeWindColorScheme, vars } from 'nativewind'
import {
  loadMobileUiSettings,
  saveMobileUiSettings,
  type MobileAppearance,
} from '../services/mobileUiSettings'

type JournalThemeContextValue = {
  appearance: MobileAppearance
  colors: ResolvedSemanticColors
  resolvedAppearance: SemanticColorScheme
  setAppearance: (appearance: MobileAppearance) => Promise<void>
  statusBarStyle: 'dark-content' | 'light-content'
}

const JournalThemeContext = createContext<JournalThemeContextValue | null>(null)

function resolveMobileAppearance(
  appearance: MobileAppearance,
  systemColorScheme: ColorSchemeName,
): SemanticColorScheme {
  if (appearance !== 'system') {
    return appearance
  }

  return systemColorScheme === 'dark' ? 'dark' : 'light'
}

export function JournalThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useSystemColorScheme()
  const nativeWindColorScheme = useNativeWindColorScheme()
  const [appearance, setAppearanceState] = useState<MobileAppearance>('system')
  const resolvedAppearance = resolveMobileAppearance(appearance, systemColorScheme)
  const colors = useMemo(() => getSemanticColors(resolvedAppearance), [resolvedAppearance])
  const nativeWindVariables = useMemo(
    () => vars(getNativeWindColorVariables(resolvedAppearance)) as StyleProp<ViewStyle>,
    [resolvedAppearance],
  )

  useEffect(() => {
    nativeWindColorScheme.setColorScheme(appearance)
  }, [appearance, nativeWindColorScheme])

  useEffect(() => {
    let isMounted = true

    void loadMobileUiSettings()
      .then((settings) => {
        if (isMounted) {
          setAppearanceState(settings.appearance)
        }
      })
      .catch((error) => {
        console.error(error)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const value = useMemo<JournalThemeContextValue>(() => ({
    appearance,
    colors,
    resolvedAppearance,
    async setAppearance(nextAppearance) {
      const previousAppearance = appearance

      setAppearanceState(nextAppearance)

      try {
        const savedSettings = await saveMobileUiSettings({ appearance: nextAppearance })

        setAppearanceState(savedSettings.appearance)
      } catch (error) {
        setAppearanceState(previousAppearance)
        throw error
      }
    },
    statusBarStyle: resolvedAppearance === 'dark' ? 'light-content' : 'dark-content',
  }), [appearance, colors, resolvedAppearance])

  return (
    <JournalThemeContext.Provider value={value}>
      <View
        className="flex-1"
        style={[
          styles.root,
          { backgroundColor: colors.background },
          nativeWindVariables,
        ]}
      >
        {children}
      </View>
    </JournalThemeContext.Provider>
  )
}

export function useJournalTheme() {
  const value = useContext(JournalThemeContext)

  if (!value) {
    throw new Error('useJournalTheme must be used within JournalThemeProvider')
  }

  return value
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
})
