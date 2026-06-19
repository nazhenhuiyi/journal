import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import {
  hasUsableImageLocationCoordinates,
  type ImageBlock,
  type ImageLocation,
  type MurmurBlock,
} from '@journal/core'

export type PhotoMapRange = '7d' | '14d' | '30d' | 'all'

export type PhotoMapSourceDay = {
  date: string
  murmurs: readonly MurmurBlock[]
}

export type PhotoMapMurmurEntry = {
  body: string
  coordinates: [longitude: number, latitude: number] | null
  date: string
  id: string
  imageEntries: PhotoMapImageEntry[]
  images: readonly ImageBlock[]
  kind: 'murmur'
  location?: ImageLocation
  murmur: MurmurBlock
  murmurId: string
  time: string
}

export type PhotoMapImageEntry = {
  body: string
  coordinates: [longitude: number, latitude: number] | null
  date: string
  id: string
  image: ImageBlock
  kind: 'image'
  location?: ImageLocation
  murmurCoordinates: [longitude: number, latitude: number] | null
  murmurId: string
  murmurLocation?: ImageLocation
  time: string
}

export type PhotoMapEntry = PhotoMapMurmurEntry | PhotoMapImageEntry

export type PhotoMapMurmurPointProperties = {
  date: string
  entryId: string
  imageCount: number
  kind: 'murmur'
  murmurId: string
  title: string
  time: string
}

export type PhotoMapImagePointProperties = {
  date: string
  entryId: string
  imageId: string
  kind: 'image'
  murmurId: string
  title: string
  time: string
}

export type PhotoMapPointProperties = PhotoMapMurmurPointProperties | PhotoMapImagePointProperties

export type PhotoMapMurmurRouteProperties = {
  kind: 'murmur-route'
}

export type PhotoMapInitialCamera =
  | {
      center: [longitude: number, latitude: number]
      zoom: number
    }
  | {
      bounds: [west: number, south: number, east: number, north: number]
      padding: {
        bottom: number
        left: number
        right: number
        top: number
      }
    }

export const defaultPhotoMapRange = '7d' satisfies PhotoMapRange

const defaultCamera: PhotoMapInitialCamera = {
  center: [104.1954, 35.8617],
  zoom: 3,
}
const rangeDays: Record<Exclude<PhotoMapRange, 'all'>, number> = {
  '14d': 14,
  '30d': 30,
  '7d': 7,
}

export function createPhotoMapEntries(
  records: readonly PhotoMapSourceDay[],
  currentDay: PhotoMapSourceDay,
  range: PhotoMapRange = defaultPhotoMapRange,
): PhotoMapEntry[] {
  const mergedRecords = [
    currentDay,
    ...records.filter((record) => record.date !== currentDay.date),
  ]
  const entries: PhotoMapEntry[] = []

  for (const record of mergedRecords) {
    for (const murmur of record.murmurs) {
      const murmurCoordinates = getLocationCoordinates(murmur.location)
      const imageEntries = murmur.images.map((image) => ({
        body: murmur.body,
        coordinates: getLocationCoordinates(image.location),
        date: record.date,
        id: `${record.date}:${murmur.id}:${image.id}`,
        image,
        kind: 'image' as const,
        location: image.location,
        murmurCoordinates,
        murmurId: murmur.id,
        murmurLocation: murmur.location,
        time: murmur.time,
      }))
      const murmurEntry: PhotoMapMurmurEntry = {
        body: murmur.body,
        coordinates: murmurCoordinates,
        date: record.date,
        id: `${record.date}:${murmur.id}`,
        imageEntries,
        images: murmur.images,
        kind: 'murmur',
        location: murmur.location,
        murmur,
        murmurId: murmur.id,
        time: murmur.time,
      }

      entries.push(murmurEntry, ...imageEntries)
    }
  }

  return filterPhotoMapEntriesByRange(entries, range, currentDay.date)
}

