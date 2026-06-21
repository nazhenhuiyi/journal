import { useMemo } from 'react'
import { useWindowDimensions } from 'react-native'
import { spacingPixels } from '@journal/theme'
import type { MobileJournalRecord } from '../services/mobileJournalStore'
import {
  createMurmurRouteFeatureCollection,
  createPhotoMapImageClusters,
  createPhotoMapImageObservations,
  createPhotoMapMurmurSlices,
  createPhotoMapTextClusters,
  createPhotoMapTextObservations,
  getPhotoMapInitialCamera,
  type PhotoMapInitialCamera,
  type PhotoMapRange,
} from './photoMapData'
import { getPhotoMapInteractionFocus, type PhotoMapInteractionState } from './photoMapInteraction'
import {
  createPhotoMapTextClusterLookup,
  getPhotoMapInitialCameraKey,
  getUnlocatedPhotoMapContentCount,
  limitVisiblePhotoMapClusters,
} from './photoMapViewModel'
import {
  textCarouselPeekWidth,
  textCarouselSideInset,
} from './photoMapPresentation'
import type { MurmurBlock } from '@journal/core'

export function usePhotoMapRuntime({
  currentMurmurs,
  interaction,
  mapFrameWidth,
  mapReadyGeneration,
  range,
  records,
  selectedTextId,
  today,
}: {
  currentMurmurs: readonly MurmurBlock[]
  interaction: PhotoMapInteractionState
  mapFrameWidth: number
  mapReadyGeneration: number
  range: PhotoMapRange
  records: readonly MobileJournalRecord[]
  selectedTextId: string | null
  today: string
}) {
  const viewport = useWindowDimensions()
  const murmurSlices = useMemo(() => createPhotoMapMurmurSlices(records, {
    date: today,
    murmurs: currentMurmurs,
  }, range), [currentMurmurs, range, records, today])
  const imageObservations = useMemo(() => createPhotoMapImageObservations(murmurSlices), [murmurSlices])
  const textObservations = useMemo(() => createPhotoMapTextObservations(murmurSlices), [murmurSlices])
  const focusedTextObservation = useMemo(() => (
    textObservations.find((observation) => observation.id === selectedTextId) ?? textObservations[0] ?? null
  ), [selectedTextId, textObservations])
  const routeFeatures = useMemo(() => createMurmurRouteFeatureCollection(murmurSlices), [murmurSlices])
  const initialCamera = useMemo<PhotoMapInitialCamera>(() => (
    focusedTextObservation
      ? {
          center: focusedTextObservation.coordinates,
          zoom: 12.2,
        }
      : getPhotoMapInitialCamera(murmurSlices)
  ), [focusedTextObservation, murmurSlices])
  const initialCameraKey = getPhotoMapInitialCameraKey({
    imageObservationCount: imageObservations.length,
    initialCamera,
    mapReadyGeneration,
    range,
    textObservationCount: textObservations.length,
  })
  const murmurCount = murmurSlices.length
  const totalImageCount = useMemo(() => (
    murmurSlices.reduce((count, murmurSlice) => count + murmurSlice.murmur.images.length, 0)
  ), [murmurSlices])
  const mappableObservationCount = imageObservations.length + textObservations.length
  const unlocatedCount = useMemo(() => getUnlocatedPhotoMapContentCount(murmurSlices), [murmurSlices])
  const textCarouselWidth = Math.max(1, mapFrameWidth || viewport.width - spacingPixels['6'])
  const textCarouselItemWidth = Math.max(
    260,
    textCarouselWidth - textCarouselSideInset * 2 - textCarouselPeekWidth,
  )
  const imageClusters = useMemo(() => createPhotoMapImageClusters(imageObservations), [imageObservations])
  const textClusters = useMemo(() => createPhotoMapTextClusters(textObservations), [textObservations])
  const imageClusterIds = useMemo(() => new Set(imageClusters.map((cluster) => cluster.id)), [imageClusters])
  const textClusterIds = useMemo(() => new Set(textClusters.map((cluster) => cluster.id)), [textClusters])
  const interactionFocus = useMemo(() => getPhotoMapInteractionFocus(interaction), [interaction])
  const visibleImageClusters = useMemo(
    () => limitVisiblePhotoMapClusters(imageClusters, interactionFocus.imageClusterId),
    [imageClusters, interactionFocus.imageClusterId],
  )
  const visibleTextClusters = useMemo(
    () => limitVisiblePhotoMapClusters(textClusters, interactionFocus.textClusterId ?? focusedTextObservation?.id),
    [focusedTextObservation?.id, interactionFocus.textClusterId, textClusters],
  )
  const textClusterByObservationId = useMemo(
    () => createPhotoMapTextClusterLookup(textClusters),
    [textClusters],
  )
  const activeImageCluster = useMemo(() => (
    interactionFocus.imageClusterId
      ? imageClusters.find((cluster) => cluster.id === interactionFocus.imageClusterId) ?? null
      : null
  ), [imageClusters, interactionFocus.imageClusterId])
  const activeTextCluster = useMemo(() => (
    interactionFocus.textClusterId
      ? textClusters.find((cluster) => cluster.id === interactionFocus.textClusterId) ?? null
      : null
  ), [interactionFocus.textClusterId, textClusters])
  const isTextClusterSheetVisible = activeTextCluster !== null && activeTextCluster.items.length > 1

  return {
    activeImageCluster,
    activeTextCluster,
    focusedTextObservation,
    imageClusterIds,
    imageObservations,
    initialCamera,
    initialCameraKey,
    interactionFocus,
    isTextClusterSheetVisible,
    mappableObservationCount,
    murmurCount,
    murmurSlices,
    routeFeatures,
    textCarouselItemWidth,
    textCarouselWidth,
    textClusterByObservationId,
    textClusterIds,
    textObservations,
    totalImageCount,
    unlocatedCount,
    visibleImageClusters,
    visibleTextClusters,
  }
}
