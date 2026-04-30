import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadJournalSettings, saveJournalSettings } from './journalSettings'

const temporaryDirectories: string[] = []

async function createTemporaryJournalDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'journal-settings-'))

  temporaryDirectories.push(directory)

  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('journal settings', () => {
  it('creates default settings on first load', async () => {
    const journalDirectory = await createTemporaryJournalDirectory()

    const settings = await loadJournalSettings(journalDirectory)

    expect(settings.weatherLocation).toBe('')
    expect(settings.workingDirectory).toBe(journalDirectory)
    await expect(readFile(settings.settingsPath, 'utf8')).resolves.toContain('"weatherLocation": ""')
  })

  it('persists a fixed weather location', async () => {
    const journalDirectory = await createTemporaryJournalDirectory()

    await saveJournalSettings(journalDirectory, {
      weatherLocation: ' Shanghai ',
    })

    const settings = await loadJournalSettings(journalDirectory)

    expect(settings.weatherLocation).toBe('Shanghai')
  })

  it('repairs broken settings and rejects invalid saved values', async () => {
    const journalDirectory = await createTemporaryJournalDirectory()
    const settingsPath = path.join(journalDirectory, 'settings.json')

    await writeFile(settingsPath, '{broken', 'utf8')

    const settings = await loadJournalSettings(journalDirectory)

    expect(settings.weatherLocation).toBe('')
    await expect(saveJournalSettings(journalDirectory, {
      weatherLocation: '上海\n北京',
    })).rejects.toThrow('天气位置不能包含换行')
  })
})
