import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import {
  FlatList,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import type { CameraRef } from '@maplibre/maplibre-react-native'
import type { ImageBlock } from '@journal/core'
import { spacingPixels } from '@journal/theme'
import {
  type PhotoMapImageCluster,
  type PhotoMapImageObservation,
  type PhotoMapRange,
  type PhotoMapTextCluster,
  type PhotoMapTextObservation,
} from './photoMapData'
import {
  clearPhotoMapInteraction,
  focusPhotoMapImageCluster,
  focusPhotoMapTextCluster,
  restorePhotoMapImageCluster,
  type PhotoMapInteractionState,
} from './photoMapInteraction'
import { getPhotoMapClusterBounds } from './photoMapViewModel'
import {
  clampIndex,
  overlayMapPressGuardMs,
  pendingMapPressClearDelayMs,
  textCardHeight,
} from './photoMapPresentation'

export function usePhotoMapInteractions({
  cameraRef,
  imageObservations,
  interaction,
  onOpenDay,
  onPreviewImage,
  onPreviewImageGallery,
  setInteraction,
  setIsRangeMenuOpen,
  setRange,
  setSelectedTextId,
  textCarouselItemWidth,
  textCarouselListRef,
  textClusterByObservationId,
  textObservations,
}: {
  cameraRef: RefObject<CameraRef | null>
  imageObservations: readonly PhotoMapImageObservation[]
  interaction: PhotoMapInteractionState
  onOpenDay: (date: string) => void
  onPreviewImage: (image: ImageBlock) => void
  onPreviewImageGallery: (
    images: readonly ImageBlock[],
    initialIndex?: number,
    options?: {
      onBeforeClose?: () => void
    },
  ) => void
  setInteraction: Dispatch<SetStateAction<PhotoMapInteractionState>>
  setIsRangeMenuOpen: Dispatch<SetStateAction<boolean>>
  setRange: Dispatch<SetStateAction<PhotoMapRange>>
  setSelectedTextId: Dispatch<SetStateAction<string | null>>
  textCarouselItemWidth: number
  textCarouselListRef: RefObject<FlatList<PhotoMapTextObservation> | null>
  textClusterByObservationId: ReadonlyMap<string, PhotoMapTextCluster>
  textObservations: readonly PhotoMapTextObservation[]
}) {
  const interactionRef = useRef<PhotoMapInteractionState>(interaction)
  const ignoreOverlayMapPressUntilRef = useRef(0)
  const pendingMapPressClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTextCarouselDraggingRef = useRef(false)
  const textCardPressBlockUntilRef = useRef(0)
  const textCarouselDragResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    interactionRef.current = interaction
  }, [interaction])

  useEffect(() => () => {
    cancelPendingMapPressClear()
    cancelTextCarouselDragReset()
  }, [])

  function selectTextObservation(observation: PhotoMapTextObservation) {
    setIsRangeMenuOpen(false)
    setSelectedTextId(observation.id)
    setInteraction(clearPhotoMapInteraction)
    scrollToTextCard(observation)

    moveCameraToCoordinates(observation.coordinates, 12.2)
  }

  function selectTextObservationInsideCluster(
    cluster: PhotoMapTextCluster,
    observation: PhotoMapTextObservation,
  ) {
    guardOverlayMapPress()
    setIsRangeMenuOpen(false)
    setSelectedTextId(observation.id)
    setInteraction((previousInteraction) => focusPhotoMapTextCluster(previousInteraction, cluster.id))
    scrollToTextCard(observation)
  }

  function selectPagerObservation(observation: PhotoMapTextObservation) {
    setIsRangeMenuOpen(false)
    setSelectedTextId(observation.id)
    setInteraction((previousInteraction) => {
      if (previousInteraction.kind === 'textCluster') {
        const observationCluster = textClusterByObservationId.get(observation.id)

        if (observationCluster?.id === previousInteraction.clusterId) {
          return previousInteraction
        }
      }

      return clearPhotoMapInteraction(previousInteraction)
    })
    moveCameraToCoordinates(observation.coordinates, 12.2)
  }

  function moveCameraToCoordinates(
    coordinates: [longitude: number, latitude: number],
    zoom: number,
  ) {
    cameraRef.current?.easeTo({
      center: coordinates,
      duration: 420,
      zoom,
    })
  }

  function selectImageCluster(cluster: PhotoMapImageCluster) {
    setIsRangeMenuOpen(false)

    if (cluster.items.length <= 1) {
      const item = cluster.items[0]

      setInteraction(clearPhotoMapInteraction)

      if (item) {
        onPreviewImage(item.image)
      }
      return
    }

    setInteraction((previousInteraction) => focusPhotoMapImageCluster(previousInteraction, cluster.id))
    moveCameraToCluster(cluster)
  }

  function selectTextCluster(cluster: PhotoMapTextCluster) {
    setIsRangeMenuOpen(false)

    if (cluster.items.length <= 1) {
      const item = cluster.items[0]

      if (item) {
        selectTextObservation(item)
      }
      return
    }

    setInteraction((previousInteraction) => focusPhotoMapTextCluster(previousInteraction, cluster.id))
    moveCameraToCluster(cluster)
  }

  function selectImageClusterFromMarker(cluster: PhotoMapImageCluster) {
    guardOverlayMapPress()
    selectImageCluster(cluster)
  }

  function selectTextClusterFromMarker(cluster: PhotoMapTextCluster) {
    guardOverlayMapPress()
    selectTextCluster(cluster)
  }

  function selectTextClusterFromCard(
    cluster: PhotoMapTextCluster,
    observation: PhotoMapTextObservation,
  ) {
    guardOverlayMapPress()
    setIsRangeMenuOpen(false)
    setSelectedTextId(observation.id)
    setInteraction((previousInteraction) => focusPhotoMapTextCluster(previousInteraction, cluster.id))
    moveCameraToCluster(cluster)
  }

  function previewImageGalleryFromImageGroup(
    cluster: PhotoMapImageCluster,
    images: readonly ImageBlock[],
    initialIndex?: number,
  ) {
    onPreviewImageGallery(images, initialIndex, {
      onBeforeClose: () => restoreImageClusterView(cluster),
    })
  }

  function previewImageGalleryFromImageGroupOverlay(
    cluster: PhotoMapImageCluster,
    images: readonly ImageBlock[],
    initialIndex?: number,
  ) {
    guardOverlayMapPress()
    previewImageGalleryFromImageGroup(cluster, images, initialIndex)
  }

  function restoreImageClusterView(cluster: PhotoMapImageCluster) {
    const currentInteraction = interactionRef.current
    const shouldRestoreCamera = currentInteraction.kind !== 'imageCluster' ||
      currentInteraction.clusterId !== cluster.id

    setInteraction((previousInteraction) => restorePhotoMapImageCluster(previousInteraction, cluster.id))

    if (shouldRestoreCamera) {
      moveCameraToCluster(cluster, { transition: 'instant' })
    }
  }

  function previewImageFromTextCard(image: ImageBlock) {
    setInteraction(clearPhotoMapInteraction)
    onPreviewImage(image)
  }

  function previewImageGalleryFromTextCard(images: readonly ImageBlock[], initialIndex?: number) {
    setInteraction(clearPhotoMapInteraction)
    onPreviewImageGallery(images, initialIndex)
  }

  function moveCameraToCluster(
    cluster: PhotoMapImageCluster | PhotoMapTextCluster,
    options: { transition?: 'animated' | 'instant' } = {},
  ) {
    const duration = options.transition === 'instant' ? 0 : 460

    if (cluster.items.length <= 1) {
      cameraRef.current?.easeTo({
        center: cluster.coordinates,
        duration,
        zoom: 13.6,
      })
      return
    }

    cameraRef.current?.fitBounds(getPhotoMapClusterBounds(cluster), {
      duration,
      padding: {
        bottom: textCardHeight + 140,
        left: spacingPixels['8'],
        right: spacingPixels['8'],
        top: 132,
      },
    })
  }

  function scrollToTextCard(observation: PhotoMapTextObservation) {
    const textObservationIndex = textObservations.findIndex((candidate) => candidate.id === observation.id)

    if (textObservationIndex < 0) {
      return
    }

    textCarouselListRef.current?.scrollToOffset({
      animated: true,
      offset: textObservationIndex * textCarouselItemWidth,
    })
  }

  function handleTextCarouselSnapToItem(index: number) {
    const observation = textObservations[index]

    if (observation) {
      selectPagerObservation(observation)
    }
  }

  function handleTextCarouselMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    releaseTextCarouselDragGuard(240)

    const nextIndex = clampIndex(
      Math.round(event.nativeEvent.contentOffset.x / textCarouselItemWidth),
      textObservations.length,
    )

    handleTextCarouselSnapToItem(nextIndex)
  }

  function handleTextCarouselScrollBeginDrag() {
    beginTextCarouselDragGuard()
  }

  function handleTextCarouselScrollEndDrag() {
    releaseTextCarouselDragGuard(520)
  }

  function handleMapPress() {
    if (Date.now() < ignoreOverlayMapPressUntilRef.current) {
      return
    }

    cancelPendingMapPressClear()
    pendingMapPressClearRef.current = setTimeout(() => {
      pendingMapPressClearRef.current = null
      setIsRangeMenuOpen(false)
      setInteraction(clearPhotoMapInteraction)
    }, pendingMapPressClearDelayMs)
  }

  function guardOverlayMapPress() {
    cancelPendingMapPressClear()
    ignoreOverlayMapPressUntilRef.current = Date.now() + overlayMapPressGuardMs
  }

  function cancelPendingMapPressClear() {
    if (!pendingMapPressClearRef.current) {
      return
    }

    clearTimeout(pendingMapPressClearRef.current)
    pendingMapPressClearRef.current = null
  }

  function beginTextCarouselDragGuard() {
    isTextCarouselDraggingRef.current = true
    textCardPressBlockUntilRef.current = Date.now() + 1200
    cancelTextCarouselDragReset()
  }

  function releaseTextCarouselDragGuard(delay: number) {
    textCardPressBlockUntilRef.current = Date.now() + delay
    cancelTextCarouselDragReset()
    textCarouselDragResetRef.current = setTimeout(() => {
      isTextCarouselDraggingRef.current = false
      textCarouselDragResetRef.current = null
    }, delay)
  }

  function cancelTextCarouselDragReset() {
    if (!textCarouselDragResetRef.current) {
      return
    }

    clearTimeout(textCarouselDragResetRef.current)
    textCarouselDragResetRef.current = null
  }

  function openDayFromTextCard(date: string) {
    if (isTextCarouselDraggingRef.current || Date.now() < textCardPressBlockUntilRef.current) {
      return
    }

    onOpenDay(date)
  }

  function openDayFromTextClusterSheet(event: GestureResponderEvent, date: string) {
    event.stopPropagation()
    guardOverlayMapPress()
    onOpenDay(date)
  }

  function handleRangeChange(nextRange: PhotoMapRange) {
    setRange(nextRange)
    setIsRangeMenuOpen(false)
    setInteraction(clearPhotoMapInteraction)
  }

  function recenterToInitialMapContent() {
    const firstTextObservation = textObservations[0] ?? null

    if (firstTextObservation) {
      selectTextObservation(firstTextObservation)
      return
    }

    const firstImageObservation = imageObservations[0] ?? null

    if (!firstImageObservation) {
      return
    }

    setIsRangeMenuOpen(false)
    setInteraction(clearPhotoMapInteraction)
    moveCameraToCoordinates(firstImageObservation.coordinates, 13)
  }

  return {
    guardOverlayMapPress,
    handleMapPress,
    handleRangeChange,
    handleTextCarouselMomentumEnd,
    handleTextCarouselScrollBeginDrag,
    handleTextCarouselScrollEndDrag,
    openDayFromTextCard,
    openDayFromTextClusterSheet,
    previewImageFromTextCard,
    previewImageGalleryFromImageGroupOverlay,
    previewImageGalleryFromTextCard,
    recenterToInitialMapContent,
    selectImageClusterFromMarker,
    selectTextClusterFromCard,
    selectTextClusterFromMarker,
    selectTextObservationInsideCluster,
  }
}
