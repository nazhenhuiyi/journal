import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image as NativeImage,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type GestureResponderEvent,
  useWindowDimensions,
} from 'react-native'
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
  type CameraRef,
  type MarkerEvent,
} from '@maplibre/maplibre-react-native'
import { Ionicons } from '@expo/vector-icons'
import type { ImageBlock, MurmurBlock } from '@journal/core'
import { radiusPixels, semanticColors, spacingPixels } from '@journal/theme'
import {
  listDailyJournals,
  type MobileJournalRecord,
} from '../services/mobileJournalStore'
import { useJournalImageThumbnailUri } from '../services/mobileImageThumbnails'
import { PageShell } from './PageShell'
import {
  createMurmurRouteFeatureCollection,
  createPhotoMapImageClusters,
  createPhotoMapImageObservations,
  createPhotoMapMurmurSlices,
  createPhotoMapTextClusters,
  createPhotoMapTextObservations,
  defaultPhotoMapRange,
  formatCompactDate,
  getPhotoMapInitialCamera,
  type PhotoMapImageCluster,
  type PhotoMapImageObservation,
  type PhotoMapInitialCamera,
  type PhotoMapRange,
  type PhotoMapTextCluster,
  type PhotoMapTextObservation,
} from './photoMapData'
import {
  browsePhotoMapInteraction,
  clearPhotoMapInteraction,
  focusPhotoMapImageCluster,
  focusPhotoMapTextCluster,
  getPhotoMapInteractionFocus,
  reconcilePhotoMapInteraction,
  restorePhotoMapImageCluster,
  type PhotoMapFocusMotion,
  type PhotoMapInteractionState,
} from './photoMapInteraction'
import {
  createPhotoMapTextClusterLookup,
  getExpandedPhotoMapMarkerOffset,
  getPhotoMapClusterBounds,
  getUnlocatedPhotoMapContentCount,
  isPhotoMapTextClusterSelected,
  limitVisiblePhotoMapClusters,
} from './photoMapViewModel'

type PhotoMapPageProps = {
  currentMurmurs: MurmurBlock[]
  onBack: () => void
  onOpenDay: (date: string) => void
  onPreviewImage: (image: ImageBlock) => void
  onPreviewImageGallery: PhotoMapImageGalleryPreviewHandler
  today: string
}

type PhotoMapImageGalleryPreviewHandler = (
  images: readonly ImageBlock[],
  initialIndex?: number,
  options?: {
    onBeforeClose?: () => void
  },
) => void

type PhotoMapRangeOption = {
  label: string
  value: PhotoMapRange
}

type PhotoMapMarkerOffset = [x: number, y: number]
type PhotoMapMarkerPressEvent = NativeSyntheticEvent<MarkerEvent>
type PhotoMapSessionSnapshot = {
  interaction: PhotoMapInteractionState
  range: PhotoMapRange
  selectedTextId: string | null
}

function handlePhotoMapMarkerPress(event: PhotoMapMarkerPressEvent, action: () => void) {
  event.stopPropagation()
  action()
}

const routeSourceId = 'journal-photo-map-murmur-route'
const openFreeMapStyleUrl = 'https://tiles.openfreemap.org/styles/positron'
const rangeOptions: PhotoMapRangeOption[] = [
  { label: '1周', value: '7d' },
  { label: '2周', value: '14d' },
  { label: '1月', value: '30d' },
  { label: '全部', value: 'all' },
]
const textCardHeight = 112
const textCardHorizontalPadding = spacingPixels['5']
const textCardVerticalPadding = spacingPixels['3']
const textCardImageSize = 72
const textCarouselSideInset = spacingPixels['4']
const textCarouselPeekWidth = spacingPixels['3']
const textCarouselItemGap = spacingPixels['2']
const imageClusterMarkerOffset: PhotoMapMarkerOffset = [30, -30]
const textClusterMarkerOffset: PhotoMapMarkerOffset = [0, 0]
const expandedImageMarkerRadiusPixels = 68
const expandedTextMarkerRadiusPixels = 52
const overlayMapPressGuardMs = 650
const pendingMapPressClearDelayMs = 180
const textCardTapMaxDurationMs = 360
let photoMapSessionSnapshot: PhotoMapSessionSnapshot | null = null

