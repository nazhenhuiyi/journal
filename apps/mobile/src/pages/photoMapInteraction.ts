import type { PhotoMapRange } from './photoMapData'

export type PhotoMapFocusMotion = 'enter' | 'restore'

// Photo map keeps one transient layer active at a time:
// browse -> image/text cluster when opening a group, and cluster -> browse on map blank/range changes.
// Image clusters can restore without replaying the enter animation after full-screen preview closes.
export type PhotoMapInteractionState =
  | {
      kind: 'browse'
    }
  | {
      clusterId: string
      kind: 'imageCluster'
      motion: PhotoMapFocusMotion
      revision: number
    }
  | {
      clusterId: string
      kind: 'textCluster'
      motion: 'enter'
      revision: number
    }

export type PhotoMapSessionSnapshot = {
  interaction: PhotoMapInteractionState
  range: PhotoMapRange
  selectedTextId: string | null
}

export const browsePhotoMapInteraction: PhotoMapInteractionState = { kind: 'browse' }

export function getPhotoMapInteractionFocus(state: PhotoMapInteractionState) {
  return {
    imageActivationKey: state.kind === 'imageCluster' ? `${state.clusterId}:${state.revision}` : '',
    imageClusterId: state.kind === 'imageCluster' ? state.clusterId : null,
    imageMotion: state.kind === 'imageCluster' ? state.motion : 'enter',
    textActivationKey: state.kind === 'textCluster' ? `${state.clusterId}:${state.revision}` : '',
    textClusterId: state.kind === 'textCluster' ? state.clusterId : null,
    textMotion: 'enter' as const,
  }
}

export function clearPhotoMapInteraction(
  state: PhotoMapInteractionState,
): PhotoMapInteractionState {
  return state.kind === 'browse' ? state : browsePhotoMapInteraction
}

export function focusPhotoMapImageCluster(
  state: PhotoMapInteractionState,
  clusterId: string,
  motion: PhotoMapFocusMotion = 'enter',
): PhotoMapInteractionState {
  if (state.kind === 'imageCluster' && state.clusterId === clusterId) {
    return state
  }

  return {
    clusterId,
    kind: 'imageCluster',
    motion,
    revision: getNextPhotoMapInteractionRevision(state),
  }
}

export function focusPhotoMapTextCluster(
  state: PhotoMapInteractionState,
  clusterId: string,
): PhotoMapInteractionState {
  if (state.kind === 'textCluster' && state.clusterId === clusterId) {
    return state
  }

  return {
    clusterId,
    kind: 'textCluster',
    motion: 'enter',
    revision: getNextPhotoMapInteractionRevision(state),
  }
}

export function restorePhotoMapImageCluster(
  state: PhotoMapInteractionState,
  clusterId: string,
): PhotoMapInteractionState {
  return focusPhotoMapImageCluster(state, clusterId, 'restore')
}

export function reconcilePhotoMapInteraction(
  state: PhotoMapInteractionState,
  availableImageClusterIds: ReadonlySet<string>,
  availableTextClusterIds: ReadonlySet<string>,
): PhotoMapInteractionState {
  if (state.kind === 'imageCluster') {
    return availableImageClusterIds.has(state.clusterId)
      ? state
      : browsePhotoMapInteraction
  }

  if (state.kind === 'textCluster') {
    return availableTextClusterIds.has(state.clusterId)
      ? state
      : browsePhotoMapInteraction
  }

  return state
}

function getNextPhotoMapInteractionRevision(state: PhotoMapInteractionState) {
  return state.kind === 'browse' ? 1 : state.revision + 1
}
