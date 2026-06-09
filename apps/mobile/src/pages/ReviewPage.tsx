import { Text, View } from 'react-native'
import { PageShell } from './PageShell'

type ReviewPageProps = {
  longEntryMarkdown: string
  murmurCount: number
  onBack: () => void
}

export function ReviewPage({ longEntryMarkdown, murmurCount, onBack }: ReviewPageProps) {
  const trimmedEntry = longEntryMarkdown.trim()

  return (
    <PageShell icon="sparkles-outline" onBack={onBack} title="回顾">
      <View className="gap-3">
        <View className="rounded-lg border border-reed bg-paper px-4 py-4">
          <Text className="mb-3 text-base font-semibold text-ink">今天</Text>
          <View className="flex-row gap-3">
            <View className="flex-1 rounded-lg bg-cloud px-3 py-3">
              <Text className="text-xs font-medium text-mossMuted">长日记</Text>
              <Text className="mt-1 text-lg font-semibold text-moss">{trimmedEntry.length} 字</Text>
            </View>
            <View className="flex-1 rounded-lg bg-cloud px-3 py-3">
              <Text className="text-xs font-medium text-mossMuted">碎碎念</Text>
              <Text className="mt-1 text-lg font-semibold text-moss">{murmurCount} 条</Text>
            </View>
          </View>
        </View>
        <Text className="px-1 text-sm leading-5 text-mossMuted">
          回顾会从已有日记里慢慢长出来，先把今天留下来就好。
        </Text>
      </View>
    </PageShell>
  )
}
