import { describe, expect, it } from 'vitest'
import {
  browsePhotoMapInteraction,
  clearPhotoMapInteraction,
  focusPhotoMapImageCluster,
  focusPhotoMapTextCluster,
  getPhotoMapInteractionFocus,
  reconcilePhotoMapInteraction,
  restorePhotoMapImageCluster,
} from './photoMapInteraction'

describe('photoMapInteraction', () => {
  it('starts in browse mode and opens an image cluster with enter motion', () => {
    const state = focusPhotoMapImageCluster(browsePhotoMapInteraction, 'image-a')

    expect(state).toEqual({
      clusterId: 'image-a',
      kind: 'imageCluster',
      motion: 'enter',
      revision: 1,
    })
  })

  it('does not replay the same image cluster interaction', () => {
    const state = focusPhotoMapImageCluster(browsePhotoMapInteraction, 'image-a')

    expect(focusPhotoMapImageCluster(state, 'image-a')).toBe(state)
    expect(restorePhotoMapImageCluster(state, 'image-a')).toBe(state)
  })

  it('restores an image cluster without enter motion when preview returns to a lost map state', () => {
    const state = restorePhotoMapImageCluster(browsePhotoMapInteraction, 'image-a')

    expect(state).toEqual({
      clusterId: 'image-a',
      kind: 'imageCluster',
      motion: 'restore',
      revision: 1,
    })
  })

  it('increments revisions when switching between cluster focuses', () => {
    const imageState = focusPhotoMapImageCluster(browsePhotoMapInteraction, 'image-a')
    const textState = focusPhotoMapTextCluster(imageState, 'text-a')
    const nextImageState = focusPhotoMapImageCluster(textState, 'image-b')

    expect(textState).toEqual({
      clusterId: 'text-a',
      kind: 'textCluster',
      motion: 'enter',
      revision: 2,
    })
    expect(nextImageState).toEqual({
      clusterId: 'image-b',
      kind: 'imageCluster',
      motion: 'enter',
      revision: 3,
    })
  })

  it('clears transient cluster focus without inventing another mode', () => {
    const state = focusPhotoMapTextCluster(browsePhotoMapInteraction, 'text-a')

    expect(clearPhotoMapInteraction(state)).toBe(browsePhotoMapInteraction)
    expect(clearPhotoMapInteraction(browsePhotoMapInteraction)).toBe(browsePhotoMapInteraction)
  })

  it('keeps only cluster focuses that still exist after data changes', () => {
    const imageState = focusPhotoMapImageCluster(browsePhotoMapInteraction, 'image-a')
    const textState = focusPhotoMapTextCluster(browsePhotoMapInteraction, 'text-a')

    expect(reconcilePhotoMapInteraction(
      imageState,
      new Set(['image-a']),
      new Set(),
    )).toBe(imageState)
    expect(reconcilePhotoMapInteraction(
      imageState,
      new Set(['image-b']),
      new Set(),
    )).toBe(browsePhotoMapInteraction)
    expect(reconcilePhotoMapInteraction(
      textState,
      new Set(),
      new Set(['text-a']),
    )).toBe(textState)
    expect(reconcilePhotoMapInteraction(
      textState,
      new Set(),
      new Set(['text-b']),
    )).toBe(browsePhotoMapInteraction)
  })

  it('derives render focus from interaction state', () => {
    const imageState = focusPhotoMapImageCluster(browsePhotoMapInteraction, 'image-a')
    const textState = focusPhotoMapTextCluster(imageState, 'text-a')

    expect(getPhotoMapInteractionFocus(imageState)).toEqual({
      imageActivationKey: 'image-a:1',
      imageClusterId: 'image-a',
      imageMotion: 'enter',
      textActivationKey: '',
      textClusterId: null,
      textMotion: 'enter',
    })
    expect(getPhotoMapInteractionFocus(textState)).toEqual({
      imageActivationKey: '',
      imageClusterId: null,
      imageMotion: 'enter',
      textActivationKey: 'text-a:2',
      textClusterId: 'text-a',
      textMotion: 'enter',
    })
  })
})
