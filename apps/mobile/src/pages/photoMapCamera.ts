import type { CameraRef } from '@maplibre/maplibre-react-native'
import type { PhotoMapInitialCamera } from './photoMapData'

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
