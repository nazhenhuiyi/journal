import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { semanticColors, spacingPixels } from '@journal/theme'
import { Screen } from '../ui/Screen'

type PageShellProps = {
  children: ReactNode
  onBack: () => void
  headerRight?: ReactNode
  testID?: string
  title: string
}

export function PageShell({ children, headerRight, onBack, testID, title }: PageShellProps) {
  return (
    <Screen>
      <View className="flex-1 pb-5 pt-4">
        <View style={[styles.nav, styles.horizontal]}>
          <View style={styles.headerSide}>
            <Pressable
              accessibilityLabel="返回"
              accessibilityRole="button"
              onPress={onBack}
              style={styles.backButton}
              testID="back-to-today-button"
            >
              <Ionicons color={semanticColors['text-tertiary']} name="chevron-back" size={24} />
            </Pressable>
          </View>
          <Text
            className="text-lg font-semibold text-foreground"
            style={styles.title}
          >
            {title}
          </Text>
          <View style={[styles.headerSide, styles.headerRight]}>
            {headerRight}
          </View>
        </View>
        <View style={styles.content} testID={testID}>
          {children}
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: spacingPixels['8'],
  },
  content: {
    flex: 1,
    paddingHorizontal: spacingPixels['5'],
  },
  horizontal: {
    paddingHorizontal: spacingPixels['5'],
  },
  headerSide: {
    justifyContent: 'center',
    width: 92,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  nav: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 36,
    marginBottom: spacingPixels['1.5'],
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
})
