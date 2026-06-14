import { Ionicons } from '@expo/vector-icons'
import {
  Image as NativeImage,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { spacingPixels } from '@journal/theme'

type ImagePreviewModalProps = {
  accessibilityLabel?: string
  caption?: string | null
  onClose: () => void
  uri: string | null
}

export function ImagePreviewModal({
  accessibilityLabel,
  caption,
  onClose,
  uri,
}: ImagePreviewModalProps) {
  const captionText = caption?.trim()

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={Boolean(uri)}
    >
      <SafeAreaView style={styles.container}>
        <Pressable
          accessibilityLabel="关闭图片预览"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.header}>
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
        <View pointerEvents="box-none" style={styles.imageWrap}>
          {uri ? (
            <NativeImage
              accessibilityLabel={accessibilityLabel ?? captionText ?? '图片预览'}
              resizeMode="contain"
              source={{ uri }}
              style={styles.image}
            />
          ) : null}
        </View>
        {captionText ? (
          <Text style={styles.caption}>{captionText}</Text>
        ) : null}
      </SafeAreaView>
    </Modal>
  )
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
  header: {
    alignItems: 'flex-end',
    paddingHorizontal: spacingPixels['5'],
    paddingTop: spacingPixels['3'],
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imageWrap: {
    flex: 1,
    paddingHorizontal: spacingPixels['3'],
    paddingVertical: spacingPixels['4'],
  },
})
