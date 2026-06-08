import { type ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, StatusBar, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

type ScreenProps = {
  bottomColor?: string
  children: ReactNode
}

export function Screen({ bottomColor = '#f4f5ef', children }: ScreenProps) {
  return (
    <SafeAreaProvider className="flex-1 bg-canvas">
      <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
        <StatusBar backgroundColor="#f4f5ef" barStyle="dark-content" translucent={false} />
        <View className="flex-1">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1"
          >
            {children}
          </KeyboardAvoidingView>
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: bottomColor }} />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
