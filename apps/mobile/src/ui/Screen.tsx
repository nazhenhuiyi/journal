import { type ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  View,
  type KeyboardAvoidingViewProps,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { useJournalTheme } from './JournalTheme'

type ScreenProps = {
  bottomColor?: string
  children: ReactNode
  keyboardAvoidingBehavior?: KeyboardAvoidingViewProps['behavior']
  keyboardAvoidingEnabled?: boolean
}

export function Screen({
  bottomColor,
  children,
  keyboardAvoidingBehavior,
  keyboardAvoidingEnabled = true,
}: ScreenProps) {
  const { colors, statusBarStyle } = useJournalTheme()
  const behavior = keyboardAvoidingEnabled
    ? keyboardAvoidingBehavior ?? (Platform.OS === 'ios' ? 'padding' : undefined)
    : undefined
  const safeBottomColor = bottomColor ?? colors.background

  return (
    <SafeAreaProvider
      className="flex-1 bg-background"
      style={{ backgroundColor: colors.background, flex: 1 }}
    >
      <SafeAreaView
        className="flex-1 bg-background"
        edges={['top']}
        style={{ backgroundColor: colors.background, flex: 1 }}
      >
        <StatusBar backgroundColor={colors.background} barStyle={statusBarStyle} translucent={false} />
        <View className="flex-1" style={{ flex: 1 }}>
          <KeyboardAvoidingView
            behavior={behavior}
            className="flex-1"
            enabled={keyboardAvoidingEnabled}
            style={{ flex: 1 }}
          >
            {children}
          </KeyboardAvoidingView>
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: safeBottomColor }} />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
