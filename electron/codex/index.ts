import { type Dirent, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Codex, type SandboxMode, type ThreadItem } from '@openai/codex-sdk'
import type { Annotation } from '../../src/domain/annotations/types'
import type { DailyCuration } from '../../src/domain/dailyCuration'
import type { JournalCodexSettingsFile } from '../codexSettings'
import { loadDailyCuration, saveDailyCuration } from '../dailyCurationStore'

export type CodexActivity = {
  id: string
  type: string
  summary: string
  status?: string
  exitCode?: number
}

export type CodexAskResult = {
  finalResponse: string
  items: CodexActivity[]
  threadId: string | null
  usage: {
    input_tokens: number
    cached_input_tokens: number
    output_tokens: number
  } | null
}

export type CodexAnnotationDraft = {
  kind: 'observation' | 'question'
  content: string
  anchorQuote?: string
  anchorPrefix?: string
  anchorSuffix?: string
}

export type CodexAnnotationDraftsPayload = {
  date: string
  longEntryMarkdown: string
}

export type CodexAnnotationDraftsResult = {
  drafts: CodexAnnotationDraft[]
  threadId: string | null
  usage: CodexAskResult['usage']
}

export type CodexFrontMatterDraft = {
  title?: string
  excerpt?: string
  tags: string[]
  collections: string[]
}

export type CodexFrontMatterDraftPayload = {
  collectionLibrary: string[]
  date: string
  journalMarkdown: string
  tagLibrary: string[]
  currentFrontMatter?: {
    title?: string
    excerpt?: string
    tags?: string[]
    collections?: string[]
  }
}

export type CodexFrontMatterDraftResult = {
  draft: CodexFrontMatterDraft
  threadId: string | null
  usage: CodexAskResult['usage']
}

export type CodexDailyCurationDraftPayload = {
  curation: DailyCuration
  candidateCurations?: DailyCuration[]
}

export type CodexDailyCurationDraftResult = {
  curation: DailyCuration
  filePath: string
  threadId: string | null
  usage: CodexAskResult['usage']
}

export type CodexAnnotationChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export type CodexAnnotationChatPayload = {
  date: string
  journalMarkdown: string
  annotation: Annotation
  message: string
  threadId?: string
}

export type CodexAnnotationChatResult = {
  response: string
  threadId: string | null
  usage: CodexAskResult['usage']
}

const codexSessionsDirectory = path.join(os.homedir(), '.codex', 'sessions')

const annotationDraftsSchema = {
  type: 'object',
  properties: {
    drafts: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['observation', 'question'] },
          content: { type: 'string' },
          anchorQuote: { type: ['string', 'null'] },
          anchorPrefix: { type: ['string', 'null'] },
          anchorSuffix: { type: ['string', 'null'] },
        },
        required: ['kind', 'content', 'anchorQuote', 'anchorPrefix', 'anchorSuffix'],
        additionalProperties: false,
      },
    },
  },
  required: ['drafts'],
  additionalProperties: false,
} as const

const frontMatterDraftSchema = {
  type: 'object',
  properties: {
    title: { type: ['string', 'null'] },
    excerpt: { type: ['string', 'null'] },
    tags: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string' },
    },
    collections: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string' },
    },
  },
  required: ['title', 'excerpt', 'tags', 'collections'],
  additionalProperties: false,
} as const

const dailyCurationWriteResultSchema = {
  type: 'object',
  properties: {
    selectedSourceDate: { type: 'string' },
    filePath: { type: 'string' },
  },
  required: ['selectedSourceDate', 'filePath'],
  additionalProperties: false,
} as const

function summarizeCodexItem(item: ThreadItem): CodexActivity {
  if (item.type === 'agent_message') {
    return {
      id: item.id,
      type: item.type,
      summary: item.text,
    }
  }

  if (item.type === 'command_execution') {
    return {
      id: item.id,
      type: item.type,
      summary: item.command,
      status: item.status,
      exitCode: item.exit_code,
    }
  }

  if (item.type === 'file_change') {
    return {
      id: item.id,
      type: item.type,
      summary: item.changes.map((change) => `${change.kind}: ${change.path}`).join('\n'),
      status: item.status,
    }
  }

  if (item.type === 'todo_list') {
    return {
      id: item.id,
      type: item.type,
      summary: item.items.map((todo) => `${todo.completed ? '完成' : '待办'}: ${todo.text}`).join('\n'),
    }
  }

  if (item.type === 'error') {
    return {
      id: item.id,
      type: item.type,
      summary: item.message,
    }
  }

  return {
    id: item.id,
    type: item.type,
    summary: 'Codex completed an internal step.',
  }
}

