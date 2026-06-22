import type {
  CameraRef,
  InitialViewState,
  ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native'
import type { PhotoMapInitialCamera } from './photoMapData'
import type { PhotoMapCameraSnapshot } from './photoMapInteraction'

export function getPhotoMapInitialViewState(
  camera: PhotoMapInitialCamera,
  snapshot: PhotoMapCameraSnapshot | null,
): InitialViewState {
  if (snapshot) {
    return {
      bearing: snapshot.bearing,
      center: snapshot.center,
      pitch: snapshot.pitch,
      zoom: snapshot.zoom,
    }
  }

  if ('center' in camera) {
    return {
      center: camera.center,
      zoom: camera.zoom,
    }
  }

  return {
    bounds: camera.bounds,
    padding: camera.padding,
  }
}

export function createPhotoMapCameraSnapshot(
  viewState: ViewStateChangeEvent,
): PhotoMapCameraSnapshot | null {
  const [longitude, latitude] = viewState.center

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(viewState.zoom) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null
  }

  return {
    bearing: Number.isFinite(viewState.bearing) ? viewState.bearing : 0,
    center: [longitude, latitude],
    pitch: Number.isFinite(viewState.pitch) ? viewState.pitch : 0,
    zoom: viewState.zoom,
  }
}

export function moveCameraToInitialView(
  cameraRef: { current: CameraRef | null },
  camera: PhotoMapInitialCamera,
) {
  if ('center' in camera) {
    cameraRef.current?.easeTo({
      center: camera.center,
      duration: 520,
      zoom: camera.zoom,
    })
    return
  }

  cameraRef.current?.fitBounds(camera.bounds, {
    duration: 520,
    padding: camera.padding,
  })
}
