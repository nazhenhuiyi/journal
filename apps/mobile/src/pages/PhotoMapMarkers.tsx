import { Animated, Image as NativeImage, Text, View, type NativeSyntheticEvent } from 'react-native'
import { Marker, type MarkerEvent } from '@maplibre/maplibre-react-native'
import type { ImageBlock } from '@journal/core'
import { useJournalImageThumbnailUri } from '../services/mobileImageThumbnails'
import {
  type PhotoMapImageCluster,
  type PhotoMapTextCluster,
  type PhotoMapTextObservation,
} from './photoMapData'
import type { PhotoMapFocusMotion } from './photoMapInteraction'
import { getExpandedPhotoMapMarkerOffset } from './photoMapViewModel'
import {
  addPhotoMapMarkerOffsets,
  expandedImageMarkerRadiusPixels,
  expandedTextMarkerRadiusPixels,
  formatPhotoMapCountBadge,
  getPhotoMapCardMurmurText,
  getPhotoMapImageTitle,
  getPhotoMapScaleInStyle,
  imageClusterMarkerOffset,
  textClusterMarkerOffset,
  usePhotoMapEnterProgress,
} from './photoMapPresentation'
import { usePhotoMapStyles } from './photoMapStyles'

type PhotoMapMarkerPressEvent = NativeSyntheticEvent<MarkerEvent>

function handlePhotoMapMarkerPress(event: PhotoMapMarkerPressEvent, action: () => void) {
  event.stopPropagation()
  action()
}

export function PhotoMapTextClusterMarker({
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
  const styles = usePhotoMapStyles()
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
          isCluster && (isExpanded || isSelected) ? styles.mapTextClusterMarkerSelected : null,
          !isCluster && isSelected ? styles.mapTextMarkerSelected : null,
        ]}
      >
        {isCluster ? (
          <Text style={[
            styles.mapTextClusterMarkerText,
            isExpanded || isSelected ? styles.mapTextClusterMarkerTextSelected : null,
          ]}>
            {markerText}
          </Text>
        ) : null}
      </View>
    </Marker>
  )
}

export function PhotoMapImageClusterMarker({
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
  const styles = usePhotoMapStyles()
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

export function PhotoMapExpandedImageMarkers({
  activationKey,
  cluster,
  motion,
  onPreviewClusterImageGallery,
}: {
  activationKey: string
  cluster: PhotoMapImageCluster
  motion: PhotoMapFocusMotion
  onPreviewClusterImageGallery: (
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
          onPress={() => onPreviewClusterImageGallery(cluster, images, index)}
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
  markerOffset: [x: number, y: number]
  motion: PhotoMapFocusMotion
  originOffset: [x: number, y: number]
  onPress: () => void
  title: string
}) {
  const styles = usePhotoMapStyles()
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

export function PhotoMapExpandedTextMarkers({
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
  markerOffset: [x: number, y: number]
  motion: PhotoMapFocusMotion
  originOffset: [x: number, y: number]
  onSelect: (observation: PhotoMapTextObservation) => void
}) {
  const styles = usePhotoMapStyles()
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
