import type { Feature, FeatureCollection, LineString } from 'geojson'
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

export type PhotoMapMurmurSlice = {
  body: string
  coordinates: [longitude: number, latitude: number] | null
  date: string
  id: string
  kind: 'murmur'
  murmur: MurmurBlock
  murmurId: string
  time: string
}

export type PhotoMapImageCoordinateSource = 'image' | 'murmur'

export type PhotoMapImageObservation = {
  body: string
  coordinateSource: PhotoMapImageCoordinateSource
  coordinates: [longitude: number, latitude: number]
  date: string
  id: string
  image: ImageBlock
  kind: 'image-observation'
  murmur: MurmurBlock
  murmurId: string
  time: string
}

export type PhotoMapTextObservation = {
  body: string
  coordinates: [longitude: number, latitude: number]
  date: string
  id: string
  kind: 'text-observation'
  murmur: MurmurBlock
  murmurId: string
  time: string
}

export type PhotoMapImageCluster = {
  coordinates: [longitude: number, latitude: number]
  id: string
  items: PhotoMapImageObservation[]
  kind: 'image-cluster'
  representativeItem: PhotoMapImageObservation
}

export type PhotoMapTextCluster = {
  coordinates: [longitude: number, latitude: number]
  id: string
  items: PhotoMapTextObservation[]
  kind: 'text-cluster'
  representativeItem: PhotoMapTextObservation
}

type PhotoMapMutableObservationCluster<
  Observation extends PhotoMapImageObservation | PhotoMapTextObservation,
  ClusterKind extends PhotoMapImageCluster['kind'] | PhotoMapTextCluster['kind'],
> = {
  coordinates: [longitude: number, latitude: number]
  id: string
  items: Observation[]
  kind: ClusterKind
  representativeItem: Observation
}

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
export const defaultPhotoMapNearbyGroupRadiusMeters = 150
const rangeDays: Record<Exclude<PhotoMapRange, 'all'>, number> = {
  '14d': 14,
  '30d': 30,
  '7d': 7,
}

export function createPhotoMapMurmurSlices(
  records: readonly PhotoMapSourceDay[],
  currentDay: PhotoMapSourceDay,
  range: PhotoMapRange = defaultPhotoMapRange,
): PhotoMapMurmurSlice[] {
  const mergedRecords = [
    currentDay,
    ...records.filter((record) => record.date !== currentDay.date),
  ]
  const murmurSlices: PhotoMapMurmurSlice[] = []

  for (const record of mergedRecords) {
    for (const murmur of record.murmurs) {
      const murmurCoordinates = getLocationCoordinates(murmur.location)
      const murmurSlice: PhotoMapMurmurSlice = {
        body: murmur.body,
        coordinates: murmurCoordinates,
        date: record.date,
        id: `${record.date}:${murmur.id}`,
        kind: 'murmur',
        murmur,
        murmurId: murmur.id,
        time: murmur.time,
      }

      murmurSlices.push(murmurSlice)
    }
  }

  return filterPhotoMapMurmurSlicesByRange(murmurSlices, range, currentDay.date)
}

export function filterPhotoMapMurmurSlicesByRange(
  murmurSlices: readonly PhotoMapMurmurSlice[],
  range: PhotoMapRange,
  today: string,
) {
  const sortedSlices = [...murmurSlices].sort(comparePhotoMapMurmurSlicesByNewest)

  if (range === 'all') {
    return sortedSlices
  }

  const startDate = addDateKeyDays(today, -(rangeDays[range] - 1))

  return sortedSlices.filter((murmurSlice) => {
    return murmurSlice.date >= startDate && murmurSlice.date <= today
  })
}

