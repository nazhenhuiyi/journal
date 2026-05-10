import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { CalendarDays, Camera, Image } from '../components/HandDrawnIcons'
import { resolveJournalMediaSrc } from '../domain/journalMedia'
import type { JournalIndexEntry } from '../domain/journalIndex/types'
import { panelTransition } from './markdown-preview/constants'

type PhotosLoadStatus = 'loading' | 'ready' | 'failed'

type JournalPhoto = {
  caption?: string
  date: string
  entryTitle: string
  imageId: string
  monthKey: string
  murmurExcerpt: string
  murmurId: string
  photoId: string
  searchableText: string
  src: string
  tags: string[]
}

type MonthSummary = {
  count: number
  key: string
  label: string
}

type TagSummary = {
  count: number
  tag: string
}

function getJournalStore() {
  return typeof window === 'undefined' ? undefined : window.journalStore
}

function PhotosPage() {
  const [entries, setEntries] = useState<JournalIndexEntry[]>([])
  const [loadStatus, setLoadStatus] = useState<PhotosLoadStatus>(() =>
    getJournalStore()?.listIndex ? 'loading' : 'ready',
  )
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [selectedTag, setSelectedTag] = useState('all')
  const [query, setQuery] = useState('')
  const photos = useMemo(() => createJournalPhotos(entries), [entries])
  const months = useMemo(() => createMonthSummaries(photos), [photos])
  const tags = useMemo(() => createTagSummaries(photos), [photos])
  const dayCount = useMemo(() => new Set(photos.map((photo) => photo.date)).size, [photos])
  const latestDate = photos[0]?.date
  const filteredPhotos = useMemo(
    () => filterPhotos(photos, selectedMonth, selectedTag, query),
    [photos, query, selectedMonth, selectedTag],
  )

  useEffect(() => {
    const journalStore = getJournalStore()

    if (!journalStore?.listIndex) {
      return
    }

    let isCancelled = false

    journalStore.listIndex()
      .then((journalEntries) => {
        if (!isCancelled) {
          setEntries(journalEntries)
          setLoadStatus('ready')
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setEntries([])
          setLoadStatus('failed')
        }
      })

    return () => {
      isCancelled = true
    }
  }, [])

  function handleSelectMonth(monthKey: string) {
    setSelectedMonth(monthKey)
  }

  function handleSelectTag(tag: string) {
    setSelectedTag(tag)
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="photos-page flex min-h-0 flex-1 flex-col overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      transition={panelTransition}
    >
      <header className="journal-topbar grid min-h-[5.6rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-6 px-8 py-4">
        <div className="min-w-0">
          <p className="m-0 flex items-center gap-2 text-[0.78rem] font-semibold text-[rgba(47,38,31,0.48)]">
            <Image aria-hidden="true" size={16} strokeWidth={2.2} />
            日记里的画面
          </p>
          <h1 className="m-0 mt-1 font-display text-[1.9rem] font-semibold leading-tight tracking-[0] text-ink">
            照片
          </h1>
        </div>
        <dl className="m-0 grid grid-cols-3 gap-2">
          <StatItem label="照片" value={`${photos.length} 张`} />
          <StatItem label="天数" value={`${dayCount} 天`} />
          <StatItem label="最近" value={latestDate ? formatDateLabel(latestDate) : '等待照片'} />
        </dl>
      </header>

      <section className="grid min-h-0 flex-1 grid-cols-[12rem_minmax(0,1fr)] gap-5 px-7 py-6">
        <aside className="photos-side-panel min-h-0 overflow-hidden rounded-[8px] border border-[rgba(122,79,50,0.13)] bg-[rgba(255,253,244,0.64)] p-3">
          <div className="mb-3 flex items-center gap-2 px-1">
            <CalendarDays aria-hidden="true" className="text-[#14724f]" size={18} strokeWidth={2.1} />
            <h2 className="m-0 font-display text-[1.28rem] font-semibold tracking-[0] text-ink">月份</h2>
          </div>
          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
            <button
              aria-pressed={selectedMonth === 'all'}
              className={`photos-month-button ${selectedMonth === 'all' ? 'is-active' : ''}`}
              onClick={() => handleSelectMonth('all')}
              type="button"
            >
              <span>全部照片</span>
              <strong>{photos.length}</strong>
            </button>
            {months.map((month) => (
              <button
                aria-pressed={selectedMonth === month.key}
                className={`photos-month-button ${selectedMonth === month.key ? 'is-active' : ''}`}
                key={month.key}
                onClick={() => handleSelectMonth(month.key)}
                type="button"
              >
                <span>{month.label}</span>
                <strong>{month.count}</strong>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col gap-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <label className="photos-search-field">
              <span className="sr-only">搜索照片</span>
              <input
                aria-label="搜索照片"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜日期、标题、碎碎念、说明或标签"
                type="search"
                value={query}
              />
            </label>
            <div className="rounded-[999px] border border-[rgba(122,79,50,0.12)] bg-[rgba(255,253,244,0.62)] px-4 py-2 text-[0.82rem] font-semibold text-[rgba(47,38,31,0.56)]">
              {filteredPhotos.length} 张
            </div>
          </div>

          <div aria-label="照片标签" className="flex gap-2 overflow-x-auto pb-1">
            <button
              aria-pressed={selectedTag === 'all'}
              className={`photos-chip ${selectedTag === 'all' ? 'is-active' : ''}`}
              onClick={() => handleSelectTag('all')}
              type="button"
            >
              全部标签
            </button>
            {tags.map((tag) => (
              <button
                aria-label={`筛选标签 ${tag.tag}`}
                aria-pressed={selectedTag === tag.tag}
                className={`photos-chip ${selectedTag === tag.tag ? 'is-active' : ''}`}
                key={tag.tag}
                onClick={() => handleSelectTag(tag.tag)}
                type="button"
              >
                {tag.tag}
                <span>{tag.count}</span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {loadStatus === 'loading' ? (
              <PhotoStateMessage role="status" text="正在整理照片..." />
            ) : loadStatus === 'failed' ? (
              <PhotoStateMessage role="alert" text="照片索引暂时没有读出来。" />
            ) : photos.length === 0 ? (
              <PhotoStateMessage text="还没有照片。写日记时放进几张，照片墙就会亮起来。" />
            ) : filteredPhotos.length === 0 ? (
              <PhotoStateMessage text="没有符合筛选的照片。" />
            ) : (
              <div aria-label="照片墙" className="photos-wall">
                {filteredPhotos.map((photo) => (
                  <Link
                    aria-label={`打开 ${photo.date} 的照片：${photo.caption || photo.entryTitle}`}
                    className="photos-photo-card"
                    key={photo.photoId}
                    to={`/calendar?date=${encodeURIComponent(photo.date)}`}
                  >
                    <span className="photos-photo-image">
                      <img
                        alt={photo.caption || photo.entryTitle}
                        loading="lazy"
                        src={resolveJournalMediaSrc(photo.src)}
                      />
                    </span>
                    <span className="photos-photo-copy">
                      <time dateTime={photo.date}>{formatDateLabel(photo.date)}</time>
                      <strong>{photo.caption || photo.entryTitle}</strong>
                      {photo.murmurExcerpt ? <small>{photo.murmurExcerpt}</small> : null}
                      {photo.tags.length > 0 ? (
                        <span aria-label="照片卡片标签" className="photos-photo-tags">
                          {photo.tags.slice(0, 3).map((tag) => (
                            <span key={tag}>{tag}</span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </main>
      </section>
    </motion.div>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[5.8rem] rounded-[8px] border border-[rgba(122,79,50,0.12)] bg-[rgba(255,253,244,0.58)] px-3 py-2">
      <dt className="m-0 text-[0.68rem] font-semibold text-[rgba(47,38,31,0.42)]">{label}</dt>
      <dd className="m-0 mt-1 font-display text-[1.05rem] font-semibold tracking-[0] text-ink">{value}</dd>
    </div>
  )
}

function PhotoStateMessage({
  role,
  text,
}: {
  role?: 'alert' | 'status'
  text: string
}) {
  return (
    <div className="photos-empty-state" role={role}>
      <Camera aria-hidden="true" size={28} strokeWidth={2.1} />
      <p>{text}</p>
    </div>
  )
}

function createJournalPhotos(entries: JournalIndexEntry[]) {
  return entries
    .flatMap((entry) => {
      const title = entry.title?.trim() || `${formatDateLabel(entry.date)} 的一页`

      return entry.images.map((image, index): JournalPhoto => {
        const murmur = entry.murmurs.find((candidate) => candidate.id === image.murmurId)
        const photoId = `${entry.date}:${image.murmurId}:${image.id}:${index}`
        const murmurExcerpt = createExcerpt(murmur?.excerpt ?? '', 86)
        const tags = normalizeTags(image.tags)
        const searchableText = [
          entry.date,
          formatDateLabel(entry.date),
          formatMonthLabel(entry.date.slice(0, 7)),
          title,
          image.caption,
          murmurExcerpt,
          ...tags,
        ]
          .filter((chunk): chunk is string => Boolean(chunk?.trim()))
          .join('\n')

        return {
          caption: image.caption?.trim() || undefined,
          date: entry.date,
          entryTitle: title,
          imageId: image.id,
          monthKey: entry.date.slice(0, 7),
          murmurExcerpt,
          murmurId: image.murmurId,
          photoId,
          searchableText: searchableText.toLocaleLowerCase(),
          src: image.src,
          tags,
        }
      })
    })
    .sort((left, right) => right.date.localeCompare(left.date) || left.photoId.localeCompare(right.photoId))
}

function createMonthSummaries(photos: JournalPhoto[]): MonthSummary[] {
  const counts = new Map<string, number>()

  for (const photo of photos) {
    counts.set(photo.monthKey, (counts.get(photo.monthKey) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, count]) => ({
      count,
      key,
      label: formatMonthLabel(key),
    }))
}

function createTagSummaries(photos: JournalPhoto[]): TagSummary[] {
  const counts = new Map<string, number>()

  for (const photo of photos) {
    for (const tag of photo.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .sort(([leftTag, leftCount], [rightTag, rightCount]) => rightCount - leftCount || leftTag.localeCompare(rightTag, 'zh-CN'))
    .map(([tag, count]) => ({ count, tag }))
}

function filterPhotos(photos: JournalPhoto[], selectedMonth: string, selectedTag: string, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  return photos.filter((photo) => {
    if (selectedMonth !== 'all' && photo.monthKey !== selectedMonth) {
      return false
    }

    if (selectedTag !== 'all' && !photo.tags.includes(selectedTag)) {
      return false
    }

    if (normalizedQuery && !photo.searchableText.includes(normalizedQuery)) {
      return false
    }

    return true
  })
}

function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)))
}

function formatMonthLabel(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey)

  if (!match) {
    return monthKey
  }

  return `${match[1]}年${Number(match[2])}月`
}

function formatDateLabel(dateKey: string) {
  return dateKey.replace(/-/g, '.')
}

function createExcerpt(text: string, maxLength: number) {
  const excerpt = text.replace(/\s+/g, ' ').trim()

  if (excerpt.length <= maxLength) {
    return excerpt
  }

  return `${excerpt.slice(0, maxLength).trimEnd()}...`
}

export default PhotosPage
