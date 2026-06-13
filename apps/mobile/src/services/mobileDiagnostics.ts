import * as Location from 'expo-location'
import type { DayFrontMatter } from '@journal/core'
import {
  getDailyJournalFileUri,
  getJournalWorktreeDirectory,
} from './mobileJournalStore'
import { getMobileUiSettingsStorageLabel } from './mobileUiSettings'

export type MobileLocationPermissionStatus =
  | 'denied'
  | 'granted'
  | 'unknown'
  | 'undetermined'
  | 'unavailable'

export type MobileLocationDiagnostic = {
  canGetLocation: boolean
  errorMessage?: string
  locationLabel?: string
  permissionStatus: MobileLocationPermissionStatus
}

export type MobileWeatherDiagnostic = {
  label: string
  updatedAtLabel: string
}

export function getMobileDiagnosticPaths(date: string) {
  return {
    todayEntryPath: getDailyJournalFileUri(date),
    uiSettingsStorage: getMobileUiSettingsStorageLabel(),
    worktreeDirectory: getJournalWorktreeDirectory(),
  }
}

export async function getMobileLocationPermissionDiagnostic(): Promise<MobileLocationDiagnostic> {
  try {
    const permission = await Location.getForegroundPermissionsAsync()

    return {
      canGetLocation: permission.granted,
      permissionStatus: normalizePermissionStatus(permission.status, permission.granted),
    }
  } catch (error) {
    return {
      canGetLocation: false,
      errorMessage: getErrorMessage(error),
      permissionStatus: 'unavailable',
    }
  }
}

export async function requestMobileLocationDiagnostic(): Promise<MobileLocationDiagnostic> {
  let permissionStatus: MobileLocationPermissionStatus = 'unknown'

  try {
    const permission = await Location.requestForegroundPermissionsAsync()
    permissionStatus = normalizePermissionStatus(permission.status, permission.granted)

    if (!permission.granted) {
      return {
        canGetLocation: false,
        permissionStatus,
      }
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    })
    const locationLabel = await reverseGeocodeLocationLabel({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    })

    return {
      canGetLocation: true,
      locationLabel: locationLabel || '已获取当前位置',
      permissionStatus,
    }
  } catch (error) {
    return {
      canGetLocation: false,
      errorMessage: getErrorMessage(error),
      permissionStatus,
    }
  }
}

export function getMobileWeatherDiagnostic(frontMatter: DayFrontMatter | null): MobileWeatherDiagnostic {
  const weather = frontMatter?.weather

  if (!weather?.text) {
    return {
      label: '未获取',
      updatedAtLabel: '无',
    }
  }

  return {
    label: [
      weather.text,
      typeof weather.temperature === 'number' ? `${Math.round(weather.temperature)}℃` : '',
    ].filter(Boolean).join(' '),
    updatedAtLabel: formatDiagnosticTime(weather.updatedAt),
  }
}

export function formatMobileLocationLabel(location: DayFrontMatter['location']) {
  if (location?.query) {
    return location.query
  }

  const locationLabel = [location?.name, location?.region, location?.country].filter(Boolean).join(' · ')

  return locationLabel || '未记录'
}

function normalizePermissionStatus(status: unknown, granted: boolean): MobileLocationPermissionStatus {
  if (granted) {
    return 'granted'
  }

  if (status === 'denied' || status === 'granted' || status === 'undetermined') {
    return status
  }

  return 'unknown'
}

async function reverseGeocodeLocationLabel(coords: { latitude: number; longitude: number }) {
  try {
    const [location] = await Location.reverseGeocodeAsync(coords)

    if (!location) {
      return ''
    }

    return [
      location.city ?? location.district ?? location.subregion ?? location.name,
      location.region,
      location.country,
    ].filter(Boolean).join(' · ')
  } catch {
    return ''
  }
}

function formatDiagnosticTime(value: string | undefined) {
  if (!value) {
    return '时间未知'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  })
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '诊断失败'
}