export async function askCodex(
  prompt: unknown,
  workingDirectory: string,
  settings: JournalCodexSettingsFile,
): Promise<CodexAskResult> {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('请输入想问 Codex 的内容。')
  }

  const thread = createCodex(settings).startThread(createThreadOptions(workingDirectory, settings))

  const turn = await thread.run(prompt.trim())

  return {
    finalResponse: turn.finalResponse,
    items: turn.items.map(summarizeCodexItem),
    threadId: thread.id,
    usage: turn.usage,
  }
}

export async function generateAnnotationDrafts(
  payload: unknown,
  workingDirectory: string,
  settings: JournalCodexSettingsFile,
): Promise<CodexAnnotationDraftsResult> {
  const normalizedPayload = normalizeAnnotationDraftsPayload(payload)
  const thread = createCodex(settings).startThread(createThreadOptions(workingDirectory, settings))
  const turn = await thread.run(buildAnnotationDraftsPrompt(normalizedPayload), {
    outputSchema: annotationDraftsSchema,
  })
  const parsedDrafts = parseAnnotationDraftsResponse(turn.finalResponse)

  return {
    drafts: parsedDrafts,
    threadId: thread.id,
    usage: turn.usage,
  }
}

export async function generateFrontMatterDraft(
  payload: unknown,
  workingDirectory: string,
  settings: JournalCodexSettingsFile,
): Promise<CodexFrontMatterDraftResult> {
  const normalizedPayload = normalizeFrontMatterDraftPayload(payload)
  const thread = createCodex(settings).startThread(createThreadOptions(workingDirectory, settings))
  const turn = await thread.run(buildFrontMatterDraftPrompt(normalizedPayload), {
    outputSchema: frontMatterDraftSchema,
  })
  const draft = parseFrontMatterDraftResponse(turn.finalResponse)

  return {
    draft,
    threadId: thread.id,
    usage: turn.usage,
  }
}

export async function generateDailyCurationDraft(
  payload: unknown,
  workingDirectory: string,
  settings: JournalCodexSettingsFile,
): Promise<CodexDailyCurationDraftResult> {
  const normalizedPayload = normalizeDailyCurationDraftPayload(payload)
  const targetFilePath = getDailyCurationTargetFilePath(workingDirectory, normalizedPayload.curation.curationDate)
  const allowedSourceDates = new Set(
    getDailyCurationPromptCandidates(normalizedPayload).map((candidate) => candidate.source.date),
  )
  const thread = createCodex(settings).startThread(createThreadOptions(workingDirectory, settings, 'workspace-write'))
  const turn = await thread.run(buildDailyCurationWritePrompt(normalizedPayload, workingDirectory, targetFilePath), {
    outputSchema: dailyCurationWriteResultSchema,
  })
  const writeResult = parseDailyCurationWriteResponse(turn.finalResponse)

  if (path.resolve(writeResult.filePath) !== path.resolve(targetFilePath)) {
    throw new Error('Codex 写入的今日回声路径不符合预期。')
  }

  if (!allowedSourceDates.has(writeResult.selectedSourceDate)) {
    throw new Error('Codex 选择了候选之外的旧页。')
  }

  const storedCuration = await loadDailyCuration(workingDirectory, normalizedPayload.curation.curationDate)

  if (!storedCuration) {
    throw new Error('Codex 没有写出今日回声 JSON。')
  }

  if (!isDailyCurationRecord(storedCuration.curation)) {
    throw new Error('Codex 写出的今日回声 JSON 结构不完整。')
  }

  if (storedCuration.curation.source.date !== writeResult.selectedSourceDate) {
    throw new Error('Codex 写出的今日回声和最终选择的旧页不一致。')
  }

  const savedCuration = await saveDailyCuration(workingDirectory, {
    ...storedCuration.curation,
    ai: {
      generatedAt: new Date().toISOString(),
      provider: 'codex',
      threadId: thread.id,
      usage: turn.usage,
    },
  })

  return {
    curation: savedCuration.curation,
    filePath: savedCuration.filePath,
    threadId: thread.id,
    usage: turn.usage,
  }
}

