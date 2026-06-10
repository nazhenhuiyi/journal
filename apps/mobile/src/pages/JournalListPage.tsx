import { useEffect, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { spacingPixels } from '@journal/theme'
import {
  listDailyJournals,
  type MobileJournalRecord,
} from '../services/mobileJournalStore'
import { PageShell } from './PageShell'

type JournalListRow = {
  date: string
  isToday: boolean
  murmurCount: number
  preview: string
}

type JournalListPageProps = {
  longEntryMarkdown: string
  murmurCount: number
  onBack: () => void
  today: string
}

export function JournalListPage({
  longEntryMarkdown,
  murmurCount,
  onBack,
  today,
}: JournalListPageProps) {
  const [records, setRecords] = useState<MobileJournalRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [didLoadFail, setDidLoadFail] = useState(false)
  const rows = createJournalListRows({
    currentLongEntryMarkdown: longEntryMarkdown,
    currentMurmurCount: murmurCount,
    records,
    today,
  })

  useEffect(() => {
    let isMounted = true

    setIsLoading(true)
    setDidLoadFail(false)

    listDailyJournals()
      .then((loadedRecords) => {
        if (!isMounted) {
          return
        }

        setRecords(loadedRecords)
      })
      .catch((error) => {
        console.error(error)

        if (isMounted) {
          setDidLoadFail(true)
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [today])

  return (
    <PageShell onBack={onBack} title="日记列表">
      <ScrollView contentContainerStyle={{ paddingBottom: spacingPixels['6'] }} showsVerticalScrollIndicator={false}>
        <View className="gap-3">
          {isLoading ? (
            <Text className="px-1 text-sm font-medium text-text-tertiary">正在打开日记列表</Text>
          ) : null}

          {didLoadFail ? (
            <Text className="px-1 text-sm font-medium text-danger">日记列表读取失败</Text>
          ) : null}

          {!isLoading && !didLoadFail && rows.length === 0 ? (
            <View className="rounded-lg border border-border bg-surface px-4 py-4">
              <Text className="text-sm leading-5 text-text-tertiary">还没有写下内容</Text>
            </View>
          ) : null}

          {rows.map((row) => (
            <View key={row.date} className="rounded-lg border border-border bg-surface px-4 py-4">
              <View className="mb-3 flex-row items-center justify-between gap-3">
                <Text className="text-base font-semibold text-foreground">{row.isToday ? '今天' : formatCompactDate(row.date)}</Text>
                <Text className="text-sm font-medium text-text-tertiary">{formatPaperDateLine(row.date)}</Text>
              </View>
              <Text className="text-sm leading-5 text-text-tertiary" numberOfLines={3}>
                {row.preview || (row.murmurCount > 0 ? `${row.murmurCount} 条碎碎念` : '还没有写下内容')}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </PageShell>
  )
}

function createJournalListRows({
  currentLongEntryMarkdown,
  currentMurmurCount,
  records,
  today,
}: {
  currentLongEntryMarkdown: string
  currentMurmurCount: number
  records: MobileJournalRecord[]
  today: string
}): JournalListRow[] {
  const rows = records.map((record) => ({
    date: record.date,
    isToday: record.date === today,
    murmurCount: record.murmurs.length,
    preview: record.longEntryMarkdown.trim(),
  }))
  const todayRow = rows.find((row) => row.date === today)

  if (todayRow) {
    todayRow.murmurCount = currentMurmurCount
    todayRow.preview = currentLongEntryMarkdown.trim()
  } else if (currentLongEntryMarkdown.trim() || currentMurmurCount > 0) {
    rows.unshift({
      date: today,
      isToday: true,
      murmurCount: currentMurmurCount,
      preview: currentLongEntryMarkdown.trim(),
    })
  }

  return rows.sort((first, second) => second.date.localeCompare(first.date))
}

function formatCompactDate(dateKey: string) {
  const [, month, day] = dateKey.split('-')

  if (!month || !day) {
    return dateKey
  }

  return `${Number(month)}月${Number(day)}日`
}

function formatPaperDateLine(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return dateKey
  }

  const weekday = date.toLocaleDateString('zh-CN', { weekday: 'long' })
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}月${day}日 · ${weekday}`
}