export function filterPhotoMapEntriesByRange(
  entries: readonly PhotoMapEntry[],
  range: PhotoMapRange,
  today: string,
) {
  const sortedEntries = [...entries].sort(comparePhotoMapEntriesByNewest)

  if (range === 'all') {
    return sortedEntries
  }

  const startDate = addDateKeyDays(today, -(rangeDays[range] - 1))

  return sortedEntries.filter((entry) => {
    return entry.date >= startDate && entry.date <= today
  })
}

export function createMurmurPointFeatureCollection(
  entries: readonly PhotoMapEntry[],
): FeatureCollection<Point, PhotoMapMurmurPointProperties> {
  return {
    features: entries.flatMap((entry) => {
      if (entry.kind !== 'murmur' || !entry.coordinates) {
        return []
      }

      return [{
        geometry: {
          coordinates: entry.coordinates,
          type: 'Point',
        },
        id: entry.id,
        properties: {
          date: entry.date,
          entryId: entry.id,
          imageCount: entry.images.length,
          kind: 'murmur',
          murmurId: entry.murmurId,
          time: entry.time,
          title: getPhotoMapEntryTitle(entry),
        },
        type: 'Feature',
      } satisfies Feature<Point, PhotoMapMurmurPointProperties>]
    }),
    type: 'FeatureCollection',
  }
}

export function createMurmurRouteFeatureCollection(
  entries: readonly PhotoMapEntry[],
): FeatureCollection<LineString, PhotoMapMurmurRouteProperties> {
  const coordinates = entries
    .filter((entry): entry is PhotoMapMurmurEntry => entry.kind === 'murmur')
    .sort(comparePhotoMapEntriesByOldest)
    .flatMap((entry) => entry.coordinates ? [entry.coordinates] : [])

  if (coordinates.length < 2) {
    return {
      features: [],
      type: 'FeatureCollection',
    }
  }

  return {
    features: [{
      geometry: {
        coordinates,
        type: 'LineString',
      },
      id: 'murmur-route',
      properties: {
        kind: 'murmur-route',
      },
      type: 'Feature',
    }],
    type: 'FeatureCollection',
  }
}

export function createImagePointFeatureCollection(
  entries: readonly PhotoMapEntry[],
): FeatureCollection<Point, PhotoMapImagePointProperties> {
  return {
    features: entries.flatMap((entry) => {
      if (entry.kind !== 'image' || !entry.coordinates) {
        return []
      }

      return [{
        geometry: {
          coordinates: entry.coordinates,
          type: 'Point',
        },
        id: entry.id,
        properties: {
          date: entry.date,
          entryId: entry.id,
          imageId: entry.image.id,
          kind: 'image',
          murmurId: entry.murmurId,
          time: entry.time,
          title: getPhotoMapEntryTitle(entry),
        },
        type: 'Feature',
      } satisfies Feature<Point, PhotoMapImagePointProperties>]
    }),
    type: 'FeatureCollection',
  }
}

export function getPhotoMapInitialCamera(entries: readonly PhotoMapEntry[]): PhotoMapInitialCamera {
  const coordinates = getInitialPhotoMapCameraCoordinates(entries)

  if (!coordinates) {
    return defaultCamera
  }

  return {
    center: coordinates,
    zoom: 12,
  }
}

export function getMappablePhotoMapEntries(entries: readonly PhotoMapEntry[]) {
  return entries.filter((entry) => getPhotoMapEntryMapCoordinates(entry))
}

export function getPhotoMapEntryMapCoordinates(entry: PhotoMapEntry) {
  return entry.coordinates
}

export function getPhotoMapEntryCameraCoordinates(entry: PhotoMapEntry) {
  return entry.kind === 'image'
    ? entry.coordinates ?? entry.murmurCoordinates
    : entry.coordinates ?? entry.imageEntries.find((imageEntry) => imageEntry.coordinates)?.coordinates ?? null
}

