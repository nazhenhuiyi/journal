import { describe, expect, it } from 'vitest'
import type { ViewStateChangeEvent } from '@maplibre/maplibre-react-native'
import {
  createPhotoMapCameraSnapshot,
  getPhotoMapInitialViewState,
} from './photoMapCamera'

describe('photoMapCamera', () => {
  it('uses the remembered camera snapshot as the initial map view', () => {
    expect(getPhotoMapInitialViewState({
      center: [121.5, 31.2],
      zoom: 12,
    }, {
      bearing: 6,
      center: [104.06331, 30.65761],
      pitch: 18,
      zoom: 13.4,
    })).toEqual({
      bearing: 6,
      center: [104.06331, 30.65761],
      pitch: 18,
      zoom: 13.4,
    })
  })

  it('falls back to the content camera when no snapshot exists', () => {
    expect(getPhotoMapInitialViewState({
      bounds: [104.02, 30.62, 104.08, 30.68],
      padding: {
        bottom: 120,
        left: 24,
        right: 24,
        top: 96,
      },
    }, null)).toEqual({
      bounds: [104.02, 30.62, 104.08, 30.68],
      padding: {
        bottom: 120,
        left: 24,
        right: 24,
        top: 96,
      },
    })
  })

  it('creates a stable snapshot from a valid map view state', () => {
    expect(createPhotoMapCameraSnapshot(createViewState({
      bearing: 8,
      center: [104.06331, 30.65761],
      pitch: 12,
      zoom: 13.4,
    }))).toEqual({
      bearing: 8,
      center: [104.06331, 30.65761],
      pitch: 12,
      zoom: 13.4,
    })
  })

  it('ignores impossible map camera positions', () => {
    expect(createPhotoMapCameraSnapshot(createViewState({
      center: [200, 30.65761],
    }))).toBeNull()
    expect(createPhotoMapCameraSnapshot(createViewState({
      center: [104.06331, Number.NaN],
    }))).toBeNull()
  })
})

function createViewState(
  overrides: Partial<ViewStateChangeEvent>,
): ViewStateChangeEvent {
  return {
    animated: false,
    bearing: 0,
    bounds: [104.02, 30.62, 104.08, 30.68],
    center: [104.06331, 30.65761],
    pitch: 0,
    userInteraction: false,
    zoom: 12,
    ...overrides,
  }
}
