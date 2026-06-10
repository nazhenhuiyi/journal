import { useEffect, useRef, useState } from 'react'
import { isFreshWeather, type DayFrontMatter } from '@journal/core'
import { fetchTodayMobileWeather } from '../services/mobileWeather'
import {
  getLocalDateKey,
  type MobileJournalRecord,
  type SaveDailyJournalResult,
} from '../services/mobileJournalStore'
import type { SaveState } from './useMobileJournal'

type UseMobileWeatherInput = {
  frontMatter: DayFrontMatter | null
  isLongEntryInputUnstable: () => boolean
  record: MobileJournalRecord | null
  saveState: SaveState
  saveStateRef: { current: SaveState }
  today: string
  updateTodayFrontMatter: (frontMatterPatch: DayFrontMatter) => Promise<SaveDailyJournalResult>
}

const inputRetryDelayMs = 5500
const failureRetryDelayMs = 10_000

export function useMobileWeather({
  frontMatter,
  isLongEntryInputUnstable,
  record,
  saveState,
  saveStateRef,
  today,
  updateTodayFrontMatter,
}: UseMobileWeatherInput) {
  const requestedKeyRef = useRef('')
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    if (!record || !frontMatter || today !== getLocalDateKey()) {
      return undefined
    }

    if (isFreshWeather(frontMatter.weather, today)) {
      return undefined
    }

    if (saveState === 'dirty' || saveState === 'saving' || saveState === 'loading') {
      return undefined
    }

    if (isLongEntryInputUnstable()) {
      const timeoutId = setTimeout(() => {
        setRetryTick((currentRetryTick) => currentRetryTick + 1)
      }, inputRetryDelayMs)

      return () => clearTimeout(timeoutId)
    }

    const requestKey = `${today}:${frontMatter.weather?.updatedAt ?? 'missing'}:${frontMatter.weather?.text ?? ''}`

    if (requestedKeyRef.current === requestKey) {
      return undefined
    }

    requestedKeyRef.current = requestKey
    let isCancelled = false

    fetchTodayMobileWeather()
      .then(async (weatherPayload) => {
        if (isCancelled) {
          return
        }

        if (
          saveStateRef.current === 'dirty' ||
          saveStateRef.current === 'saving' ||
          saveStateRef.current === 'loading' ||
          isLongEntryInputUnstable()
        ) {
          requestedKeyRef.current = ''
          setRetryTick((currentRetryTick) => currentRetryTick + 1)
          return
        }

        const updatedRecord = await updateTodayFrontMatter({
          weather: weatherPayload.weather,
          location: weatherPayload.location,
        })

        if (!updatedRecord.didWrite) {
          requestedKeyRef.current = ''
        }
      })
      .catch(() => {
        if (isCancelled) {
          return
        }

        requestedKeyRef.current = ''
        setTimeout(() => {
          if (!isCancelled) {
            setRetryTick((currentRetryTick) => currentRetryTick + 1)
          }
        }, failureRetryDelayMs)
        // Weather is ambient context; failures should not interrupt writing.
      })

    return () => {
      isCancelled = true
    }
  }, [
    frontMatter,
    isLongEntryInputUnstable,
    record,
    retryTick,
    saveState,
    saveStateRef,
    today,
    updateTodayFrontMatter,
  ])
}
