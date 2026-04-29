import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type JournalCodexSettings = {
  version: 1
  model: string
  modelReasoningEffort: ModelReasoningEffort
}

export type JournalCodexSettingsFile = JournalCodexSettings & {
  systemPrompt: string
  workingDirectory: string
  directory: string
  settingsPath: string
  systemPromptPath: string
}

export type SaveJournalCodexSettingsPayload = {
  model?: unknown
  modelReasoningEffort?: unknown
  systemPrompt?: unknown
}

const SETTINGS_VERSION = 1
const CODEX_SETTINGS_DIR_NAME = 'codex'
const CODEX_SETTINGS_FILE_NAME = 'settings.json'
const CODEX_SYSTEM_PROMPT_FILE_NAME = 'system-prompt.md'

export const defaultJournalCodexSettings: JournalCodexSettings = {
  version: SETTINGS_VERSION,
  model: 'gpt-5.5',
  modelReasoningEffort: 'high',
}

export const defaultJournalCodexSystemPrompt = `你是「且留」里的页边批注者：一个温和、克制的中文日记阅读助手，运行在桌面日记应用里。

你只围绕用户提供的日记内容、批注和问题工作。回答要具体、简洁、有陪伴感，但不要夸张，不要替用户做心理诊断，不要使用病理化措辞。

当你生成日记批注时：
- 优先给出情绪观察、复盘追问、轻量的模式提醒。
- 保持像写在页边的小字一样短，不要站到正文前面。
- 如果需要引用原文，只引用用户提供文本中真实存在的连续片段。

当你和用户围绕批注继续聊天时：
- 先回应用户真正问到的点。
- 多使用具体观察，少使用抽象判断。
- 可以提出一个温和的问题，但不要连续追问，也不要催促用户完成表达。

始终使用中文。`

export function getJournalCodexSettingsPaths(journalDirectory: string) {
  const directory = path.join(journalDirectory, CODEX_SETTINGS_DIR_NAME)

  return {
    directory,
    settingsPath: path.join(directory, CODEX_SETTINGS_FILE_NAME),
    systemPromptPath: path.join(directory, CODEX_SYSTEM_PROMPT_FILE_NAME),
  }
}

export async function loadJournalCodexSettings(
  journalDirectory: string,
): Promise<JournalCodexSettingsFile> {
  const paths = getJournalCodexSettingsPaths(journalDirectory)

  await mkdir(paths.directory, { recursive: true })

  const settings = normalizeJournalCodexSettings(await readJsonFile(paths.settingsPath))
  const systemPrompt = await readSystemPrompt(paths.systemPromptPath)

  await writeJsonFile(paths.settingsPath, settings)
  await writeTextFile(paths.systemPromptPath, systemPrompt)

  return {
    ...settings,
    systemPrompt,
    workingDirectory: journalDirectory,
    ...paths,
  }
}

export async function saveJournalCodexSettings(
  journalDirectory: string,
  payload: unknown,
): Promise<JournalCodexSettingsFile> {
  const paths = getJournalCodexSettingsPaths(journalDirectory)
  const settings = normalizeSavePayload(payload)

  await mkdir(paths.directory, { recursive: true })
  await writeJsonFile(paths.settingsPath, {
    version: SETTINGS_VERSION,
    model: settings.model,
    modelReasoningEffort: settings.modelReasoningEffort,
  })
  await writeTextFile(paths.systemPromptPath, settings.systemPrompt)

  return {
    version: SETTINGS_VERSION,
    model: settings.model,
    modelReasoningEffort: settings.modelReasoningEffort,
    systemPrompt: settings.systemPrompt,
    workingDirectory: journalDirectory,
    ...paths,
  }
}

function normalizeJournalCodexSettings(value: unknown): JournalCodexSettings {
  if (!isRecord(value)) {
    return defaultJournalCodexSettings
  }

  const model = normalizeModel(value.model)
  const modelReasoningEffort = normalizeModelReasoningEffort(value.modelReasoningEffort)

  return {
    version: SETTINGS_VERSION,
    model: model ?? defaultJournalCodexSettings.model,
    modelReasoningEffort:
      modelReasoningEffort ?? defaultJournalCodexSettings.modelReasoningEffort,
  }
}

function normalizeSavePayload(payload: unknown) {
  const payloadRecord = isRecord(payload) ? payload : {}
  const model = normalizeModel(payloadRecord.model)
  const modelReasoningEffort = normalizeModelReasoningEffort(payloadRecord.modelReasoningEffort)
  const systemPrompt =
    typeof payloadRecord.systemPrompt === 'string' ? payloadRecord.systemPrompt.trim() : ''

  if (!model) {
    throw new Error('模型名称不能为空，也不能包含换行。')
  }

  if (!modelReasoningEffort) {
    throw new Error('推理强度不正确。')
  }

  if (!systemPrompt) {
    throw new Error('System prompt 不能为空。')
  }

  return {
    model,
    modelReasoningEffort,
    systemPrompt,
  }
}

function normalizeModel(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const model = value.trim()

  if (!model || /[\r\n]/.test(model)) {
    return null
  }

  return model
}

function normalizeModelReasoningEffort(value: unknown): ModelReasoningEffort | null {
  return value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh'
    ? value
    : null
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const content = await readFile(filePath, 'utf8').catch((error: unknown) => {
    if (isNodeError(error, 'ENOENT')) {
      return null
    }

    throw error
  })

  if (content === null) {
    return null
  }

  try {
    return JSON.parse(content) as unknown
  } catch {
    return null
  }
}

async function readSystemPrompt(filePath: string) {
  const content = await readFile(filePath, 'utf8').catch((error: unknown) => {
    if (isNodeError(error, 'ENOENT')) {
      return null
    }

    throw error
  })

  return content?.trim() ? content : defaultJournalCodexSystemPrompt
}

async function writeJsonFile(filePath: string, value: JournalCodexSettings) {
  await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

async function writeTextFile(filePath: string, content: string) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`

  await writeFile(temporaryPath, content, 'utf8')
  await rename(temporaryPath, filePath)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNodeError(error: unknown, code: string) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code)
}
