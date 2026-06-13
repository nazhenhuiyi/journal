import { useCallback, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import {
  BUILT_IN_THEMES,
  type DayFrontMatter,
  type MurmurBlock,
  type ReviewMoment,
  type ReviewSourceDay,
} from '@journal/core'
import { radiusPixels, spacingPixels } from '@journal/theme'
import {
  listDailyJournals,
  loadOrCreateDailyReview,
  type MobileJournalRecord,
} from '../services/mobileJournalStore'
import { journalEffects } from '../services/journalEffects'
import { PageShell } from './PageShell'

type ReviewPageProps = {
  currentFrontMatter: DayFrontMatter
  longEntryMarkdown: string
  murmurs: MurmurBlock[]
  onBack: () => void
  onOpenSourceDay: (date: string) => void
  onStartThemeEntry: (themeId: string) => void
  today: string
}

const visibleThemeEntries = BUILT_IN_THEMES.slice(0, 6)

export function ReviewPage({
  currentFrontMatter,
  longEntryMarkdown,
  murmurs,
  onBack,
  onOpenSourceDay,
  onStartThemeEntry,
  today,
}: ReviewPageProps) {
  const [moments, setMoments] = useState<ReviewMoment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [didLoadFail, setDidLoadFail] = useState(false)

  useFocusEffect(useCallback(() => {
    let isActive = true

    setIsLoading(true)
    setDidLoadFail(false)
    setMoments([])

    listDailyJournals()
      .then((loadedRecords) => {
        const currentDay: ReviewSourceDay = {
          date: today,
          frontMatter: currentFrontMatter,
          longEntryMarkdown,
          murmurs,
        }
        const reviewSourceDays = mergeCurrentDay(loadedRecords, currentDay)

        return loadOrCreateDailyReview({
          date: today,
          sourceDays: reviewSourceDays,
        }).then((result) => ({
          currentDay,
          result,
        }))
      })
      .then((loadedReview) => {
        if (!loadedReview) {
          return
        }

        void journalEffects.afterReviewLoaded({
          currentDay: loadedReview.currentDay,
          date: today,
          result: loadedReview.result,
        })

        if (isActive) {
          setMoments(loadedReview.result.review?.moments ?? [])
        }
      })
      .catch((error) => {
        console.error(error)

        if (isActive) {
          setDidLoadFail(true)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [currentFrontMatter, longEntryMarkdown, murmurs, today]))

  return (
    <PageShell onBack={onBack} testID="review-page" title="回顾">
      <ScrollView contentContainerStyle={{ paddingBottom: spacingPixels['6'] }} showsVerticalScrollIndicator={false}>
        <View className="gap-5">
          <View className="gap-3">
            <Text className="px-1 text-xs font-semibold text-text-tertiary">此刻</Text>
            <View className="gap-3">
              {visibleThemeEntries.map((theme) => (
                <Pressable
                  accessibilityLabel={`放进${theme.label}`}
                  accessibilityRole="button"
                  className="border border-border bg-surface px-4 py-4"
                  key={theme.id}
                  onPress={() => onStartThemeEntry(theme.id)}
                  style={({ pressed }) => ({
                    borderRadius: radiusPixels.lg,
                    opacity: pressed ? 0.74 : 1,
                  })}
                >
                  <Text className="text-base font-semibold text-foreground">{theme.label}</Text>
                  <Text className="mt-1 text-sm leading-5 text-text-tertiary">{theme.entrySubtitle}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="gap-3">
            <Text className="px-1 text-xs font-semibold text-text-tertiary">浮现</Text>
            {isLoading ? (
              <Text className="px-1 text-sm font-medium text-text-tertiary">正在翻出几张旧纸条</Text>
            ) : null}

            {didLoadFail ? (
              <Text className="px-1 text-sm font-medium text-danger">回顾读取失败</Text>
            ) : null}

            {!isLoading && !didLoadFail && moments.length === 0 ? (
              <View className="rounded-lg border border-border bg-surface px-4 py-4">
                <Text className="text-sm leading-5 text-text-tertiary">
                  回顾会从旧日里慢慢长出来，先把今天留下来就好。
                </Text>
              </View>
            ) : null}

            {moments.map((moment) => (
              <ReviewMomentCard
                key={moment.id}
                moment={moment}
                onPress={() => {
                  const [sourceDay] = moment.sourceDays

                  if (sourceDay) {
                    onOpenSourceDay(sourceDay)
                  }
                }}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </PageShell>
  )
}

function ReviewMomentCard({
  moment,
  onPress,
}: {
  moment: ReviewMoment
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={moment.title}
      accessibilityRole="button"
      className="border border-border bg-surface px-4 py-4"
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: radiusPixels.lg,
        opacity: pressed ? 0.74 : 1,
      })}
    >
      <Text className="text-base font-semibold text-foreground">{moment.title}</Text>
      {moment.subtitle ? (
        <Text className="mt-2 text-sm leading-5 text-foreground">{moment.subtitle}</Text>
      ) : null}
      {moment.anchors.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {moment.anchors.slice(0, 4).map((anchor) => (
            <View className="rounded-full bg-surface-muted px-2.5 py-1" key={`${anchor.type}-${anchor.value ?? anchor.label}`}>
              <Text className="text-xs font-semibold text-text-tertiary">{anchor.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  )
}

function mergeCurrentDay(records: MobileJournalRecord[], currentDay: ReviewSourceDay): ReviewSourceDay[] {
  const savedRecords = records.filter((record) => record.date !== currentDay.date)

  if (!hasCurrentDayContent(currentDay)) {
    return savedRecords
  }

  return [currentDay, ...savedRecords]
}

function hasCurrentDayContent(day: ReviewSourceDay) {
  return Boolean(
    day.longEntryMarkdown.trim() ||
      day.murmurs.some((murmur) => murmur.body.trim() || murmur.images.length > 0),
  )
}
