import { describe, expect, it } from 'vitest'
import type { ImageBlock, ImageLocation, MurmurBlock } from '@journal/core'
import {
  createImagePointFeatureCollection,
  createMurmurPointFeatureCollection,
  createMurmurRouteFeatureCollection,
  createPhotoMapEntries,
  defaultPhotoMapRange,
  filterPhotoMapEntriesByRange,
  formatCoordinateLabel,
  getPhotoMapEntryCoordinateLabel,
  getPhotoMapInitialCamera,
  type PhotoMapEntry,
} from './photoMapData'

describe('photoMapData', () => {
  it('defaults the photo map to the latest week', () => {
    expect(defaultPhotoMapRange).toBe('7d')

    const entries = createPhotoMapEntries([
      {
        date: '2026-06-08',
        murmurs: [createMurmur('eleven-days-ago', '2026-06-08T10:00:00.000Z', [
          createImage('eleven-days-ago-image', 35, 135),
        ])],
      },
    ], {
      date: '2026-06-18',
      murmurs: [createMurmur('today', '2026-06-18T10:00:00.000Z', [
        createImage('today-image', 31.2, 121.5),
      ])],
    })

    expect(entries.map((entry) => entry.murmurId)).toEqual([
      'today',
      'today',
    ])
  })

  it('uses the in-memory current day instead of the stored record for today', () => {
    const entries = createPhotoMapEntries([
      {
        date: '2026-06-18',
        murmurs: [
          createMurmur('stored', '2026-06-18T09:00:00.000Z', [
            createImage('stored-image', 39.9, 116.4),
          ], {
            latitude: 39.9,
            longitude: 116.4,
            source: 'manual',
          }),
        ],
      },
      {
        date: '2026-06-17',
        murmurs: [
          createMurmur('older', '2026-06-17T19:00:00.000Z', [
            createImage('older-image', 30.2, 120.1),
          ], {
            latitude: 30.2,
            longitude: 120.1,
            source: 'manual',
          }),
        ],
      },
    ], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('current', '2026-06-18T10:00:00.000Z', [
          createImage('current-image', 31.2, 121.5),
        ], {
          latitude: 31.2,
          longitude: 121.5,
          source: 'manual',
        }),
      ],
    }, '30d')

    expect(entries.filter(isImageEntry).map((entry) => entry.image.id)).toEqual([
      'current-image',
      'older-image',
    ])
  })

  it('filters entries by journal date range and keeps images with their murmur', () => {
    const allEntries = createPhotoMapEntries([
      {
        date: '2026-06-13',
        murmurs: [createMurmur('six-days-ago', '2026-06-13T10:00:00.000Z', [
          createImage('six-days-ago-image', 35, 135),
        ])],
      },
      {
        date: '2026-06-08',
        murmurs: [createMurmur('eleven-days-ago', '2026-06-08T10:00:00.000Z', [
          createImage('eleven-days-ago-image', 35, 135),
        ])],
      },
      {
        date: '2026-05-01',
        murmurs: [createMurmur('old', '2026-05-01T10:00:00.000Z', [
          createImage('old-image', 35, 135),
        ])],
      },
    ], {
      date: '2026-06-18',
      murmurs: [createMurmur('today', '2026-06-18T10:00:00.000Z', [
        createImage('today-image', 31.2, 121.5),
      ])],
    }, 'all')

    expect(filterPhotoMapEntriesByRange(allEntries, '7d', '2026-06-18').map((entry) => entry.murmurId)).toEqual([
      'today',
      'today',
      'six-days-ago',
      'six-days-ago',
    ])
    expect(filterPhotoMapEntriesByRange(allEntries, '14d', '2026-06-18').map((entry) => entry.murmurId)).toContain('eleven-days-ago')
    expect(filterPhotoMapEntriesByRange(allEntries, '30d', '2026-06-18').map((entry) => entry.murmurId)).not.toContain('old')
    expect(filterPhotoMapEntriesByRange(allEntries, 'all', '2026-06-18').map((entry) => entry.murmurId)).toContain('old')
  })

  it('does not drop range-boundary entries because of timezone offsets in murmur time', () => {
    const allEntries = createPhotoMapEntries([
      {
        date: '2026-06-12',
        murmurs: [createMurmur('tokyo-boundary', '2026-06-12T00:30:00+09:00', [
          createImage('tokyo-boundary-image', 35.7, 139.8),
        ])],
      },
    ], {
      date: '2026-06-18',
      murmurs: [],
    }, 'all')

    expect(filterPhotoMapEntriesByRange(allEntries, '7d', '2026-06-18').map((entry) => entry.murmurId)).toEqual([
      'tokyo-boundary',
      'tokyo-boundary',
    ])
  })

  it('creates murmur main points only from murmur locations', () => {
    const entries = createPhotoMapEntries([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('murmur-located', '2026-06-18T10:00:00.000Z', [
          createImage('image-without-location'),
        ], {
          latitude: 22.2819,
          longitude: 114.1587,
          name: '中环至半山自动扶梯',
          source: 'manual',
        }),
        createMurmur('image-located', '2026-06-18T09:00:00.000Z', [
          createImage('image-fallback', 31.2, 121.5),
        ]),
      ],
    }, '30d')
    const murmurPoints = createMurmurPointFeatureCollection(entries)

    expect(murmurPoints.features.map((feature) => feature.properties.entryId)).toEqual([
      '2026-06-18:murmur-located',
    ])
    expect(murmurPoints.features[0].geometry.coordinates).toEqual([114.1587, 22.2819])
  })

  it('creates image side points only from image locations without faking murmur positions', () => {
    const entries = createPhotoMapEntries([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('murmur-located', '2026-06-18T10:00:00.000Z', [
          createImage('image-without-location'),
          createImage('image-with-own-location', 22.284, 114.16),
        ], {
          latitude: 22.2819,
          longitude: 114.1587,
          source: 'manual',
        }),
      ],
    }, '30d')
    const imagePoints = createImagePointFeatureCollection(entries)

    expect(imagePoints.features.map((feature) => feature.properties.entryId)).toEqual([
      '2026-06-18:murmur-located:image-with-own-location',
    ])
    expect(imagePoints.features[0].geometry.coordinates).toEqual([114.16, 22.284])
    expect(getPhotoMapEntryCoordinateLabel(
      entries.find((entry) => entry.id.endsWith('image-without-location'))!,
    )).toBe('跟随碎碎念 · 22.2819°N · 114.1587°E')
  })

  it('keeps murmur and image map coordinates independent when they differ', () => {
    const entries = createPhotoMapEntries([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('posted-later', '2026-06-18T22:00:00+08:00', [
          createImage('photo-taken-earlier', 30.6576, 104.0633),
        ], {
          latitude: 30.6532,
          longitude: 104.0818,
          source: 'manual',
        }),
      ],
    }, '30d')

    expect(createMurmurPointFeatureCollection(entries).features[0].geometry.coordinates).toEqual([
      104.0818,
      30.6532,
    ])
    expect(createImagePointFeatureCollection(entries).features[0].geometry.coordinates).toEqual([
      104.0633,
      30.6576,
    ])
  })

  it('creates a chronological route from murmur locations only', () => {
    const entries = createPhotoMapEntries([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('newer', '2026-06-18T12:00:00.000Z', [
          createImage('newer-image', 35, 135),
        ], {
          latitude: 31.2,
          longitude: 121.5,
          source: 'manual',
        }),
        createMurmur('image-only-location', '2026-06-18T11:00:00.000Z', [
          createImage('image-only-location-image', 39.9, 116.4),
        ]),
        createMurmur('older', '2026-06-18T10:00:00.000Z', [
          createImage('older-image'),
        ], {
          latitude: 30.6,
          longitude: 104.1,
          source: 'manual',
        }),
      ],
    }, '30d')
    const route = createMurmurRouteFeatureCollection(entries)

    expect(route.features).toHaveLength(1)
    expect(route.features[0].geometry.coordinates).toEqual([
      [104.1, 30.6],
      [121.5, 31.2],
    ])
  })

  it('does not create a murmur route for fewer than two located murmurs', () => {
    const entries = createPhotoMapEntries([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('one', '2026-06-18T10:00:00.000Z', [
          createImage('one-image', 39.9, 116.4),
        ], {
          latitude: 30.6,
          longitude: 104.1,
          source: 'manual',
        }),
      ],
    }, '30d')

    expect(createMurmurRouteFeatureCollection(entries).features).toEqual([])
  })

  it('keeps each image as a stable independent entry', () => {
    const entries = createPhotoMapEntries([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('gallery', '2026-06-18T09:00:00.000Z', [
          createImage('first-image', 39.9, 116.4),
          createImage('second-image', 31.2, 121.5),
          createImage('unlocated-image'),
        ], {
          latitude: 39.91,
          longitude: 116.41,
          source: 'manual',
        }),
      ],
    }, '30d')

    expect(entries.map((entry) => entry.id)).toEqual([
      '2026-06-18:gallery',
      '2026-06-18:gallery:first-image',
      '2026-06-18:gallery:second-image',
      '2026-06-18:gallery:unlocated-image',
    ])
    expect(createImagePointFeatureCollection(entries).features.map((feature) => feature.properties.imageId)).toEqual([
      'first-image',
      'second-image',
    ])
  })

  it('positions the initial camera on the first valid murmur or its first valid image', () => {
    const oneEntry = createPhotoMapEntries([], {
      date: '2026-06-18',
      murmurs: [createMurmur('one', '2026-06-18T09:00:00.000Z', [
        createImage('one-image'),
      ], {
        latitude: 31.2,
        longitude: 121.5,
        source: 'manual',
      })],
    }, '30d')
    const manyEntries = createPhotoMapEntries([], {
      date: '2026-06-18',
      murmurs: [createMurmur('many', '2026-06-18T09:00:00.000Z', [
        createImage('first-image', 39.9, 116.4),
        createImage('second-image', 31.2, 121.5),
      ])],
    }, '30d')

    expect(getPhotoMapInitialCamera(oneEntry)).toMatchObject({
      center: [121.5, 31.2],
      zoom: 12,
    })
    expect(getPhotoMapInitialCamera(manyEntries)).toMatchObject({
      center: [116.4, 39.9],
      zoom: 12,
    })
  })

  it('ignores dirty or impossible coordinates on points, routes, labels, and initial camera', () => {
    const entries = createPhotoMapEntries([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('dirty-zero', '2026-06-18T12:00:00.000Z', [
          createImage('dirty-image', 0, 0),
        ], {
          latitude: 0,
          longitude: 0,
          source: 'manual',
        }),
        createMurmur('invalid-bounds', '2026-06-18T11:00:00.000Z', [
          createImage('invalid-image', 91, 116.4),
        ]),
        createMurmur('valid', '2026-06-18T10:00:00.000Z', [
          createImage('valid-image', 31.2, 121.5),
        ]),
      ],
    }, '30d')

    expect(createMurmurPointFeatureCollection(entries).features).toEqual([])
    expect(createImagePointFeatureCollection(entries).features.map((feature) => feature.properties.imageId)).toEqual([
      'valid-image',
    ])
    expect(createMurmurRouteFeatureCollection(entries).features).toEqual([])
    expect(getPhotoMapInitialCamera(entries)).toMatchObject({
      center: [121.5, 31.2],
      zoom: 12,
    })
    expect(formatCoordinateLabel({
      latitude: 0,
      longitude: 0,
      source: 'exif',
    })).toBe('未定位')
  })

  it('formats coordinates for map cards', () => {
    expect(formatCoordinateLabel({
      latitude: 31.23456,
      longitude: -121.45678,
      source: 'exif',
    })).toBe('31.2346°N · 121.4568°W')
    expect(formatCoordinateLabel(undefined)).toBe('未定位')
  })
})

function isImageEntry(entry: PhotoMapEntry) {
  return entry.kind === 'image'
}

function createMurmur(
  id: string,
  time: string,
  images: ImageBlock[],
  location?: ImageLocation,
): MurmurBlock {
  const murmur: MurmurBlock = {
    body: `body for ${id}`,
    id,
    images,
    themes: [],
    time,
  }

  if (location) {
    murmur.location = location
  }

  return murmur
}

function createImage(id: string, latitude?: number, longitude?: number): ImageBlock {
  return {
    caption: `caption for ${id}`,
    id,
    location: latitude === undefined || longitude === undefined
      ? undefined
      : {
          latitude,
          longitude,
          source: 'exif',
        },
    src: `media/2026/06/${id}.webp`,
    tags: [],
  }
}
