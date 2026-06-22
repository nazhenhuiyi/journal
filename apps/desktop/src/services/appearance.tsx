import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export type DesktopAppearance = 'dark' | 'light' | 'system'
export type ResolvedDesktopAppearance = 'dark' | 'light'

type DesktopAppearanceContextValue = {
  appearance: DesktopAppearance
  resolvedAppearance: ResolvedDesktopAppearance
  setAppearance: (appearance: DesktopAppearance) => Promise<void>
}

const DesktopAppearanceContext = createContext<DesktopAppearanceContextValue | null>(null)

function getSystemAppearance(): ResolvedDesktopAppearance {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveAppearance(
  appearance: DesktopAppearance,
  systemAppearance: ResolvedDesktopAppearance,
): ResolvedDesktopAppearance {
  return appearance === 'system' ? systemAppearance : appearance
}

function applyDesktopAppearance(resolvedAppearance: ResolvedDesktopAppearance) {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement

  root.classList.toggle('dark', resolvedAppearance === 'dark')
  root.dataset.theme = resolvedAppearance
  root.style.colorScheme = resolvedAppearance
}

function getJournalSettingsStore() {
  return typeof window === 'undefined' ? undefined : window.journalSettings
}

export function DesktopAppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<DesktopAppearance>('system')
  const [systemAppearance, setSystemAppearance] = useState<ResolvedDesktopAppearance>(() => getSystemAppearance())
  const resolvedAppearance = resolveAppearance(appearance, systemAppearance)

  useEffect(() => {
    applyDesktopAppearance(resolvedAppearance)
  }, [resolvedAppearance])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return undefined
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => setSystemAppearance(mediaQuery.matches ? 'dark' : 'light')

    handleChange()
    mediaQuery.addEventListener('change', handleChange)

    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    let isMounted = true

    void getJournalSettingsStore()?.load()
      .then((settings) => {
        if (isMounted && settings) {
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

  const value = useMemo<DesktopAppearanceContextValue>(() => ({
    appearance,
    resolvedAppearance,
    async setAppearance(nextAppearance) {
      const previousAppearance = appearance

      setAppearanceState(nextAppearance)

      try {
        const savedSettings = await getJournalSettingsStore()?.save({ appearance: nextAppearance })

        if (savedSettings) {
          setAppearanceState(savedSettings.appearance)
        }
      } catch (error) {
        setAppearanceState(previousAppearance)
        throw error
      }
    },
  }), [appearance, resolvedAppearance])

  return (
    <DesktopAppearanceContext.Provider value={value}>
      {children}
    </DesktopAppearanceContext.Provider>
  )
}

export function useDesktopAppearance() {
  const value = useContext(DesktopAppearanceContext)

  if (!value) {
    throw new Error('useDesktopAppearance must be used within DesktopAppearanceProvider')
  }

  return value
}
