import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { semanticColors } from '@journal/theme'
import { Screen } from '../ui/Screen'

type PageShellProps = {
  children: ReactNode
  onBack: () => void
  title: string
}

export function PageShell({ children, onBack, title }: PageShellProps) {
  return (
    <Screen>
      <View className="flex-1 px-5 pb-5 pt-4">
        <View style={styles.nav}>
          <Pressable
            accessibilityLabel="返回今日"
            accessibilityRole="button"
            onPress={onBack}
            style={styles.backButton}
            testID="back-to-today-button"
          >
            <Ionicons color={semanticColors['muted-fg']} name="chevron-back" size={24} />
          </Pressable>
          <Text
            className="text-lg font-semibold text-foreground"
            style={styles.title}
          >
            {title}
          </Text>
          <View style={styles.navSpacer} />
        </View>
        {children}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
  },
  nav: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 40,
    marginBottom: 28,
  },
  navSpacer: {
    width: 32,
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
})
