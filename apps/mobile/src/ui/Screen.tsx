import { type ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  View,
  type KeyboardAvoidingViewProps,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { semanticColors } from '@journal/theme'

type ScreenProps = {
  bottomColor?: string
  children: ReactNode
  keyboardAvoidingBehavior?: KeyboardAvoidingViewProps['behavior']
  keyboardAvoidingEnabled?: boolean
}

export function Screen({
  bottomColor = semanticColors.background,
  children,
  keyboardAvoidingBehavior,
  keyboardAvoidingEnabled = true,
}: ScreenProps) {
  const behavior = keyboardAvoidingEnabled
    ? keyboardAvoidingBehavior ?? (Platform.OS === 'ios' ? 'padding' : undefined)
    : undefined

  return (
    <SafeAreaProvider
      className="flex-1 bg-background"
      style={{ backgroundColor: semanticColors.background, flex: 1 }}
    >
      <SafeAreaView
        className="flex-1 bg-background"
        edges={['top']}
        style={{ backgroundColor: semanticColors.background, flex: 1 }}
      >
        <StatusBar backgroundColor={semanticColors.background} barStyle="dark-content" translucent={false} />
        <View className="flex-1" style={{ flex: 1 }}>
          <KeyboardAvoidingView
            behavior={behavior}
            className="flex-1"
            enabled={keyboardAvoidingEnabled}
            style={{ flex: 1 }}
          >
            {children}
          </KeyboardAvoidingView>
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: bottomColor }} />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
