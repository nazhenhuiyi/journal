import { useRef } from 'react'
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image as NativeImage,
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { ImageBlock } from '@journal/core'
import { semanticColors } from '@journal/theme'
import { useJournalImageThumbnailUri } from '../services/mobileImageThumbnails'
import {
  formatCompactDate,
  type PhotoMapImageCluster,
  type PhotoMapRange,
  type PhotoMapTextCluster,
  type PhotoMapTextObservation,
} from './photoMapData'
import type { PhotoMapFocusMotion } from './photoMapInteraction'
import {
  formatTextCardDate,
  getPhotoMapCardMurmurText,
  getPhotoMapImageTitle,
  getPhotoMapSlideUpStyle,
  getPhotoMapTextPreviewTitle,
  getRangeLabel,
  getRangeShortLabel,
  rangeOptions,
  textCardTapMaxDurationMs,
  usePhotoMapEnterProgress,
} from './photoMapPresentation'
import { photoMapStyles as styles } from './photoMapStyles'

export function PhotoMapSummaryCard({
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

export function PhotoMapRangeButton({
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

export function PhotoMapRangeMenu({
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

export function PhotoMapImageClusterTray({
  activationKey,
  cluster,
  motion,
  onGuardMapPress,
  onPreviewClusterImageGallery,
}: {
  activationKey: string
  cluster: PhotoMapImageCluster
  motion: PhotoMapFocusMotion
  onGuardMapPress: () => void
  onPreviewClusterImageGallery: (
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
    <Animated.View
      onTouchStart={(event) => {
        event.stopPropagation()
        onGuardMapPress()
      }}
      style={[
        styles.imageClusterTray,
        getPhotoMapSlideUpStyle(progress, 18),
      ]}
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
            onPress={() => onPreviewClusterImageGallery(cluster, images, index)}
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

export function PhotoMapTextClusterSheet({
  activationKey,
  cluster,
  motion,
  onGuardMapPress,
  onPressDayItem,
}: {
  activationKey: string
  cluster: PhotoMapTextCluster
  motion: PhotoMapFocusMotion
  onGuardMapPress: () => void
  onPressDayItem: (event: GestureResponderEvent, date: string) => void
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
            onPress={(event) => onPressDayItem(event, item.date)}
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

export function PhotoMapTextCard({
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
            onPlaceholderPress={openDayIfTap}
            onPlaceholderPressIn={handleCardPressIn}
            onPlaceholderTouchMove={handleCardTouchMove}
            observation={observation}
            onPreviewImageGallery={onPreviewImageGallery}
            onPreviewImage={onPreviewImage}
          />
        </View>
        <View style={styles.textCardTextColumn}>
          <Pressable
            accessibilityLabel={`打开${formatCompactDate(observation.date)}的日记`}
            accessibilityRole="button"
            onPress={openDayIfTap}
            onPressIn={handleCardPressIn}
            onTouchMove={handleCardTouchMove}
            style={styles.textCardPressLayer}
          />
          <View pointerEvents="box-none" style={styles.textCardTextContent}>
            <View pointerEvents="box-none" style={styles.cardMetaRow}>
              <View pointerEvents="none" style={styles.cardDateContent}>
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
            <Text
              ellipsizeMode="tail"
              numberOfLines={2}
              pointerEvents="none"
              style={styles.textCardMurmurText}
            >
              {murmurText}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

function MurmurPreviewImage({
  onPlaceholderPress,
  onPlaceholderPressIn,
  onPlaceholderTouchMove,
  observation,
  onPreviewImageGallery,
  onPreviewImage,
}: {
  onPlaceholderPress?: () => void
  onPlaceholderPressIn?: (event: GestureResponderEvent) => void
  onPlaceholderTouchMove?: (event: GestureResponderEvent) => void
  observation: PhotoMapTextObservation
  onPreviewImageGallery: (images: readonly ImageBlock[], initialIndex?: number) => void
  onPreviewImage: (image: ImageBlock) => void
}) {
  const images = observation.murmur.images
  const firstImage = images[0]

  if (!firstImage) {
    const placeholder = (
      <View pointerEvents="none" style={[styles.textCardImage, styles.emptyMurmurImage]}>
        <View style={styles.emptyMurmurIconBubble}>
          <Ionicons color={semanticColors.primary} name="chatbubble-ellipses-outline" size={20} />
        </View>
        <View style={styles.emptyMurmurLineLong} />
        <View style={styles.emptyMurmurLineShort} />
      </View>
    )

    if (!onPlaceholderPress) {
      return placeholder
    }

    return (
      <Pressable
        accessibilityLabel={`打开${formatCompactDate(observation.date)}的日记`}
        accessibilityRole="button"
        onPress={onPlaceholderPress}
        onPressIn={onPlaceholderPressIn}
        onTouchMove={onPlaceholderTouchMove}
        style={({ pressed }) => ({
          opacity: pressed ? 0.82 : 1,
        })}
      >
        {placeholder}
      </Pressable>
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
      onPressIn={(event) => {
        event.stopPropagation()
      }}
      onTouchStart={(event) => {
        event.stopPropagation()
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

export function PhotoMapStatus({
  icon,
  message,
  title,
  variant = 'default',
}: {
  icon: keyof typeof Ionicons.glyphMap
  message: string
  title: string
  variant?: 'default' | 'loading'
}) {
  return (
    <View className="flex-1 items-center justify-center">
      <View
        className="items-center border border-border bg-surface px-5 py-5"
        style={styles.statusCard}
      >
        {variant === 'loading' ? (
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