export function formatCompactDate(dateKey: string) {
  const [, month, day] = dateKey.split('-')

  if (!month || !day) {
    return dateKey
  }

  return `${Number(month)}月${Number(day)}日`
}

export function formatCoordinateLabel(location: ImageLocation | undefined) {
  const coordinates = getLocationCoordinates(location)

  if (!coordinates) {
    return '未定位'
  }

  const [longitude, latitude] = coordinates

  return [
    formatCoordinate(latitude, 'N', 'S'),
    formatCoordinate(longitude, 'E', 'W'),
  ].join(' · ')
}

export function getPhotoMapEntryCoordinateLabel(entry: PhotoMapEntry) {
  if (entry.kind === 'image' && !entry.location && entry.murmurLocation) {
    return `跟随碎碎念 · ${formatCoordinateLabel(entry.murmurLocation)}`
  }

  return formatCoordinateLabel(entry.location)
}

export function getPhotoMapEntryTitle(entry: PhotoMapEntry) {
  if (entry.kind === 'image') {
    return entry.image.caption?.trim() || entry.body.trim() || formatCompactDate(entry.date)
  }

  return entry.body.trim() || (entry.images.length > 0 ? `${entry.images.length} 张照片` : formatCompactDate(entry.date))
}

export function getPhotoMapEntryExcerpt(entry: PhotoMapEntry) {
  const text = entry.body.trim()

  if (!text) {
    return ''
  }

  return text.length > 76 ? `${text.slice(0, 76).trimEnd()}...` : text
}

function getLocationCoordinates(location: ImageLocation | undefined): [number, number] | null {
  if (!hasUsableImageLocationCoordinates(location)) {
    return null
  }

  return [location.longitude, location.latitude]
}

function getInitialPhotoMapCameraCoordinates(entries: readonly PhotoMapEntry[]) {
  const firstMurmurCoordinates = entries
    .filter((entry): entry is PhotoMapMurmurEntry => entry.kind === 'murmur')
    .map((entry) => getPhotoMapEntryCameraCoordinates(entry))
    .find((coordinates): coordinates is [number, number] => coordinates !== null)

  if (firstMurmurCoordinates) {
    return firstMurmurCoordinates
  }

  return entries
    .map((entry) => getPhotoMapEntryCameraCoordinates(entry))
    .find((coordinates): coordinates is [number, number] => coordinates !== null) ?? null
}

function comparePhotoMapEntriesByNewest(left: PhotoMapEntry, right: PhotoMapEntry) {
  const timeCompare = right.time.localeCompare(left.time)

  if (timeCompare !== 0) {
    return timeCompare
  }

  const kindCompare = getEntryKindSortRank(left) - getEntryKindSortRank(right)

  return kindCompare === 0 ? left.id.localeCompare(right.id) : kindCompare
}

function comparePhotoMapEntriesByOldest(left: PhotoMapEntry, right: PhotoMapEntry) {
  const timeCompare = left.time.localeCompare(right.time)

  if (timeCompare !== 0) {
    return timeCompare
  }

  const kindCompare = getEntryKindSortRank(left) - getEntryKindSortRank(right)

  return kindCompare === 0 ? left.id.localeCompare(right.id) : kindCompare
}

function getEntryKindSortRank(entry: PhotoMapEntry) {
  return entry.kind === 'murmur' ? 0 : 1
}

function getDateStart(dateKey: string) {
  const parsed = new Date(`${dateKey}T00:00:00`)

  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed
}

function addDateKeyDays(dateKey: string, dayDelta: number) {
  const date = getDateStart(dateKey)

  date.setDate(date.getDate() + dayDelta)

  return formatDateKey(date)
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatCoordinate(value: number, positive: string, negative: string) {
  const suffix = value >= 0 ? positive : negative

  return `${Math.abs(value).toFixed(4)}°${suffix}`
}