export function createMurmurRouteFeatureCollection(
  murmurSlices: readonly PhotoMapMurmurSlice[],
): FeatureCollection<LineString, PhotoMapMurmurRouteProperties> {
  const coordinates = [...murmurSlices]
    .sort(comparePhotoMapMurmurSlicesByOldest)
    .flatMap((murmurSlice) => murmurSlice.coordinates ? [murmurSlice.coordinates] : [])

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

export function createPhotoMapImageObservations(
  murmurSlices: readonly PhotoMapMurmurSlice[],
): PhotoMapImageObservation[] {
  return murmurSlices.flatMap((murmurSlice) => {
    return murmurSlice.murmur.images.flatMap((image) => {
      const imageCoordinates = getLocationCoordinates(image.location)
      const coordinates = imageCoordinates ?? murmurSlice.coordinates

      if (!coordinates) {
        return []
      }

      return [{
        body: murmurSlice.body,
        coordinateSource: imageCoordinates ? 'image' : 'murmur',
        coordinates,
        date: murmurSlice.date,
        id: `${murmurSlice.date}:${murmurSlice.murmurId}:${image.id}`,
        image,
        kind: 'image-observation' as const,
        murmur: murmurSlice.murmur,
        murmurId: murmurSlice.murmurId,
        time: murmurSlice.time,
      }]
    })
  })
}

export function createPhotoMapTextObservations(
  murmurSlices: readonly PhotoMapMurmurSlice[],
): PhotoMapTextObservation[] {
  return murmurSlices.flatMap((murmurSlice) => {
    const body = murmurSlice.body.trim()
    const coordinates = murmurSlice.coordinates

    if (!body || !coordinates) {
      return []
    }

    return [{
      body,
      coordinates,
      date: murmurSlice.date,
      id: murmurSlice.id,
      kind: 'text-observation' as const,
      murmur: murmurSlice.murmur,
      murmurId: murmurSlice.murmurId,
      time: murmurSlice.time,
    }]
  })
}

export function createPhotoMapImageClusters(
  observations: readonly PhotoMapImageObservation[],
  radiusMeters = defaultPhotoMapNearbyGroupRadiusMeters,
): PhotoMapImageCluster[] {
  return createPhotoMapObservationClusters(
    observations,
    radiusMeters,
    'image-cluster',
    getPhotoMapImageClusterId,
  )
}

export function createPhotoMapTextClusters(
  observations: readonly PhotoMapTextObservation[],
  radiusMeters = defaultPhotoMapNearbyGroupRadiusMeters,
): PhotoMapTextCluster[] {
  return createPhotoMapObservationClusters(
    observations,
    radiusMeters,
    'text-cluster',
    getPhotoMapTextClusterId,
  )
}

export function getPhotoMapInitialCamera(murmurSlices: readonly PhotoMapMurmurSlice[]): PhotoMapInitialCamera {
  const coordinates = getInitialPhotoMapCameraCoordinates(murmurSlices)

  if (!coordinates) {
    return defaultCamera
  }

  return {
    center: coordinates,
    zoom: 12,
  }
}

export function formatCompactDate(dateKey: string) {
  const [, month, day] = dateKey.split('-')

  if (!month || !day) {
    return dateKey
  }

  return `${Number(month)}月${Number(day)}日`
}

function getLocationCoordinates(location: ImageLocation | undefined): [number, number] | null {
  if (!hasUsableImageLocationCoordinates(location)) {
    return null
  }

  return [location.longitude, location.latitude]
}

function createPhotoMapObservationClusters<
  Observation extends PhotoMapImageObservation | PhotoMapTextObservation,
  ClusterKind extends PhotoMapImageCluster['kind'] | PhotoMapTextCluster['kind'],
>(
  observations: readonly Observation[],
  radiusMeters: number,
  kind: ClusterKind,
  getClusterId: (items: readonly Observation[]) => string,
): Array<ClusterKind extends 'image-cluster' ? PhotoMapImageCluster : PhotoMapTextCluster> {
  const clusters: Array<PhotoMapMutableObservationCluster<Observation, ClusterKind>> = []

  for (const observation of observations) {
    const nearbyClusters = clusters.filter((cluster) => (
      isPhotoMapObservationNearCluster(observation, cluster, radiusMeters)
    ))

    if (nearbyClusters.length === 0) {
      clusters.push({
        coordinates: observation.coordinates,
        id: getClusterId([observation]),
        items: [observation],
        kind,
        representativeItem: observation,
      })
      continue
    }

    const [nearbyCluster, ...clustersToMerge] = nearbyClusters
    const mergedClusterSet = new Set(clustersToMerge)

    nearbyCluster.items = [
      ...nearbyCluster.items,
      ...clustersToMerge.flatMap((cluster) => cluster.items),
      observation,
    ]
    nearbyCluster.coordinates = getAverageCoordinates(nearbyCluster.items)
    nearbyCluster.id = getClusterId(nearbyCluster.items)

    if (mergedClusterSet.size > 0) {
      for (let index = clusters.length - 1; index >= 0; index -= 1) {
        if (mergedClusterSet.has(clusters[index])) {
          clusters.splice(index, 1)
        }
      }
    }
  }

  return clusters as unknown as Array<ClusterKind extends 'image-cluster' ? PhotoMapImageCluster : PhotoMapTextCluster>
}

function isPhotoMapObservationNearCluster<
  Observation extends PhotoMapImageObservation | PhotoMapTextObservation,
  ClusterKind extends PhotoMapImageCluster['kind'] | PhotoMapTextCluster['kind'],
>(
  observation: Observation,
  cluster: PhotoMapMutableObservationCluster<Observation, ClusterKind>,
  radiusMeters: number,
) {
  return cluster.items.some((item) => (
    getDistanceMeters(item.coordinates, observation.coordinates) <= radiusMeters
  ))
}

function getPhotoMapImageClusterId(items: readonly PhotoMapImageObservation[]) {
  return `image-cluster:${items.map((item) => item.id).join('|')}`
}

function getPhotoMapTextClusterId(items: readonly PhotoMapTextObservation[]) {
  return `text-cluster:${items.map((item) => item.id).join('|')}`
}

function getAverageCoordinates(
  items: ReadonlyArray<{ coordinates: [longitude: number, latitude: number] }>,
): [longitude: number, latitude: number] {
  const [longitudeSum, latitudeSum] = items.reduce<[number, number]>((sums, item) => [
    sums[0] + item.coordinates[0],
    sums[1] + item.coordinates[1],
  ], [0, 0])

  return [longitudeSum / items.length, latitudeSum / items.length]
}

function getDistanceMeters(
  left: [longitude: number, latitude: number],
  right: [longitude: number, latitude: number],
) {
  const earthRadiusMeters = 6371008.8
  const leftLatitude = degreesToRadians(left[1])
  const rightLatitude = degreesToRadians(right[1])
  const latitudeDelta = degreesToRadians(right[1] - left[1])
  const longitudeDelta = degreesToRadians(right[0] - left[0])
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function degreesToRadians(degrees: number) {
  return degrees * Math.PI / 180
}

function getInitialPhotoMapCameraCoordinates(murmurSlices: readonly PhotoMapMurmurSlice[]) {
  const firstMurmurCoordinates = murmurSlices
    .map((murmurSlice) => murmurSlice.coordinates)
    .find((coordinates): coordinates is [number, number] => coordinates !== null)

  if (firstMurmurCoordinates) {
    return firstMurmurCoordinates
  }

  return murmurSlices
    .map((murmurSlice) => getPhotoMapMurmurSliceImageCameraCoordinates(murmurSlice))
    .find((coordinates): coordinates is [number, number] => coordinates !== null) ?? null
}

function getPhotoMapMurmurSliceImageCameraCoordinates(murmurSlice: PhotoMapMurmurSlice) {
  return murmurSlice.murmur.images
    .map((image) => getLocationCoordinates(image.location))
    .find((coordinates): coordinates is [number, number] => coordinates !== null) ?? null
}

function comparePhotoMapMurmurSlicesByNewest(left: PhotoMapMurmurSlice, right: PhotoMapMurmurSlice) {
  const timeCompare = right.time.localeCompare(left.time)

  return timeCompare === 0 ? left.id.localeCompare(right.id) : timeCompare
}

function comparePhotoMapMurmurSlicesByOldest(left: PhotoMapMurmurSlice, right: PhotoMapMurmurSlice) {
  const timeCompare = left.time.localeCompare(right.time)

  return timeCompare === 0 ? left.id.localeCompare(right.id) : timeCompare
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
