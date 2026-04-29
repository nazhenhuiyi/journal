import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  defaultJournalCodexSystemPrompt,
  loadJournalCodexSettings,
  saveJournalCodexSettings,
} from './codexSettings'

const temporaryDirectories: string[] = []

async function createTemporaryJournalDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'journal-codex-settings-'))

  temporaryDirectories.push(directory)

  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('journal Codex settings', () => {
  it('creates default settings and prompt on first load', async () => {
    const journalDirectory = await createTemporaryJournalDirectory()

    const settings = await loadJournalCodexSettings(journalDirectory)

    expect(settings.model).toBe('gpt-5.5')
    expect(settings.modelReasoningEffort).toBe('high')
    expect(settings.systemPrompt).toBe(defaultJournalCodexSystemPrompt)
    await expect(readFile(settings.settingsPath, 'utf8')).resolves.toContain('"model": "gpt-5.5"')
    await expect(readFile(settings.systemPromptPath, 'utf8')).resolves.toBe(defaultJournalCodexSystemPrompt)
  })

  it('persists saved settings and reloads them', async () => {
    const journalDirectory = await createTemporaryJournalDirectory()

    await saveJournalCodexSettings(journalDirectory, {
      model: 'gpt-5.4-mini',
      modelReasoningEffort: 'medium',
      systemPrompt: '请温和地阅读日记。',
    })

    const settings = await loadJournalCodexSettings(journalDirectory)

    expect(settings.model).toBe('gpt-5.4-mini')
    expect(settings.modelReasoningEffort).toBe('medium')
    expect(settings.systemPrompt).toBe('请温和地阅读日记。')
  })

  it('repairs broken settings while preserving a readable prompt file', async () => {
    const journalDirectory = await createTemporaryJournalDirectory()
    const codexDirectory = path.join(journalDirectory, 'codex')

    await saveJournalCodexSettings(journalDirectory, {
      model: 'gpt-5.4',
      modelReasoningEffort: 'low',
      systemPrompt: '保留这份 prompt。',
    })
    await writeFile(path.join(codexDirectory, 'settings.json'), '{broken', 'utf8')

    const settings = await loadJournalCodexSettings(journalDirectory)

    expect(settings.model).toBe('gpt-5.5')
    expect(settings.modelReasoningEffort).toBe('high')
    expect(settings.systemPrompt).toBe('保留这份 prompt。')
  })

  it('rejects invalid saved values', async () => {
    const journalDirectory = await createTemporaryJournalDirectory()

    await expect(
      saveJournalCodexSettings(journalDirectory, {
        model: 'gpt-5.5\nbad',
        modelReasoningEffort: 'high',
        systemPrompt: 'prompt',
      }),
    ).rejects.toThrow('模型名称不能为空')

    await expect(
      saveJournalCodexSettings(journalDirectory, {
        model: 'gpt-5.5',
        modelReasoningEffort: 'huge',
        systemPrompt: 'prompt',
      }),
    ).rejects.toThrow('推理强度不正确')

    await expect(
      saveJournalCodexSettings(journalDirectory, {
        model: 'gpt-5.5',
        modelReasoningEffort: 'high',
        systemPrompt: '   ',
      }),
    ).rejects.toThrow('System prompt 不能为空')
  })
})
