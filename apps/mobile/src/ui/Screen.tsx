import { type ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, StatusBar, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { semanticColors } from '@journal/theme'

type ScreenProps = {
  bottomColor?: string
  children: ReactNode
}

export function Screen({ bottomColor = semanticColors.background, children }: ScreenProps) {
  return (
    <SafeAreaProvider className="flex-1 bg-background">
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <StatusBar backgroundColor={semanticColors.background} barStyle="dark-content" translucent={false} />
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
