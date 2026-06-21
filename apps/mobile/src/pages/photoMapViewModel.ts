import { hasUsableImageLocationCoordinates } from '@journal/core'
import type {
  PhotoMapMurmurSlice,
  PhotoMapImageCluster,
  PhotoMapTextCluster,
} from './photoMapData'

export const maxVisiblePhotoMapClusters = 80

export function limitVisiblePhotoMapClusters<Cluster extends PhotoMapImageCluster | PhotoMapTextCluster>(
  clusters: readonly Cluster[],
  importantId: string | undefined | null,
) {
  if (clusters.length <= maxVisiblePhotoMapClusters) {
    return clusters
  }

  const limitedClusters = clusters.slice(0, maxVisiblePhotoMapClusters)

  if (!importantId || limitedClusters.some((cluster) => isPhotoMapClusterImportant(cluster, importantId))) {
    return limitedClusters
  }

  const importantCluster = clusters.find((cluster) => isPhotoMapClusterImportant(cluster, importantId))

  return importantCluster
    ? [importantCluster, ...limitedClusters.slice(0, maxVisiblePhotoMapClusters - 1)]
    : limitedClusters
}

export function createPhotoMapTextClusterLookup(clusters: readonly PhotoMapTextCluster[]) {
  const lookup = new Map<string, PhotoMapTextCluster>()

  for (const cluster of clusters) {
    for (const item of cluster.items) {
      lookup.set(item.id, cluster)
    }
  }

  return lookup
}

export function getUnlocatedPhotoMapContentCount(murmurSlices: readonly PhotoMapMurmurSlice[]) {
  return murmurSlices.reduce((count, murmurSlice) => {
    const textGapCount = murmurSlice.body.trim() && !murmurSlice.coordinates ? 1 : 0
    const imageGapCount = murmurSlice.murmur.images.reduce((imageCount, image) => {
      const hasUsableCoordinates = hasUsableImageLocationCoordinates(image.location) || Boolean(murmurSlice.coordinates)

      return hasUsableCoordinates ? imageCount : imageCount + 1
    }, 0)

    return count + textGapCount + imageGapCount
  }, 0)
}

export function isPhotoMapTextClusterSelected(
  cluster: PhotoMapTextCluster,
  selectedTextId: string | undefined,
) {
  return Boolean(selectedTextId && cluster.items.some((item) => item.id === selectedTextId))
}

export function getPhotoMapClusterBounds(
  cluster: PhotoMapImageCluster | PhotoMapTextCluster,
): [west: number, south: number, east: number, north: number] {
  const longitudes = cluster.items.map((item) => item.coordinates[0])
  const latitudes = cluster.items.map((item) => item.coordinates[1])
  const west = Math.min(...longitudes)
  const east = Math.max(...longitudes)
  const south = Math.min(...latitudes)
  const north = Math.max(...latitudes)
  const latitudePadding = Math.max((north - south) * 0.35, 0.0012)
  const longitudePadding = Math.max((east - west) * 0.35, 0.0012)

  return [
    west - longitudePadding,
    south - latitudePadding,
    east + longitudePadding,
    north + latitudePadding,
  ]
}

export function getExpandedPhotoMapMarkerCoordinates(
  center: [longitude: number, latitude: number],
  index: number,
  count: number,
  radiusMeters: number,
): [longitude: number, latitude: number] {
  if (count <= 1) {
    return center
  }

  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count
  const latitudeMeters = 111320
  const longitudeMeters = Math.max(
    1,
    111320 * Math.cos(center[1] * Math.PI / 180),
  )

  return [
    center[0] + Math.cos(angle) * radiusMeters / longitudeMeters,
    center[1] + Math.sin(angle) * radiusMeters / latitudeMeters,
  ]
}

export function getExpandedPhotoMapMarkerOffset(
  index: number,
  count: number,
  radiusPixels: number,
): [x: number, y: number] {
  if (count <= 1) {
    return [0, 0]
  }

  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count

  return [
    Math.round(Math.cos(angle) * radiusPixels),
    Math.round(Math.sin(angle) * radiusPixels),
  ]
}

function isPhotoMapClusterImportant(
  cluster: PhotoMapImageCluster | PhotoMapTextCluster,
  importantId: string,
) {
  return cluster.id === importantId || cluster.items.some((item) => item.id === importantId)
}
