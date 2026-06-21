import { useEffect, useMemo, useRef, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import {
  FlatList,
  Image as NativeImage,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { spacingPixels } from '@journal/theme'

const previewHeaderTopPadding = spacingPixels['12'] + spacingPixels['4']

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
  const listRef = useRef<FlatList<ImagePreviewModalItem>>(null)
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const clampedInitialIndex = clampIndex(initialIndex, items.length)
  const activeItem = items[activeIndex] ?? items[clampedInitialIndex] ?? null
  const captionText = activeItem?.caption?.trim()
  const itemUrisKey = useMemo(() => items.map((item) => item.uri).join('\n'), [items])
  const pageWidth = Math.max(1, width)
  const previewImageWidth = Math.max(1, pageWidth - spacingPixels['6'] * 2)

  useEffect(() => {
    setActiveIndex(clampedInitialIndex)
  }, [clampedInitialIndex, itemUrisKey])

  useEffect(() => {
    if (items.length === 0) {
      return undefined
    }

    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        animated: false,
        index: clampIndex(activeIndex, items.length),
      })
    })

    return () => cancelAnimationFrame(frame)
  }, [activeIndex, items.length, pageWidth])

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setActiveIndex(clampIndex(Math.round(event.nativeEvent.contentOffset.x / pageWidth), items.length))
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent
      transparent={false}
      visible={items.length > 0}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          {items.length > 1 ? (
            <Text style={styles.counter}>{activeIndex + 1} / {items.length}</Text>
          ) : (
            <View style={styles.counterPlaceholder} />
          )}
          <Pressable
            accessibilityLabel="关闭图片预览"
            accessibilityRole="button"
            hitSlop={16}
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              pressed ? styles.closeButtonPressed : null,
            ]}
          >
            <Ionicons color="#fff" name="close" size={24} />
          </Pressable>
        </View>
        <FlatList
          data={items}
          getItemLayout={(_, index) => ({
            index,
            length: pageWidth,
            offset: pageWidth * index,
          })}
          horizontal
          initialScrollIndex={clampedInitialIndex}
          keyExtractor={(item, index) => `${item.uri}:${index}`}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          onScrollToIndexFailed={(info) => {
            requestAnimationFrame(() => {
              listRef.current?.scrollToOffset({
                animated: false,
                offset: info.averageItemLength * info.index,
              })
            })
          }}
          pagingEnabled
          ref={listRef}
          renderItem={({ item }) => (
            <View style={[styles.imagePage, { width: pageWidth }]}>
              <NativeImage
                accessibilityLabel={item.accessibilityLabel || item.caption || '图片预览'}
                resizeMode="contain"
                source={{ uri: item.uri }}
                style={[styles.image, { width: previewImageWidth }]}
              />
            </View>
          )}
          scrollEnabled={items.length > 1}
          showsHorizontalScrollIndicator={false}
          style={styles.imagePager}
        />
        <View style={styles.footer}>
          <Text numberOfLines={3} style={styles.caption}>
            {captionText || ' '}
          </Text>
        </View>
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
    textAlign: 'center',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  closeButtonPressed: {
    opacity: 0.72,
  },
  container: {
    backgroundColor: '#050505',
    flex: 1,
  },
  counter: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  counterPlaceholder: {
    width: 52,
  },
  footer: {
    minHeight: 84,
    paddingBottom: spacingPixels['6'],
    paddingHorizontal: spacingPixels['6'],
    paddingTop: spacingPixels['3'],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: spacingPixels['5'],
    paddingTop: previewHeaderTopPadding,
    zIndex: 3,
  },
  image: {
    flex: 1,
  },
  imagePager: {
    flex: 1,
  },
  imagePage: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacingPixels['3'],
    paddingVertical: spacingPixels['2'],
  },
})