export async function chatWithAnnotation(
  payload: unknown,
  workingDirectory: string,
  settings: JournalCodexSettingsFile,
): Promise<CodexAnnotationChatResult> {
  const normalizedPayload = normalizeAnnotationChatPayload(payload)
  const hasExistingThread = Boolean(normalizedPayload.threadId)
  const codex = createCodex(settings)
  const threadOptions = createThreadOptions(workingDirectory, settings)
  const thread = normalizedPayload.threadId
    ? codex.resumeThread(normalizedPayload.threadId, threadOptions)
    : codex.startThread(threadOptions)
  const turn = await thread.run(
    hasExistingThread ? normalizedPayload.message : buildAnnotationChatPrompt(normalizedPayload),
  )

  return {
    response: turn.finalResponse,
    threadId: thread.id,
    usage: turn.usage,
  }
}

export async function readAnnotationThread(threadId: unknown): Promise<{ messages: CodexAnnotationChatMessage[] }> {
  if (typeof threadId !== 'string' || !threadId.trim()) {
    throw new Error('批注聊天 threadId 不正确。')
  }

  const sessionPath = await findCodexSessionPath(threadId.trim())

  if (!sessionPath) {
    return { messages: [] }
  }

  const content = await fs.readFile(sessionPath, 'utf8')

  return { messages: parseAnnotationThreadMessages(content) }
}

function createCodex(settings: JournalCodexSettingsFile) {
  return new Codex({
    config: {
      model_instructions_file: settings.systemPromptPath,
    },
  })
}

function createThreadOptions(
  workingDirectory: string,
  settings: JournalCodexSettingsFile,
  sandboxMode: SandboxMode = 'read-only',
) {
  return {
    approvalPolicy: 'never' as const,
    model: settings.model,
    modelReasoningEffort: settings.modelReasoningEffort,
    sandboxMode,
    skipGitRepoCheck: true,
    workingDirectory,
  }
}

function normalizeAnnotationDraftsPayload(payload: unknown): CodexAnnotationDraftsPayload {
  if (!isRecord(payload)) {
    throw new Error('页边批注请求格式不正确。')
  }

  const date = stringFromRecord(payload, 'date')
  const longEntryMarkdown = stringFromRecord(payload, 'longEntryMarkdown')

  if (!date || !longEntryMarkdown) {
    throw new Error('页边批注需要日期和日记正文。')
  }

  return { date, longEntryMarkdown }
}

function normalizeAnnotationChatPayload(payload: unknown): CodexAnnotationChatPayload {
  if (!isRecord(payload)) {
    throw new Error('批注聊天请求格式不正确。')
  }

  const date = stringFromRecord(payload, 'date')
  const journalMarkdown = stringFromRecord(payload, 'journalMarkdown')
  const message = stringFromRecord(payload, 'message')
  const annotation = payload.annotation

  if (!date || !journalMarkdown || !message || !isRecord(annotation)) {
    throw new Error('批注聊天需要日期、日记、批注和问题。')
  }

  return {
    date,
    journalMarkdown,
    message,
    annotation: annotation as Annotation,
    threadId: stringFromRecord(payload, 'threadId'),
  }
}

function normalizeFrontMatterDraftPayload(payload: unknown): CodexFrontMatterDraftPayload {
  if (!isRecord(payload)) {
    throw new Error('策展信息请求格式不正确。')
  }

  const date = stringFromRecord(payload, 'date')
  const journalMarkdown = stringFromRecord(payload, 'journalMarkdown')

  if (!date || !journalMarkdown) {
    throw new Error('策展信息需要日期和日记内容。')
  }

  const currentFrontMatter = asRecord(payload.currentFrontMatter)

  return {
    collectionLibrary: stringArrayFromRecord(payload, 'collectionLibrary'),
    currentFrontMatter: {
      collections: stringArrayFromRecord(currentFrontMatter, 'collections'),
      excerpt: stringFromRecord(currentFrontMatter, 'excerpt'),
      tags: stringArrayFromRecord(currentFrontMatter, 'tags'),
      title: stringFromRecord(currentFrontMatter, 'title'),
    },
    date,
    journalMarkdown,
    tagLibrary: stringArrayFromRecord(payload, 'tagLibrary'),
  }
}

