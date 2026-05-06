import { type Dirent, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Codex, type ThreadItem } from '@openai/codex-sdk'
import type { Annotation } from '../../src/domain/annotations/types'
import type { JournalCodexSettingsFile } from '../codexSettings'

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

function createThreadOptions(workingDirectory: string, settings: JournalCodexSettingsFile) {
  return {
    approvalPolicy: 'never' as const,
    model: settings.model,
    modelReasoningEffort: settings.modelReasoningEffort,
    sandboxMode: 'read-only' as const,
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
