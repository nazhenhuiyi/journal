import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native'
import { radiusPixels, spacingPixels, type ResolvedSemanticColors } from '@journal/theme'
import { cn } from './cn'
import { useJournalTheme } from './JournalTheme'

type BottomSheetProps = {
  children: ReactNode
  contentClassName?: string
  height?: ViewStyle['height']
  keyboardAvoiding?: boolean
  maxHeight?: ViewStyle['maxHeight']
  onClose: () => void
  sheetClassName?: string
  title?: ReactNode
  visible: boolean
}

export function BottomSheet({
  children,
  contentClassName,
  height = '80%',
  keyboardAvoiding = false,
  maxHeight,
  onClose,
  sheetClassName,
  title,
  visible,
}: BottomSheetProps) {
  const { colors } = useJournalTheme()
  const { height: windowHeight } = useWindowDimensions()
  const [isMounted, setIsMounted] = useState(visible)
  const [translateY] = useState(() => new Animated.Value(windowHeight))
  const isClosingRef = useRef(false)
  const styles = useMemo(() => createBottomSheetStyles(colors), [colors])

  const animateOpen = useCallback(() => {
    isClosingRef.current = false
    translateY.stopAnimation()
    translateY.setValue(windowHeight)

    requestAnimationFrame(() => {
      Animated.timing(translateY, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }).start()
    })
  }, [translateY, windowHeight])

  const animateClose = useCallback(() => {
    if (isClosingRef.current) {
      return
    }

    isClosingRef.current = true
    translateY.stopAnimation()

    Animated.timing(translateY, {
      duration: 180,
      easing: Easing.in(Easing.cubic),
      toValue: windowHeight,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIsMounted(false)
        onClose()
      }

      isClosingRef.current = false
    })
  }, [onClose, translateY, windowHeight])

  const settleOpen = useCallback(() => {
    Animated.spring(translateY, {
      damping: 26,
      mass: 0.9,
      stiffness: 240,
      toValue: 0,
      useNativeDriver: true,
    }).start()
  }, [translateY])

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gestureState) => (
      gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
    ),
    onPanResponderMove: (_event, gestureState) => {
      translateY.setValue(Math.max(0, gestureState.dy))
    },
    onPanResponderRelease: (_event, gestureState) => {
      if (gestureState.dy > 72 || gestureState.vy > 0.75) {
        animateClose()
      } else {
        settleOpen()
      }
    },
    onPanResponderTerminate: settleOpen,
  }), [animateClose, settleOpen, translateY])

  useEffect(() => {
    if (visible) {
      setIsMounted(true)
      animateOpen()
    } else if (!isClosingRef.current) {
      setIsMounted(false)
    }
  }, [animateOpen, visible])

  if (!isMounted) {
    return null
  }

  const sheet = (
    <Animated.View
      className={cn('bg-background', sheetClassName)}
      style={{
        borderTopLeftRadius: radiusPixels['4xl'],
        borderTopRightRadius: radiusPixels['4xl'],
        height,
        maxHeight,
        transform: [{ translateY }],
      }}
    >
      <View style={styles.handleArea} {...panResponder.panHandlers}>
        <View style={styles.handle} />
      </View>
      <View className={contentClassName} style={styles.content}>
        {title ? (
          <View style={styles.titleArea}>
            {typeof title === 'string' ? (
              <Text style={styles.title}>{title}</Text>
            ) : (
              title
            )}
          </View>
        ) : null}
        {children}
      </View>
    </Animated.View>
  )

  return (
    <Modal
      animationType="none"
      onRequestClose={animateClose}
      transparent
      visible={isMounted}
    >
      <View className="flex-1">
        <Pressable
          accessibilityLabel="关闭面板"
          accessibilityRole="button"
          className="bg-black/30"
          onPress={animateClose}
          style={StyleSheet.absoluteFill}
        />
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1 justify-end"
            pointerEvents="box-none"
          >
            {sheet}
          </KeyboardAvoidingView>
        ) : (
          <View className="flex-1 justify-end" pointerEvents="box-none">
            {sheet}
          </View>
        )}
      </View>
    </Modal>
  )
}

function createBottomSheetStyles(colors: ResolvedSemanticColors) {
  return StyleSheet.create({
  content: {
    flex: 1,
    paddingBottom: spacingPixels['8'] + spacingPixels['1'],
    paddingHorizontal: spacingPixels['6'],
    paddingTop: spacingPixels['2'],
  },
  handle: {
    backgroundColor: colors.border,
    borderRadius: radiusPixels.full,
    height: spacingPixels['1.5'],
    width: spacingPixels['12'],
  },
  handleArea: {
    alignItems: 'center',
    paddingBottom: spacingPixels['5'],
    paddingTop: spacingPixels['5'],
  },
  title: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: '600',
  },
  titleArea: {
    paddingBottom: spacingPixels['8'],
  },
  })
}