function normalizeDailyCurationDraftPayload(payload: unknown): CodexDailyCurationDraftPayload {
  if (!isRecord(payload)) {
    throw new Error('今日回声请求格式不正确。')
  }

  const curation = asRecord(payload.curation)

  if (!isDailyCurationRecord(curation)) {
    throw new Error('今日回声需要一份可用的本地策展草稿。')
  }

  return {
    candidateCurations: normalizeDailyCurationCandidates(payload.candidateCurations),
    curation: curation as DailyCuration,
  }
}

function normalizeDailyCurationCandidates(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(isDailyCurationRecord).slice(0, 5) as DailyCuration[]
}

function isDailyCurationRecord(value: unknown): value is Record<string, unknown> {
  const record = asRecord(value)

  return record.version === 6 && isRecord(record.source) && isRecord(record.thesis)
}

function getDailyCurationTargetFilePath(workingDirectory: string, date: string) {
  return path.join(workingDirectory, 'curations', 'daily', `${date}.json`)
}

function buildAnnotationDraftsPrompt(payload: CodexAnnotationDraftsPayload) {
  return `你是「且留」里的页边批注者。请只基于下面这一天的长日记生成 3-5 条页边批注草稿。

要求：
- 不做心理诊断，不使用病理化措辞。
- 像一个贴着原文读日记的人，不像老师、咨询师或文学评论者。
- 优先批注这些位置：情绪转折、反复出现的念头、强烈比喻、具体生活瞬间、用户写到但还没有展开的句子。
- 优先生成情绪观察、具体生活瞬间的回看、温和追问、轻量的模式提醒。
- kind 只能是 observation 或 question。
- content 使用中文，短一些，像写在页边的批注，不要替用户解释人生。
- content 要贴近原文，可以偶尔使用“这里似乎”“我读到”“这一句里有”，但不要固定套用这些开头。
- 避免聪明但疏远的分析腔，少用正当性、投射、防御、主体性、创伤、内在小孩、课题分离、原生家庭等概念词，也少用力量、允许、反问这类容易把日记读成评论的词。
- 少写段落总结，不要只是概括全文观点；尽量贴住一个短句里的语气、画面或停顿。
- observation 更像“我在这句话旁边画线的原因”，不要像文章点评。
- question 必须是具体、可继续写下去的问题，指向一个时刻、画面、选择或感受；只问一个点，不要问“这意味着什么”这类过大的问题，也不要列出一串选项或补充“比如 A、B、C”。
- 如果批注能绑定到具体原文，anchorQuote 必须是 LONG_ENTRY_MARKDOWN 中连续出现的精确 Markdown 子串，优先选择 8-30 个字的关键短句。
- 避免多条批注锚定同一个过长片段；如果一段里有多个可读之处，分别锚定不同短句。
- anchorPrefix 和 anchorSuffix 是 anchorQuote 前后的短上下文，用于重复文本定位。
- 如果是整天层面的观察，anchorQuote、anchorPrefix、anchorSuffix 都返回 null。

风格参考：
- 好的 observation：这几个词很热，像是还没被理性收拾过。
- 好的 observation：这句没有否定理性，只是给混乱也留了一点位置。
- 不好的 observation：这里体现了主体对秩序和失序的辩证调和。
- 好的 question：写到“短暂”时，你想到的是哪一个具体瞬间？
- 不好的 question：这背后意味着什么？比如作息、效率、评价，还是别的什么？

DATE:
${payload.date}

LONG_ENTRY_MARKDOWN:
${payload.longEntryMarkdown}`
}

