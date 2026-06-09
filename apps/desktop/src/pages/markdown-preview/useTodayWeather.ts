import { useCallback, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import {
  isFreshWeatherForLocation,
  parseJournalMarkdown,
  type DayFrontMatter,
} from '@journal/core'
import type { JournalSyncCoordinator } from '@journal/sync/scheduler'
import type { WeatherStatus } from './JournalWeatherHeader'
import { stripManagedFrontMatter } from './managedJournalMarkdown'

type JournalFile = Awaited<ReturnType<NonNullable<Window['journalStore']>['loadToday']>>

type UseTodayWeatherInput = {
  coordinatorRef: MutableRefObject<JournalSyncCoordinator | null>
  journalFileRef: MutableRefObject<JournalFile | null>
  saveRequestIdRef: MutableRefObject<number>
  setJournalFile: Dispatch<SetStateAction<JournalFile | null>>
  setJournalFrontMatter: Dispatch<SetStateAction<DayFrontMatter>>
  updateLastSavedJournalSnapshot: (
    snapshot: {
      frontMatter: DayFrontMatter
      markdown: string
    },
    options?: { updateState?: boolean },
  ) => void
}

export function useTodayWeather({
  coordinatorRef,
  journalFileRef,
  saveRequestIdRef,
  setJournalFile,
  setJournalFrontMatter,
  updateLastSavedJournalSnapshot,
}: UseTodayWeatherInput) {
  const [weatherStatus, setWeatherStatus] = useState<WeatherStatus>('idle')

  const refreshTodayWeather = useCallback(async (loadedFile: JournalFile) => {
    const journalStore = getJournalStore()

    if (!journalStore?.refreshTodayWeather) {
      const frontMatter = parseJournalMarkdown(loadedFile.content).frontMatter

      if (journalFileRef.current?.date === loadedFile.date) {
        setWeatherStatus(frontMatter.weather?.text ? 'ready' : 'failed')
      }
      return
    }

    const loadedFrontMatter = parseJournalMarkdown(loadedFile.content).frontMatter

    if (loadedFile.date !== getLocalDateKey()) {
      setWeatherStatus(loadedFrontMatter.weather?.text ? 'ready' : 'failed')
      return
    }

    const weatherLocation = await loadConfiguredWeatherLocation()

    if (isFreshWeatherForLocation(loadedFrontMatter, loadedFile.date, weatherLocation)) {
      setWeatherStatus('ready')
      return
    }

    setWeatherStatus('loading')

    try {
      const location = weatherLocation ? undefined : await resolveBrowserWeatherLocation()

      if (journalFileRef.current?.date !== loadedFile.date || loadedFile.date !== getLocalDateKey()) {
        if (journalFileRef.current?.date === loadedFile.date) {
          setWeatherStatus(loadedFrontMatter.weather?.text ? 'ready' : 'failed')
        }
        return
      }

      const refreshedFile = await journalStore.refreshTodayWeather(location)
      const refreshedFrontMatter = parseJournalMarkdown(refreshedFile.content).frontMatter

      if (
        journalFileRef.current?.date !== loadedFile.date ||
        journalFileRef.current?.content !== loadedFile.content ||
        refreshedFile.date !== loadedFile.date
      ) {
        if (journalFileRef.current?.date === loadedFile.date) {
          setWeatherStatus(loadedFrontMatter.weather?.text ? 'ready' : 'failed')
        }
        return
      }

      saveRequestIdRef.current += 1
      journalFileRef.current = refreshedFile
      updateLastSavedJournalSnapshot({
        frontMatter: refreshedFrontMatter,
        markdown: stripManagedFrontMatter(refreshedFile.content),
      })
      setJournalFrontMatter(refreshedFrontMatter)
      setJournalFile(refreshedFile)
      setWeatherStatus(refreshedFrontMatter.weather?.text ? 'ready' : 'failed')
      if (didJournalFileWrite(refreshedFile)) {
        coordinatorRef.current?.markLocalSave(getJournalFileTrackedPaths(refreshedFile))
      }
    } catch {
      if (journalFileRef.current?.date === loadedFile.date) {
        setWeatherStatus('failed')
      }
    }
  }, [
    coordinatorRef,
    journalFileRef,
    saveRequestIdRef,
    setJournalFile,
    setJournalFrontMatter,
    updateLastSavedJournalSnapshot,
  ])

  return {
    refreshTodayWeather,
    weatherStatus,
  }
}

function getJournalStore() {
  return typeof window === 'undefined' ? undefined : window.journalStore
}

function getJournalSettingsStore() {
  return typeof window === 'undefined' ? undefined : window.journalSettings
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function resolveBrowserWeatherLocation(): Promise<{ latitude: number; longitude: number } | undefined> {
  if (!navigator.geolocation) {
    return Promise.resolve(undefined)
  }

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(undefined), 5000)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timeoutId)
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      () => {
        window.clearTimeout(timeoutId)
        resolve(undefined)
      },
      {
        enableHighAccuracy: false,
        maximumAge: 1000 * 60 * 60,
        timeout: 4500,
      },
    )
  })
}

async function loadConfiguredWeatherLocation() {
  try {
    return (await getJournalSettingsStore()?.load())?.weatherLocation.trim() ?? ''
  } catch {
    return ''
  }
}

function didJournalFileWrite(file: JournalFile) {
  return file.didWrite === true
}

function getJournalFileTrackedPaths(file: JournalFile) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(file.date)

  if (!match) {
    return []
  }

  const [, year, month] = match

  return [`entries/${year}/${month}/${file.date}.md`]
}
