import type { JournalIndexEntry } from './journalIndex/types'

export type DailyCurationArtifact = 'postcard' | 'library-card' | 'receipt'

export type DailyCuration = {
  version: 1
  id: string
  curationDate: string
  generatedAt: string
  generation: number
  artifact: DailyCurationArtifact
  source: {
    date: string
    title: string
    excerpt: string
    tags: string[]
    collections: string[]
    image?: {
      src: string
      caption?: string
    }
  }
  title: string
  curatorNote: string
  reason: string
  question: string
  recall: {
    label: string
    rule: string
    score: number
  }
}

type ScoredEntry = {
  entry: JournalIndexEntry
  score: number
  dayDistance: number
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

const curatorNotes = [
  '我翻到这一页的时候，它像一张从抽屉里自己滑出来的通行证。没有解释人生，只是把当时的你搬到今天的桌面上。',
  '这页有一点离谱的安静，像有人把一盏小灯递给逗号。它不催你复盘，只是提醒今天可以多看一眼。',
  '我本来只想路过，结果这段文字把袖口勾住了。它看起来很日常，但日常有时候是最会装作无事发生的证人。',
  '这页适合今天，因为它像一枚过期但仍然有效的车票。目的地不一定清楚，至少证明你真的经过那里。',
]

const questions = [
  '现在的你，会给那一天补一句什么旁白？',
  '如果把这页重新放回今天，它会变成提醒、玩笑，还是一个小小的答案？',
  '当时那个判断，现在还站得住吗？',
  '你愿意把这段旧天气借给今天几分钟吗？',
]

export function createDailyCuration(
  entries: JournalIndexEntry[],
  date = new Date(),
  generation = 0,
): DailyCuration | null {
  const curationDate = getLocalDateKey(date)
  const candidates = entries
    .filter((entry) => entry.date < curationDate)
    .map((entry) => scoreEntry(entry, date, generation))
    .sort((left, right) => right.score - left.score)

  if (candidates.length === 0) {
    return null
  }

  const selected = candidates[generation % Math.min(candidates.length, 5)]
  const source = selected.entry
  const sourceTitle = source.title ?? createEntryTitle(source)
  const sourceExcerpt = source.excerpt ?? createEntryExcerpt(source.searchableText)
  const noteIndex = stableIndex(`${curationDate}:${source.date}:note:${generation}`, curatorNotes.length)
  const questionIndex = stableIndex(`${curationDate}:${source.date}:question:${generation}`, questions.length)

  return {
    artifact: chooseArtifact(source, generation),
    curationDate,
    curatorNote: curatorNotes[noteIndex],
    generatedAt: new Date().toISOString(),
    generation,
    id: `daily-curation-${curationDate}-${generation}`,
    question: questions[questionIndex],
    reason: createReason(selected, date),
    recall: {
      label: createRecallLabel(selected, date),
      rule: selected.dayDistance <= 7 ? '时间节点相似' : '历史日记召回',
      score: selected.score,
    },
    source: {
      collections: source.collections,
      date: source.date,
      excerpt: sourceExcerpt,
      image: source.images[0]
        ? {
            caption: source.images[0].caption,
            src: source.images[0].src,
          }
        : undefined,
      tags: source.tags,
      title: sourceTitle,
    },
    title: `今天翻到：${sourceTitle}`,
    version: 1,
  }
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function scoreEntry(entry: JournalIndexEntry, today: Date, generation: number): ScoredEntry {
  const entryDate = parseDateKey(entry.date)
  const dayDistance = getCircularDayDistance(today, entryDate)
  const monthBonus = entryDate.getMonth() === today.getMonth() ? 14 : 0
  const exactMonthDayBonus =
    entryDate.getMonth() === today.getMonth() && entryDate.getDate() === today.getDate() ? 34 : 0
  const contentWeight = Math.min(Math.max(entry.stats.wordCount, entry.searchableText.length / 2), 120) / 10
  const metadataWeight = Math.min(entry.tags.length + entry.collections.length, 6) * 2.4
  const ageInDays = Math.max(0, Math.floor((today.getTime() - entryDate.getTime()) / DAY_IN_MS))
  const ageWeight = Math.min(ageInDays / 40, 10)
  const timeSimilarity = Math.max(0, 42 - dayDistance * 2.2)
  const jitter = stableIndex(`${entry.date}:${today.toISOString().slice(0, 10)}:${generation}`, 1000) / 100

  return {
    dayDistance,
    entry,
    score: timeSimilarity + monthBonus + exactMonthDayBonus + contentWeight + metadataWeight + ageWeight + jitter,
  }
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)

  return new Date(year, month - 1, day)
}

function getCircularDayDistance(left: Date, right: Date) {
  const leftDay = getDayOfYear(left)
  const rightDay = getDayOfYear(right)
  const directDistance = Math.abs(leftDay - rightDay)

  return Math.min(directDistance, 366 - directDistance)
}

function getDayOfYear(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0)

  return Math.floor((date.getTime() - start.getTime()) / DAY_IN_MS)
}

function createEntryTitle(entry: JournalIndexEntry) {
  const firstTag = entry.tags[0] ?? entry.collections[0]

  if (firstTag) {
    return `${formatDateLabel(entry.date)} 的${firstTag}`
  }

  return `${formatDateLabel(entry.date)} 的一页`
}

function createEntryExcerpt(text: string) {
  const excerpt = text.replace(/\s+/g, ' ').trim()

  if (!excerpt) {
    return '这一天留下了一点痕迹。'
  }

  return excerpt.length > 72 ? `${excerpt.slice(0, 72).trimEnd()}...` : excerpt
}

function createReason(scoredEntry: ScoredEntry, today: Date) {
  if (scoredEntry.dayDistance <= 3) {
    return '它和今天几乎踩在同一个日历缝隙上，像旧页轻轻碰了一下今天的袖口。'
  }

  if (scoredEntry.dayDistance <= 14) {
    return '它离今天的时间节点很近，适合拿出来看看：同一段季节里，心事常常会换一种姿势回来。'
  }

  const yearGap = Math.max(1, today.getFullYear() - parseDateKey(scoredEntry.entry.date).getFullYear())

  return `它已经隔了大约 ${yearGap} 年，距离刚好够远，可以不急着解释，只先把当时的光线看清楚。`
}

function createRecallLabel(scoredEntry: ScoredEntry, today: Date) {
  if (scoredEntry.dayDistance <= 3) {
    return '近似往年今日'
  }

  if (parseDateKey(scoredEntry.entry.date).getMonth() === today.getMonth()) {
    return '同月回声'
  }

  return '历史回声'
}

function chooseArtifact(entry: JournalIndexEntry, generation: number): DailyCurationArtifact {
  if (entry.images.length > 0) {
    return 'postcard'
  }

  if (entry.murmurs.length >= 2 || generation % 3 === 1) {
    return 'library-card'
  }

  return 'receipt'
}

function formatDateLabel(dateKey: string) {
  return dateKey.replace(/-/g, '.')
}

function stableIndex(input: string, modulo: number) {
  let hash = 0

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0
  }

  return modulo === 0 ? 0 : hash % modulo
}
