import { useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'
import type { ImageBlock } from '@journal/core'
import { spacingPixels } from '@journal/theme'
import { formatCompactDate, type PhotoMapImageObservation, type PhotoMapRange, type PhotoMapTextObservation } from './photoMapData'
import type { PhotoMapFocusMotion } from './photoMapInteraction'

export type PhotoMapImageGalleryPreviewHandler = (
  images: readonly ImageBlock[],
  initialIndex?: number,
  options?: {
    onBeforeClose?: () => void
  },
) => void

export type PhotoMapMarkerOffset = [x: number, y: number]
export type PhotoMapRangeOption = {
  label: string
  value: PhotoMapRange
}

export const routeSourceId = 'journal-photo-map-murmur-route'
export const openFreeMapStyleUrl = 'https://tiles.openfreemap.org/styles/positron'
export const rangeOptions: PhotoMapRangeOption[] = [
  { label: '1周', value: '7d' },
  { label: '2周', value: '14d' },
  { label: '1月', value: '30d' },
  { label: '全部', value: 'all' },
]
export const textCardHeight = 112
export const textCardHorizontalPadding = spacingPixels['5']
export const textCardVerticalPadding = spacingPixels['3']
export const textCardImageSize = 72
export const textCarouselSideInset = spacingPixels['4']
export const textCarouselPeekWidth = spacingPixels['3']
export const textCarouselItemGap = spacingPixels['2']
export const imageClusterMarkerOffset: PhotoMapMarkerOffset = [30, -30]
export const textClusterMarkerOffset: PhotoMapMarkerOffset = [0, 0]
export const expandedImageMarkerRadiusPixels = 68
export const expandedTextMarkerRadiusPixels = 52
export const overlayMapPressGuardMs = 650
export const pendingMapPressClearDelayMs = 180
export const textCardTapMaxDurationMs = 360

export function usePhotoMapEnterProgress(
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

export function getPhotoMapScaleInStyle(
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

export function addPhotoMapMarkerOffsets(
  firstOffset: PhotoMapMarkerOffset,
  secondOffset: PhotoMapMarkerOffset,
): PhotoMapMarkerOffset {
  return [
    firstOffset[0] + secondOffset[0],
    firstOffset[1] + secondOffset[1],
  ]
}

export function getPhotoMapSlideUpStyle(progress: Animated.Value, fromOffset: number) {
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

export function getPhotoMapCardMurmurText(observation: PhotoMapTextObservation) {
  return observation.body.trim() || '这条碎碎念还没有文字。'
}

export function getPhotoMapImageTitle(observation: PhotoMapImageObservation) {
  return observation.image.caption?.trim() || observation.body.trim() || formatCompactDate(observation.date)
}

export function getPhotoMapTextPreviewTitle(observation: PhotoMapTextObservation) {
  const firstImage = observation.murmur.images[0]

  return firstImage?.caption?.trim() || getPhotoMapCardMurmurText(observation)
}

export function formatPhotoMapCountBadge(count: number) {
  return count > 9 ? '9+' : String(count)
}

export function formatTextCardDate(dateKey: string) {
  const [, month, day] = dateKey.split('-')

  if (!month || !day) {
    return dateKey
  }

  return `${Number(month)}/${Number(day)}`
}

export function clampIndex(index: number, length: number) {
  if (length <= 0) {
    return 0
  }

  return Math.min(Math.max(index, 0), length - 1)
}

export function getRangeLabel(range: PhotoMapRange) {
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

export function getRangeShortLabel(range: PhotoMapRange) {
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
