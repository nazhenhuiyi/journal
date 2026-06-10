import { expect, test } from '@playwright/test'
import { mkdir, mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  closeIsolatedDesktopApp,
  createIsolatedDesktopApp,
  getLocalDateKey,
  readJournalEntry,
  waitForJournalEditor,
  waitForPreviewPage,
  writeJournalEntry,
  writeMalformedJournal,
} from './desktopApp'

test('desktop creates, saves, reloads, and reviews today journal content', async () => {
  const context = await createIsolatedDesktopApp()

  try {
    const page = await waitForPreviewPage(context.app)
    const entryTitle = `E2E saved day ${Date.now()}`
    const entryText = `Playwright desktop persistence ${Date.now()}`
    const editor = page.locator('[aria-label="日记正文"][role="textbox"]')

    await expect(page).toHaveURL(/#\/preview/)
    await expect(editor).toBeVisible()

    await editor.click()
    await page.keyboard.insertText(`# ${entryTitle}\n\n${entryText}`)

    await expect.poll(
      async () => readJournalEntry(context.journalDir).catch(() => ''),
      { timeout: 12_000 },
    ).toContain(entryText)

    await page.reload()
    await waitForJournalEditor(page)

    await expect(editor).toContainText(entryTitle)
    await expect(editor).toContainText(entryText)

    await page.getByRole('button', { name: '回看' }).click()
    await expect(page.getByRole('heading', { name: entryTitle })).toBeVisible()
    await expect(page.getByText(entryText)).toBeVisible()
    await expect(editor).toHaveCount(0)
  } finally {
    await closeIsolatedDesktopApp(context)
  }
})

test('desktop creates, persists, and displays a murmur', async () => {
  const context = await createIsolatedDesktopApp()

  try {
    const page = await waitForPreviewPage(context.app)
    const murmurText = `Playwright murmur persistence ${Date.now()}`

    await expect(page.getByRole('complementary', { name: '碎碎念' })).toBeVisible()
    await page.getByRole('button', { name: '添一条' }).click()
    await page.getByRole('textbox', { name: '碎碎念正文' }).fill(murmurText)

    await expect.poll(
      async () => readJournalEntry(context.journalDir).catch(() => ''),
      { timeout: 12_000 },
    ).toContain(murmurText)
    await expect.poll(
      async () => readJournalEntry(context.journalDir).catch(() => ''),
      { timeout: 12_000 },
    ).toContain(':::murmur')

    await page.reload()
    await waitForJournalEditor(page)

    await expect(page.getByLabel('碎碎念列表')).toContainText(murmurText)
    const createdMurmurCard = page.locator('.journal-murmur-card').filter({ hasText: murmurText })

    await createdMurmurCard.hover()
    await createdMurmurCard.getByRole('button', { name: '编辑' }).click()
    await expect(page.getByRole('textbox', { name: '碎碎念正文' })).toHaveValue(murmurText)
    await page.getByRole('button', { name: '完成' }).click()
    await expect(page.getByLabel('碎碎念列表')).toContainText(murmurText)
  } finally {
    await closeIsolatedDesktopApp(context)
  }
})

test('desktop deletes a murmur and persists the removal', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'journal-desktop-e2e-'))
  const journalDir = path.join(rootDir, 'journal')
  const today = getLocalDateKey()
  const murmurText = `Playwright murmur deletion ${Date.now()}`

  await writeJournalEntry(journalDir, today, [
    '# 正文',
    '',
    '保留长日记正文。',
    '',
    ':::murmur',
    'id: m_e2e_delete',
    `time: ${today}T12:00:00.000Z`,
    '---',
    murmurText,
    ':::',
  ].join('\n'))

  const context = await createIsolatedDesktopApp(rootDir, journalDir)

  try {
    const page = await waitForPreviewPage(context.app)

    await expect(page.getByLabel('碎碎念列表')).toContainText(murmurText)
    const existingMurmurCard = page.locator('.journal-murmur-card').filter({ hasText: murmurText })

    await existingMurmurCard.hover()
    await existingMurmurCard.getByRole('button', { name: /删除 .* 的碎碎念/ }).click()

    await expect(page.getByText('可以先留一条碎碎念，再给它放照片。')).toBeVisible()
    await expect.poll(
      async () => (await readJournalEntry(context.journalDir, today)).includes(murmurText),
      { timeout: 12_000 },
    ).toBe(false)
    await expect.poll(
      async () => (await readJournalEntry(context.journalDir, today)).includes(':::murmur'),
      { timeout: 12_000 },
    ).toBe(false)

    await page.reload()
    await waitForJournalEditor(page)

    await expect(page.getByText('可以先留一条碎碎念，再给它放照片。')).toBeVisible()
    await expect(page.getByRole('textbox', { name: '碎碎念正文' })).toHaveCount(0)
    await expect(page.getByText('保留长日记正文。')).toBeVisible()
  } finally {
    await closeIsolatedDesktopApp(context)
  }
})