function buildFrontMatterDraftPrompt(payload: CodexFrontMatterDraftPayload) {
  return `你是「且留」里的日记策展助手。请只基于下面这一天的日记内容，生成可供用户确认的 Front Matter 策展信息草稿。

要求：
- 只返回结构化字段，不要写解释。
- title 使用中文，短一些，像日记卡片标题，不要夸张。
- excerpt 使用中文，一句话概括这一天留下的画面或线索，不做心理诊断。
- tags 返回 3-8 个中文短标签，适合检索和策展，可以包含主题、场景、物件、天气。
- collections 返回 0-4 个中文合集建议，像「雨天」「房间里的光」这种可复用专题。
- TAG_LIBRARY 和 COLLECTION_LIBRARY 是用户过去维护出的可复用词库。tags 和 collections 必须先从这些库里挑合适的沿用。
- 只有当日记里有清晰、重要、且现有库无法覆盖的线索时，才新增中文短标签或合集；新增项要和库里的粒度、语气保持一致。
- 不要判断 favorite，不要输出用户没有确认过的重要性判断。
- 如果已有字段仍然合适，可以沿用或轻微整理。

DATE:
${payload.date}

TAG_LIBRARY:
${JSON.stringify(payload.tagLibrary, null, 2)}

COLLECTION_LIBRARY:
${JSON.stringify(payload.collectionLibrary, null, 2)}

CURRENT_FRONT_MATTER:
${JSON.stringify(payload.currentFrontMatter ?? {}, null, 2)}

JOURNAL_MARKDOWN:
${payload.journalMarkdown}`
}

