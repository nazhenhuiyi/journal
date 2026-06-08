import { type ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, StatusBar } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

type ScreenProps = {
  children: ReactNode
}

export function Screen({ children }: ScreenProps) {
  return (
    <SafeAreaProvider className="flex-1 bg-canvas">
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
        <StatusBar backgroundColor="#f4f5ef" barStyle="dark-content" translucent={false} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
        >
          {children}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
