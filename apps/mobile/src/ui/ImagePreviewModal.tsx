import { useEffect, useRef, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import {
  Image as NativeImage,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { spacingPixels } from '@journal/theme'

export type ImagePreviewModalItem = {
  accessibilityLabel: string
  caption: string | null
  uri: string
}

type ImagePreviewModalProps = {
  initialIndex?: number
  items: readonly ImagePreviewModalItem[]
  onClose: () => void
}

export function ImagePreviewModal({
  initialIndex = 0,
  items = [],
  onClose,
}: ImagePreviewModalProps) {
  const { width } = useWindowDimensions()
  const scrollViewRef = useRef<ScrollView>(null)
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const clampedInitialIndex = clampIndex(initialIndex, items.length)
  const activeItem = items[activeIndex] ?? items[clampedInitialIndex] ?? null
  const captionText = activeItem?.caption?.trim()
  const itemUrisKey = items.map((item) => item.uri).join('\n')

  useEffect(() => {
    setActiveIndex(clampedInitialIndex)

    if (items.length === 0) {
      return undefined
    }

    const frame = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        animated: false,
        x: width * clampedInitialIndex,
        y: 0,
      })
    })

    return () => cancelAnimationFrame(frame)
  }, [clampedInitialIndex, itemUrisKey, items.length, width])

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setActiveIndex(clampIndex(Math.round(event.nativeEvent.contentOffset.x / width), items.length))
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={items.length > 0}
    >
      <SafeAreaView style={styles.container}>
        <Pressable
          accessibilityLabel="关闭图片预览"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.header}>
          {items.length > 1 ? (
            <Text style={styles.counter}>{activeIndex + 1} / {items.length}</Text>
          ) : (
            <View />
          )}
          <Pressable
            accessibilityLabel="关闭图片预览"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              { opacity: pressed ? 0.72 : 1 },
            ]}
          >
            <Ionicons color="#fff" name="close" size={24} />
          </Pressable>
        </View>
        <ScrollView
          contentOffset={{ x: width * clampedInitialIndex, y: 0 }}
          horizontal
          onMomentumScrollEnd={handleMomentumScrollEnd}
          pagingEnabled
          ref={scrollViewRef}
          scrollEnabled={items.length > 1}
          showsHorizontalScrollIndicator={false}
          style={styles.imagePager}
        >
          {items.map((item, index) => (
            <View key={`${item.uri}:${index}`} pointerEvents="none" style={[styles.imageWrap, { width }]}>
              <NativeImage
                accessibilityLabel={item.accessibilityLabel || item.caption || '图片预览'}
                resizeMode="contain"
                source={{ uri: item.uri }}
                style={styles.image}
              />
            </View>
          ))}
        </ScrollView>
        {captionText ? (
          <Text style={styles.caption}>{captionText}</Text>
        ) : null}
      </SafeAreaView>
    </Modal>
  )
}

function clampIndex(index: number, length: number) {
  if (length <= 0) {
    return 0
  }

  return Math.min(Math.max(index, 0), length - 1)
}

const styles = StyleSheet.create({
  caption: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    paddingBottom: spacingPixels['6'],
    paddingHorizontal: spacingPixels['6'],
    textAlign: 'center',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    flex: 1,
  },
  counter: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacingPixels['5'],
    paddingTop: spacingPixels['3'],
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imagePager: {
    flex: 1,
  },
  imageWrap: {
    paddingHorizontal: spacingPixels['3'],
    paddingVertical: spacingPixels['4'],
  },
})