function buildDailyCurationWritePrompt(
  payload: CodexDailyCurationDraftPayload,
  workingDirectory: string,
  targetFilePath: string,
) {
  const curation = payload.curation
  const candidateCurations = getDailyCurationPromptCandidates(payload)
  const candidateOldPages = candidateCurations.map((candidate) => ({
    collections: candidate.source.collections,
    date: candidate.source.date,
    filePath: candidate.hero.entryId,
    image: candidate.source.image,
    objects: candidate.objects?.map((object) => ({
      action: object.action,
      date: object.date,
      hasImage: Boolean(object.image),
      image: object.image,
      itemLabels: object.items?.map((item) => item.label) ?? object.rows?.map((row) => row.label),
      place: object.place,
      slot: object.slot,
      style: object.style,
    })),
    tags: candidate.source.tags,
    title: candidate.source.title,
  }))
  const candidatePagePaths = candidateCurations.map((candidate) => ({
    date: candidate.source.date,
    path: candidate.hero.entryId,
  }))
  const candidateStructure = candidateCurations.map(createDailyCurationAgentSkeleton)
  const todayJournalPath = path.join(workingDirectory, `${curation.today.date}.md`)

  return `你是「且留」里的今日回声策展 agent。你有文件系统写入权限，请自己读取日记原文、选择旧页和物件，并把完整 DailyCuration v6 JSON 写入指定路径。

任务：
1. 阅读 TODAY_JOURNAL_PATH 的今日日记原文。
2. 阅读 CANDIDATE_PAGE_PATHS 中每一页候选旧页原文。
3. 从候选旧页中选择一页作为主旧页，selectedSourceDate 必须是候选 date 之一。
4. 判断今天和旧页之间最具体、最值得展示的回声，并选择适合的物件。
5. 以 CANDIDATE_STRUCTURE_JSON 中对应候选作为结构骨架，写出完整 JSON 到 TARGET_FILE_PATH。

判断原则：
- 选页不是找“最像”的旧页，而是找能让用户感觉“原来今天翻到这页，是因为这里有一个具体回声”的旧页。
- 原文是唯一事实来源。TODAY_CONTEXT、旧页摘要、source.excerpt、summary/searchable 类文本都只能当索引线索，不能当正文事实。
- CANDIDATE_STRUCTURE_JSON 是写文件用的结构骨架，不是文案建议；里面空着的展示字段需要你根据原文重新写。
- 不暴露算法过程。面向用户的中文展示字段里不要出现：为什么今天、主题线索、时间线索、旧页证据、召回、打分、候选、匹配、算法。
- 不要让 AI、模型、系统、助手或 Codex 成为叙述主语；除非原文就在讨论 AI，不要主动写“AI”。
- 语气像一个安静的日记阅读同伴：具体、克制、有画面，允许留白。不要做心理诊断，不替用户下结论。
- 少用套话，不要连续依赖“旧日子 / 并排 / 余味 / 轻轻 / 慢慢 / 接住 / 松弛”这类词撑完整段。
- 宁可少一点，也不要凑满。没有独立展示功能的物件就删掉。
- 物件是可选的附加发现，不是版式配额。如果今天和旧页没有足够具体的内容支撑物件，就把 objects 写成 []。

物件决策：
- 先写好主卡和 bridgeNote，再决定需不需要物件。不要先假设一定有物件。
- 每个物件保留前，问自己两件事：这张卡有没有带出一个主卡没讲过的原文细节？删掉它，用户会不会少看到一点真正有意思的东西？
- 如果答案是否定的，就删掉这张物件卡。页面空一点没关系，空洞的物件比没有物件更糟。
- 不要把“给空页一个入口、先留一句、补长、继续写、递回今天”这类抽象动作当成物件内容；除非原文里有更具体的名词、动作、场景或原句支撑。
- 你可以返回 0、1 或 2 张物件；只有当每一张都各自有用时才超过 2 张。

物件职责：
- today-thread / 便利贴：一个手边动作、轻提醒或临时贴上的念头；如果只能总结主卡，就不要选。
- nearby-memory / 明信片或拍立得：给用户一个旁边可看的旧场景、图片、地点或物件；不要写成第二段主文。
- archive-ledger / 借阅卡：旧页里有几条可借用的片段、清单或记录感时使用；不要为了形式保留。
- daily-receipt / 小票：今天有钱、时间、身体、天气、消费、完成量等日常结算材料，且能压成四个短条目时使用。
- reply-ticket / 票根：适合留下一个继续写、继续做或继续选择的具体入口。
- daily-receipt 和 reply-ticket 都是收尾物件，通常二选一；只有当两者功能完全不重叠时才可同时保留。

写入要求：
- 目标文件是 TARGET_FILE_PATH。你必须创建父目录并写入完整 JSON 对象；不要修改其他文件。
- 输出文件必须是 DailyCuration v6，不是 patch、draft 或外层 wrapper。
- 从 CANDIDATE_STRUCTURE_JSON 中复制 selectedSourceDate 对应的对象作为底稿；保留 version、id、curationDate、generation、today、artifact、recall、anchors，以及 object 的 id/slot/style/source/image/action/tone/place/date 等结构字段。
- source.date 必须等于 selectedSourceDate；title 应保持“今日回声：{source.title}”的形态。
- source.excerpt 和 hero.excerpt 请从旧页原文中整理成忠实、可展示的短摘录；不要使用 Front Matter excerpt 当正文。
- thesis.curatorVoice 负责让用户感到“这页为什么会回到今天”；objects 不要复述主卡。
- bridgeNote 是左侧旧页卡片里的页边小记，请写成一段自然语言，不要拆成“内容/时间”两条，不要写解释表。
- objects 只保留你决定展示的物件，顺序就是展示顺序。不要新增 slot，不要改变 source/image/action。没有值得展示的物件时，objects 必须写成 []。
- ai 字段可先写成 {"provider":"codex","generatedAt":"${new Date().toISOString()}","threadId":null,"usage":null}，应用会在读取后补上真实 threadId/usage。
- 写完后请自己校验 JSON 能被 JSON.parse 解析，并确认 curationDate 是 ${curation.curationDate}。
- 最终回复只返回结构化 JSON：{"filePath": TARGET_FILE_PATH, "selectedSourceDate": "你选中的日期"}。

展示字段建议：
- thesis.subtitle：14-30 个中文字符，和“今日翻到”并列展示；暗示今天和旧页的连接。
- thesis.curatorVoice：55-95 个中文字符；同时包含今天的一个具体细节和旧页的一个具体线索。
- bridgeNote：45-90 个中文字符，像人翻到旧页时顺手写在页边的一段话；它要说明这页怎么自然地回到今天，但不要出现“内容相接、时间距离、因为、所以、从某日到某日隔了几天”这类说明腔。
- closingQuestion 和 question：写成同一句具体、轻的问题。
- anchors.theme.body / anchors.time.body：作为兼容字段保留，可写短一点；真正展示优先使用 bridgeNote。
- supports 可同步整理兼容字段，但真正展示以 objects 为准。
- objects 通常 0-2 个最合适。每张物件卡必须通过“原文钩子”测试：它要带出主卡没有讲过的具体名词、动作、场景或原句，而且最好同时碰到今天和旧页。做不到就删掉。
- 不要把“空页、没内容、先留一句、写一句、补长、入口、继续写、递回今天”本身当作物件内容。除非原文里有更具体的东西支撑，否则这些只能留在主卡或问题里，不要生成卡片。

TODAY_CONTEXT:
${JSON.stringify(curation.today, null, 2)}

TODAY_JOURNAL_PATH:
${todayJournalPath}

CANDIDATE_PAGE_PATHS:
${JSON.stringify(candidatePagePaths, null, 2)}

CANDIDATE_OLD_PAGES:
${JSON.stringify(candidateOldPages, null, 2)}

CANDIDATE_STRUCTURE_JSON:
${JSON.stringify(candidateStructure, null, 2)}

TARGET_FILE_PATH:
${targetFilePath}`
}

