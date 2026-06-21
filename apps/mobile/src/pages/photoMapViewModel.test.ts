import { describe, expect, it } from 'vitest'
import type {
  PhotoMapImageCluster,
  PhotoMapImageObservation,
  PhotoMapTextCluster,
  PhotoMapTextObservation,
} from './photoMapData'
import {
  createPhotoMapTextClusterLookup,
  getExpandedPhotoMapMarkerOffset,
  getPhotoMapInitialCameraIdentity,
  getPhotoMapInitialCameraKey,
  getUnlocatedPhotoMapContentCount,
  isPhotoMapTextClusterSelected,
  limitVisiblePhotoMapClusters,
  maxVisiblePhotoMapClusters,
} from './photoMapViewModel'

describe('photoMapViewModel', () => {
  it('keeps an important cluster visible when the map cluster list is capped', () => {
    const clusters = Array.from({ length: maxVisiblePhotoMapClusters + 2 }, (_, index) => (
      createImageCluster(`image-${index}`)
    ))
    const importantCluster = clusters.at(-1)!

    const visibleClusters = limitVisiblePhotoMapClusters(clusters, importantCluster.id)

    expect(visibleClusters).toHaveLength(maxVisiblePhotoMapClusters)
    expect(visibleClusters[0]).toBe(importantCluster)
  })

  it('builds a lookup from text observation id to its cluster', () => {
    const firstItem = createTextObservation('text-1')
    const secondItem = createTextObservation('text-2')
    const cluster = createTextCluster('cluster-1', [firstItem, secondItem])
    const lookup = createPhotoMapTextClusterLookup([cluster])

    expect(lookup.get(firstItem.id)).toBe(cluster)
    expect(lookup.get(secondItem.id)).toBe(cluster)
    expect(isPhotoMapTextClusterSelected(cluster, secondItem.id)).toBe(true)
    expect(isPhotoMapTextClusterSelected(cluster, 'missing')).toBe(false)
  })

  it('counts only unmappable images and located-body text gaps', () => {
    expect(getUnlocatedPhotoMapContentCount([
      {
        body: '',
        coordinates: null,
        date: '2026-06-18',
        id: '2026-06-18:image-only',
        kind: 'murmur',
        murmur: {
          body: '',
          id: 'image-only',
          images: [{
            id: 'image-only',
            src: 'media/image-only.jpg',
            tags: [],
          }],
          themes: [],
          time: '2026-06-18T10:00:00.000Z',
        },
        murmurId: 'image-only',
        time: '2026-06-18T10:00:00.000Z',
      },
      {
        body: '',
        coordinates: [104.1, 30.6],
        date: '2026-06-18',
        id: '2026-06-18:image-fallback',
        kind: 'murmur',
        murmur: {
          body: '',
          id: 'image-fallback',
          images: [{
            id: 'image-fallback',
            src: 'media/image-fallback.jpg',
            tags: [],
          }],
          themes: [],
          time: '2026-06-18T10:00:00.000Z',
        },
        murmurId: 'image-fallback',
        time: '2026-06-18T10:00:00.000Z',
      },
      {
        body: '有文字但没有定位',
        coordinates: null,
        date: '2026-06-18',
        id: '2026-06-18:text',
        kind: 'murmur',
        murmur: {
          body: '有文字但没有定位',
          id: 'text',
          images: [],
          themes: [],
          time: '2026-06-18T10:00:00.000Z',
        },
        murmurId: 'text',
        time: '2026-06-18T10:00:00.000Z',
      },
    ])).toBe(2)
  })

  it('fans expanded marker offsets around the cluster center in screen pixels', () => {
    expect(getExpandedPhotoMapMarkerOffset(0, 1, 62)).toEqual([0, 0])
    expect(getExpandedPhotoMapMarkerOffset(0, 4, 62)).toEqual([0, -62])
    expect(getExpandedPhotoMapMarkerOffset(1, 4, 62)).toEqual([62, 0])
  })

  it('identifies initial cameras by coordinates, zoom, bounds, and padding', () => {
    const centerCamera = {
      center: [104.06331, 30.65761] as [longitude: number, latitude: number],
      zoom: 12.2,
    }
    const sameCenterCamera = {
      center: [104.06331, 30.65761] as [longitude: number, latitude: number],
      zoom: 12.2,
    }

    expect(getPhotoMapInitialCameraIdentity(centerCamera)).toBe(getPhotoMapInitialCameraIdentity(sameCenterCamera))
    expect(getPhotoMapInitialCameraIdentity({
      center: [104.06331, 30.65761],
      zoom: 12.2,
    })).not.toBe(getPhotoMapInitialCameraIdentity({
      center: [104.16331, 30.65761],
      zoom: 12.2,
    }))
    expect(getPhotoMapInitialCameraIdentity({
      center: [104.06331, 30.65761],
      zoom: 12.2,
    })).not.toBe(getPhotoMapInitialCameraIdentity({
      center: [104.06331, 30.65761],
      zoom: 13,
    }))
    expect(getPhotoMapInitialCameraIdentity({
      bounds: [104.02, 30.62, 104.08, 30.68],
      padding: {
        bottom: 120,
        left: 24,
        right: 24,
        top: 96,
      },
    })).not.toBe(getPhotoMapInitialCameraIdentity({
      bounds: [104.02, 30.62, 104.08, 30.68],
      padding: {
        bottom: 160,
        left: 24,
        right: 24,
        top: 96,
      },
    }))
  })

  it('changes initial camera keys when camera identity changes even if observation counts stay stable', () => {
    const baseline = getPhotoMapInitialCameraKey({
      imageObservationCount: 3,
      initialCamera: {
        center: [104.06331, 30.65761],
        zoom: 12.2,
      },
      mapReadyGeneration: 1,
      range: '7d',
      textObservationCount: 4,
    })
    const movedSameCounts = getPhotoMapInitialCameraKey({
      imageObservationCount: 3,
      initialCamera: {
        center: [104.16331, 30.75761],
        zoom: 12.2,
      },
      mapReadyGeneration: 1,
      range: '7d',
      textObservationCount: 4,
    })
    const sameCamera = getPhotoMapInitialCameraKey({
      imageObservationCount: 3,
      initialCamera: {
        center: [104.06331, 30.65761],
        zoom: 12.2,
      },
      mapReadyGeneration: 1,
      range: '7d',
      textObservationCount: 4,
    })

    expect(movedSameCounts).not.toBe(baseline)
    expect(sameCamera).toBe(baseline)
  })
})

