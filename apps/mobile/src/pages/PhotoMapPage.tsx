import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image as NativeImage,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native'
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
  type CameraRef,
  type FilterSpecification,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native'
import type { FeatureCollection, Point } from 'geojson'
import { Ionicons } from '@expo/vector-icons'
import type { ImageBlock, MurmurBlock } from '@journal/core'
import { radiusPixels, semanticColors, spacingPixels } from '@journal/theme'
import {
  listDailyJournals,
  resolveJournalMediaFileUri,
  type MobileJournalRecord,
} from '../services/mobileJournalStore'
import { PageShell } from './PageShell'
import {
  createMurmurPointFeatureCollection,
  createMurmurRouteFeatureCollection,
  createPhotoMapEntries,
  defaultPhotoMapRange,
  formatCompactDate,
  getMappablePhotoMapEntries,
  getPhotoMapEntryCameraCoordinates,
  getPhotoMapInitialCamera,
  type PhotoMapEntry,
  type PhotoMapInitialCamera,
  type PhotoMapPointProperties,
  type PhotoMapRange,
} from './photoMapData'

type PhotoMapPageProps = {
  currentMurmurs: MurmurBlock[]
  onBack: () => void
  onOpenDay: (date: string) => void
  onPreviewImage: (image: ImageBlock) => void
  onPreviewImageGallery: (images: readonly ImageBlock[], initialIndex?: number) => void
  today: string
}

type PhotoMapRangeOption = {
  label: string
  value: PhotoMapRange
}

type PhotoMapMurmurEntry = Extract<PhotoMapEntry, { kind: 'murmur' }>

type PhotoMapGroupMarkerEntry = PhotoMapMurmurEntry & {
  markerCoordinates: [longitude: number, latitude: number]
  markerImage: ImageBlock
}

const pointSourceId = 'journal-photo-map-points'
const routeSourceId = 'journal-photo-map-murmur-route'
const openFreeMapStyleUrl = 'https://tiles.openfreemap.org/styles/positron'
const murmurPointFilter = ['==', ['get', 'kind'], 'murmur'] as FilterSpecification
const textOnlyMurmurPointFilter = [
  'all',
  ['==', ['get', 'kind'], 'murmur'],
  ['==', ['get', 'imageCount'], 0],
] as FilterSpecification
const rangeOptions: PhotoMapRangeOption[] = [
  { label: '1周', value: '7d' },
  { label: '2周', value: '14d' },
  { label: '1月', value: '30d' },
  { label: '全部', value: 'all' },
]
const specimenCardHeight = 112
const specimenCardHorizontalPadding = spacingPixels['5']
const specimenCardVerticalPadding = spacingPixels['3']
const specimenImageSize = 72
const specimenCarouselSideInset = spacingPixels['4']
const specimenCarouselPeekWidth = spacingPixels['3']
const specimenCarouselItemGap = spacingPixels['2']
const maxImageMarkerCount = 80

