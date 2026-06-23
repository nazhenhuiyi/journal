import { useEffect, useMemo, useState } from 'react'
import {
  Image as NativeImage,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { radiusPixels, spacingPixels } from '@journal/theme'
import {
  loadWeeklyReview,
  type MobileWeeklyReviewRecord,
} from '../services/mobileJournalStore'
import { useJournalImageThumbnailUri } from '../services/mobileImageThumbnails'
import { useJournalTheme } from '../ui/JournalTheme'
import { PageShell } from './PageShell'

type WeeklyReviewPageProps = {
  onBack: () => void
  week: string
}

export function WeeklyReviewPage({ onBack, week }: WeeklyReviewPageProps) {
  const [review, setReview] = useState<MobileWeeklyReviewRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [didLoadFail, setDidLoadFail] = useState(false)
  const paragraphs = useMemo(
    () => review ? splitWeeklyReviewParagraphs(review.bodyMarkdown) : [],
    [review],
  )

  useEffect(() => {
    let isMounted = true

    setIsLoading(true)
    setDidLoadFail(false)
    setReview(null)

    loadWeeklyReview(week)
      .then((loadedReview) => {
        if (isMounted) {
          setReview(loadedReview)
        }
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
  }, [week])

  return (
    <PageShell onBack={onBack} testID="weekly-review-page" title={review?.title ?? ''}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacingPixels['6'] }} showsVerticalScrollIndicator={false}>
        <View className="gap-4">
          {isLoading ? (
            <Text className="px-1 text-sm font-medium text-text-tertiary">正在打开这一周</Text>
          ) : null}

          {didLoadFail ? (
            <Text className="px-1 text-sm font-medium text-danger">周回顾读取失败</Text>
          ) : null}

          {!isLoading && !didLoadFail && !review ? (
            <View className="rounded-lg border border-border bg-surface px-4 py-4">
              <Text className="text-sm leading-5 text-text-tertiary">这篇周回顾还没有同步到手机。</Text>
            </View>
          ) : null}

          {review ? (
            <View className="gap-5">
              {review.coverImage ? (
                <WeeklyReviewHeroImage review={review} />
              ) : null}

              <View className="gap-3 px-1">
                <Text className="text-xs font-semibold text-text-tertiary">
                  {formatWeeklyReviewRange(review.startDate, review.endDate)}
                </Text>
                <Text className="text-[28px] font-semibold leading-9 text-foreground">{review.title}</Text>
                <Text className="text-base leading-7 text-text-tertiary">{review.summary}</Text>
              </View>

              <View className="gap-5 px-1">
                {paragraphs.map((paragraph, index) => (
                  <Text className="text-[18px] leading-8 text-foreground" key={`${review.week}-paragraph-${index}`}>
                    {paragraph}
                  </Text>
                ))}
              </View>

              {review.question ? (
                <View className="border border-border bg-surface px-4 py-4" style={{ borderRadius: radiusPixels.lg }}>
                  <Text className="text-xs font-semibold text-text-tertiary">问题</Text>
                  <Text className="mt-3 text-base leading-7 text-foreground">{review.question}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </PageShell>
  )
}

function WeeklyReviewHeroImage({ review }: { review: MobileWeeklyReviewRecord }) {
  const imageUri = useJournalImageThumbnailUri(review.coverImage ?? '', 1024)
  const { colors } = useJournalTheme()

  return (
    <NativeImage
      accessibilityLabel={`${review.title}封面图`}
      resizeMode="cover"
      source={{ uri: imageUri }}
      style={{
        aspectRatio: 4 / 3,
        backgroundColor: colors['surface-muted'],
        borderRadius: radiusPixels.xl,
        width: '100%',
      }}
    />
  )
}

function splitWeeklyReviewParagraphs(markdown: string) {
  return markdown
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
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
