import type { JournalIndexEntry } from './journalIndex/types'

export type DailyCurationArtifact = 'postcard' | 'library-card' | 'receipt'
export type EchoObjectSlot = 'today-thread' | 'nearby-memory' | 'archive-ledger' | 'daily-receipt' | 'reply-ticket'
export type EchoObjectStyle = 'sticky' | 'postcard' | 'polaroid' | 'library-card' | 'receipt' | 'movie-ticket'

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

export type EchoObjectCard = {
  id: string
  slot: EchoObjectSlot
  style: EchoObjectStyle
  title: string
  body: string
  meta?: string
  tone?: string
  kicker?: string
  date?: string
  place?: string
  caption?: string
  connection?: string
  source?: {
    date: string
    title: string
    excerpt: string
  }
  image?: {
    src: string
    alt: string
    caption?: string
  }
  items?: Array<{
    label: string
    value: string
  }>
  rows?: Array<{
    label: string
    value: string
    note: string
    dateTime?: string
  }>
  action?: {
    label: string
    to: string
  }
}

export type DailyCurationAiObjectDraft = {
  slot?: EchoObjectSlot
  enabled?: boolean
  title?: string
  body?: string
  meta?: string
  caption?: string
  connection?: string
  question?: string
  items?: Array<{
    label: string
    value: string
  }>
}

export type DailyCurationAiDraft = {
  subtitle?: string
  curatorVoice?: string
  closingQuestion?: string
  themeNoteTitle?: string
  themeNoteBody?: string
  parallelConnection?: string
  receiptItems?: Array<{
    label: string
    value: string
  }>
  objectDrafts?: DailyCurationAiObjectDraft[]
}

export type DailyCuration = {
  version: 6
  id: string
  curationDate: string
  generatedAt: string
  generation: number
  today: TodayContext
  anchors: CurationAnchors
  thesis: CurationThesis
  hero: EchoArtifact
  supports: EchoSupportCard[]
  objects?: EchoObjectCard[]
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
  ai?: {
    generatedAt: string
    provider: 'codex'
    threadId: string | null
    usage: {
      input_tokens: number
      cached_input_tokens: number
      output_tokens: number
    } | null
  }
}