test('desktop calendar opens historical entries and saves edits for a selected date', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'journal-desktop-e2e-'))
  const journalDir = path.join(rootDir, 'journal')
  const currentYear = new Date().getFullYear()
  const editedDate = `${currentYear}-03-30`
  const previousDate = `${currentYear}-03-29`

  await writeJournalEntry(journalDir, previousDate, '# 前一天\n\n从前一天翻过来。')
  await writeJournalEntry(journalDir, editedDate, '# 窗边植物\n\n窗边那盆植物又长出一点新叶。')

  const context = await createIsolatedDesktopApp(rootDir, journalDir)

  try {
    const page = await waitForPreviewPage(context.app)
    const calendarLink = page.getByRole('link', { name: /日历/ })

    await calendarLink.click()

    await expect(page).toHaveURL(/#\/calendar/)
    await expect(page.getByRole('heading', { name: '日历书架' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '三月' })).toBeVisible()
    await expect(page.getByText('2 / 31 天有记录')).toBeVisible()

    await page.getByRole('button', { name: `打开 ${editedDate} 的日记` }).click()
    await waitForJournalEditor(page)

    let editor = page.locator('[aria-label="日记正文"][role="textbox"]')

    await expect(page.getByRole('heading', { name: formatJournalHeading(editedDate) })).toBeVisible()
    await expect(editor).toContainText('窗边植物')

    const appendedText = `从日历追加的一句 ${Date.now()}`

    await editor.click()
    await page.keyboard.insertText(`\n${appendedText}`)
    await expect(editor).toContainText(appendedText)

    await page.getByRole('button', { name: '上一天' }).click()
    await waitForJournalEditor(page)
    editor = page.locator('[aria-label="日记正文"][role="textbox"]')

    await expect(page.getByRole('heading', { name: formatJournalHeading(previousDate) })).toBeVisible()
    await expect(editor).toContainText('前一天')
    await expect.poll(
      async () => readJournalEntry(context.journalDir, editedDate).catch(() => ''),
      { timeout: 12_000 },
    ).toContain(appendedText)

    await page.getByRole('button', { name: '返回日历' }).click()
    await expect(page.getByRole('heading', { name: '日历书架' })).toBeVisible()
  } finally {
    await closeIsolatedDesktopApp(context)
  }
})

test('desktop settings reports unconfigured Git sync state and validates unsafe remotes', async () => {
  const context = await createIsolatedDesktopApp()

  try {
    const page = await waitForPreviewPage(context.app)
    const syncButton = page.locator('.journal-sync-button')

    await expect(syncButton).toBeVisible()
    await syncButton.click()
    await expect(page).toHaveURL(/#\/settings/)
    await expect(page.locator('[aria-label="同步设置"]')).toBeVisible()
    await expect(page.locator('.settings-sync-status')).toContainText('Git 同步未配置')
    await expect(page.getByRole('button', { name: '保存配置' })).toBeVisible()
    await expect(page.getByRole('button', { name: '立即同步' })).toBeVisible()

    await page.getByLabel('仓库地址').fill('https://secret-token@github.com/example/journal-sync.git')
    await page.getByLabel('GitHub Token').fill('secret-token')
    await page.getByRole('button', { name: '保存配置' }).click()

    await expect(page.locator('.settings-sync-error')).toContainText('不能包含用户名或 token')
  } finally {
    await closeIsolatedDesktopApp(context)
  }
})

test('desktop surfaces markdown diagnostics for malformed journal files', async () => {
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

function formatJournalHeading(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

  return `${month}月${day}日 · ${weekdayLabels[date.getDay()]}`
}
