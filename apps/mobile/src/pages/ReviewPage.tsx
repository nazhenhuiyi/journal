import { useCallback, useState } from 'react'
import { Image as NativeImage, Pressable, ScrollView, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import {
  type DayFrontMatter,
  type MurmurBlock,
  type ReviewMoment,
  type ReviewSourceDay,
} from '@journal/core'
import { radiusPixels, spacingPixels } from '@journal/theme'
import {
  listDailyJournals,
  listWeeklyReviews,
  loadOrCreateDailyReview,
  type MobileJournalRecord,
  type MobileWeeklyReviewRecord,
} from '../services/mobileJournalStore'
import { journalEffects } from '../services/journalEffects'
import { useJournalImageThumbnailUri } from '../services/mobileImageThumbnails'
import { PageShell } from './PageShell'

type ReviewPageProps = {
  currentFrontMatter: DayFrontMatter
  longEntryMarkdown: string
  murmurs: MurmurBlock[]
  onBack: () => void
  onOpenSourceDay: (date: string) => void
  onOpenWeeklyReview: (week: string) => void
  today: string
}

export function ReviewPage({
  currentFrontMatter,
  longEntryMarkdown,
  murmurs,
  onBack,
  onOpenSourceDay,
  onOpenWeeklyReview,
  today,
}: ReviewPageProps) {
  const [moments, setMoments] = useState<ReviewMoment[]>([])
  const [weeklyReviews, setWeeklyReviews] = useState<MobileWeeklyReviewRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [didLoadFail, setDidLoadFail] = useState(false)

  useFocusEffect(useCallback(() => {
    let isActive = true

    setIsLoading(true)
    setDidLoadFail(false)
    setMoments([])
    setWeeklyReviews([])

    Promise.all([
      listDailyJournals(),
      listWeeklyReviews(),
    ])
      .then(([loadedRecords, loadedWeeklyReviews]) => {
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
          weeklyReviews: loadedWeeklyReviews,
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
          setWeeklyReviews(loadedReview.weeklyReviews)
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
            <Text className="px-1 text-xs font-semibold text-text-tertiary">周回顾</Text>
            {isLoading ? (
              <Text className="px-1 text-sm font-medium text-text-tertiary">正在翻开这一周</Text>
            ) : null}

            {!isLoading && !didLoadFail && weeklyReviews.length === 0 ? (
              <View className="rounded-lg border border-border bg-surface px-4 py-4">
                <Text className="text-sm leading-5 text-text-tertiary">
                  周回顾会在一周结束后慢慢装订成册。
                </Text>
              </View>
            ) : null}

            {weeklyReviews.map((review) => (
              <WeeklyReviewCard
                key={review.week}
                review={review}
                onPress={() => onOpenWeeklyReview(review.week)}
              />
            ))}
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

function WeeklyReviewCard({
  review,
  onPress,
}: {
  review: MobileWeeklyReviewRecord
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={`打开周回顾：${review.title}`}
      accessibilityRole="button"
      className="overflow-hidden border border-border bg-surface"
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: radiusPixels.lg,
        opacity: pressed ? 0.78 : 1,
      })}
    >
      {review.coverImage ? (
        <WeeklyReviewCover src={review.coverImage} title={review.title} />
      ) : null}
      <View className="px-4 py-4">
        <Text className="text-xs font-semibold text-text-tertiary">
          {formatWeeklyReviewRange(review.startDate, review.endDate)}
        </Text>
        <Text className="mt-2 text-lg font-semibold leading-6 text-foreground">{review.title}</Text>
        <Text className="mt-2 text-sm leading-5 text-text-tertiary" numberOfLines={3}>
          {review.summary}
        </Text>
      </View>
    </Pressable>
  )
}

function WeeklyReviewCover({
  src,
  title,
}: {
  src: string
  title: string
}) {
  const imageUri = useJournalImageThumbnailUri(src, 768)

  return (
    <NativeImage
      accessibilityLabel={`${title}封面图`}
      resizeMode="cover"
      source={{ uri: imageUri }}
      style={{
        aspectRatio: 16 / 9,
        width: '100%',
      }}
    />
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

function formatWeeklyReviewRange(startDate: string, endDate: string) {
  return `${formatMonthDay(startDate)} - ${formatMonthDay(endDate)}`
}

function formatMonthDay(dateKey: string) {
  const [, month, day] = dateKey.split('-')

  if (!month || !day) {
    return dateKey
  }

  return `${Number(month)}月${Number(day)}日`
}