export function PhotoMapPage({
  currentMurmurs,
  onBack,
  onOpenDay,
  onPreviewImage,
  onPreviewImageGallery,
  today,
}: PhotoMapPageProps) {
  const cameraRef = useRef<CameraRef>(null)
  const appliedInitialCameraKeyRef = useRef<string | null>(null)
  const textCarouselListRef = useRef<FlatList<PhotoMapTextObservation>>(null)
  const restoredSessionRef = useRef(photoMapSessionSnapshot)
  const restoredSession = restoredSessionRef.current
  const viewport = useWindowDimensions()
  const [records, setRecords] = useState<MobileJournalRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [didLoadFail, setDidLoadFail] = useState(false)
  const [range, setRange] = useState<PhotoMapRange>(restoredSession?.range ?? defaultPhotoMapRange)
  const [isRangeMenuOpen, setIsRangeMenuOpen] = useState(false)
  const [mapReadyGeneration, setMapReadyGeneration] = useState(0)
  const [mapFrameWidth, setMapFrameWidth] = useState(0)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(restoredSession?.selectedTextId ?? null)
  const [interaction, setInteraction] = useState<PhotoMapInteractionState>(
    restoredSession?.interaction ?? browsePhotoMapInteraction,
  )
  const interactionRef = useRef<PhotoMapInteractionState>(interaction)
  const ignoreOverlayMapPressUntilRef = useRef(0)
  const pendingMapPressClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTextCarouselDraggingRef = useRef(false)
  const textCardPressBlockUntilRef = useRef(0)
  const textCarouselDragResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const murmurSlices = useMemo(() => createPhotoMapMurmurSlices(records, {
    date: today,
    murmurs: currentMurmurs,
  }, range), [currentMurmurs, range, records, today])
  const murmurSliceIds = useMemo(() => murmurSlices.map((murmurSlice) => murmurSlice.id).join('|'), [murmurSlices])
  const imageObservations = useMemo(() => createPhotoMapImageObservations(murmurSlices), [murmurSlices])
  const textObservations = useMemo(() => createPhotoMapTextObservations(murmurSlices), [murmurSlices])
  const selectedTextObservation = useMemo(() => (
    textObservations.find((observation) => observation.id === selectedTextId) ?? textObservations[0] ?? null
  ), [selectedTextId, textObservations])
  const routeFeatures = useMemo(() => createMurmurRouteFeatureCollection(murmurSlices), [murmurSlices])
  const initialCamera = useMemo<PhotoMapInitialCamera>(() => (
    selectedTextObservation
      ? {
          center: selectedTextObservation.coordinates,
          zoom: 12.2,
        }
      : getPhotoMapInitialCamera(murmurSlices)
  ), [murmurSlices, selectedTextObservation])
  const murmurCount = murmurSlices.length
  const imageCount = useMemo(() => (
    murmurSlices.reduce((count, murmurSlice) => count + murmurSlice.murmur.images.length, 0)
  ), [murmurSlices])
  const mappableContentCount = imageObservations.length + textObservations.length
  const initialCameraKey = `${mapReadyGeneration}:${range}:${murmurSliceIds}:${mappableContentCount}:${selectedTextObservation?.id ?? ''}`
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
    () => limitVisiblePhotoMapClusters(textClusters, interactionFocus.textClusterId ?? selectedTextObservation?.id),
    [interactionFocus.textClusterId, selectedTextObservation?.id, textClusters],
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
  useEffect(() => {
    interactionRef.current = interaction
  }, [interaction])

  useEffect(() => {
    photoMapSessionSnapshot = {
      interaction,
      range,
      selectedTextId,
    }
  }, [interaction, range, selectedTextId])

  useEffect(() => () => {
    cancelPendingMapPressClear()
    cancelTextCarouselDragReset()
  }, [])

  useEffect(() => {
    let isMounted = true

    setIsLoading(true)
    setDidLoadFail(false)

    listDailyJournals()
      .then((loadedRecords) => {
        if (isMounted) {
          setRecords(loadedRecords)
        }
      })
      .catch((error) => {
        console.error(error)

        if (isMounted) {
          setDidLoadFail(true)
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [today])

  useEffect(() => {
    if (textObservations.length === 0) {
      setSelectedTextId(null)
      return
    }

    setSelectedTextId((previousTextId) => (
      previousTextId && textObservations.some((observation) => observation.id === previousTextId)
        ? previousTextId
        : textObservations[0]?.id ?? null
    ))
  }, [textObservations])

  useEffect(() => {
    if (mapReadyGeneration === 0 || mappableContentCount === 0) {
      return
    }

    if (interaction.kind !== 'browse') {
      return
    }

    if (appliedInitialCameraKeyRef.current === initialCameraKey) {
      return
    }

    appliedInitialCameraKeyRef.current = initialCameraKey
    moveCameraToInitialView(cameraRef, initialCamera)
  }, [initialCamera, initialCameraKey, interaction.kind, mapReadyGeneration, mappableContentCount])

  useEffect(() => {
    if (mappableContentCount === 0) {
      setMapReadyGeneration(0)
    }
  }, [mappableContentCount])

  useEffect(() => {
    if (isLoading) {
      return
    }

    setInteraction((previousInteraction) => reconcilePhotoMapInteraction(
      previousInteraction,
      imageClusterIds,
      textClusterIds,
    ))
  }, [imageClusterIds, isLoading, textClusterIds])

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

  function handleMapFrameLayout(event: LayoutChangeEvent) {
    const nextWidth = Math.round(event.nativeEvent.layout.width)

    setMapFrameWidth((previousWidth) => (
      previousWidth === nextWidth ? previousWidth : nextWidth
    ))
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

  function handleBack() {
    photoMapSessionSnapshot = null
    onBack()
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

  return (
    <PageShell
      headerRight={(
        <PhotoMapRangeButton
          isOpen={isRangeMenuOpen}
          onPress={() => setIsRangeMenuOpen((isOpen) => !isOpen)}
          range={range}
        />
      )}
      onBack={handleBack}
      testID="photo-map-page"
      title="照片地图"
    >
      <View className="flex-1">
        {isRangeMenuOpen ? (
          <PhotoMapRangeMenu
            onChange={handleRangeChange}
            range={range}
          />
        ) : null}
        {isLoading ? (
          <PhotoMapStatus
            icon="map-outline"
            message="正在铺开照片地图"
            title="读取日记里的照片"
          />
        ) : null}

        {!isLoading && didLoadFail ? (
          <PhotoMapStatus
            icon="warning-outline"
            message="日记读取失败，稍后再试一次。"
            title="照片地图没有打开"
          />
        ) : null}

        {!isLoading && !didLoadFail && murmurSlices.length === 0 ? (
          <PhotoMapStatus
            icon="chatbubble-ellipses-outline"
            message={`这个${getRangeLabel(range)}还没有碎碎念。`}
            title="还没有可浏览的碎碎念"
          />
        ) : null}

        {!isLoading && !didLoadFail && murmurSlices.length > 0 && mappableContentCount === 0 ? (
          <PhotoMapStatus
            icon="location-outline"
            message={`${murmurSlices.length} 条内容还没有经纬度。`}
            title="还没有带定位的内容"
          />
        ) : null}

        {!isLoading && !didLoadFail && mappableContentCount > 0 ? (
          <View onLayout={handleMapFrameLayout} style={styles.mapFrame}>
            <MapLibreMap
              attribution={false}
              compass={false}
              logo={false}
              mapStyle={openFreeMapStyleUrl}
              onDidFinishLoadingMap={() => setMapReadyGeneration((generation) => generation + 1)}
              onPress={handleMapPress}
              scaleBar={false}
              style={StyleSheet.absoluteFill}
            >
              <Camera
                maxZoom={17}
                minZoom={2}
                ref={cameraRef}
              />
              <GeoJSONSource
                data={routeFeatures}
                id={routeSourceId}
              >
                <Layer
                  id="photo-map-murmur-route-shadow"
                  paint={{
                    'line-color': semanticColors.surface,
                    'line-opacity': 0.72,
                    'line-width': 4,
                  }}
                  type="line"
                />
                <Layer
                  id="photo-map-murmur-route"
                  paint={{
                    'line-color': semanticColors.primary,
                    'line-opacity': 0.42,
                    'line-width': 2,
                  }}
                  type="line"
                />
              </GeoJSONSource>
              {visibleImageClusters.map((cluster) => (
                <PhotoMapImageClusterMarker
                  cluster={cluster}
                  isExpanded={cluster.id === activeImageCluster?.id}
                  isSelected={cluster.id === activeImageCluster?.id}
                  key={cluster.id}
                  onSelect={selectImageClusterFromMarker}
                />
              ))}
              {visibleTextClusters.map((cluster) => (
                <PhotoMapTextClusterMarker
                  cluster={cluster}
                  isExpanded={cluster.id === activeTextCluster?.id}
                  isSelected={isPhotoMapTextClusterSelected(cluster, selectedTextObservation?.id)}
                  key={cluster.id}
                  onSelect={selectTextClusterFromMarker}
                />
              ))}
              {activeImageCluster ? (
                <PhotoMapExpandedImageMarkers
                  activationKey={interactionFocus.imageActivationKey}
                  cluster={activeImageCluster}
                  motion={interactionFocus.imageMotion}
                  onPreviewImageGallery={previewImageGalleryFromImageGroupOverlay}
                />
              ) : null}
              {activeTextCluster ? (
                <PhotoMapExpandedTextMarkers
                  activationKey={interactionFocus.textActivationKey}
                  cluster={activeTextCluster}
                  motion={interactionFocus.textMotion}
                  onSelect={(observation) => selectTextObservationInsideCluster(activeTextCluster, observation)}
                  selectedTextId={selectedTextObservation?.id}
                />
              ) : null}
            </MapLibreMap>

            <View style={styles.mapTopPanel}>
              <PhotoMapSummaryCard
                imageCount={imageCount}
                murmurCount={murmurCount}
                onRecenter={recenterToInitialMapContent}
                range={range}
                unlocatedCount={unlocatedCount}
              />
            </View>

            <View pointerEvents="none" style={styles.mapAttribution}>
              <Text style={styles.mapAttributionText}>© OpenMapTiles · OpenStreetMap</Text>
            </View>

            {activeImageCluster && activeImageCluster.items.length > 1 ? (
              <PhotoMapImageClusterTray
                activationKey={interactionFocus.imageActivationKey}
                cluster={activeImageCluster}
                motion={interactionFocus.imageMotion}
                onGuardMapPress={guardOverlayMapPress}
                onPreviewImageGallery={previewImageGalleryFromImageGroupOverlay}
              />
            ) : null}

            {isTextClusterSheetVisible ? (
              <PhotoMapTextClusterSheet
                activationKey={interactionFocus.textActivationKey}
                cluster={activeTextCluster}
                onGuardMapPress={guardOverlayMapPress}
                motion={interactionFocus.textMotion}
                onOpenDay={openDayFromTextClusterSheet}
              />
            ) : null}

            {textObservations.length > 0 && !isTextClusterSheetVisible ? (
              <View pointerEvents="box-none" style={styles.textCardTray}>
                <FlatList
                  contentContainerStyle={[
                    styles.textCarouselListContent,
                    {
                      paddingLeft: textCarouselSideInset,
                      paddingRight: textCarouselSideInset + textCarouselPeekWidth,
                    },
                  ]}
                  data={textObservations}
                  decelerationRate="fast"
                  disableIntervalMomentum
                  getItemLayout={(_, index) => ({
                    index,
                    length: textCarouselItemWidth,
                    offset: textCarouselItemWidth * index,
                  })}
                  horizontal
                  keyExtractor={(observation) => observation.id}
                  onMomentumScrollEnd={handleTextCarouselMomentumEnd}
                  onScrollBeginDrag={handleTextCarouselScrollBeginDrag}
                  onScrollEndDrag={handleTextCarouselScrollEndDrag}
                  ref={textCarouselListRef}
                  renderItem={({ item: observation }) => (
                    <View style={[styles.textCarouselPage, { width: textCarouselItemWidth }]}>
                      <PhotoMapTextCard
                        isSelected={observation.id === selectedTextObservation?.id}
                        nearbyCluster={textClusterByObservationId.get(observation.id) ?? null}
                        observation={observation}
                        onOpenDay={openDayFromTextCard}
                        onOpenNearbyCluster={selectTextClusterFromCard}
                        onPreviewImageGallery={previewImageGalleryFromTextCard}
                        onPreviewImage={previewImageFromTextCard}
                      />
                    </View>
                  )}
                  showsHorizontalScrollIndicator={false}
                  snapToAlignment="start"
                  snapToInterval={textCarouselItemWidth}
                  style={[
                    styles.textCarouselList,
                    { width: textCarouselWidth },
                  ]}
                  testID="photo-map-text-carousel"
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </PageShell>
  )
}

function PhotoMapSummaryCard({
  imageCount,
  murmurCount,
  onRecenter,
  range,
  unlocatedCount,
}: {
  imageCount: number
  murmurCount: number
  onRecenter: () => void
  range: PhotoMapRange
  unlocatedCount: number
}) {
  return (
    <View style={styles.mapSummary}>
      <View style={styles.mapSummaryMain}>
        <Text className="text-xs font-semibold text-primary">{getRangeLabel(range)}</Text>
        <View style={styles.mapSummaryMetricRow}>
          <Text className="text-xl font-semibold text-foreground">{murmurCount}</Text>
          <Text className="text-xs font-semibold text-text-tertiary">条碎碎念</Text>
          <Text className="text-xl font-semibold text-foreground">{imageCount}</Text>
          <Text className="text-xs font-semibold text-text-tertiary">张照片</Text>
        </View>
        {unlocatedCount > 0 ? (
          <Text className="text-xs font-medium text-text-tertiary">
            {unlocatedCount} 条内容未定位
          </Text>
        ) : (
          <Text className="text-xs font-medium text-text-tertiary">
            全部内容已定位
          </Text>
        )}
      </View>
      <Pressable
        accessibilityLabel="回到第一条定位"
        accessibilityRole="button"
        onPress={onRecenter}
        style={({ pressed }) => [
          styles.recenterButton,
          { opacity: pressed ? 0.72 : 1 },
        ]}
        testID="photo-map-recenter-button"
      >
        <Ionicons color={semanticColors.primary} name="navigate-outline" size={18} />
      </Pressable>
    </View>
  )
}

function moveCameraToInitialView(
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

function PhotoMapRangeButton({
  isOpen,
  onPress,
  range,
}: {
  isOpen: boolean
  onPress: () => void
  range: PhotoMapRange
}) {
  return (
    <Pressable
      accessibilityLabel={`筛选照片地图时间范围，当前${getRangeLabel(range)}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: isOpen }}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
      testID="photo-map-range-menu-button"
    >
      <View style={[styles.rangeHeaderButton, isOpen ? styles.rangeHeaderButtonActive : null]}>
        <Text
          className="text-xs font-semibold"
          numberOfLines={1}
          style={{ color: semanticColors.primary }}
        >
          {getRangeShortLabel(range)}
        </Text>
      </View>
    </Pressable>
  )
}

function PhotoMapRangeMenu({
  onChange,
  range,
}: {
  onChange: (range: PhotoMapRange) => void
  range: PhotoMapRange
}) {
  return (
    <View
      accessibilityLabel="照片地图时间范围"
      accessibilityRole="tablist"
      style={styles.rangeMenu}
    >
      {rangeOptions.map((option) => {
        const isSelected = option.value === range

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.rangeMenuButton,
              isSelected ? styles.rangeMenuButtonSelected : null,
              { opacity: pressed ? 0.74 : 1 },
            ]}
            testID={`photo-map-range-${option.value}`}
          >
            <Text
              className="text-xs font-semibold"
              style={{ color: isSelected ? semanticColors.primary : semanticColors['text-tertiary'] }}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function PhotoMapTextCard({
  isSelected,
  nearbyCluster,
  observation,
  onOpenDay,
  onOpenNearbyCluster,
  onPreviewImageGallery,
  onPreviewImage,
}: {
  isSelected: boolean
  nearbyCluster: PhotoMapTextCluster | null
  observation: PhotoMapTextObservation
  onOpenDay: (date: string) => void
  onOpenNearbyCluster: (cluster: PhotoMapTextCluster, observation: PhotoMapTextObservation) => void
  onPreviewImageGallery: (images: readonly ImageBlock[], initialIndex?: number) => void
  onPreviewImage: (image: ImageBlock) => void
}) {
  const murmurText = getPhotoMapCardMurmurText(observation)
  const cardDate = formatTextCardDate(observation.date)
  const nearbyTextCount = nearbyCluster?.items.length ?? 1
  const pressStartRef = useRef<{ x: number, y: number } | null>(null)
  const pressStartTimeRef = useRef(0)
  const didMovePressRef = useRef(false)

  function handleCardPressIn(event: GestureResponderEvent) {
    pressStartTimeRef.current = Date.now()
    pressStartRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    }
    didMovePressRef.current = false
  }

  function handleCardTouchMove(event: GestureResponderEvent) {
    const startPoint = pressStartRef.current

    if (!startPoint) {
      return
    }

    const deltaX = Math.abs(event.nativeEvent.pageX - startPoint.x)
    const deltaY = Math.abs(event.nativeEvent.pageY - startPoint.y)

    if (deltaX > 8 || deltaY > 8) {
      didMovePressRef.current = true
    }
  }

  function openDayIfTap() {
    const pressDuration = Date.now() - pressStartTimeRef.current

    if (didMovePressRef.current || pressDuration > textCardTapMaxDurationMs) {
      didMovePressRef.current = false
      return
    }

    onOpenDay(observation.date)
  }

  return (
    <View
      style={[
        styles.textCard,
        isSelected ? styles.textCardSelected : null,
      ]}
    >
      <View style={styles.textCardInner}>
        <View pointerEvents="box-none" style={styles.textCardMediaSlot}>
          <MurmurPreviewImage
            observation={observation}
            onPreviewImageGallery={onPreviewImageGallery}
            onPreviewImage={onPreviewImage}
          />
        </View>
        <Pressable
          accessibilityLabel={`打开${formatCompactDate(observation.date)}的日记`}
          accessibilityRole="button"
          onPress={openDayIfTap}
          onPressIn={handleCardPressIn}
          onTouchMove={handleCardTouchMove}
          style={({ pressed }) => [
            styles.textCardTextColumn,
            { opacity: pressed ? 0.82 : 1 },
          ]}
        >
          <View style={styles.cardMetaRow}>
            <View style={styles.cardDateContent}>
              <Ionicons color={semanticColors['text-tertiary']} name="calendar-outline" size={13} />
              <Text className="text-xs font-semibold text-text-tertiary" numberOfLines={1} style={styles.cardMetaDate}>
                {cardDate}
              </Text>
            </View>
            {nearbyCluster && nearbyTextCount > 1 ? (
              <Pressable
                accessibilityLabel={`打开附近 ${nearbyTextCount} 条碎碎念`}
                accessibilityRole="button"
                onPress={(event) => {
                  event.stopPropagation()
                  onOpenNearbyCluster(nearbyCluster, observation)
                }}
                onPressIn={(event) => {
                  event.stopPropagation()
                }}
                onTouchStart={(event) => {
                  event.stopPropagation()
                }}
                style={({ pressed }) => [
                  styles.cardNearbyBadge,
                  { opacity: pressed ? 0.78 : 1 },
                ]}
              >
                <Text numberOfLines={1} style={styles.cardNearbyBadgeText}>
                  附近 {nearbyTextCount} 条
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text numberOfLines={2} style={styles.textCardMurmurText}>
            {murmurText}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function PhotoMapTextClusterMarker({
  cluster,
  isExpanded,
  isSelected,
  onSelect,
}: {
  cluster: PhotoMapTextCluster
  isExpanded: boolean
  isSelected: boolean
  onSelect: (cluster: PhotoMapTextCluster) => void
}) {
  const isCluster = cluster.items.length > 1
  const firstItem = cluster.items[0]
  const markerText = isCluster ? formatPhotoMapCountBadge(cluster.items.length) : ''

  return (
    <Marker
      anchor="center"
      id={`photo-map-text-marker-${cluster.id}`}
      lngLat={cluster.coordinates}
      offset={textClusterMarkerOffset}
      onPress={(event) => handlePhotoMapMarkerPress(event, () => onSelect(cluster))}
    >
      <View
        accessibilityLabel={isCluster
          ? `展开附近 ${cluster.items.length} 条碎碎念`
          : `选择碎碎念：${firstItem ? getPhotoMapCardMurmurText(firstItem) : ''}`}
        accessibilityRole="button"
        style={[
          styles.mapTextMarker,
          isCluster ? styles.mapTextClusterMarker : null,
          isExpanded ? styles.mapTextMarkerExpanded : null,
          !isCluster && isSelected ? styles.mapTextMarkerSelected : null,
        ]}
      >
        {isCluster ? (
          <Text style={styles.mapTextClusterMarkerText}>
            {markerText}
          </Text>
        ) : null}
      </View>
    </Marker>
  )
}

function PhotoMapImageClusterMarker({
  cluster,
  isExpanded,
  isSelected,
  onSelect,
}: {
  cluster: PhotoMapImageCluster
  isExpanded: boolean
  isSelected: boolean
  onSelect: (cluster: PhotoMapImageCluster) => void
}) {
  const item = cluster.representativeItem
  const title = getPhotoMapImageTitle(item)
  const isCluster = cluster.items.length > 1
  const imageUri = useJournalImageThumbnailUri(item.image.src)

  if (!imageUri) {
    return null
  }

  return (
    <Marker
      anchor="center"
      id={`photo-map-image-marker-${cluster.id}`}
      lngLat={cluster.coordinates}
      offset={imageClusterMarkerOffset}
      onPress={(event) => handlePhotoMapMarkerPress(event, () => onSelect(cluster))}
    >
      <View
        accessibilityLabel={isCluster
          ? `展开附近 ${cluster.items.length} 张照片`
          : `选择照片：${title}`}
        accessibilityRole="button"
        style={[
          styles.mapImageMarker,
          isExpanded ? styles.mapImageMarkerExpanded : null,
          isSelected ? styles.mapImageMarkerSelected : null,
          isCluster ? styles.mapImageMarkerGrouped : null,
        ]}
      >
        {isCluster ? <View style={styles.mapImageMarkerGroupHalo} /> : null}
        <NativeImage
          accessibilityLabel={title}
          resizeMode="cover"
          source={{ uri: imageUri }}
          style={[
            styles.mapImageMarkerImage,
            isSelected ? styles.mapImageMarkerImageSelected : null,
          ]}
        />
        {isCluster ? (
          <View style={[
            styles.mapImageMultiBadge,
            styles.mapImageNearbyBadge,
          ]}>
            <Text style={[
              styles.mapImageMultiBadgeText,
              styles.mapImageNearbyBadgeText,
            ]}>
              {formatPhotoMapCountBadge(cluster.items.length)}张
            </Text>
          </View>
        ) : null}
      </View>
    </Marker>
  )
}

function PhotoMapExpandedImageMarkers({
  activationKey,
  cluster,
  motion,
  onPreviewImageGallery,
}: {
  activationKey: string
  cluster: PhotoMapImageCluster
  motion: PhotoMapFocusMotion
  onPreviewImageGallery: (
    cluster: PhotoMapImageCluster,
    images: readonly ImageBlock[],
    initialIndex?: number,
  ) => void
}) {
  const images = cluster.items.map((item) => item.image)

  return (
    <>
      {cluster.items.map((item, index) => (
        <PhotoMapExpandedImageMarker
          activationKey={activationKey}
          image={item.image}
          index={index}
          key={item.id}
          lngLat={cluster.coordinates}
          markerOffset={addPhotoMapMarkerOffsets(
            imageClusterMarkerOffset,
            getExpandedPhotoMapMarkerOffset(index, cluster.items.length, expandedImageMarkerRadiusPixels),
          )}
          motion={motion}
          originOffset={imageClusterMarkerOffset}
          onPress={() => onPreviewImageGallery(cluster, images, index)}
          title={getPhotoMapImageTitle(item)}
        />
      ))}
    </>
  )
}

function PhotoMapExpandedImageMarker({
  activationKey,
  image,
  index,
  lngLat,
  markerOffset,
  motion,
  originOffset,
  onPress,
  title,
}: {
  activationKey: string
  image: ImageBlock
  index: number
  lngLat: [longitude: number, latitude: number]
  markerOffset: PhotoMapMarkerOffset
  motion: PhotoMapFocusMotion
  originOffset: PhotoMapMarkerOffset
  onPress: () => void
  title: string
}) {
  const imageUri = useJournalImageThumbnailUri(image.src)
  const progress = usePhotoMapEnterProgress(activationKey, motion, {
    delay: index * 28,
    duration: 260,
  })

  if (!imageUri) {
    return null
  }

  return (
    <Marker
      anchor="center"
      id={`photo-map-expanded-image-${image.id}-${index}`}
      lngLat={lngLat}
      offset={markerOffset}
      onPress={(event) => handlePhotoMapMarkerPress(event, onPress)}
    >
      <Animated.View
        accessibilityLabel={`查看照片：${title}`}
        accessibilityRole="button"
        style={[
          styles.expandedImageMarker,
          getPhotoMapScaleInStyle(progress, 0.62, markerOffset, originOffset),
        ]}
      >
        <NativeImage
          accessibilityLabel={title}
          resizeMode="cover"
          source={{ uri: imageUri }}
          style={styles.expandedImageMarkerImage}
        />
      </Animated.View>
    </Marker>
  )
}

function PhotoMapExpandedTextMarkers({
  activationKey,
  cluster,
  motion,
  onSelect,
  selectedTextId,
}: {
  activationKey: string
  cluster: PhotoMapTextCluster
  motion: PhotoMapFocusMotion
  onSelect: (observation: PhotoMapTextObservation) => void
  selectedTextId: string | undefined
}) {
  return (
    <>
      {cluster.items.map((item, index) => (
        <PhotoMapExpandedTextMarker
          activationKey={activationKey}
          index={index}
          isSelected={item.id === selectedTextId}
          item={item}
          key={item.id}
          lngLat={cluster.coordinates}
          markerOffset={addPhotoMapMarkerOffsets(
            textClusterMarkerOffset,
            getExpandedPhotoMapMarkerOffset(index, cluster.items.length, expandedTextMarkerRadiusPixels),
          )}
          motion={motion}
          originOffset={textClusterMarkerOffset}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

function PhotoMapExpandedTextMarker({
  activationKey,
  index,
  isSelected,
  item,
  lngLat,
  markerOffset,
  motion,
  originOffset,
  onSelect,
}: {
  activationKey: string
  index: number
  isSelected: boolean
  item: PhotoMapTextObservation
  lngLat: [longitude: number, latitude: number]
  markerOffset: PhotoMapMarkerOffset
  motion: PhotoMapFocusMotion
  originOffset: PhotoMapMarkerOffset
  onSelect: (observation: PhotoMapTextObservation) => void
}) {
  const progress = usePhotoMapEnterProgress(activationKey, motion, {
    delay: index * 24,
    duration: 220,
  })

  return (
    <Marker
      anchor="center"
      id={`photo-map-expanded-text-${item.id}`}
      lngLat={lngLat}
      offset={markerOffset}
      onPress={(event) => handlePhotoMapMarkerPress(event, () => onSelect(item))}
    >
      <Animated.View
        accessibilityLabel={`选择碎碎念：${getPhotoMapCardMurmurText(item)}`}
        accessibilityRole="button"
        style={[
          styles.expandedTextMarker,
          isSelected ? styles.expandedTextMarkerSelected : null,
          getPhotoMapScaleInStyle(progress, 0.58, markerOffset, originOffset),
        ]}
      />
    </Marker>
  )
}

function PhotoMapImageClusterTray({
  activationKey,
  cluster,
  motion,
  onGuardMapPress,
  onPreviewImageGallery,
}: {
  activationKey: string
  cluster: PhotoMapImageCluster
  motion: PhotoMapFocusMotion
  onGuardMapPress: () => void
  onPreviewImageGallery: (
    cluster: PhotoMapImageCluster,
    images: readonly ImageBlock[],
    initialIndex?: number,
  ) => void
}) {
  const images = cluster.items.map((item) => item.image)
  const progress = usePhotoMapEnterProgress(activationKey, motion, {
    duration: 220,
  })

  return (
    <Animated.View style={[
      styles.imageClusterTray,
      getPhotoMapSlideUpStyle(progress, 18),
    ]}
    onTouchStart={(event) => {
      event.stopPropagation()
      onGuardMapPress()
    }}
    >
      <View style={styles.overlayHeaderRow}>
        <Text style={styles.overlayTitle}>附近 {cluster.items.length} 张照片</Text>
        <Text style={styles.overlayMetaText}>点开查看原图</Text>
      </View>
      <FlatList
        contentContainerStyle={styles.imageClusterTrayList}
        data={cluster.items}
        horizontal
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <PhotoMapTrayImageButton
            image={item.image}
            onPress={() => onPreviewImageGallery(cluster, images, index)}
            title={getPhotoMapImageTitle(item)}
          />
        )}
        showsHorizontalScrollIndicator={false}
      />
    </Animated.View>
  )
}

function PhotoMapTrayImageButton({
  image,
  onPress,
  title,
}: {
  image: ImageBlock
  onPress: () => void
  title: string
}) {
  const imageUri = useJournalImageThumbnailUri(image.src)

  if (!imageUri) {
    return null
  }

  return (
    <Pressable
      accessibilityLabel={`查看照片：${title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.imageClusterTrayItem,
        { opacity: pressed ? 0.78 : 1 },
      ]}
    >
      <NativeImage
        resizeMode="cover"
        source={{ uri: imageUri }}
        style={styles.imageClusterTrayImage}
      />
    </Pressable>
  )
}

function PhotoMapTextClusterSheet({
  activationKey,
  cluster,
  motion,
  onGuardMapPress,
  onOpenDay,
}: {
  activationKey: string
  cluster: PhotoMapTextCluster
  motion: PhotoMapFocusMotion
  onGuardMapPress: () => void
  onOpenDay: (event: GestureResponderEvent, date: string) => void
}) {
  const progress = usePhotoMapEnterProgress(activationKey, motion, {
    duration: 220,
  })

  return (
    <Animated.View
      onTouchStart={(event) => {
        event.stopPropagation()
        onGuardMapPress()
      }}
      style={[
        styles.textClusterSheet,
        getPhotoMapSlideUpStyle(progress, 22),
      ]}
    >
      <View style={styles.overlayHeaderRow}>
        <Text style={styles.overlayTitle}>附近 {cluster.items.length} 条碎碎念</Text>
        <Text style={styles.overlayMetaText}>打开当天记录</Text>
      </View>
      <FlatList
        contentContainerStyle={styles.textClusterSheetList}
        data={cluster.items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            accessibilityLabel={`打开${formatCompactDate(item.date)}的日记`}
            accessibilityRole="button"
            onPress={(event) => onOpenDay(event, item.date)}
            onPressIn={(event) => {
              event.stopPropagation()
              onGuardMapPress()
            }}
            style={({ pressed }) => [
              styles.textClusterSheetItem,
              { opacity: pressed ? 0.78 : 1 },
            ]}
          >
            <View style={styles.cardMetaRow}>
              <Ionicons color={semanticColors['text-tertiary']} name="calendar-outline" size={13} />
              <Text className="text-xs font-semibold text-text-tertiary" numberOfLines={1}>
                {formatTextCardDate(item.date)}
              </Text>
            </View>
            <Text numberOfLines={2} style={styles.textClusterSheetText}>
              {getPhotoMapCardMurmurText(item)}
            </Text>
          </Pressable>
        )}
        showsVerticalScrollIndicator={false}
      />
    </Animated.View>
  )
}

function MurmurPreviewImage({
  observation,
  onPreviewImageGallery,
  onPreviewImage,
}: {
  observation: PhotoMapTextObservation
  onPreviewImageGallery: (images: readonly ImageBlock[], initialIndex?: number) => void
  onPreviewImage: (image: ImageBlock) => void
}) {
  const images = observation.murmur.images
  const firstImage = images[0]

  if (!firstImage) {
    return (
      <View pointerEvents="none" style={[styles.textCardImage, styles.emptyMurmurImage]}>
        <View style={styles.emptyMurmurIconBubble}>
          <Ionicons color={semanticColors.primary} name="chatbubble-ellipses-outline" size={20} />
        </View>
        <View style={styles.emptyMurmurLineLong} />
        <View style={styles.emptyMurmurLineShort} />
      </View>
    )
  }

  return (
    <PhotoPreviewButton
      galleryImages={images}
      image={firstImage}
      onPreviewImageGallery={onPreviewImageGallery}
      onPreviewImage={onPreviewImage}
      title={getPhotoMapTextPreviewTitle(observation)}
    />
  )
}

function PhotoPreviewButton({
  galleryImages,
  image,
  onPreviewImageGallery,
  onPreviewImage,
  title,
}: {
  galleryImages?: readonly ImageBlock[]
  image: ImageBlock
  onPreviewImageGallery: (images: readonly ImageBlock[], initialIndex?: number) => void
  onPreviewImage: (image: ImageBlock) => void
  title: string
}) {
  const imageUri = useJournalImageThumbnailUri(image.src)

  return (
    <Pressable
      accessibilityLabel={`查看大图：${title}`}
      accessibilityRole="button"
      onPress={(event) => {
        event.stopPropagation()

        if (galleryImages && galleryImages.length > 1) {
          onPreviewImageGallery(galleryImages, 0)
          return
        }

        onPreviewImage(image)
      }}
      style={({ pressed }) => ({
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <NativeImage
        accessibilityLabel={title}
        resizeMode="cover"
        source={{ uri: imageUri }}
        style={styles.textCardImage}
      />
    </Pressable>
  )
}

function PhotoMapStatus({
  icon,
  message,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap
  message: string
  title: string
}) {
  return (
    <View className="flex-1 items-center justify-center">
      <View
        className="items-center border border-border bg-surface px-5 py-5"
        style={styles.statusCard}
      >
        {title === '读取日记里的照片' ? (
          <ActivityIndicator color={semanticColors['text-tertiary']} size="small" />
        ) : (
          <Ionicons color={semanticColors['text-tertiary']} name={icon} size={24} />
        )}
        <Text className="mt-4 text-base font-semibold text-foreground">{title}</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-text-tertiary">{message}</Text>
      </View>
    </View>
  )
}

function usePhotoMapEnterProgress(
  activationKey: string,
  motion: PhotoMapFocusMotion,
  options: {
    delay?: number
    duration?: number
  } = {},
) {
  const delay = options.delay ?? 0
  const duration = options.duration ?? 180
  const progress = useRef(new Animated.Value(motion === 'restore' ? 1 : 0)).current

  useEffect(() => {
    progress.stopAnimation()

    if (motion === 'restore') {
      progress.setValue(1)
      return undefined
    }

    progress.setValue(0)

    const animation = Animated.timing(progress, {
      delay,
      duration,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    })

    animation.start()

    return () => {
      animation.stop()
    }
  }, [activationKey, delay, duration, motion, progress])

  return progress
}

function getPhotoMapScaleInStyle(
  progress: Animated.Value,
  fromScale: number,
  markerOffset: PhotoMapMarkerOffset,
  originOffset: PhotoMapMarkerOffset,
) {
  const fromTranslateX = originOffset[0] - markerOffset[0]
  const fromTranslateY = originOffset[1] - markerOffset[1]

  return {
    opacity: progress,
    transform: [
      {
        translateX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [fromTranslateX, 0],
        }),
      },
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [fromTranslateY, 0],
        }),
      },
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [fromScale, 1],
        }),
      },
    ],
  }
}

function addPhotoMapMarkerOffsets(
  firstOffset: PhotoMapMarkerOffset,
  secondOffset: PhotoMapMarkerOffset,
): PhotoMapMarkerOffset {
  return [
    firstOffset[0] + secondOffset[0],
    firstOffset[1] + secondOffset[1],
  ]
}

function getPhotoMapSlideUpStyle(progress: Animated.Value, fromOffset: number) {
  return {
    opacity: progress,
    transform: [{
      translateY: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [fromOffset, 0],
      }),
    }],
  }
}

function getPhotoMapCardMurmurText(observation: PhotoMapTextObservation) {
  return observation.body.trim() || '这条碎碎念还没有文字。'
}

function getPhotoMapImageTitle(observation: PhotoMapImageObservation) {
  return observation.image.caption?.trim() || observation.body.trim() || formatCompactDate(observation.date)
}

function getPhotoMapTextPreviewTitle(observation: PhotoMapTextObservation) {
  const firstImage = observation.murmur.images[0]

  return firstImage?.caption?.trim() || getPhotoMapCardMurmurText(observation)
}

function formatPhotoMapCountBadge(count: number) {
  return count > 9 ? '9+' : String(count)
}

function formatTextCardDate(dateKey: string) {
  const [, month, day] = dateKey.split('-')

  if (!month || !day) {
    return dateKey
  }

  return `${Number(month)}/${Number(day)}`
}

function clampIndex(index: number, length: number) {
  if (length <= 0) {
    return 0
  }

  return Math.min(Math.max(index, 0), length - 1)
}

function getRangeLabel(range: PhotoMapRange) {
  switch (range) {
    case '7d':
      return '近1周'
    case '14d':
      return '近2周'
    case '30d':
      return '近1月'
    case 'all':
      return '全部'
  }
}

function getRangeShortLabel(range: PhotoMapRange) {
  switch (range) {
    case '7d':
      return '1周'
    case '14d':
      return '2周'
    case '30d':
      return '1月'
    case 'all':
      return '全部'
  }
}

const styles = StyleSheet.create({
  cardNearbyBadge: {
    alignItems: 'center',
    backgroundColor: semanticColors['primary-soft'],
    borderRadius: radiusPixels.full,
    flexShrink: 0,
    justifyContent: 'center',
    maxWidth: 82,
    paddingHorizontal: spacingPixels['1.5'],
    paddingVertical: 1,
  },
  cardNearbyBadgeText: {
    color: semanticColors.primary,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
  cardMetaDate: {
    flexShrink: 0,
  },
  cardDateContent: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacingPixels['1'],
    minHeight: 18,
    minWidth: 52,
  },
  cardMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: spacingPixels['1'],
    minHeight: 18,
    minWidth: 0,
  },
  emptyMurmurImage: {
    alignItems: 'center',
    borderColor: semanticColors.border,
    borderWidth: 1,
    gap: spacingPixels['1.5'],
    justifyContent: 'center',
  },
  emptyMurmurIconBubble: {
    alignItems: 'center',
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.border,
    borderRadius: radiusPixels.full,
    borderWidth: 1,
    height: spacingPixels['8'],
    justifyContent: 'center',
    width: spacingPixels['8'],
  },
  emptyMurmurLineLong: {
    backgroundColor: semanticColors.border,
    borderRadius: radiusPixels.full,
    height: 3,
    width: 36,
  },
  emptyMurmurLineShort: {
    backgroundColor: semanticColors.border,
    borderRadius: radiusPixels.full,
    height: 3,
    opacity: 0.72,
    width: 24,
  },
  expandedImageMarker: {
    alignItems: 'center',
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.primary,
    borderRadius: radiusPixels.md,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    shadowColor: semanticColors.foreground,
    shadowOffset: {
      height: 2,
      width: 0,
    },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    width: 42,
  },
  expandedImageMarkerImage: {
    backgroundColor: semanticColors['surface-muted'],
    borderRadius: radiusPixels.sm,
    height: 38,
    width: 38,
  },
  expandedTextMarker: {
    backgroundColor: semanticColors.primary,
    borderColor: semanticColors.surface,
    borderRadius: radiusPixels.full,
    borderWidth: 2,
    height: 18,
    shadowColor: semanticColors.foreground,
    shadowOffset: {
      height: 1,
      width: 0,
    },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    width: 18,
  },
  expandedTextMarkerSelected: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.primary,
    borderWidth: 3,
    height: 22,
    width: 22,
  },
  imageClusterTray: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.border,
    borderRadius: radiusPixels.lg,
    borderWidth: 1,
    bottom: textCardHeight + spacingPixels['6'],
    left: spacingPixels['4'],
    paddingHorizontal: spacingPixels['3'],
    paddingVertical: spacingPixels['2.5'],
    position: 'absolute',
    right: spacingPixels['4'],
    shadowColor: semanticColors.foreground,
    shadowOffset: {
      height: 4,
      width: 0,
    },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    zIndex: 4,
  },
  imageClusterTrayImage: {
    backgroundColor: semanticColors['surface-muted'],
    borderRadius: radiusPixels.md,
    height: 56,
    width: 56,
  },
  imageClusterTrayItem: {
    borderColor: semanticColors.border,
    borderRadius: radiusPixels.md,
    borderWidth: 1,
    height: 58,
    overflow: 'hidden',
    width: 58,
  },
  imageClusterTrayList: {
    gap: spacingPixels['2'],
    paddingTop: spacingPixels['2'],
  },
  mapFrame: {
    backgroundColor: semanticColors['surface-muted'],
    borderColor: semanticColors.border,
    borderRadius: radiusPixels['2xl'],
    borderWidth: 1,
    flex: 1,
    overflow: 'hidden',
  },
  mapImageMarker: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    overflow: 'visible',
    width: 40,
  },
  mapImageMarkerGrouped: {
    height: 46,
    width: 46,
  },
  mapImageMarkerExpanded: {
    opacity: 0.82,
  },
  mapImageMarkerGroupHalo: {
    backgroundColor: semanticColors['primary-soft'],
    borderColor: semanticColors.primary,
    borderRadius: radiusPixels.lg,
    borderWidth: 1,
    bottom: 1,
    left: 1,
    opacity: 0.78,
    position: 'absolute',
    right: 1,
    top: 1,
    transform: [{ rotate: '-7deg' }],
  },
  mapImageMarkerImage: {
    backgroundColor: semanticColors['surface-muted'],
    borderColor: semanticColors.surface,
    borderRadius: radiusPixels.md,
    borderWidth: 1,
    height: 38,
    width: 38,
  },
  mapImageMarkerImageSelected: {
    borderColor: semanticColors.primary,
    borderWidth: 1.5,
  },
  mapImageMarkerSelected: {
    height: 42,
    width: 42,
  },
  mapImageMultiBadge: {
    alignItems: 'center',
    backgroundColor: semanticColors['primary-soft'],
    borderColor: semanticColors.primary,
    borderRadius: radiusPixels.full,
    borderWidth: 1,
    height: 16,
    justifyContent: 'center',
    position: 'absolute',
    right: 1,
    top: 1,
    minWidth: 16,
    paddingHorizontal: 3,
  },
  mapImageMultiBadgeText: {
    color: semanticColors.primary,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
  mapImageNearbyBadge: {
    backgroundColor: semanticColors.primary,
    borderColor: semanticColors.surface,
    height: 18,
    minWidth: 26,
    right: -3,
    top: -3,
  },
  mapImageNearbyBadgeText: {
    color: semanticColors.surface,
    fontSize: 9,
    lineHeight: 11,
  },
  mapTextClusterMarker: {
    height: 30,
    width: 30,
  },
  mapTextClusterMarkerText: {
    color: semanticColors.surface,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 14,
  },
  mapTextMarker: {
    alignItems: 'center',
    backgroundColor: semanticColors.primary,
    borderColor: semanticColors.surface,
    borderRadius: radiusPixels.full,
    borderWidth: 2,
    height: 16,
    justifyContent: 'center',
    shadowColor: semanticColors.foreground,
    shadowOffset: {
      height: 1,
      width: 0,
    },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    width: 16,
  },
  mapTextMarkerExpanded: {
    opacity: 0.74,
  },
  mapTextMarkerSelected: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.primary,
    borderWidth: 3,
    height: 22,
    width: 22,
  },
  mapSummary: {
    alignItems: 'center',
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.border,
    borderRadius: radiusPixels.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacingPixels['3'],
    justifyContent: 'space-between',
    paddingLeft: spacingPixels['3'],
    paddingRight: spacingPixels['3'],
    paddingVertical: spacingPixels['2.5'],
  },
  mapSummaryMain: {
    flex: 1,
    minWidth: 0,
  },
  mapSummaryMetricRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingPixels['1'],
    marginTop: spacingPixels['1'],
  },
  mapAttribution: {
    bottom: textCardHeight + spacingPixels['5'],
    left: spacingPixels['3'],
    opacity: 0.62,
    position: 'absolute',
    zIndex: 2,
  },
  mapAttributionText: {
    color: semanticColors['text-quaternary'],
    fontSize: 8,
    fontWeight: '500',
    lineHeight: 9,
  },
  mapTopPanel: {
    elevation: 6,
    gap: spacingPixels['2'],
    left: spacingPixels['3'],
    position: 'absolute',
    right: spacingPixels['3'],
    top: spacingPixels['3'],
    zIndex: 2,
  },
  rangeHeaderButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: radiusPixels.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacingPixels['1'],
    height: spacingPixels['8'],
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: spacingPixels['2'],
  },
  rangeHeaderButtonActive: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  rangeMenu: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.border,
    borderRadius: radiusPixels.xl,
    borderWidth: 1,
    elevation: 9,
    gap: spacingPixels['1'],
    position: 'absolute',
    right: spacingPixels['4'],
    top: spacingPixels['12'] + spacingPixels['1'],
    padding: spacingPixels['1'],
    shadowColor: semanticColors.foreground,
    shadowOffset: {
      height: 8,
      width: 0,
    },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    zIndex: 8,
  },
  rangeMenuButton: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radiusPixels.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: spacingPixels['10'],
    minWidth: 96,
    paddingHorizontal: spacingPixels['3'],
  },
  rangeMenuButtonSelected: {
    backgroundColor: semanticColors['primary-soft'],
    borderColor: semanticColors.primary,
  },
  recenterButton: {
    alignItems: 'center',
    backgroundColor: semanticColors['primary-soft'],
    borderColor: semanticColors.primary,
    borderRadius: radiusPixels.full,
    borderWidth: 1,
    height: spacingPixels['10'],
    justifyContent: 'center',
    width: spacingPixels['10'],
  },
  textCard: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.border,
    borderRadius: radiusPixels.lg,
    borderWidth: 1,
    elevation: 1,
    height: textCardHeight,
    overflow: 'hidden',
    shadowColor: semanticColors.foreground,
    shadowOffset: {
      height: 2,
      width: 0,
    },
    shadowOpacity: 0.035,
    shadowRadius: 5,
    width: '100%',
  },
  textCardSelected: {
    borderColor: semanticColors.primary,
    shadowOpacity: 0.05,
  },
  textCardInner: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacingPixels['3.5'],
    minWidth: 0,
    paddingHorizontal: textCardHorizontalPadding,
    paddingVertical: textCardVerticalPadding,
    width: '100%',
  },
  textCardMediaSlot: {
    flexShrink: 0,
    height: textCardImageSize,
    width: textCardImageSize,
  },
  textCardImage: {
    backgroundColor: semanticColors['surface-muted'],
    borderRadius: radiusPixels.md,
    height: textCardImageSize,
    width: textCardImageSize,
  },
  textCardMurmurText: {
    color: semanticColors['text-secondary'],
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacingPixels['1.5'],
    overflow: 'hidden',
  },
  textCardTextColumn: {
    flex: 1,
    flexShrink: 1,
    height: textCardImageSize,
    justifyContent: 'center',
    minHeight: textCardImageSize,
    minWidth: 0,
    overflow: 'hidden',
  },
  textCarouselList: {
    alignSelf: 'center',
    height: textCardHeight,
    overflow: 'visible',
  },
  textCarouselListContent: {
    alignItems: 'center',
  },
  textCarouselPage: {
    justifyContent: 'center',
    paddingHorizontal: textCarouselItemGap / 2,
    width: '100%',
  },
  textCardTray: {
    bottom: spacingPixels['4'],
    elevation: 0,
    left: 0,
    overflow: 'visible',
    position: 'absolute',
    right: 0,
    width: '100%',
    zIndex: 3,
  },
  statusCard: {
    borderRadius: radiusPixels['2xl'],
    maxWidth: 320,
  },
  overlayHeaderRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacingPixels['2'],
    justifyContent: 'space-between',
  },
  overlayMetaText: {
    color: semanticColors['text-tertiary'],
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  overlayTitle: {
    color: semanticColors.foreground,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  textClusterSheet: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.border,
    borderRadius: radiusPixels.lg,
    borderWidth: 1,
    bottom: spacingPixels['4'],
    elevation: 7,
    left: spacingPixels['4'],
    maxHeight: 220,
    paddingHorizontal: spacingPixels['3'],
    paddingVertical: spacingPixels['2.5'],
    position: 'absolute',
    right: spacingPixels['4'],
    shadowColor: semanticColors.foreground,
    shadowOffset: {
      height: 4,
      width: 0,
    },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    zIndex: 5,
  },
  textClusterSheetItem: {
    borderColor: semanticColors.border,
    borderRadius: radiusPixels.md,
    borderWidth: 1,
    paddingHorizontal: spacingPixels['3'],
    paddingVertical: spacingPixels['2'],
  },
  textClusterSheetList: {
    gap: spacingPixels['2'],
    paddingTop: spacingPixels['2'],
  },
  textClusterSheetText: {
    color: semanticColors.foreground,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: spacingPixels['1'],
  },
})