export function PhotoMapPage({
  currentMurmurs,
  onBack,
  onOpenDay,
  onPreviewImage,
  onPreviewImageGallery,
  today,
}: PhotoMapPageProps) {
  const cameraRef = useRef<CameraRef>(null)
  const specimenListRef = useRef<FlatList<PhotoMapMurmurEntry>>(null)
  const viewport = useWindowDimensions()
  const [records, setRecords] = useState<MobileJournalRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [didLoadFail, setDidLoadFail] = useState(false)
  const [range, setRange] = useState<PhotoMapRange>(defaultPhotoMapRange)
  const [isRangeMenuOpen, setIsRangeMenuOpen] = useState(false)
  const [isMapReady, setIsMapReady] = useState(false)
  const [mapFrameWidth, setMapFrameWidth] = useState(0)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const entries = useMemo(() => createPhotoMapEntries(records, {
    date: today,
    murmurs: currentMurmurs,
  }, range), [currentMurmurs, range, records, today])
  const entryIds = useMemo(() => entries.map((entry) => entry.id).join('|'), [entries])
  const mappableEntries = useMemo(() => getMappablePhotoMapEntries(entries), [entries])
  const selectedEntry = useMemo(() => (
    entries.find((entry) => entry.id === selectedEntryId) ?? getDefaultSelectedEntry(entries)
  ), [entries, selectedEntryId])
  const pointFeatures = useMemo<FeatureCollection<Point, PhotoMapPointProperties>>(
    () => createMurmurPointFeatureCollection(entries) as FeatureCollection<Point, PhotoMapPointProperties>,
    [entries],
  )
  const routeFeatures = useMemo(() => createMurmurRouteFeatureCollection(entries), [entries])
  const initialCamera = useMemo(() => getPhotoMapInitialCamera(entries), [entries])
  const murmurCount = useMemo(() => entries.filter((entry) => entry.kind === 'murmur').length, [entries])
  const imageCount = useMemo(() => entries.filter((entry) => entry.kind === 'image').length, [entries])
  const unlocatedCount = entries.length - mappableEntries.length
  const specimenCardEntries = useMemo(() => entries.filter(shouldShowEntryAsSpecimenCard), [entries])
  const selectedSpecimenEntry = selectedEntry && shouldShowEntryAsSpecimenCard(selectedEntry)
    ? selectedEntry
    : null
  const specimenEntries = specimenCardEntries
  const specimenCarouselWidth = Math.max(1, mapFrameWidth || viewport.width - spacingPixels['6'])
  const specimenCarouselItemWidth = Math.max(
    260,
    specimenCarouselWidth - specimenCarouselSideInset * 2 - specimenCarouselPeekWidth,
  )
  const imageMarkerEntries = useMemo(() => getPhotoMapGroupMarkerEntries(entries), [entries])
  const visibleImageMarkerEntries = useMemo(
    () => limitPhotoMapImageMarkers(imageMarkerEntries, selectedEntry?.id),
    [imageMarkerEntries, selectedEntry?.id],
  )

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
    if (entries.length === 0) {
      setSelectedEntryId(null)
      return
    }

    setSelectedEntryId((previousEntryId) => (
      previousEntryId && entries.some((entry) => entry.id === previousEntryId)
        ? previousEntryId
        : getDefaultSelectedEntry(entries)?.id ?? null
    ))
  }, [entries, entryIds])

  useEffect(() => {
    if (!isMapReady || mappableEntries.length === 0) {
      return
    }

    moveCameraToInitialView(cameraRef, initialCamera)
  }, [entryIds, initialCamera, isMapReady, mappableEntries.length, range])

  useEffect(() => {
    if (mappableEntries.length === 0) {
      setIsMapReady(false)
    }
  }, [mappableEntries.length])

  function selectEntry(entry: PhotoMapEntry) {
    setIsRangeMenuOpen(false)
    setSelectedEntryId(entry.id)
    showSpecimenCard(entry)

    moveCameraToEntry(entry)
  }

  function selectPagerEntry(entry: PhotoMapEntry) {
    setIsRangeMenuOpen(false)
    setSelectedEntryId(entry.id)
    moveCameraToEntry(entry)
  }

  function moveCameraToEntry(entry: PhotoMapEntry) {
    const coordinates = getPhotoMapGroupCameraCoordinates(entry)

    if (coordinates) {
      cameraRef.current?.easeTo({
        center: coordinates,
        duration: 420,
        zoom: entry.kind === 'murmur' ? 12.2 : 13,
      })
    }
  }

  function showSpecimenCard(entry: PhotoMapEntry) {
    if (!shouldShowEntryAsSpecimenCard(entry)) {
      return
    }

    const entryIndex = specimenCardEntries.findIndex((candidate) => candidate.id === entry.id)

    if (entryIndex < 0) {
      return
    }

    specimenListRef.current?.scrollToOffset({
      animated: true,
      offset: entryIndex * specimenCarouselItemWidth,
    })
  }

  function handleSpecimenSnapToItem(index: number) {
    const entry = specimenEntries[index]

    if (entry) {
      selectPagerEntry(entry)
    }
  }

  function handleSpecimenMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = clampIndex(
      Math.round(event.nativeEvent.contentOffset.x / specimenCarouselItemWidth),
      specimenEntries.length,
    )

    handleSpecimenSnapToItem(nextIndex)
  }

  function handleMapFrameLayout(event: LayoutChangeEvent) {
    const nextWidth = Math.round(event.nativeEvent.layout.width)

    setMapFrameWidth((previousWidth) => (
      previousWidth === nextWidth ? previousWidth : nextWidth
    ))
  }

  function handleSourcePress(event: NativeSyntheticEvent<PressEventWithFeatures>) {
    const feature = event.nativeEvent.features[0]

    if (!feature) {
      return
    }

    const entryId = getStringProperty(feature, 'entryId')
    const entry = entryId ? entries.find((candidate) => candidate.id === entryId) : null

    if (entry) {
      selectEntry(entry)
    }
  }

  function handleRangeChange(nextRange: PhotoMapRange) {
    setRange(nextRange)
    setIsRangeMenuOpen(false)
  }

  function recenterToFirstEntry() {
    const firstEntry = specimenCardEntries[0] ?? null

    if (!firstEntry) {
      return
    }

    setIsRangeMenuOpen(false)
    selectEntry(firstEntry)
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
      onBack={onBack}
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

        {!isLoading && !didLoadFail && entries.length === 0 ? (
          <PhotoMapStatus
            icon="chatbubble-ellipses-outline"
            message={`这个${getRangeLabel(range)}还没有碎碎念。`}
            title="还没有可浏览的碎碎念"
          />
        ) : null}

        {!isLoading && !didLoadFail && entries.length > 0 && mappableEntries.length === 0 ? (
          <PhotoMapStatus
            icon="location-outline"
            message={`${entries.length} 条内容还没有经纬度。`}
            title="还没有带定位的内容"
          />
        ) : null}

        {!isLoading && !didLoadFail && mappableEntries.length > 0 ? (
          <View onLayout={handleMapFrameLayout} style={styles.mapFrame}>
            <MapLibreMap
              attribution={false}
              compass={false}
              logo={false}
              mapStyle={openFreeMapStyleUrl}
              onDidFinishLoadingMap={() => setIsMapReady(true)}
              scaleBar={false}
              style={StyleSheet.absoluteFill}
            >
              <Camera
                initialViewState={initialCamera}
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
              <GeoJSONSource
                data={pointFeatures}
                id={pointSourceId}
                onPress={handleSourcePress}
              >
                <Layer
                  filter={murmurPointFilter}
                  id="photo-map-murmur-shadow"
                  paint={{
                    'circle-color': semanticColors.foreground,
                    'circle-opacity': 0.13,
                    'circle-radius': 8,
                    'circle-translate': [0, 1],
                  }}
                  type="circle"
                />
                <Layer
                  filter={textOnlyMurmurPointFilter}
                  id="photo-map-murmur-text-only-ring"
                  paint={{
                    'circle-color': semanticColors['primary-soft'],
                    'circle-opacity': 0.78,
                    'circle-radius': 9,
                    'circle-stroke-color': semanticColors.primary,
                    'circle-stroke-opacity': 0.34,
                    'circle-stroke-width': 1,
                  }}
                  type="circle"
                />
                <Layer
                  filter={murmurPointFilter}
                  id="photo-map-murmur-point"
                  paint={{
                    'circle-color': semanticColors.primary,
                    'circle-radius': 4.6,
                    'circle-stroke-color': semanticColors.surface,
                    'circle-stroke-width': 2,
                  }}
                  type="circle"
                />
                <Layer
                  filter={getSelectedPointFilter('murmur', selectedEntry?.id)}
                  id="photo-map-murmur-selected"
                  paint={{
                    'circle-color': semanticColors.primary,
                    'circle-opacity': 0.96,
                    'circle-radius': 6.4,
                    'circle-stroke-color': semanticColors.surface,
                    'circle-stroke-width': 3,
                  }}
                  type="circle"
                />
              </GeoJSONSource>
              {visibleImageMarkerEntries.map((entry) => (
                <PhotoMapGroupImageMarker
                  entry={entry}
                  isSelected={entry.id === selectedEntry?.id}
                  key={entry.id}
                  onPreviewImageGallery={onPreviewImageGallery}
                  onPreviewImage={onPreviewImage}
                  onSelect={selectEntry}
                />
              ))}
            </MapLibreMap>

            <View style={styles.mapTopPanel}>
              <PhotoMapSummaryCard
                imageCount={imageCount}
                murmurCount={murmurCount}
                onRecenter={recenterToFirstEntry}
                range={range}
                unlocatedCount={unlocatedCount}
              />
            </View>

            <View pointerEvents="none" style={styles.mapAttribution}>
              <Text style={styles.mapAttributionText}>© OpenMapTiles · OpenStreetMap</Text>
            </View>

            <View pointerEvents="box-none" style={styles.specimenTray}>
              <FlatList
                contentContainerStyle={[
                  styles.specimenListContent,
                  {
                    paddingLeft: specimenCarouselSideInset,
                    paddingRight: specimenCarouselSideInset + specimenCarouselPeekWidth,
                  },
                ]}
                data={specimenEntries}
                decelerationRate="fast"
                disableIntervalMomentum
                getItemLayout={(_, index) => ({
                  index,
                  length: specimenCarouselItemWidth,
                  offset: specimenCarouselItemWidth * index,
                })}
                horizontal
                keyExtractor={(entry) => entry.id}
                onMomentumScrollEnd={handleSpecimenMomentumEnd}
                ref={specimenListRef}
                renderItem={({ item: entry }) => (
                  <View style={[styles.specimenPage, { width: specimenCarouselItemWidth }]}>
                    <PhotoMapEntryCard
                      entry={entry}
                      isSelected={entry.id === selectedSpecimenEntry?.id}
                      onOpenDay={onOpenDay}
                      onPreviewImageGallery={onPreviewImageGallery}
                      onPreviewImage={onPreviewImage}
                      onSelect={selectEntry}
                    />
                  </View>
                )}
                showsHorizontalScrollIndicator={false}
                snapToAlignment="start"
                snapToInterval={specimenCarouselItemWidth}
                style={[
                  styles.specimenList,
                  { width: specimenCarouselWidth },
                ]}
                testID="photo-map-specimen-carousel"
              />
            </View>
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

function PhotoMapEntryCard({
  entry,
  isSelected,
  onOpenDay,
  onPreviewImageGallery,
  onPreviewImage,
  onSelect,
}: {
  entry: PhotoMapMurmurEntry
  isSelected: boolean
  onOpenDay: (date: string) => void
  onPreviewImageGallery: (images: readonly ImageBlock[], initialIndex?: number) => void
  onPreviewImage: (image: ImageBlock) => void
  onSelect: (entry: PhotoMapEntry) => void
}) {
  const murmurText = getPhotoMapCardMurmurText(entry)
  const cardDate = formatSpecimenCardDate(entry.date)

  return (
    <View
      style={[
        styles.specimenCard,
        isSelected ? styles.specimenCardSelected : null,
      ]}
    >
      <View style={styles.specimenCardInner}>
        <View style={styles.specimenMediaSlot}>
          <MurmurPreviewImage
            entry={entry}
            onPreviewImageGallery={onPreviewImageGallery}
            onPreviewImage={onPreviewImage}
          />
        </View>
        <View style={styles.specimenTextColumn}>
          <Pressable
            accessibilityLabel={`打开${formatCompactDate(entry.date)}的日记`}
            accessibilityRole="button"
            onPress={() => onOpenDay(entry.date)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <View style={styles.cardMetaRow}>
              <Ionicons color={semanticColors['text-tertiary']} name="calendar-outline" size={13} />
              <Text className="text-xs font-semibold text-text-tertiary" numberOfLines={1} style={styles.cardMetaDate}>
                {cardDate}
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityLabel={`选择碎碎念：${murmurText}`}
            accessibilityRole="button"
            onPress={() => onSelect(entry)}
            style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
          >
            <Text numberOfLines={2} style={styles.specimenMurmurText}>
              {murmurText}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function PhotoMapGroupImageMarker({
  entry,
  isSelected,
  onPreviewImageGallery,
  onPreviewImage,
  onSelect,
}: {
  entry: PhotoMapGroupMarkerEntry
  isSelected: boolean
  onPreviewImageGallery: (images: readonly ImageBlock[], initialIndex?: number) => void
  onPreviewImage: (image: ImageBlock) => void
  onSelect: (entry: PhotoMapEntry) => void
}) {
  const title = getPhotoMapPreviewTitle(entry)
  const imageUri = resolveJournalMediaFileUri(entry.markerImage.src) ?? entry.markerImage.src

  if (!imageUri) {
    return null
  }

  return (
    <Marker
      anchor="center"
      id={`photo-map-image-marker-${entry.id}`}
      lngLat={entry.markerCoordinates}
      offset={[18, -18]}
      onPress={() => {
        onSelect(entry)
        setTimeout(() => {
          if (entry.images.length > 1) {
            onPreviewImageGallery(entry.images, 0)
            return
          }

          onPreviewImage(entry.markerImage)
        }, 0)
      }}
    >
      <View
        accessibilityLabel={`选择照片：${title}`}
        accessibilityRole="button"
        style={[
          styles.mapImageMarker,
          isSelected ? styles.mapImageMarkerSelected : null,
        ]}
      >
        <NativeImage
          accessibilityLabel={title}
          resizeMode="cover"
          source={{ uri: imageUri }}
          style={[
            styles.mapImageMarkerImage,
            isSelected ? styles.mapImageMarkerImageSelected : null,
          ]}
        />
        {entry.images.length > 1 ? (
          <View style={styles.mapImageMultiBadge}>
            <Text style={styles.mapImageMultiBadgeText}>{formatPhotoMapCountBadge(entry.images.length)}</Text>
          </View>
        ) : null}
      </View>
    </Marker>
  )
}

function MurmurPreviewImage({
  entry,
  onPreviewImageGallery,
  onPreviewImage,
}: {
  entry: Extract<PhotoMapEntry, { kind: 'murmur' }>
  onPreviewImageGallery: (images: readonly ImageBlock[], initialIndex?: number) => void
  onPreviewImage: (image: ImageBlock) => void
}) {
  const firstImage = entry.images[0]

  if (!firstImage) {
    return (
      <View style={[styles.specimenImage, styles.emptyMurmurImage]}>
        <View style={styles.emptyMurmurIconBubble}>
          <Ionicons color={semanticColors.primary} name="chatbubble-ellipses-outline" size={20} />
        </View>
        <View style={styles.emptyMurmurLineLong} />
        <View style={styles.emptyMurmurLineShort} />
      </View>
    )
  }

  return (
    <View>
      <PhotoPreviewButton
        galleryImages={entry.images}
        image={firstImage}
        onPreviewImageGallery={onPreviewImageGallery}
        onPreviewImage={onPreviewImage}
        title={getPhotoMapPreviewTitle(entry)}
      />
    </View>
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
  const imageUri = resolveJournalMediaFileUri(image.src) ?? image.src

  return (
    <Pressable
      accessibilityLabel={`查看大图：${title}`}
      accessibilityRole="button"
      onPress={() => {
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
        style={styles.specimenImage}
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

function getDefaultSelectedEntry(entries: readonly PhotoMapEntry[]) {
  return entries.find((entry) => entry.kind === 'murmur' && getPhotoMapGroupCameraCoordinates(entry)) ??
    entries.find((entry) => entry.coordinates) ??
    entries[0] ??
    null
}

function shouldShowEntryAsSpecimenCard(entry: PhotoMapEntry): entry is PhotoMapMurmurEntry {
  return entry.kind === 'murmur' && getPhotoMapGroupCameraCoordinates(entry) !== null
}

function getPhotoMapGroupMarkerEntries(entries: readonly PhotoMapEntry[]): PhotoMapGroupMarkerEntry[] {
  return entries.flatMap((entry) => {
    if (entry.kind !== 'murmur') {
      return []
    }

    const markerImage = entry.images[0]
    const markerCoordinates = getPhotoMapGroupCameraCoordinates(entry)

    if (!markerImage || !markerCoordinates) {
      return []
    }

    return [{
      ...entry,
      markerCoordinates,
      markerImage,
    }]
  })
}

function limitPhotoMapImageMarkers(
  entries: readonly PhotoMapGroupMarkerEntry[],
  selectedEntryId: string | undefined,
) {
  if (entries.length <= maxImageMarkerCount) {
    return entries
  }

  const limitedEntries = entries.slice(0, maxImageMarkerCount)

  if (!selectedEntryId || limitedEntries.some((entry) => entry.id === selectedEntryId)) {
    return limitedEntries
  }

  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId)

  return selectedEntry
    ? [selectedEntry, ...limitedEntries.slice(0, maxImageMarkerCount - 1)]
    : limitedEntries
}

function getPhotoMapGroupCameraCoordinates(entry: PhotoMapEntry) {
  if (entry.kind === 'image') {
    return getPhotoMapEntryCameraCoordinates(entry)
  }

  return entry.coordinates ?? entry.imageEntries.find((imageEntry) => imageEntry.coordinates)?.coordinates ?? null
}

function getPhotoMapCardMurmurText(entry: PhotoMapEntry) {
  const text = entry.body.trim()

  return text || '这条碎碎念还没有文字。'
}

function getPhotoMapPreviewTitle(entry: PhotoMapEntry) {
  if (entry.kind === 'image') {
    return entry.image.caption?.trim() || getPhotoMapCardMurmurText(entry)
  }

  const firstImage = entry.images[0]

  return firstImage?.caption?.trim() || getPhotoMapCardMurmurText(entry)
}

function formatPhotoMapCountBadge(count: number) {
  return count > 9 ? '9+' : String(count)
}

function formatSpecimenCardDate(dateKey: string) {
  const [, month, day] = dateKey.split('-')

  if (!month || !day) {
    return dateKey
  }

  return `${Number(month)}/${Number(day)}`
}

function getSelectedPointFilter(kind: PhotoMapEntry['kind'], selectedEntryId: string | undefined) {
  if (kind === 'murmur') {
    return [
      'all',
      ['!', ['has', 'point_count']],
      ['==', ['get', 'kind'], kind],
      ['==', ['get', 'entryId'], selectedEntryId ?? ''],
      ['==', ['get', 'imageCount'], 0],
    ] as FilterSpecification
  }

  return [
    'all',
    ['!', ['has', 'point_count']],
    ['==', ['get', 'kind'], kind],
    ['==', ['get', 'entryId'], selectedEntryId ?? ''],
  ] as FilterSpecification
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

function getStringProperty(feature: GeoJSON.Feature, key: string) {
  const value = feature.properties?.[key]

  return typeof value === 'string' ? value : null
}

const styles = StyleSheet.create({
  cardMetaDate: {
    flexShrink: 0,
  },
  cardMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacingPixels['1'],
    minHeight: 18,
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
    bottom: specimenCardHeight + spacingPixels['5'],
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
    flexDirection: 'row',
    gap: spacingPixels['1'],
    position: 'absolute',
    right: 0,
    top: 0,
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
    minHeight: spacingPixels['8'],
    minWidth: 44,
    paddingHorizontal: spacingPixels['2'],
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
  specimenCard: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.border,
    borderRadius: radiusPixels.lg,
    borderWidth: 1,
    elevation: 2,
    height: specimenCardHeight,
    overflow: 'hidden',
    shadowColor: semanticColors.foreground,
    shadowOffset: {
      height: 6,
      width: 0,
    },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    width: '100%',
  },
  specimenCardSelected: {
    borderColor: semanticColors.border,
    shadowOpacity: 0.12,
  },
  specimenCardInner: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacingPixels['3.5'],
    minWidth: 0,
    paddingHorizontal: specimenCardHorizontalPadding,
    paddingVertical: specimenCardVerticalPadding,
    width: '100%',
  },
  specimenMediaSlot: {
    flexShrink: 0,
    height: specimenImageSize,
    width: specimenImageSize,
  },
  specimenImage: {
    backgroundColor: semanticColors['surface-muted'],
    borderRadius: radiusPixels.md,
    height: specimenImageSize,
    width: specimenImageSize,
  },
  specimenMurmurText: {
    color: semanticColors.foreground,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: spacingPixels['1.5'],
    overflow: 'hidden',
  },
  specimenTextColumn: {
    flex: 1,
    flexShrink: 1,
    height: specimenImageSize,
    justifyContent: 'center',
    minHeight: specimenImageSize,
    minWidth: 0,
    overflow: 'hidden',
  },
  specimenList: {
    alignSelf: 'center',
    height: specimenCardHeight,
    overflow: 'visible',
  },
  specimenListContent: {
    alignItems: 'center',
  },
  specimenPage: {
    justifyContent: 'center',
    paddingHorizontal: specimenCarouselItemGap / 2,
    width: '100%',
  },
  specimenTray: {
    bottom: spacingPixels['4'],
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
})