export type DailyCurationDisplay = {
  artifact: {
    badge: string
    cardStyle: EchoArtifact['cardStyle']
    caption?: {
      badge: string
      date: string
    }
    dateLabel: string
    eyebrow: string
    image?: {
      alt: string
      src: string
    }
  }
  main: {
    excerpt: string
    kicker: string
    kickerLabel: string
    note: string
    question: string
    tags: string[]
    title: string
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
  '这页没有用力证明什么，只是站在那里，像一张小纸条说：你看，当时也有这样的一天。',
  '这页有点像从口袋里摸出来的旧票根，边角不锋利，但确实去过某个地方。今天可以借它坐一会儿。',
  '它不是大事件，更像一个很会躲的逗号。隔了一段时间再看，反而能听见当时没说完的半句。',
]

const questions = [
  '现在的你，会给那一天补一句什么旁白？',
  '如果把这页重新放回今天，它会变成提醒、玩笑，还是一个小小的答案？',
  '当时那个判断，现在还站得住吗？',
  '这页如果忽然坐到你旁边，最先让你想起哪个细节？',
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
  const closingQuestion = questions[questionIndex]
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
  const supports = createSupportCards(candidates, selected, todayContext, generation)
  const objects = createEchoObjectDeck(candidates, selected, todayContext, generation, closingQuestion, anchors)

  return {
    anchors,
    artifact: chooseArtifact(source, generation),
    curationDate,
    curatorNote: createCuratorNote(sourceTitle, sourceExcerpt, noteIndex),
    closingQuestion,
    generatedAt: new Date().toISOString(),
    generation,
    hero,
    id: `daily-curation-${curationDate}-${generation}`,
    objects,
    question: closingQuestion,
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
    version: 6,
  }
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function createDailyCurationDisplay(curation: DailyCuration): DailyCurationDisplay {
  const image = curation.source.image ?? curation.hero.image

  return {
    artifact: {
      badge: curation.recall.label,
      caption: image
        ? {
            badge: curation.recall.label,
            date: curation.source.date.replace(/-/g, '.'),
          }
        : undefined,
      cardStyle: curation.hero.cardStyle,
      dateLabel: formatArchiveMonthDay(curation.source.date),
      eyebrow: 'ARCHIVE NOTE',
      image: image
        ? {
            alt: image.caption ?? curation.source.title,
            src: image.src,
          }
        : undefined,
    },
    main: {
      excerpt: curation.source.excerpt,
      kicker: formatDisplaySubtitle(curation),
      kickerLabel: '今日翻到',
      note: createDisplayConnectionNote(curation),
      question: curation.closingQuestion,
      tags: createDisplayTags(curation),
      title: curation.source.title,
    },
  }
}

export function createDailyCurationReceiptItems(curation: DailyCuration) {
  return createReceiptItemsFromParts({
    changeTags: [...(curation.today.journal?.tags ?? []), ...curation.source.tags, ...curation.source.collections],
    todayContext: curation.today,
    todayTitle: curation.today.journal?.title ?? '今天',
    topic: inferCurationTopic(curation),
  })
}

export function createLegacyEchoObjectDeck(curation: DailyCuration): EchoObjectCard[] {
  const topic = inferCurationTopic(curation)
  const themeSupport = curation.supports.find((support) => support.role === 'theme-note')
  const parallelSupport = curation.supports.find((support) => support.role === 'parallel-memory')
  const receiptSupport = curation.supports.find((support) => support.role === 'receipt')
  const nearbySource = parallelSupport?.source ?? {
    date: curation.source.date,
    excerpt: curation.source.excerpt,
    title: curation.source.title,
  }
  const receiptItems = receiptSupport?.items?.length ? receiptSupport.items : createDailyCurationReceiptItems(curation)

  return [
    {
      body: themeSupport?.body ?? createFallbackDisplayConnectionNote(curation),
      id: `object-today-thread-${curation.source.date}-${curation.generation}`,
      meta: `轻连接 · ${curation.today.weekday}`,
      slot: 'today-thread',
      style: 'sticky',
      title: themeSupport?.title ?? `${topic}便签`,
      tone: createStickyTone(`${curation.id}:thread`),
    },
    {
      body: nearbySource.excerpt,
      caption: parallelSupport?.connection,
      connection: parallelSupport?.connection,
      date: nearbySource.date,
      id: `object-nearby-${nearbySource.date}-${curation.generation}`,
      image: curation.source.image
        ? {
            alt: curation.source.image.caption ?? nearbySource.title,
            caption: curation.source.image.caption,
            src: curation.source.image.src,
          }
        : undefined,
      meta: formatObjectDate(nearbySource.date),
      place: createObjectPlace(curation.source.collections, curation.source.tags, curation.today),
      slot: 'nearby-memory',
      source: nearbySource,
      style: 'postcard',
      title: nearbySource.title,
      tone: createPostcardTone(`${nearbySource.date}:legacy`),
    },
    {
      body: curation.source.excerpt,
      id: `object-ledger-${curation.source.date}-${curation.generation}`,
      meta: `馆藏号 ${createArchiveNo(curation.source.date)}`,
      rows: createLegacyArchiveRows(curation, parallelSupport?.source),
      slot: 'archive-ledger',
      source: {
        date: curation.source.date,
        excerpt: curation.source.excerpt,
        title: curation.source.title,
      },
      style: 'library-card',
      title: '这页的借阅记录',
    },
    {
      body: receiptSupport?.body ?? receiptItems.map((item) => item.value).join(' / '),
      id: `object-receipt-${curation.source.date}-${curation.generation}`,
      items: receiptItems,
      meta: createReceiptOrderNo(curation.today.date, curation.generation),
      slot: 'daily-receipt',
      style: 'receipt',
      title: receiptSupport?.title ?? '今日回声小票',
    },
    {
      action: {
        label: '写一句回应',
        to: `/calendar?date=${encodeURIComponent(curation.today.date)}`,
      },
      body: curation.closingQuestion,
      id: `object-reply-${curation.today.date}-${curation.generation}`,
      meta: 'KEEP STUB',
      slot: 'reply-ticket',
      style: 'movie-ticket',
      title: '给今天留一张票',
    },
  ]
}

export function applyDailyCurationAiDraft(
  curation: DailyCuration,
  draft: DailyCurationAiDraft,
  metadata: DailyCuration['ai'],
): DailyCuration {
  const subtitle = cleanAiText(draft.subtitle, 72)
  const curatorVoice = cleanAiText(draft.curatorVoice, 240)
  const closingQuestion = cleanAiText(draft.closingQuestion, 96)
  const themeNoteTitle = cleanAiText(draft.themeNoteTitle, 24)
  const themeNoteBody = cleanAiText(draft.themeNoteBody, 160)
  const parallelConnection = cleanAiText(draft.parallelConnection, 44)
  const receiptItems = normalizeAiReceiptItems(draft.receiptItems, curation)
  const objects = applyAiObjectDrafts(curation.objects ?? createLegacyEchoObjectDeck(curation), draft.objectDrafts, receiptItems)
  const supports = curation.supports.map((support) => {
    if (support.role === 'theme-note') {
      return {
        ...support,
        body: themeNoteBody ?? support.body,
        title: themeNoteTitle ?? support.title,
      }
    }

    if (support.role === 'parallel-memory') {
      return {
        ...support,
        connection: parallelConnection ?? support.connection,
      }
    }

    if (support.role === 'receipt') {
      return {
        ...support,
        items: receiptItems ?? support.items,
      }
    }

    return support
  })

  return {
    ...curation,
    ai: metadata,
    closingQuestion: closingQuestion ?? curation.closingQuestion,
    objects,
    question: closingQuestion ?? curation.question,
    supports,
    thesis: {
      ...curation.thesis,
      curatorVoice: curatorVoice ?? curation.thesis.curatorVoice,
      subtitle: subtitle ?? curation.thesis.subtitle,
    },
  }
}

function applyAiObjectDrafts(
  objects: EchoObjectCard[],
  drafts: DailyCurationAiDraft['objectDrafts'],
  legacyReceiptItems?: Array<{ label: string; value: string }>,
) {
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return objects
  }

  const objectBySlot = new Map(objects.map((object) => [object.slot, object]))
  const selected: EchoObjectCard[] = []
  const seenSlots = new Set<EchoObjectSlot>()

  drafts.forEach((draft) => {
    if (!draft.slot || !isEchoObjectSlot(draft.slot) || seenSlots.has(draft.slot) || draft.enabled === false) {
      return
    }

    const object = objectBySlot.get(draft.slot)

    if (!object) {
      return
    }

    seenSlots.add(draft.slot)
    selected.push(applyAiObjectDraft(object, draft, legacyReceiptItems))
  })

  return selected.length > 0 ? selected : objects
}

function applyAiObjectDraft(
  object: EchoObjectCard,
  draft: DailyCurationAiObjectDraft,
  legacyReceiptItems?: Array<{ label: string; value: string }>,
) {
  const title = cleanAiText(draft.title, 36)
  const body = cleanAiText(draft.body, 180)
  const meta = cleanAiText(draft.meta, 36)
  const caption = cleanAiText(draft.caption, 72)
  const connection = cleanAiText(draft.connection, 72)
  const question = object.slot === 'reply-ticket' ? cleanAiText(draft.question, 96) : undefined
  const items = normalizeAiObjectItems(draft.items, object.items) ?? (object.slot === 'daily-receipt' ? legacyReceiptItems : undefined)

  return {
    ...object,
    body: question ?? body ?? object.body,
    caption: caption ?? object.caption,
    connection: connection ?? object.connection,
    items: items ?? object.items,
    meta: meta ?? object.meta,
    title: title ?? object.title,
  }
}

function isEchoObjectSlot(value: string): value is EchoObjectSlot {
  return ['today-thread', 'nearby-memory', 'archive-ledger', 'daily-receipt', 'reply-ticket'].includes(value)
}

function normalizeAiObjectItems(
  items: DailyCurationAiObjectDraft['items'],
  fallback: EchoObjectCard['items'],
) {
  if (!Array.isArray(items) || !fallback?.length) {
    return undefined
  }

  const byLabel = new Map(
    items.flatMap((item) => {
      const label = cleanAiText(item.label, 8)
      const value = cleanAiText(item.value, 28)

      return label && value ? [[label, value] as const] : []
    }),
  )

  return fallback.map((item) => ({
    label: item.label,
    value: byLabel.get(item.label) ?? item.value,
  }))
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
  const lens = anchors.primary === 'time' ? 'season' : 'theme'

  return {
    curatorVoice: createCuratorNote(hero.title, hero.excerpt, noteIndex),
    lens,
    reason: createReason(scoredEntry, parseDateKey(todayContext.date), todayContext, anchors),
    subtitle:
      anchors.primary === 'time' && recallRule === '时间节点相似'
        ? '同一段季节里的一页旧日子。'
        : '一页旧日子，让它和此刻并排坐一会儿。',
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
): EchoSupportCard[] {
  const cards: EchoSupportCard[] = []
  const topic = inferEntryTopic(selected.entry, todayContext)

  cards.push({
    body: createThemeNoteBody(selected.entry, todayContext, topic),
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
    items: createReceiptItems(selected.entry, todayContext),
    role: 'receipt',
    title: '今日回声小票',
  })

  return cards.slice(0, 3)
}

function createEchoObjectDeck(
  candidates: ScoredEntry[],
  selected: ScoredEntry,
  todayContext: TodayContext,
  generation: number,
  closingQuestion: string,
  anchors: CurationAnchors,
): EchoObjectCard[] {
  const topic = inferEntryTopic(selected.entry, todayContext)
  const sourceTitle = selected.entry.title ?? createEntryTitle(selected.entry)
  const sourceExcerpt = selected.entry.excerpt ?? createEntryExcerpt(selected.entry.searchableText)
  const nearby = selectNearbyObjectCandidate(candidates, selected) ?? selected
  const nearbyEntry = nearby.entry
  const nearbyTitle = nearbyEntry.title ?? createEntryTitle(nearbyEntry)
  const nearbyExcerpt = nearbyEntry.excerpt ?? createEntryExcerpt(nearbyEntry.searchableText)
  const nearbyImage = nearbyEntry.images[0]
  const receiptItems = createReceiptItems(selected.entry, todayContext)

  return [
    {
      body: createTodayThreadBody(selected.entry, todayContext, topic, anchors),
      id: `object-today-thread-${selected.entry.date}-${generation}`,
      meta: `轻连接 · ${todayContext.weekday}`,
      slot: 'today-thread',
      style: 'sticky',
      title: `${topic}便签`,
      tone: createStickyTone(`${todayContext.date}:${selected.entry.date}:thread:${generation}`),
    },
    {
      body: nearbyExcerpt,
      caption: createParallelConnection(selected.entry, nearbyEntry, todayContext),
      connection: createParallelConnection(selected.entry, nearbyEntry, todayContext),
      date: nearbyEntry.date,
      id: `object-nearby-${nearbyEntry.date}-${generation}`,
      image: nearbyImage
        ? {
            alt: nearbyImage.caption ?? nearbyTitle,
            caption: nearbyImage.caption,
            src: nearbyImage.src,
          }
        : undefined,
      meta: nearby === selected ? '同一页再看' : '旁边一页',
      place: createObjectPlace(nearbyEntry.collections, nearbyEntry.tags, todayContext),
      slot: 'nearby-memory',
      source: {
        date: nearbyEntry.date,
        excerpt: nearbyExcerpt,
        title: nearbyTitle,
      },
      style: nearbyImage && stableIndex(`${nearbyEntry.date}:object-style:${generation}`, 2) === 1 ? 'polaroid' : 'postcard',
      title: nearby === selected ? '这一页还有余光' : nearbyTitle,
      tone: createPostcardTone(`${nearbyEntry.date}:${generation}`),
    },
    {
      body: sourceExcerpt,
      id: `object-ledger-${selected.entry.date}-${generation}`,
      meta: `馆藏号 ${createArchiveNo(selected.entry.date)}`,
      rows: createArchiveLedgerRows(selected.entry, nearby === selected ? undefined : nearbyEntry, todayContext),
      slot: 'archive-ledger',
      source: {
        date: selected.entry.date,
        excerpt: sourceExcerpt,
        title: sourceTitle,
      },
      style: 'library-card',
      title: '这页的借阅记录',
    },
    {
      body: createReceiptBody(selected.entry, todayContext),
      id: `object-receipt-${selected.entry.date}-${generation}`,
      items: receiptItems,
      meta: createReceiptOrderNo(todayContext.date, generation),
      slot: 'daily-receipt',
      style: 'receipt',
      title: '今日回声小票',
    },
    {
      action: {
        label: '写一句回应',
        to: `/calendar?date=${encodeURIComponent(todayContext.date)}`,
      },
      body: closingQuestion,
      id: `object-reply-${todayContext.date}-${generation}`,
      meta: 'KEEP STUB',
      slot: 'reply-ticket',
      style: 'movie-ticket',
      title: '给今天留一张票',
    },
  ]
}

function selectNearbyObjectCandidate(candidates: ScoredEntry[], selected: ScoredEntry) {
  const alternates = candidates.filter((candidate) => candidate.entry.date !== selected.entry.date)
  const topAlternate = alternates[0]

  if (!topAlternate) {
    return null
  }

  return (
    alternates
      .slice(0, 5)
      .find((candidate) => candidate.entry.images.length > 0 && topAlternate.score - candidate.score <= 12) ?? topAlternate
  )
}

function createTodayThreadBody(
  entry: JournalIndexEntry,
  todayContext: TodayContext,
  topic: string,
  anchors: CurationAnchors,
) {
  const todayTitle = todayContext.journal?.title?.trim()
  const entryTitle = entry.title ?? createEntryTitle(entry)

  if (todayTitle) {
    return `今天的《${todayTitle}》和旧页里的“${topic}”搭上了一根细线。先不解释，只把《${entryTitle}》放到手边。`
  }

  if (anchors.primary === 'time') {
    return `日历把这页递回来了。它不急着说明什么，只把同一段季节里的手感放到今天旁边。`
  }

  return `这页把“${topic}”留得很具体。今天再看，只取它照亮的那一点手边动静。`
}

function createArchiveLedgerRows(
  entry: JournalIndexEntry,
  nearby: JournalIndexEntry | undefined,
  todayContext: TodayContext,
): EchoObjectCard['rows'] {
  const rows: NonNullable<EchoObjectCard['rows']> = entry.murmurs.slice(0, 3).map((murmur) => ({
    dateTime: createLedgerDateTime(entry.date, murmur.time),
    label: murmur.time,
    note: createEntryExcerpt(murmur.excerpt),
    value: '碎碎念',
  }))

  addArchiveLedgerRow(rows, {
    label: '旧页',
    note: createEntryExcerpt(entry.excerpt ?? entry.searchableText),
    value: entry.title ?? createEntryTitle(entry),
  })

  if (nearby) {
    addArchiveLedgerRow(rows, {
      label: '旁页',
      note: createEntryExcerpt(nearby.excerpt ?? nearby.searchableText),
      value: nearby.title ?? createEntryTitle(nearby),
    })
  }

  if (todayContext.journal?.excerpt) {
    addArchiveLedgerRow(rows, {
      label: '今天',
      note: createEntryExcerpt(todayContext.journal.excerpt),
      value: todayContext.journal.title ?? '今日日记',
    })
  }

  addArchiveLedgerRow(rows, {
    label: '回看',
    note: '把这页先借到今天桌上，只看它照亮的一点手边动静。',
    value: '今日回声',
  })
  addArchiveLedgerRow(rows, {
    label: '续借',
    note: '没有更多片段时，就把这一页安静地多放一会儿。',
    value: todayContext.season,
  })

  return rows.slice(0, 3)
}

function createLegacyArchiveRows(
  curation: DailyCuration,
  nearby: EchoSupportCard['source'] | undefined,
): EchoObjectCard['rows'] {
  const rows: NonNullable<EchoObjectCard['rows']> = []

  addArchiveLedgerRow(rows, {
    label: '旧页',
    note: curation.source.excerpt,
    value: curation.source.title,
  })

  if (nearby) {
    addArchiveLedgerRow(rows, {
      label: '旁页',
      note: nearby.excerpt,
      value: nearby.title,
    })
  }

  if (curation.today.journal?.excerpt) {
    addArchiveLedgerRow(rows, {
      label: '今天',
      note: curation.today.journal.excerpt,
      value: curation.today.journal.title ?? '今日日记',
    })
  }

  addArchiveLedgerRow(rows, {
    label: '回看',
    note: curation.thesis.curatorVoice,
    value: curation.recall.label,
  })
  addArchiveLedgerRow(rows, {
    label: '续借',
    note: '没有更多片段时，就把这一页安静地多放一会儿。',
    value: curation.today.season,
  })

  return rows.slice(0, 3)
}

function addArchiveLedgerRow(rows: NonNullable<EchoObjectCard['rows']>, row: NonNullable<EchoObjectCard['rows']>[number]) {
  if (rows.length >= 3 || rows.some((existing) => existing.note === row.note)) {
    return
  }

  rows.push(row)
}

function createLedgerDateTime(date: string, time: string) {
  return /^\d{2}:\d{2}$/.test(time) ? `${date}T${time}` : date
}

function createStickyTone(seed: string) {
  return ['honey', 'mist', 'leaf'][stableIndex(seed, 3)]
}

function createPostcardTone(seed: string) {
  return ['river', 'bookshop'][stableIndex(seed, 2)]
}

function createObjectPlace(collections: string[], tags: string[], todayContext: TodayContext) {
  return collections[0] ?? tags[0] ?? todayContext.weather?.location ?? todayContext.season
}

function createArchiveNo(date: string) {
  return `MEM-${date.replace(/-/g, '')}`
}

function createReceiptOrderNo(date: string, generation: number) {
  return `${date.slice(5).replace('-', '')}-${`${generation + 1}`.padStart(2, '0')}`
}

function formatObjectDate(date: string) {
  return date.replace(/-/g, '.')
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
) {
  const tags = [...(todayContext.journal?.tags ?? []), ...entry.tags, ...entry.collections]
  const todayTitle = todayContext.journal?.title ?? '今天'

  return createReceiptItemsFromParts({
    changeTags: tags,
    todayContext,
    todayTitle,
    topic: inferEntryTopic(entry, todayContext),
  })
}

function createReceiptItemsFromParts({
  changeTags,
  todayContext,
  todayTitle,
  topic,
}: {
  changeTags: string[]
  todayContext: TodayContext
  todayTitle: string
  topic: string
}) {
  return [
    { label: '今天', value: todayTitle },
    { label: '回声', value: topic },
    { label: '天气', value: formatReceiptWeather(todayContext) },
    { label: '找零', value: changeTags[0] ? `一点${changeTags[0]}` : '一点普通日常' },
  ]
}

function formatReceiptWeather(todayContext: TodayContext) {
  if (todayContext.weather?.text) {
    return [todayContext.weather.text, todayContext.weather.temperature].filter(Boolean).join(' ')
  }

  return todayContext.season
}

function createThemeNoteBody(
  entry: JournalIndexEntry,
  todayContext: TodayContext,
  topic: string,
) {
  const todayTitle = todayContext.journal?.title
  const entryTitle = entry.title ?? createEntryTitle(entry)

  if (todayTitle) {
    return `今天的《${todayTitle}》旁边，先夹一张《${entryTitle}》。只把相近的余味放在手边，让它慢慢回声。`
  }

  return `这一页把“${topic}”留在桌面上。先不替它下结论，只让它和今天并排待一会儿。`
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
    return '相近余味：另一种日常回声'
  }

  return '旁边也有：不是同一件事，但气口挨得很近'
}

function inferEntryTopic(entry: JournalIndexEntry, todayContext?: TodayContext) {
  const text = [entry.title, entry.excerpt, entry.searchableText, ...entry.tags, ...entry.collections, ...(todayContext?.journal?.tags ?? [])]
    .filter(Boolean)
    .join(' ')

  return inferTopicFromText(text, entry.tags[0] ?? entry.collections[0] ?? todayContext?.season ?? '普通日常')
}

function inferTopicFromText(text: string, fallback: string) {
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

  return fallback
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

function cleanAiText(value: string | undefined, maxLength: number) {
  const text = value?.replace(/\s+/g, ' ').trim()

  if (!text || containsInternalCurationLanguage(text) || containsAiNarratorLanguage(text)) {
    return undefined
  }

  return text.length > maxLength ? text.slice(0, maxLength).trimEnd() : text
}

function formatDisplaySubtitle(curation: DailyCuration) {
  if (/今天先翻一页.*关于|再看它和此刻/.test(curation.thesis.subtitle)) {
    return curation.thesis.lens === 'season'
      ? '同一段季节里的一页旧日子。'
      : '一页旧日子，让它和此刻并排坐一会儿。'
  }

  return curation.thesis.subtitle
    .replace(/^AI\s*(?:先)?(?:替)?今天(?:先)?(?:翻到|翻一页|夹进)?/, '')
    .replace(/^今天先(?:翻到|翻一页|夹进)/, '')
    .trim()
}

function createDisplayConnectionNote(curation: DailyCuration) {
  const note = curation.thesis.curatorVoice.trim()

  if (!note || containsInternalCurationLanguage(note) || containsAiNarratorLanguage(note) || repeatsSourceInMainNote(note, curation)) {
    return createFallbackDisplayConnectionNote(curation)
  }

  return note
}

function createFallbackDisplayConnectionNote(curation: DailyCuration) {
  const topic = inferCurationTopic(curation)

  return `这页把“${topic}”留在旧时刻里；今天再看，只取它照出的那一点手边动静。`
}

function repeatsSourceInMainNote(note: string, curation: DailyCuration) {
  const sourceTitle = curation.source.title.trim()
  const sourceExcerptLead = curation.source.excerpt.trim().slice(0, 18)

  return Boolean(
    (sourceTitle && note.includes(`《${sourceTitle}》`)) ||
      (sourceExcerptLead.length >= 8 && note.includes(sourceExcerptLead)),
  )
}

function createDisplayTags(curation: DailyCuration) {
  return [...new Set([...curation.source.tags, ...curation.source.collections])].slice(0, 4)
}

function inferCurationTopic(curation: DailyCuration) {
  return inferTopicFromText(
    [
      curation.source.title,
      curation.source.excerpt,
      ...curation.source.tags,
      ...curation.source.collections,
      curation.today.journal?.title,
      curation.today.journal?.excerpt,
      ...(curation.today.journal?.tags ?? []),
    ]
      .filter(Boolean)
      .join(' '),
    curation.source.tags[0] ?? curation.source.collections[0] ?? curation.today.season,
  )
}

function formatArchiveMonthDay(date: string) {
  const [, month = '', day = ''] = date.split('-')

  return [month, day].filter(Boolean).join('.')
}

function normalizeAiReceiptItems(
  items: DailyCurationAiDraft['receiptItems'],
  curation: DailyCuration,
) {
  if (!Array.isArray(items)) {
    return undefined
  }

  const fallback = createDailyCurationReceiptItems(curation)
  const byLabel = new Map(
    items.flatMap((item) => {
      const label = cleanAiText(item.label, 8)
      const value = cleanAiText(item.value, 28)

      return label && value ? [[label, value] as const] : []
    }),
  )

  return fallback.map((item) => ({
    label: item.label,
    value: byLabel.get(item.label) ?? item.value,
  }))
}

function containsInternalCurationLanguage(text: string) {
  return /为什么今天|今日与旧页的双线索|主题线索|时间线索|旧页证据|召回|打分|候选|匹配|算法/.test(text)
}

function containsAiNarratorLanguage(text: string) {
  return (
    /(^|[：:，。；！？、\s])(?:AI|模型|系统|助手|Codex)\s*(?:先|会|想问|读到|把|帮|替|为|给|整理|夹|翻|问|写)/i.test(text) ||
    /(^|[：:，。；！？、\s])(?:AI|模型|系统|助手|Codex)\s*(?:便签|小票|问题|旁证|回声)$/i.test(text)
  )
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
