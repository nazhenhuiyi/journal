import { useEffect, useRef, useState } from 'react'
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  type CameraRef,
} from '@maplibre/maplibre-react-native'
import type { ImageBlock, MurmurBlock } from '@journal/core'
import { semanticColors } from '@journal/theme'
import {
  listDailyJournals,
  type MobileJournalRecord,
} from '../services/mobileJournalStore'
import { PageShell } from './PageShell'
import {
  defaultPhotoMapRange,
  type PhotoMapRange,
  type PhotoMapTextObservation,
} from './photoMapData'
import {
  browsePhotoMapInteraction,
  clearPhotoMapInteraction,
  reconcilePhotoMapInteraction,
  type PhotoMapInteractionState,
  type PhotoMapSessionSnapshot,
} from './photoMapInteraction'
import {
  PhotoMapExpandedImageMarkers,
  PhotoMapExpandedTextMarkers,
  PhotoMapImageClusterMarker,
  PhotoMapTextClusterMarker,
} from './PhotoMapMarkers'
import {
  PhotoMapImageClusterTray,
  PhotoMapRangeButton,
  PhotoMapRangeMenu,
  PhotoMapStatus,
  PhotoMapSummaryCard,
  PhotoMapTextCard,
  PhotoMapTextClusterSheet,
} from './PhotoMapOverlays'
import {
  type PhotoMapImageGalleryPreviewHandler,
  getRangeLabel,
  openFreeMapStyleUrl,
  routeSourceId,
  textCarouselPeekWidth,
  textCarouselSideInset,
} from './photoMapPresentation'
import { photoMapStyles as styles } from './photoMapStyles'
import { usePhotoMapRuntime } from './usePhotoMapRuntime'
import { moveCameraToInitialView } from './photoMapCamera'
import { usePhotoMapInteractions } from './usePhotoMapInteractions'
import { isPhotoMapTextClusterSelected } from './photoMapViewModel'

type PhotoMapPageProps = {
  currentMurmurs: MurmurBlock[]
  onBack: () => void
  onOpenDay: (date: string) => void
  onPreviewImage: (image: ImageBlock) => void
  onPreviewImageGallery: PhotoMapImageGalleryPreviewHandler
  onSessionSnapshotChange: (snapshot: PhotoMapSessionSnapshot | null) => void
  sessionSnapshot: PhotoMapSessionSnapshot | null
  today: string
}

export function PhotoMapPage({
  currentMurmurs,
  onBack,
  onOpenDay,
  onPreviewImage,
  onPreviewImageGallery,
  onSessionSnapshotChange,
  sessionSnapshot,
  today,
}: PhotoMapPageProps) {
  const cameraRef = useRef<CameraRef>(null)
  const appliedInitialCameraKeyRef = useRef<string | null>(null)
  const textCarouselListRef = useRef<FlatList<PhotoMapTextObservation>>(null)
  const restoredSessionRef = useRef(sessionSnapshot)
  const restoredSession = restoredSessionRef.current
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
  const {
    activeImageCluster,
    activeTextCluster,
    imageClusterIds,
    focusedTextObservation,
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
    visibleImageClusters,
    visibleTextClusters,
  } = usePhotoMapRuntime({
    currentMurmurs,
    interaction,
    mapFrameWidth,
    mapReadyGeneration,
    range,
    records,
    selectedTextId,
    today,
  })
  const {
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
  } = usePhotoMapInteractions({
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
  })

  useEffect(() => {
    onSessionSnapshotChange({
      interaction,
      range,
      selectedTextId,
    })
  }, [interaction, onSessionSnapshotChange, range, selectedTextId])

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
    if (mapReadyGeneration === 0 || mappableObservationCount === 0) {
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
  }, [initialCamera, initialCameraKey, interaction.kind, mapReadyGeneration, mappableObservationCount])

  useEffect(() => {
    if (mappableObservationCount === 0) {
      setMapReadyGeneration(0)
    }
  }, [mappableObservationCount])

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

  function handleMapFrameLayout(event: LayoutChangeEvent) {
    const nextWidth = Math.round(event.nativeEvent.layout.width)

    setMapFrameWidth((previousWidth) => (
      previousWidth === nextWidth ? previousWidth : nextWidth
    ))
  }

  function handleBack() {
    onSessionSnapshotChange(null)
    onBack()
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
            variant="loading"
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

        {!isLoading && !didLoadFail && murmurSlices.length > 0 && mappableObservationCount === 0 ? (
          <PhotoMapStatus
            icon="location-outline"
            message={`${murmurSlices.length} 条内容还没有经纬度。`}
            title="还没有带定位的内容"
          />
        ) : null}

        {!isLoading && !didLoadFail && mappableObservationCount > 0 ? (
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
                    'line-opacity': 0.48,
                    'line-width': 3,
                  }}
                  type="line"
                />
                <Layer
                  id="photo-map-murmur-route"
                  paint={{
                    'line-color': semanticColors.primary,
                    'line-opacity': 0.16,
                    'line-width': 1.5,
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
                  isSelected={isPhotoMapTextClusterSelected(cluster, focusedTextObservation?.id)}
                  key={cluster.id}
                  onSelect={selectTextClusterFromMarker}
                />
              ))}
              {activeImageCluster ? (
                <PhotoMapExpandedImageMarkers
                  activationKey={interactionFocus.imageActivationKey}
                  cluster={activeImageCluster}
                  motion={interactionFocus.imageMotion}
                  onPreviewClusterImageGallery={previewImageGalleryFromImageGroupOverlay}
                />
              ) : null}
              {activeTextCluster ? (
                <PhotoMapExpandedTextMarkers
                  activationKey={interactionFocus.textActivationKey}
                  cluster={activeTextCluster}
                  motion={interactionFocus.textMotion}
                  onSelect={(observation) => selectTextObservationInsideCluster(activeTextCluster, observation)}
                  selectedTextId={focusedTextObservation?.id}
                />
              ) : null}
            </MapLibreMap>

            <View style={styles.mapTopPanel}>
              <PhotoMapSummaryCard
                imageCount={totalImageCount}
                murmurCount={murmurCount}
                onRecenter={recenterToInitialMapContent}
                range={range}
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
                onPreviewClusterImageGallery={previewImageGalleryFromImageGroupOverlay}
              />
            ) : null}

            {isTextClusterSheetVisible && activeTextCluster ? (
              <PhotoMapTextClusterSheet
                activationKey={interactionFocus.textActivationKey}
                cluster={activeTextCluster}
                onGuardMapPress={guardOverlayMapPress}
                motion={interactionFocus.textMotion}
                onPressDayItem={openDayFromTextClusterSheet}
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
                        isSelected={observation.id === focusedTextObservation?.id}
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
