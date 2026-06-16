import { useEffect, useMemo, useState } from 'react'
import {
  Image as NativeImage,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import {
  getBuiltInThemeById,
  orderMurmursByNewest,
  type ImageBlock,
  type MurmurBlock,
} from '@journal/core'
import { radiusPixels, semanticColors, spacingPixels } from '@journal/theme'
import {
  loadDailyJournal,
  resolveJournalMediaFileUri,
  type MobileJournalRecord,
} from '../services/mobileJournalStore'
import { PageShell } from './PageShell'

type ReviewDayPageProps = {
  date: string
  onBack: () => void
  onPreviewImage: (image: ImageBlock) => void
}

export function ReviewDayPage({ date, onBack, onPreviewImage }: ReviewDayPageProps) {
  const [record, setRecord] = useState<MobileJournalRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [didLoadFail, setDidLoadFail] = useState(false)
  const orderedMurmurs = useMemo(
    () => record ? orderMurmursByNewest(record.murmurs) : [],
    [record],
  )

  useEffect(() => {
    let isMounted = true

    setIsLoading(true)
    setDidLoadFail(false)

    loadDailyJournal(date)
      .then((loadedRecord) => {
        if (!isMounted) {
          return
        }

        setRecord(loadedRecord)
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
  }, [date])

  return (
    <PageShell onBack={onBack} testID="review-day-page" title={formatCompactDate(date)}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacingPixels['6'] }} showsVerticalScrollIndicator={false}>
        <View className="gap-3">
          {isLoading ? (
            <Text className="px-1 text-sm font-medium text-text-tertiary">正在打开这一天</Text>
          ) : null}

          {didLoadFail ? (
            <Text className="px-1 text-sm font-medium text-danger">这一天读取失败</Text>
          ) : null}

          {!isLoading && !didLoadFail && record ? (
            <View className="gap-4">
              <View className="rounded-lg border border-border bg-surface px-4 py-4">
                <Text className="text-sm font-semibold text-foreground">{formatPaperDateLine(record.date)}</Text>
                {record.frontMatter.weather?.text ? (
                  <Text className="mt-1 text-sm text-text-tertiary">
                    {formatWeatherLineLabel(record.frontMatter.weather)}
                  </Text>
                ) : null}
              </View>

              {record.longEntryMarkdown.trim() ? (
                <View className="rounded-lg border border-border bg-surface px-4 py-4">
                  <Text className="text-[18px] leading-8 text-foreground">{record.longEntryMarkdown.trim()}</Text>
                </View>
              ) : null}

              {orderedMurmurs.map((murmur) => (
                <ReadonlyMurmurCard
                  key={murmur.id}
                  murmur={murmur}
                  onPreviewImage={onPreviewImage}
                />
              ))}

              {!record.longEntryMarkdown.trim() && record.murmurs.length === 0 ? (
                <View className="rounded-lg border border-border bg-surface px-4 py-4">
                  <Text className="text-sm leading-5 text-text-tertiary">这一天还没有留下内容。</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </PageShell>
  )
}

function ReadonlyMurmurCard({
  murmur,
  onPreviewImage,
}: {
  murmur: MurmurBlock
  onPreviewImage: (image: ImageBlock) => void
}) {
  return (
    <View className="rounded-lg border border-border bg-surface px-4 py-4">
      <Text className="mb-3 text-xs font-semibold text-text-tertiary">{formatTime(murmur.time)}</Text>
      {murmur.body.trim() ? (
        <Text className="text-base leading-6 text-foreground">{murmur.body}</Text>
      ) : null}
      {murmur.themes.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {murmur.themes.map((themeId) => (
            <View className="rounded-full bg-surface-muted px-2.5 py-1" key={themeId}>
              <Text className="text-xs font-semibold text-text-tertiary">
                {getBuiltInThemeById(themeId)?.label ?? themeId}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {murmur.images.length > 0 ? (
        <View className="gap-3" style={{ marginTop: murmur.body.trim() || murmur.themes.length > 0 ? spacingPixels['3.5'] : 0 }}>
          {murmur.images.map((image) => {
            const imageUri = resolveJournalMediaFileUri(image.src) ?? image.src
            const imageLabel = image.caption?.trim() || '碎碎念图片'

            return (
              <View className="gap-2" key={image.id}>
                <Pressable
                  accessibilityLabel={`查看大图：${imageLabel}`}
                  accessibilityRole="button"
                  onPress={() => onPreviewImage(image)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.82 : 1,
                  })}
                >
                  <NativeImage
                    accessibilityLabel={imageLabel}
                    resizeMode="cover"
                    source={{ uri: imageUri }}
                    style={{
                      aspectRatio: 4 / 3,
                      backgroundColor: semanticColors['surface-muted'],
                      borderRadius: radiusPixels.xl,
                      width: '100%',
                    }}
                  />
                </Pressable>
                {image.caption?.trim() ? (
                  <Text className="text-sm leading-5 text-text-tertiary">{image.caption.trim()}</Text>
                ) : null}
              </View>
            )
          })}
        </View>
      ) : null}
    </View>
  )
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

function formatWeatherLineLabel(weather: MobileJournalRecord['frontMatter']['weather']) {
  if (!weather?.text) {
    return ''
  }

  const temperature = typeof weather.temperature === 'number'
    ? `${Math.round(weather.temperature)}℃`
    : ''

  return [weather.text, temperature].filter(Boolean).join(' ')
}

function formatTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}
