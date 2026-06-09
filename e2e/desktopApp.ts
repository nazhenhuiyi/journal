import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron') as string
const workspaceRoot = path.resolve(import.meta.dirname, '..')
const desktopRoot = path.join(workspaceRoot, 'apps', 'desktop')

export type IsolatedDesktopApp = {
  app: ElectronApplication
  journalDir: string
  rootDir: string
}

export async function createIsolatedDesktopApp(rootDir = '', journalDir = '') {
  const resolvedRootDir = rootDir || await mkdtemp(path.join(os.tmpdir(), 'journal-desktop-e2e-'))
  const resolvedJournalDir = journalDir || path.join(resolvedRootDir, 'journal')
  const userDataDir = path.join(resolvedRootDir, 'user-data')
  const app = await electron.launch({
    args: [desktopRoot],
    executablePath: electronExecutable,
    env: {
      ...process.env,
      JOURNAL_DIR: resolvedJournalDir,
      JOURNAL_DISABLE_WEATHER: '1',
      JOURNAL_USER_DATA_DIR: userDataDir,
      VITE_DEV_SERVER_URL: '',
    },
  }).catch(async (error: unknown) => {
    await rm(resolvedRootDir, { force: true, recursive: true })
    throw error
  })

  return {
    app,
    journalDir: resolvedJournalDir,
    rootDir: resolvedRootDir,
  }
}

export async function closeIsolatedDesktopApp(context: IsolatedDesktopApp) {
  await context.app.close().catch(() => undefined)
  await rm(context.rootDir, { force: true, recursive: true })
}

export async function waitForPreviewPage(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow()

  await waitForJournalEditor(page)

  return page
}

export async function waitForJournalEditor(page: Page) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('[aria-label="日记正文"][role="textbox"]')
}

export function getJournalEntryPath(journalDir: string, date: string) {
  const [year, month] = date.split('-')

  return path.join(journalDir, 'entries', year, month, `${date}.md`)
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

export async function readJournalEntry(journalDir: string, date = getLocalDateKey()) {
  return await readFile(getJournalEntryPath(journalDir, date), 'utf8')
}

export async function writeMalformedJournal(filePath: string, date: string) {
  await writeFile(filePath, `---
date: ${date}

# Broken front matter`, 'utf8')
}