function createImageCluster(id: string): PhotoMapImageCluster {
  const item: PhotoMapImageObservation = {
    body: '',
    coordinateSource: 'image',
    coordinates: [104.06331, 30.65761],
    date: '2026-06-18',
    id,
    image: {
      id,
      src: `media/${id}.jpg`,
      tags: [],
    },
    kind: 'image-observation',
    murmur: {
      body: '',
      id,
      images: [],
      themes: [],
      time: '2026-06-18T10:00:00.000Z',
    },
    murmurId: id,
    time: '2026-06-18T10:00:00.000Z',
  }

  return {
    coordinates: item.coordinates,
    id: `cluster:${id}`,
    items: [item],
    kind: 'image-cluster',
    representativeItem: item,
  }
}

function createTextObservation(id: string): PhotoMapTextObservation {
  return {
    body: `body ${id}`,
    coordinates: [104.06331, 30.65761],
    date: '2026-06-18',
    id,
    kind: 'text-observation',
    murmur: {
      body: `body ${id}`,
      id,
      images: [],
      themes: [],
      time: '2026-06-18T10:00:00.000Z',
    },
    murmurId: id,
    time: '2026-06-18T10:00:00.000Z',
  }
}

function createTextCluster(id: string, items: PhotoMapTextObservation[]): PhotoMapTextCluster {
  return {
    coordinates: items[0]?.coordinates ?? [0, 0],
    id,
    items,
    kind: 'text-cluster',
    representativeItem: items[0]!,
  }
}