function getDailyCurationPromptCandidates(payload: CodexDailyCurationDraftPayload) {
  return payload.candidateCurations?.length ? payload.candidateCurations : [payload.curation]
}

function createDailyCurationAgentSkeleton(curation: DailyCuration): DailyCuration {
  const { ai: _ai, ...curationWithoutAi } = curation

  return {
    ...curationWithoutAi,
    anchors: {
      primary: curation.anchors.primary,
      theme: {
        label: '页边',
        body: '',
      },
      time: {
        label: '旁注',
        body: '',
      },
    },
    bridgeNote: '',
    closingQuestion: '',
    curatorNote: '',
    hero: {
      ...curation.hero,
      excerpt: '',
      recallReason: '',
    },
    objects: curation.objects?.map(createDailyCurationObjectSkeleton),
    question: '',
    reason: '',
    recall: {
      ...curation.recall,
      rule: '',
      score: 0,
    },
    source: {
      ...curation.source,
      excerpt: '',
    },
    supports: curation.supports.map(createDailyCurationSupportSkeleton),
    thesis: {
      ...curation.thesis,
      curatorVoice: '',
      reason: '',
      subtitle: '',
      title: curation.source.title,
    },
    title: `今日回声：${curation.source.title}`,
  }
}

function createDailyCurationSupportSkeleton(
  support: DailyCuration['supports'][number],
): DailyCuration['supports'][number] {
  return {
    ...support,
    body: '',
    connection: support.connection === undefined ? undefined : '',
    items: support.items?.map((item) => ({
      label: item.label,
      value: '',
    })),
    source: support.source
      ? {
          ...support.source,
          excerpt: '',
        }
      : undefined,
    title: '',
  }
}

function createDailyCurationObjectSkeleton(
  object: NonNullable<DailyCuration['objects']>[number],
): NonNullable<DailyCuration['objects']>[number] {
  return {
    ...object,
    body: '',
    caption: object.caption === undefined ? undefined : '',
    connection: object.connection === undefined ? undefined : '',
    items: object.items?.map((item) => ({
      label: item.label,
      value: '',
    })),
    rows: object.rows?.map((row) => ({
      ...row,
      note: '',
      value: '',
    })),
    source: object.source
      ? {
          ...object.source,
          excerpt: '',
        }
      : undefined,
    title: '',
  }
}

function buildAnnotationChatPrompt(payload: CodexAnnotationChatPayload) {
  return `你正在和用户围绕一条日记页边批注继续聊天。保持温和、具体、克制，不做诊断。

日期：${payload.date}

批注：
${JSON.stringify(payload.annotation, null, 2)}

今日日记：
${payload.journalMarkdown}

用户想继续聊：
${payload.message}`
}

async function findCodexSessionPath(threadId: string) {
  const matchingPaths: string[] = []

  await collectCodexSessionPaths(codexSessionsDirectory, threadId, matchingPaths)

  return matchingPaths.sort().at(-1) ?? null
}

