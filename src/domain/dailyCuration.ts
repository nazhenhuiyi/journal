import type { JournalIndexEntry } from './journalIndex/types'

export type DailyCurationArtifact = 'postcard' | 'library-card' | 'receipt'

export type TodayContext = {
  date: string
  weekday: string
  season: string
  weather?: {
    text: string
    temperature?: string
    location?: string
  }
  journal?: {
    exists: boolean
    title?: string
    excerpt?: string
    tags: string[]
  }
}

export type CurationThesis = {
  title: string
  subtitle: string
  curatorVoice: string
  reason: string
  lens: 'season' | 'anniversary' | 'theme' | 'contrast' | 'forgotten'
}

export type CurationAnchors = {
  theme: {
    label: string
    body: string
  }
  time: {
    label: string
    body: string
  }
  primary: 'theme' | 'time'
}

export type EchoArtifact = {
  entryId: string
  date: string
  title: string
  excerpt: string
  tags: string[]
  collections: string[]
  image?: {
    src: string
    caption?: string
  }
  recallLabel: string
  recallReason: string
  cardStyle: 'postcard' | 'photo' | 'letter' | 'receipt'
}

export type EchoSupportCard = {
  id: string
  role: 'parallel-memory' | 'contrast-memory' | 'theme-note' | 'receipt' | 'scene-memory'
  title: string
  body: string
  connection?: string
  items?: Array<{
    label: string
    value: string
  }>
  source?: {
    date: string
    title: string
    excerpt: string
  }
  cardStyle: 'sticky' | 'receipt' | 'library' | 'mini-postcard'
}

export type DailyCuration = {
  version: 5
  id: string
  curationDate: string
  generatedAt: string
  generation: number
  today: TodayContext
  anchors: CurationAnchors
  thesis: CurationThesis
  hero: EchoArtifact
  supports: EchoSupportCard[]
  closingQuestion: string
  // Compatibility fields for the current renderer while the curation package evolves.
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
  ageInDays: number
  score: number
  dayDistance: number
}

const DAY_IN_MS = 24 * 60 * 60 * 1000
const MIN_HISTORY_AGE_DAYS = 21
const SOFT_HISTORY_AGE_DAYS = 7

const curatorNotes = [
  '这页不负责解释你，只负责把当时的一点空气递回来。它看起来普通，普通得很有证词感。',
  '我把它翻出来，是因为它没有用力证明什么。它只是站在那里，像一张小纸条说：你看，当时也有这样的一天。',
  '这页有点像从口袋里摸出来的旧票根，边角不锋利，但确实去过某个地方。今天可以借它坐一会儿。',
  '它不是大事件，更像一个很会躲的逗号。隔了一段时间再看，反而能听见当时没说完的半句。',
]

const questions = [
  '现在的你，会给那一天补一句什么旁白？',
  '如果把这页重新放回今天，它会变成提醒、玩笑，还是一个小小的答案？',
  '当时那个判断，现在还站得住吗？',
  '这页如果忽然坐到你旁边，会先问你哪一句废话？',
]

