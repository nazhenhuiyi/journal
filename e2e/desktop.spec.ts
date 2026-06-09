import { expect, test } from '@playwright/test'
import { mkdir, mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  closeIsolatedDesktopApp,
  createIsolatedDesktopApp,
  getLocalDateKey,
  readJournalEntry,
  waitForPreviewPage,
  writeMalformedJournal,
} from './desktopApp'

test('desktop smoke saves journal content in an isolated directory', async () => {
  const context = await createIsolatedDesktopApp()

  try {
    const page = await waitForPreviewPage(context.app)
    const entryText = `Playwright desktop E2E ${Date.now()}`
    const editor = page.locator('[aria-label="日记正文"][role="textbox"]')
    const syncButton = page.locator('.journal-sync-button')

    await expect(page).toHaveURL(/#\/preview/)
    await expect(editor).toBeVisible()
    await expect(syncButton).toBeVisible()

    await editor.click()
    await page.keyboard.insertText(entryText)

    await expect.poll(
      async () => readJournalEntry(context.journalDir).catch(() => ''),
      { timeout: 12_000 },
    ).toContain(entryText)

    await syncButton.click()
    await expect(page).toHaveURL(/#\/settings/)
    await expect(page.locator('[aria-label="同步设置"]')).toBeVisible()
    await expect(page.locator('.settings-sync-status')).toContainText('Git 同步未配置')
    await expect(page.getByRole('button', { name: '保存配置' })).toBeVisible()
    await expect(page.getByRole('button', { name: '立即同步' })).toBeVisible()
  } finally {
    await closeIsolatedDesktopApp(context)
  }
})

test('desktop smoke surfaces markdown diagnostics', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'journal-desktop-e2e-'))
  const journalDir = path.join(rootDir, 'journal')
  const today = getLocalDateKey()
  const [year, month] = today.split('-')
  const entryDirectory = path.join(journalDir, 'entries', year, month)
  const entryPath = path.join(entryDirectory, `${today}.md`)

  await mkdir(entryDirectory, { recursive: true })
  await writeMalformedJournal(entryPath, today)

  const context = await createIsolatedDesktopApp(rootDir, journalDir)

  try {
    const page = await waitForPreviewPage(context.app)

    await expect(page.locator('.journal-diagnostics-banner')).toContainText('Markdown 格式需要处理')
    await expect(page.locator('.journal-diagnostics-banner')).toContainText('Front Matter 缺少结束标记')
  } finally {
    await closeIsolatedDesktopApp(context)
  }
})