async function collectCodexSessionPaths(directory: string, threadId: string, matchingPaths: string[]) {
  let entries: Dirent[]

  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch {
    return
  }

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        await collectCodexSessionPaths(entryPath, threadId, matchingPaths)
        return
      }

      if (entry.isFile() && entry.name.includes(threadId) && entry.name.endsWith('.jsonl')) {
        matchingPaths.push(entryPath)
      }
    }),
  )
}

function parseAnnotationThreadMessages(content: string): CodexAnnotationChatMessage[] {
  return content
    .split(/\r?\n/)
    .flatMap((line, index) => normalizeCodexSessionMessage(line, index))
}

function normalizeCodexSessionMessage(line: string, index: number): CodexAnnotationChatMessage[] {
  if (!line.trim()) {
    return []
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(line) as unknown
  } catch {
    return []
  }

  if (!isRecord(parsed) || parsed.type !== 'response_item') {
    return []
  }

  const payload = asRecord(parsed.payload)

  if (payload.type !== 'message') {
    return []
  }

  const role = stringFromRecord(payload, 'role')

  if (role !== 'user' && role !== 'assistant') {
    return []
  }

  const content = extractCodexMessageContent(payload.content)
  const displayContent = role === 'user' ? extractAnnotationUserMessage(content) : content

  if (!displayContent) {
    return []
  }

  return [
    {
      id: `thread_${index.toString(36)}`,
      role,
      content: displayContent,
    },
  ]
}

function extractCodexMessageContent(content: unknown) {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .flatMap((item) => {
      const block = asRecord(item)
      const text = stringFromRecord(block, 'text')

      return text ? [text] : []
    })
    .join('\n\n')
    .trim()
}

function extractAnnotationUserMessage(content: string) {
  const promptMessageMatch = content.match(/用户想继续聊：\s*([\s\S]+)$/)

  return (promptMessageMatch?.[1] ?? content).trim()
}

function parseAnnotationDraftsResponse(response: string): CodexAnnotationDraft[] {
  const parsed = JSON.parse(response) as unknown

  if (!isRecord(parsed) || !Array.isArray(parsed.drafts)) {
    throw new Error('Codex 没有返回可用的批注草稿。')
  }

  return parsed.drafts.flatMap((draft) => normalizeAnnotationDraft(draft)).slice(0, 5)
}

function normalizeAnnotationDraft(payload: unknown): CodexAnnotationDraft[] {
  if (!isRecord(payload)) {
    return []
  }

  const kind = stringFromRecord(payload, 'kind')
  const content = stringFromRecord(payload, 'content')

  if ((kind !== 'observation' && kind !== 'question') || !content) {
    return []
  }

  return [
    {
      kind,
      content,
      anchorQuote: stringFromRecord(payload, 'anchorQuote'),
      anchorPrefix: stringFromRecord(payload, 'anchorPrefix'),
      anchorSuffix: stringFromRecord(payload, 'anchorSuffix'),
    },
  ]
}

function parseFrontMatterDraftResponse(response: string): CodexFrontMatterDraft {
  const parsed = JSON.parse(response) as unknown

  if (!isRecord(parsed)) {
    throw new Error('Codex 没有返回可用的策展信息。')
  }

  return {
    collections: stringArrayFromRecord(parsed, 'collections').slice(0, 4),
    excerpt: stringFromRecord(parsed, 'excerpt'),
    tags: stringArrayFromRecord(parsed, 'tags').slice(0, 8),
    title: stringFromRecord(parsed, 'title'),
  }
}

function parseDailyCurationWriteResponse(response: string) {
  const parsed = JSON.parse(response) as unknown

  if (!isRecord(parsed)) {
    throw new Error('Codex 没有返回可用的今日回声写入结果。')
  }

  const filePath = stringFromRecord(parsed, 'filePath')
  const selectedSourceDate = stringFromRecord(parsed, 'selectedSourceDate')

  if (!filePath || !selectedSourceDate) {
    throw new Error('Codex 没有返回今日回声文件路径和旧页选择。')
  }

  return { filePath, selectedSourceDate }
}

function stringFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key]

  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringArrayFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key]

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