export function createDailyCuration(
  entries: JournalIndexEntry[],
  date = new Date(),
  generation = 0,
  todayContext = createDefaultTodayContext(date),
): DailyCuration | null {
  const curationDate = getLocalDateKey(date)
  const allCandidates = entries
    .filter((entry) => entry.date < curationDate)
    .map((entry) => scoreEntry(entry, date, generation, todayContext))
    .sort((left, right) => right.score - left.score)
  const candidates = createCandidatePool(allCandidates)

  if (candidates.length === 0) {
    return null
  }

  const selected = candidates[generation % Math.min(candidates.length, 5)]
  const source = selected.entry
  const sourceTitle = source.title ?? createEntryTitle(source)
  const sourceExcerpt = source.excerpt ?? createEntryExcerpt(source.searchableText)
  const noteIndex = stableIndex(`${curationDate}:${source.date}:note:${generation}`, curatorNotes.length)
  const questionIndex = stableIndex(`${curationDate}:${source.date}:question:${generation}`, questions.length)
  const recallLabel = createRecallLabel(selected, date)
  const topic = inferEntryTopic(source, todayContext)
  const anchors = createCurationAnchors(selected, date, todayContext, topic)
  const recallReason = createReason(selected, date, todayContext, anchors)
  const hero: EchoArtifact = {
    cardStyle: source.images[0] ? 'photo' : topic === '做点吃的' ? 'receipt' : 'letter',
    collections: source.collections,
    date: source.date,
    entryId: source.filePath,
    excerpt: sourceExcerpt,
    image: source.images[0]
      ? {
          caption: source.images[0].caption,
          src: source.images[0].src,
        }
      : undefined,
    recallLabel,
    recallReason,
    tags: source.tags,
    title: sourceTitle,
  }
  const thesis = createThesis(hero, selected, todayContext, noteIndex, anchors)
  const supports = createSupportCards(candidates, selected, todayContext, generation, anchors)

  return {
    anchors,
    artifact: chooseArtifact(source, generation),
    curationDate,
    curatorNote: createCuratorNote(sourceTitle, sourceExcerpt, noteIndex),
    closingQuestion: questions[questionIndex],
    generatedAt: new Date().toISOString(),
    generation,
    hero,
    id: `daily-curation-${curationDate}-${generation}`,
    question: questions[questionIndex],
    reason: createReason(selected, date, todayContext, anchors),
    recall: {
      label: recallLabel,
      rule: createRecallRule(selected, date),
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
    supports,
    thesis,
    today: todayContext,
    title: `今日回声：${sourceTitle}`,
    version: 5,
  }
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function scoreEntry(
  entry: JournalIndexEntry,
  today: Date,
  generation: number,
  todayContext: TodayContext,
): ScoredEntry {
  const entryDate = parseDateKey(entry.date)
  const dayDistance = getCircularDayDistance(today, entryDate)
  const monthBonus = entryDate.getMonth() === today.getMonth() ? 14 : 0
  const exactMonthDayBonus =
    entryDate.getMonth() === today.getMonth() && entryDate.getDate() === today.getDate() ? 34 : 0
  const contentWeight = Math.min(Math.max(entry.stats.wordCount, entry.searchableText.length / 2), 120) / 10
  const metadataWeight = Math.min(entry.tags.length + entry.collections.length, 6) * 2.4
  const ageInDays = Math.max(0, Math.floor((today.getTime() - entryDate.getTime()) / DAY_IN_MS))
  const ageWeight = Math.min(ageInDays / 35, 12)
  const recentPenalty = ageInDays < MIN_HISTORY_AGE_DAYS ? 26 : 0
  const timeSimilarity = Math.max(0, 42 - dayDistance * 2.2)
  const todayAffinity = scoreTodayAffinity(entry, todayContext)
  const jitter = stableIndex(`${entry.date}:${today.toISOString().slice(0, 10)}:${generation}`, 1000) / 100

  return {
    ageInDays,
    dayDistance,
    entry,
    score:
      timeSimilarity +
      monthBonus +
      exactMonthDayBonus +
      contentWeight +
      metadataWeight +
      ageWeight +
      todayAffinity +
      jitter -
      recentPenalty,
  }
}

function createCandidatePool(candidates: ScoredEntry[]) {
  const historyCandidates = candidates.filter((candidate) => candidate.ageInDays >= MIN_HISTORY_AGE_DAYS)

  if (historyCandidates.length > 0) {
    return historyCandidates
  }

  const softHistoryCandidates = candidates.filter((candidate) => candidate.ageInDays >= SOFT_HISTORY_AGE_DAYS)

  if (softHistoryCandidates.length > 0) {
    return softHistoryCandidates
  }

  return [...candidates].sort((left, right) => right.ageInDays - left.ageInDays || right.score - left.score)
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

function createReason(
  scoredEntry: ScoredEntry,
  today: Date,
  todayContext?: TodayContext,
  anchors?: CurationAnchors,
) {
  const topic = inferEntryTopic(scoredEntry.entry, todayContext)
  const themeLead = anchors?.theme.body ?? `它把“${topic}”留得很具体。`
  const timeLead = anchors?.time.body ?? createTimeAnchorBody(scoredEntry, today)

  if (scoredEntry.ageInDays < SOFT_HISTORY_AGE_DAYS) {
    return `${themeLead} ${timeLead} 这页离今天还很近，所以只当作近处回声来听。`
  }

  if (scoredEntry.ageInDays < MIN_HISTORY_AGE_DAYS) {
    return `${themeLead} ${timeLead} 它还不算很久以前，但已经从今天退开了一小段距离，不像复盘，更像把纸条重新展开。`
  }

  if (scoredEntry.dayDistance <= 5) {
    return `${themeLead} ${timeLead} 不像结论，更像旧日子从抽屉里探头：我还在这儿。`
  }

  if (scoredEntry.dayDistance <= 14) {
    return `${themeLead} ${timeLead} 这个距离刚好适合回看，不贴脸，也不失真。`
  }

  const yearGap = Math.max(1, today.getFullYear() - parseDateKey(scoredEntry.entry.date).getFullYear())

  return `${themeLead} ${timeLead} 它已经隔了大约 ${yearGap} 年，远到不必立刻解释，近到还认得出当时留下的光线。`
}

function createThesis(
  hero: EchoArtifact,
  scoredEntry: ScoredEntry,
  todayContext: TodayContext,
  noteIndex: number,
  anchors: CurationAnchors,
): CurationThesis {
  const recallRule = createRecallRule(scoredEntry, parseDateKey(todayContext.date))
  const topic = inferEntryTopic(scoredEntry.entry, todayContext)
  const lens = anchors.primary === 'time' ? 'season' : 'theme'

  return {
    curatorVoice: createCuratorNote(hero.title, hero.excerpt, noteIndex),
    lens,
    reason: createReason(scoredEntry, parseDateKey(todayContext.date), todayContext, anchors),
    subtitle:
      anchors.primary === 'time' && recallRule === '时间节点相似'
        ? `今天先翻一页同一段季节里、也关于“${topic}”的旧日子。`
        : `今天先翻一页关于“${topic}”的旧日子，再看它和此刻隔着怎样的时间。`,
    title: hero.title,
  }
}

function createCurationAnchors(
  scoredEntry: ScoredEntry,
  today: Date,
  todayContext: TodayContext,
  topic: string,
): CurationAnchors {
  const todayAffinity = scoreTodayAffinity(scoredEntry.entry, todayContext)
  const hasStrongTimeAnchor =
    scoredEntry.dayDistance <= 14 || parseDateKey(scoredEntry.entry.date).getMonth() === today.getMonth()
  const primary = todayAffinity > 0 || !hasStrongTimeAnchor ? 'theme' : 'time'

  return {
    primary,
    theme: {
      body: createThemeAnchorBody(scoredEntry.entry, todayContext, topic),
      label: '主题线索',
    },
    time: {
      body: createTimeAnchorBody(scoredEntry, today),
      label: '时间线索',
    },
  }
}

function createThemeAnchorBody(entry: JournalIndexEntry, todayContext: TodayContext, topic: string) {
  const todayTitle = todayContext.journal?.title?.trim()
  const todayTags = todayContext.journal?.tags ?? []
  const entryText = [entry.title, entry.excerpt, entry.searchableText, ...entry.tags, ...entry.collections]
    .filter(Boolean)
    .join(' ')
  const tagMatch = todayTags.find((tag) => entryText.includes(tag))

  if (todayTitle) {
    return `今天的《${todayTitle}》让“${topic}”先亮起来，旧页正好从另一个角度接住它。`
  }

  if (tagMatch) {
    return `今天的「${tagMatch}」和旧页里的“${topic}”彼此搭上了线，像同一件小事换了时间。`
  }

  if (todayContext.weather?.text && entryText.includes(todayContext.weather.text)) {
    return `今天的${todayContext.weather.text}把旧页里的“${topic}”叫近了一点，天气先替记忆搭了一座桥。`
  }

  return `这页把“${topic}”留得很具体，适合替今天补上一点旧光。`
}

function createTimeAnchorBody(scoredEntry: ScoredEntry, today: Date) {
  const entryDate = parseDateKey(scoredEntry.entry.date)

  if (scoredEntry.ageInDays < SOFT_HISTORY_AGE_DAYS) {
    return '它离今天还很近，近到仍能听见当时的呼吸，但已经退开了半步。'
  }

  if (scoredEntry.ageInDays < MIN_HISTORY_AGE_DAYS) {
    return '它从今天旁边退开了一小段距离，刚好能被当作短程回声重新看见。'
  }

  if (entryDate.getMonth() === today.getMonth() && entryDate.getDate() === today.getDate()) {
    return '它和今天落在同一个月日上，像往年今日把一张纸轻轻递回来。'
  }

  if (scoredEntry.dayDistance <= 5) {
    return '它几乎踩在同一段日历缝隙上，季节的气口和今天挨得很近。'
  }

  if (scoredEntry.dayDistance <= 14) {
    return '它离今天的时间节点不远，季节还在同一段光线里。'
  }

  if (entryDate.getMonth() === today.getMonth()) {
    return '它和今天同在这个月份里，像从同一只抽屉翻出的另一张纸。'
  }

  return '它已经隔开了一段时间，距离足够让旧日变成可被温柔观看的材料。'
}

function createSupportCards(
  candidates: ScoredEntry[],
  selected: ScoredEntry,
  todayContext: TodayContext,
  generation: number,
  anchors: CurationAnchors,
): EchoSupportCard[] {
  const cards: EchoSupportCard[] = []
  const topic = inferEntryTopic(selected.entry, todayContext)

  cards.push({
    body: createThemeNoteBody(selected.entry, todayContext, topic, anchors),
    cardStyle: 'sticky',
    id: `theme-${selected.entry.date}-${generation}`,
    role: 'theme-note',
    title: `${topic}便签`,
  })

  const parallel = candidates.find((candidate) => candidate.entry.date !== selected.entry.date)

  if (parallel) {
    const title = parallel.entry.title ?? createEntryTitle(parallel.entry)
    const connection = createParallelConnection(selected.entry, parallel.entry, todayContext)

    cards.push({
      body: createEntryExcerpt(parallel.entry.excerpt ?? parallel.entry.searchableText),
      cardStyle: 'mini-postcard',
      connection,
      id: `parallel-${parallel.entry.date}-${generation}`,
      role: 'parallel-memory',
      source: {
        date: parallel.entry.date,
        excerpt: createEntryExcerpt(parallel.entry.searchableText),
        title,
      },
      title: `旁边还有一页：${title}`,
    })
  }

  cards.push({
    body: createReceiptBody(selected.entry, todayContext),
    cardStyle: 'receipt',
    id: `receipt-${selected.entry.date}-${generation}`,
    items: createReceiptItems(selected.entry, todayContext, topic, anchors),
    role: 'receipt',
    title: '今日回声小票',
  })

  return cards.slice(0, 3)
}

function createReceiptBody(entry: JournalIndexEntry, todayContext: TodayContext) {
  const todayTags = todayContext.journal?.tags ?? []
  const tags = [...todayTags, ...entry.tags, ...entry.collections].slice(0, 4)

  if (tags.length === 0) {
    return '今天 / 旧页 / 一点被重新看见的日常'
  }

  return tags.join(' / ')
}

function createReceiptItems(
  entry: JournalIndexEntry,
  todayContext: TodayContext,
  topic: string,
  anchors: CurationAnchors,
) {
  const tags = [...(todayContext.journal?.tags ?? []), ...entry.tags, ...entry.collections]
  const sourceTitle = entry.title ?? createEntryTitle(entry)

  return [
    { label: '主题线索', value: topic },
    { label: '时间线索', value: anchors.time.body },
    { label: '旧页证据', value: sourceTitle },
    { label: '找零', value: tags[0] ? `一点${tags[0]}` : '一点普通日常' },
  ]
}

function createThemeNoteBody(
  entry: JournalIndexEntry,
  todayContext: TodayContext,
  topic: string,
  anchors: CurationAnchors,
) {
  const todayTitle = todayContext.journal?.title
  const entryTitle = entry.title ?? createEntryTitle(entry)

  if (todayTitle) {
    return `今天的《${todayTitle}》旁边，先夹一张《${entryTitle}》。${anchors.theme.body}`
  }

  return `策展人把“${topic}”当成书签。${anchors.theme.body}`
}

function createParallelConnection(
  selected: JournalIndexEntry,
  parallel: JournalIndexEntry,
  todayContext: TodayContext,
) {
  const selectedTokens = new Set(
    tokenize(
      [
        selected.title,
        selected.excerpt,
        selected.searchableText,
        ...selected.tags,
        ...selected.collections,
        ...(todayContext.journal?.tags ?? []),
      ]
        .filter(Boolean)
        .join(' '),
    ),
  )
  const match = tokenize([parallel.title, parallel.excerpt, parallel.searchableText, ...parallel.tags, ...parallel.collections].filter(Boolean).join(' ')).find(
    (token) => selectedTokens.has(token),
  )

  if (match) {
    return `共同线索：${match}`
  }

  return '关系：不是同一件事，但气口挨得很近'
}

function inferEntryTopic(entry: JournalIndexEntry, todayContext?: TodayContext) {
  const text = [entry.title, entry.excerpt, entry.searchableText, ...entry.tags, ...entry.collections, ...(todayContext?.journal?.tags ?? [])]
    .filter(Boolean)
    .join(' ')

  if (/AI|Codex|应用|开发|互联网|产品|灵感|模型|代码/i.test(text)) {
    return '把想法落地'
  }

  if (/创作|创造|绘本|画风|插画|手账|荒诞|加缪/.test(text)) {
    return '创造的选择权'
  }

  if (/身体|散步|跑|睡|病|疼|累|健身|运动/.test(text)) {
    return '照看身体'
  }

  if (/菜|饭|肉|烤|炒|吃饭|餐|咖啡|奶茶|苦瓜|黄瓜|厨房|做法/.test(text)) {
    return '做点吃的'
  }

  if (/朋友|家人|妈妈|母亲|父亲|同事|聊天|关系/.test(text)) {
    return '人与人的小信号'
  }

  return entry.tags[0] ?? entry.collections[0] ?? todayContext?.season ?? '普通日常'
}

function createDefaultTodayContext(date: Date): TodayContext {
  return {
    date: getLocalDateKey(date),
    season: getSeason(date),
    weekday: new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(date),
  }
}

function scoreTodayAffinity(entry: JournalIndexEntry, todayContext: TodayContext) {
  const todayTokens = [
    todayContext.weather?.text,
    todayContext.weather?.location,
    todayContext.season,
    todayContext.journal?.title,
    todayContext.journal?.excerpt,
    ...(todayContext.journal?.tags ?? []),
  ]
    .filter((token): token is string => Boolean(token?.trim()))
    .flatMap(tokenize)

  if (todayTokens.length === 0) {
    return 0
  }

  const entryTokens = new Set(tokenize([entry.title, entry.excerpt, entry.searchableText, ...entry.tags, ...entry.collections].filter(Boolean).join(' ')))
  const matchCount = todayTokens.filter((token) => entryTokens.has(token)).length

  return Math.min(matchCount * 5, 24)
}

function tokenize(text: string) {
  const normalized = text.toLowerCase()
  const tokens = normalized.match(/[\u4e00-\u9fff]{1,2}|[a-z0-9]+/g) ?? []

  return tokens.filter((token) => token.length > 0)
}

function getSeason(date: Date) {
  const month = date.getMonth() + 1

  if (month >= 3 && month <= 5) {
    return '春天'
  }

  if (month >= 6 && month <= 8) {
    return '夏天'
  }

  if (month >= 9 && month <= 11) {
    return '秋天'
  }

  return '冬天'
}

function createRecallLabel(scoredEntry: ScoredEntry, today: Date) {
  if (scoredEntry.ageInDays < SOFT_HISTORY_AGE_DAYS) {
    return '近处回声'
  }

  if (scoredEntry.ageInDays < MIN_HISTORY_AGE_DAYS) {
    return '短程回声'
  }

  if (scoredEntry.dayDistance <= 5) {
    return '近似往年今日'
  }

  if (parseDateKey(scoredEntry.entry.date).getMonth() === today.getMonth()) {
    return '同月回声'
  }

  return '历史回声'
}

function createRecallRule(scoredEntry: ScoredEntry, today: Date) {
  if (scoredEntry.ageInDays < SOFT_HISTORY_AGE_DAYS) {
    return '近处召回'
  }

  if (scoredEntry.ageInDays < MIN_HISTORY_AGE_DAYS) {
    return '短程召回'
  }

  if (scoredEntry.dayDistance <= 14 || parseDateKey(scoredEntry.entry.date).getMonth() === today.getMonth()) {
    return '时间节点相似'
  }

  return '历史日记召回'
}

function createCuratorNote(title: string, excerpt: string, noteIndex: number) {
  const selectedNote = curatorNotes[noteIndex]
  const subject = title.length > 18 ? '这页' : `《${title}》`
  const hasShortExcerpt = excerpt.length <= 34

  if (hasShortExcerpt) {
    return `${subject}留下的东西很少，反而像一枚钉子：不大声，但钉在那里。${selectedNote}`
  }

  return `${subject}不是被总结出来的，它更像被翻到的。${selectedNote}`
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
