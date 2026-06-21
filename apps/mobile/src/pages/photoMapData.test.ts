import { describe, expect, it } from 'vitest'
import type { ImageBlock, ImageLocation, MurmurBlock } from '@journal/core'
import {
  createMurmurRouteFeatureCollection,
  createPhotoMapImageClusters,
  createPhotoMapImageObservations,
  createPhotoMapMurmurSlices,
  createPhotoMapTextClusters,
  createPhotoMapTextObservations,
  defaultPhotoMapNearbyGroupRadiusMeters,
  defaultPhotoMapRange,
  filterPhotoMapMurmurSlicesByRange,
  getPhotoMapInitialCamera,
} from './photoMapData'

describe('photoMapData', () => {
  it('defaults the photo map to the latest week', () => {
    expect(defaultPhotoMapRange).toBe('7d')

    const murmurSlices = createPhotoMapMurmurSlices([
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

    expect(murmurSlices.map((murmurSlice) => murmurSlice.murmurId)).toEqual([
      'today',
    ])
  })

  it('uses the in-memory current day instead of the stored record for today', () => {
    const murmurSlices = createPhotoMapMurmurSlices([
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

    expect(createPhotoMapImageObservations(murmurSlices).map((observation) => observation.image.id)).toEqual([
      'current-image',
      'older-image',
    ])
  })

  it('filters murmur slices by journal date range and keeps images with their murmur', () => {
    const allMurmurSlices = createPhotoMapMurmurSlices([
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

    expect(filterPhotoMapMurmurSlicesByRange(allMurmurSlices, '7d', '2026-06-18').map((murmurSlice) => murmurSlice.murmurId)).toEqual([
      'today',
      'six-days-ago',
    ])
    expect(filterPhotoMapMurmurSlicesByRange(allMurmurSlices, '14d', '2026-06-18').map((murmurSlice) => murmurSlice.murmurId)).toContain('eleven-days-ago')
    expect(filterPhotoMapMurmurSlicesByRange(allMurmurSlices, '30d', '2026-06-18').map((murmurSlice) => murmurSlice.murmurId)).not.toContain('old')
    expect(filterPhotoMapMurmurSlicesByRange(allMurmurSlices, 'all', '2026-06-18').map((murmurSlice) => murmurSlice.murmurId)).toContain('old')
  })

  it('does not drop range-boundary murmur slices because of timezone offsets in murmur time', () => {
    const allMurmurSlices = createPhotoMapMurmurSlices([
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

    expect(filterPhotoMapMurmurSlicesByRange(allMurmurSlices, '7d', '2026-06-18').map((murmurSlice) => murmurSlice.murmurId)).toEqual([
      'tokyo-boundary',
    ])
  })

  it('creates text observations only from murmur locations', () => {
    const murmurSlices = createPhotoMapMurmurSlices([], {
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
    const textObservations = createPhotoMapTextObservations(murmurSlices)

    expect(textObservations.map((observation) => observation.id)).toEqual([
      '2026-06-18:murmur-located',
    ])
    expect(textObservations[0].coordinates).toEqual([114.1587, 22.2819])
  })

  it('keeps image observation coordinates independent from murmur coordinates', () => {
    const murmurSlices = createPhotoMapMurmurSlices([], {
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
    const imageObservations = createPhotoMapImageObservations(murmurSlices)

    expect(imageObservations.map((observation) => ({
      coordinateSource: observation.coordinateSource,
      coordinates: observation.coordinates,
      id: observation.id,
    }))).toEqual([
      {
        coordinateSource: 'murmur',
        coordinates: [114.1587, 22.2819],
        id: '2026-06-18:murmur-located:image-without-location',
      },
      {
        coordinateSource: 'image',
        coordinates: [114.16, 22.284],
        id: '2026-06-18:murmur-located:image-with-own-location',
      },
    ])
  })

  it('keeps route and image observations independent when their coordinates differ', () => {
    const murmurSlices = createPhotoMapMurmurSlices([], {
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

    expect(createMurmurRouteFeatureCollection(murmurSlices).features).toEqual([])
    expect(createPhotoMapTextObservations(murmurSlices)[0].coordinates).toEqual([
      104.0818,
      30.6532,
    ])
    expect(createPhotoMapImageObservations(murmurSlices)[0].coordinates).toEqual([
      104.0633,
      30.6576,
    ])
  })

  it('creates a chronological route from murmur locations only', () => {
    const murmurSlices = createPhotoMapMurmurSlices([], {
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
    const route = createMurmurRouteFeatureCollection(murmurSlices)

    expect(route.features).toHaveLength(1)
    expect(route.features[0].geometry.coordinates).toEqual([
      [104.1, 30.6],
      [121.5, 31.2],
    ])
  })

  it('does not create a murmur route for fewer than two located murmurs', () => {
    const murmurSlices = createPhotoMapMurmurSlices([], {
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

    expect(createMurmurRouteFeatureCollection(murmurSlices).features).toEqual([])
  })

  it('keeps each image as a stable independent observation', () => {
    const murmurSlices = createPhotoMapMurmurSlices([], {
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

    expect(murmurSlices.map((murmurSlice) => murmurSlice.id)).toEqual([
      '2026-06-18:gallery',
    ])
    expect(createPhotoMapImageObservations(murmurSlices).map((observation) => ({
      id: observation.id,
      imageId: observation.image.id,
    }))).toEqual([
      {
        id: '2026-06-18:gallery:first-image',
        imageId: 'first-image',
      },
      {
        id: '2026-06-18:gallery:second-image',
        imageId: 'second-image',
      },
      {
        id: '2026-06-18:gallery:unlocated-image',
        imageId: 'unlocated-image',
      },
    ])
  })

  it('creates one image observation per image and falls back to murmur coordinates when needed', () => {
    const murmurSlices = createPhotoMapMurmurSlices([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('gallery', '2026-06-18T12:00:00.000Z', [
          createImage('own-location', 30.65761, 104.06331),
          createImage('murmur-location'),
          createImage('dirty-location', 0, 0),
        ], {
          latitude: 30.658,
          longitude: 104.064,
          source: 'manual',
        }),
        createMurmur('unlocated', '2026-06-18T11:00:00.000Z', [
          createImage('no-location'),
        ]),
      ],
    }, '30d')

    const observations = createPhotoMapImageObservations(murmurSlices)

    expect(observations.map((observation) => ({
      coordinateSource: observation.coordinateSource,
      coordinates: observation.coordinates,
      imageId: observation.image.id,
    }))).toEqual([
      {
        coordinateSource: 'image',
        coordinates: [104.06331, 30.65761],
        imageId: 'own-location',
      },
      {
        coordinateSource: 'murmur',
        coordinates: [104.064, 30.658],
        imageId: 'murmur-location',
      },
      {
        coordinateSource: 'murmur',
        coordinates: [104.064, 30.658],
        imageId: 'dirty-location',
      },
    ])
  })

  it('preserves same-murmur image order in observations and clusters', () => {
    const murmurSlices = createPhotoMapMurmurSlices([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('ordered-gallery', '2026-06-18T12:00:00.000Z', [
          createImage('z-first-in-blocks', 30.65761, 104.06331),
          createImage('a-second-in-blocks', 30.65762, 104.06332),
          createImage('m-third-in-blocks', 30.65763, 104.06333),
        ]),
      ],
    }, '30d')

    const observations = createPhotoMapImageObservations(murmurSlices)
    const clusters = createPhotoMapImageClusters(observations)

    expect(observations.map((observation) => observation.image.id)).toEqual([
      'z-first-in-blocks',
      'a-second-in-blocks',
      'm-third-in-blocks',
    ])
    expect(clusters).toHaveLength(1)
    expect(clusters[0].items.map((item) => item.image.id)).toEqual([
      'z-first-in-blocks',
      'a-second-in-blocks',
      'm-third-in-blocks',
    ])
    expect(clusters[0].representativeItem.image.id).toBe('z-first-in-blocks')
  })

  it('creates text observations only for located murmurs with body text', () => {
    const murmurSlices = createPhotoMapMurmurSlices([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('with-text', '2026-06-18T12:00:00.000Z', [], {
          latitude: 30.65761,
          longitude: 104.06331,
          source: 'manual',
        }, '在这里记了一句话'),
        createMurmur('image-only', '2026-06-18T11:00:00.000Z', [
          createImage('image-only-photo', 30.6578, 104.0635),
        ], {
          latitude: 30.6578,
          longitude: 104.0635,
          source: 'manual',
        }, '   '),
        createMurmur('unlocated-text', '2026-06-18T10:00:00.000Z', [], undefined, '没有定位的文字'),
      ],
    }, '30d')

    expect(createPhotoMapTextObservations(murmurSlices).map((observation) => ({
      body: observation.body,
      coordinates: observation.coordinates,
      murmurId: observation.murmurId,
    }))).toEqual([
      {
        body: '在这里记了一句话',
        coordinates: [104.06331, 30.65761],
        murmurId: 'with-text',
      },
    ])
  })

  it('groups nearby image observations without merging distant places', () => {
    const murmurSlices = createPhotoMapMurmurSlices([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('newer-nearby', '2026-06-18T12:00:00.000Z', [
          createImage('newer-nearby-image', 30.65761, 104.06331),
          createImage('newer-extra-image', 30.65762, 104.06332),
        ]),
        createMurmur('older-nearby', '2026-06-18T11:00:00.000Z', [
          createImage('older-nearby-image', 30.6578, 104.0635),
        ]),
        createMurmur('distant', '2026-06-18T10:00:00.000Z', [
          createImage('distant-image', 30.665, 104.072),
        ]),
      ],
    }, '30d')

    const groups = createPhotoMapImageClusters(createPhotoMapImageObservations(murmurSlices), 80)

    expect(groups).toHaveLength(2)
    expect(groups[0].items.map((item) => item.image.id)).toEqual([
      'newer-nearby-image',
      'newer-extra-image',
      'older-nearby-image',
    ])
    expect(groups[0].items.map((item) => item.murmurId)).toEqual([
      'newer-nearby',
      'newer-nearby',
      'older-nearby',
    ])
    expect(groups[0].representativeItem.image.id).toBe('newer-nearby-image')
    expect(groups[0].coordinates[0]).toBeCloseTo((104.06331 + 104.06332 + 104.0635) / 3)
    expect(groups[0].coordinates[1]).toBeCloseTo((30.65761 + 30.65762 + 30.6578) / 3)
    expect(groups[1].items.map((item) => item.murmurId)).toEqual(['distant'])
  })

  it('groups chain-adjacent image and text observations by item distance', () => {
    const baseLatitude = 30.65761
    const longitude = 104.06331
    const latitudeStepWithin150Meters = 149 / 111320
    const murmurSlices = createPhotoMapMurmurSlices([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('chain-a', '2026-06-18T12:00:00.000Z', [
          createImage('chain-a-image', baseLatitude, longitude),
        ], {
          latitude: baseLatitude,
          longitude,
          source: 'manual',
        }),
        createMurmur('chain-b', '2026-06-18T11:00:00.000Z', [
          createImage('chain-b-image', baseLatitude + latitudeStepWithin150Meters, longitude),
        ], {
          latitude: baseLatitude + latitudeStepWithin150Meters,
          longitude,
          source: 'manual',
        }),
        createMurmur('chain-c', '2026-06-18T10:00:00.000Z', [
          createImage('chain-c-image', baseLatitude + latitudeStepWithin150Meters * 2, longitude),
        ], {
          latitude: baseLatitude + latitudeStepWithin150Meters * 2,
          longitude,
          source: 'manual',
        }),
      ],
    }, '30d')

    const imageGroups = createPhotoMapImageClusters(createPhotoMapImageObservations(murmurSlices))
    const textGroups = createPhotoMapTextClusters(createPhotoMapTextObservations(murmurSlices))

    expect(imageGroups).toHaveLength(1)
    expect(imageGroups[0].items.map((item) => item.image.id)).toEqual([
      'chain-a-image',
      'chain-b-image',
      'chain-c-image',
    ])
    expect(textGroups).toHaveLength(1)
    expect(textGroups[0].items.map((item) => item.murmurId)).toEqual([
      'chain-a',
      'chain-b',
      'chain-c',
    ])
  })

  it('merges existing clusters when a later observation bridges them', () => {
    const baseLatitude = 30.65761
    const longitude = 104.06331
    const latitudeStepWithin150Meters = 149 / 111320
    const murmurSlices = createPhotoMapMurmurSlices([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('bridge-south', '2026-06-18T12:00:00.000Z', [
          createImage('bridge-south-image', baseLatitude, longitude),
        ]),
        createMurmur('bridge-north', '2026-06-18T11:00:00.000Z', [
          createImage('bridge-north-image', baseLatitude + latitudeStepWithin150Meters * 2, longitude),
        ]),
        createMurmur('bridge-middle', '2026-06-18T10:00:00.000Z', [
          createImage('bridge-middle-image', baseLatitude + latitudeStepWithin150Meters, longitude),
        ]),
      ],
    }, '30d')

    const imageGroups = createPhotoMapImageClusters(createPhotoMapImageObservations(murmurSlices))

    expect(imageGroups).toHaveLength(1)
    expect(imageGroups[0].items.map((item) => item.image.id)).toEqual([
      'bridge-south-image',
      'bridge-north-image',
      'bridge-middle-image',
    ])
  })

  it('uses a 150m default cluster radius instead of merging 220m-nearby places', () => {
    const murmurSlices = createPhotoMapMurmurSlices([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('north', '2026-06-18T12:00:00.000Z', [
          createImage('north-image', 30.65916, 104.06331),
        ], {
          latitude: 30.65916,
          longitude: 104.06331,
          source: 'manual',
        }),
        createMurmur('south', '2026-06-18T11:00:00.000Z', [
          createImage('south-image', 30.65761, 104.06331),
        ], {
          latitude: 30.65761,
          longitude: 104.06331,
          source: 'manual',
        }),
      ],
    }, '30d')

    expect(defaultPhotoMapNearbyGroupRadiusMeters).toBe(150)
    expect(createPhotoMapImageClusters(createPhotoMapImageObservations(murmurSlices)).map((group) => (
      group.items.map((item) => item.image.id)
    ))).toEqual([
      ['north-image'],
      ['south-image'],
    ])
    expect(createPhotoMapTextClusters(createPhotoMapTextObservations(murmurSlices)).map((group) => (
      group.items.map((item) => item.murmurId)
    ))).toEqual([
      ['north'],
      ['south'],
    ])
  })

  it('groups nearby text observations with the same radius rule as images', () => {
    const murmurSlices = createPhotoMapMurmurSlices([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('newer-nearby-text', '2026-06-18T12:00:00.000Z', [], {
          latitude: 30.65761,
          longitude: 104.06331,
          source: 'manual',
        }),
        createMurmur('older-nearby-text', '2026-06-18T11:00:00.000Z', [], {
          latitude: 30.6578,
          longitude: 104.0635,
          source: 'manual',
        }),
        createMurmur('distant-text', '2026-06-18T10:00:00.000Z', [], {
          latitude: 30.665,
          longitude: 104.072,
          source: 'manual',
        }),
      ],
    }, '30d')

    expect(createPhotoMapTextClusters(createPhotoMapTextObservations(murmurSlices), 80).map((group) => (
      group.items.map((item) => item.murmurId)
    ))).toEqual([
      ['newer-nearby-text', 'older-nearby-text'],
      ['distant-text'],
    ])
  })

  it('keeps image cluster ids separate from text cluster ids at the same coordinates', () => {
    const murmurSlices = createPhotoMapMurmurSlices([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('same-place', '2026-06-18T12:00:00.000Z', [
          createImage('same-place-image', 30.65761, 104.06331),
        ], {
          latitude: 30.65761,
          longitude: 104.06331,
          source: 'manual',
        }, '同一个地点既有文字也有图片'),
      ],
    }, '30d')

    const imageCluster = createPhotoMapImageClusters(createPhotoMapImageObservations(murmurSlices))[0]
    const textCluster = createPhotoMapTextClusters(createPhotoMapTextObservations(murmurSlices))[0]

    expect(imageCluster.id).toBe('image-cluster:2026-06-18:same-place:same-place-image')
    expect(textCluster.id).toBe('text-cluster:2026-06-18:same-place')
    expect(imageCluster.coordinates).toEqual(textCluster.coordinates)
  })

  it('keeps image and text observations scoped to the selected date range', () => {
    const murmurSlices = createPhotoMapMurmurSlices([
      {
        date: '2026-06-08',
        murmurs: [createMurmur('outside-range', '2026-06-08T12:00:00.000Z', [
          createImage('outside-range-image', 30.65761, 104.06331),
        ], {
          latitude: 30.65761,
          longitude: 104.06331,
          source: 'manual',
        })],
      },
    ], {
      date: '2026-06-18',
      murmurs: [createMurmur('inside-range', '2026-06-18T12:00:00.000Z', [
        createImage('inside-range-image', 30.6578, 104.0635),
      ], {
        latitude: 30.6578,
        longitude: 104.0635,
        source: 'manual',
      })],
    }, '7d')

    expect(createPhotoMapImageObservations(murmurSlices).map((observation) => observation.image.id)).toEqual([
      'inside-range-image',
    ])
    expect(createPhotoMapTextObservations(murmurSlices).map((observation) => observation.murmurId)).toEqual([
      'inside-range',
    ])
  })

  it('does not leak stored current-day observations when current day memory replaces them', () => {
    const murmurSlices = createPhotoMapMurmurSlices([
      {
        date: '2026-06-18',
        murmurs: [
          createMurmur('stored-current-day', '2026-06-18T09:00:00.000Z', [
            createImage('stored-current-day-image', 39.9, 116.4),
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
          createMurmur('previous-day', '2026-06-17T09:00:00.000Z', [
            createImage('previous-day-image', 30.65761, 104.06331),
          ], {
            latitude: 30.65761,
            longitude: 104.06331,
            source: 'manual',
          }),
        ],
      },
    ], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('memory-current-day', '2026-06-18T10:00:00.000Z', [
          createImage('memory-current-day-image', 31.2, 121.5),
        ], {
          latitude: 31.2,
          longitude: 121.5,
          source: 'manual',
        }),
      ],
    }, '30d')

    expect(createPhotoMapImageObservations(murmurSlices).map((observation) => observation.image.id)).toEqual([
      'memory-current-day-image',
      'previous-day-image',
    ])
    expect(createPhotoMapTextObservations(murmurSlices).map((observation) => observation.murmurId)).toEqual([
      'memory-current-day',
      'previous-day',
    ])
  })

  it('does not create image or text observations for impossible coordinates', () => {
    const murmurSlices = createPhotoMapMurmurSlices([], {
      date: '2026-06-18',
      murmurs: [
        createMurmur('dirty-zero', '2026-06-18T12:00:00.000Z', [
          createImage('dirty-image', 0, 0),
        ], {
          latitude: 0,
          longitude: 0,
          source: 'manual',
        }),
        createMurmur('valid', '2026-06-18T10:00:00.000Z', [
          createImage('valid-image', 30.65761, 104.06331),
        ], {
          latitude: 30.65761,
          longitude: 104.06331,
          source: 'manual',
        }),
      ],
    }, '30d')

    expect(createPhotoMapImageClusters(createPhotoMapImageObservations(murmurSlices)).map((group) => (
      group.items.map((item) => item.image.id)
    ))).toEqual([['valid-image']])
    expect(createPhotoMapTextClusters(createPhotoMapTextObservations(murmurSlices)).map((group) => (
      group.items.map((item) => item.murmurId)
    ))).toEqual([['valid']])
  })

  it('positions the initial camera on the first valid murmur or its first valid image', () => {
    const oneMurmurSliceSet = createPhotoMapMurmurSlices([], {
      date: '2026-06-18',
      murmurs: [createMurmur('one', '2026-06-18T09:00:00.000Z', [
        createImage('one-image'),
      ], {
        latitude: 31.2,
        longitude: 121.5,
        source: 'manual',
      })],
    }, '30d')
    const manyMurmurSlices = createPhotoMapMurmurSlices([], {
      date: '2026-06-18',
      murmurs: [createMurmur('many', '2026-06-18T09:00:00.000Z', [
        createImage('first-image', 39.9, 116.4),
        createImage('second-image', 31.2, 121.5),
      ])],
    }, '30d')

    expect(getPhotoMapInitialCamera(oneMurmurSliceSet)).toMatchObject({
      center: [121.5, 31.2],
      zoom: 12,
    })
    expect(getPhotoMapInitialCamera(manyMurmurSlices)).toMatchObject({
      center: [116.4, 39.9],
      zoom: 12,
    })
  })

  it('ignores dirty or impossible coordinates in observations, routes, and initial camera', () => {
    const murmurSlices = createPhotoMapMurmurSlices([], {
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

    expect(createPhotoMapTextObservations(murmurSlices)).toEqual([])
    expect(createPhotoMapImageObservations(murmurSlices).map((observation) => observation.image.id)).toEqual([
      'valid-image',
    ])
    expect(createMurmurRouteFeatureCollection(murmurSlices).features).toEqual([])
    expect(getPhotoMapInitialCamera(murmurSlices)).toMatchObject({
      center: [121.5, 31.2],
      zoom: 12,
    })
  })
})

function createMurmur(
  id: string,
  time: string,
  images: ImageBlock[],
  location?: ImageLocation,
  body = `body for ${id}`,
): MurmurBlock {
  const murmur: MurmurBlock = {
    body,
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
