import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  cloneGitHubE2eBranch,
  createGitHubE2eBranchEnvironment,
  expectHeadAttachedToBranch,
  getEntryPath,
  getErrorMessage,
  loadGitHubE2eConfig,
  pathExists,
  type GitHubE2eBranchEnvironment,
} from './githubE2e'
import {
  closeIsolatedDesktopApp,
  createIsolatedDesktopApp,
  getLocalDateKey,
  getSettingsSyncStatusRow,
  readJournalEntry,
  waitForJournalEditor,
  waitForPreviewPage,
  type IsolatedDesktopApp,
} from './desktopApp'

test.use({
  screenshot: 'off',
  trace: 'off',
  video: 'off',
})

test('desktop app saves sync settings and syncs a journal entry through GitHub', async () => {
  const githubConfig = loadGitHubE2eConfig()
  const today = getLocalDateKey()
  let context: IsolatedDesktopApp | null = null
  let environment: GitHubE2eBranchEnvironment | null = null

  try {
    environment = await createGitHubE2eBranchEnvironment(githubConfig, 'desktop-app')
    context = await createIsolatedDesktopApp()

    const page = await waitForPreviewPage(context.app)

    await saveDesktopSyncSettings(page, {
      branch: environment.branch,
      remoteUrl: githubConfig.remoteUrl,
      token: githubConfig.credentials.token,
    })
    await page.reload()
    await waitForJournalEditor(page)

    const configuredStatus = await loadDesktopSyncStatus(page)

    expect(configuredStatus).toMatchObject({
      branch: environment.branch,
      credentialStatus: 'available',
      hasCredentials: true,
      hasRepository: true,
      remoteUrl: githubConfig.remoteUrl,
    })

    const marker = `Desktop app GitHub sync E2E ${environment.branch}`
    const editor = page.locator('[aria-label="日记正文"][role="textbox"]')

    await editor.click()
    await page.keyboard.insertText(marker)

    await expect.poll(
      async () => readJournalEntry(context?.journalDir ?? '', today).catch(() => ''),
      { timeout: 15_000 },
    ).toContain(marker)

    await page.locator('.journal-sync-button').click()
    await expect(page).toHaveURL(/#\/settings/)
    await expect(page.locator('[aria-label="同步设置"]')).toBeVisible()
    await expect(getSettingsSyncStatusRow(page)).toContainText(/已配置|已保存|同步中|已同步/)

    const syncNowButton = page.getByRole('button', { name: '立即同步' })

    await expect(syncNowButton).toBeEnabled()
    await syncNowButton.click()
    await expect(page.locator('.settings-success-message')).toContainText(
      /同步完成|已经是最新/,
      { timeout: 60_000 },
    )

    const syncedStatus = await loadDesktopSyncStatus(page)

    expect(syncedStatus.branch).toBe(environment.branch)
    expect(syncedStatus.dirtyPaths).toEqual([])
    await expectHeadAttachedToBranch(context.journalDir, environment.branch)
    expect(await pathExists(path.join(context.journalDir, '.git', environment.branch))).toBe(false)
    expect(await pathExists(path.join(context.journalDir, '.git', 'main'))).toBe(false)

    const cloneDir = path.join(context.rootDir, 'remote-clone')
    const clone = await cloneGitHubE2eBranch(githubConfig, environment.branch, cloneDir)
    const clonedContent = await readFile(getEntryPath(cloneDir, today), 'utf8')

    expect(clone.status.branch).toBe(environment.branch)
    expect(clone.status.dirtyPaths).toEqual([])
    expect(clonedContent).toContain(marker)
    await expectHeadAttachedToBranch(cloneDir, environment.branch)
  } finally {
    if (context) {
      await closeIsolatedDesktopApp(context)
    }

    await environment?.dispose().catch((error: unknown) => {
      console.warn(`Failed to delete GitHub E2E branch ${environment?.branch}: ${getErrorMessage(error)}`)
    })
  }
})

type DesktopSyncStatus = {
  branch: string
  credentialStatus: 'available' | 'corrupt' | 'encryption-unavailable' | 'missing'
  dirtyPaths: string[]
  hasCredentials: boolean
  hasRepository: boolean
  remoteUrl: string
}

async function saveDesktopSyncSettings(
  page: Page,
  payload: {
    branch: string
    remoteUrl: string
    token: string
  },
) {
  const status = await page.evaluate(async ({ branch, remoteUrl, token }) => {
    const sync = (window as Window & {
      journalSync?: {
        saveSettings(settingsPayload: {
          syncBranch: string
          syncRemoteUrl: string
          syncToken: string
        }): Promise<DesktopSyncStatus>
      }
    }).journalSync

    if (!sync) {
      throw new Error('Desktop journal sync preload API is unavailable.')
    }

    return await sync.saveSettings({
      syncBranch: branch,
      syncRemoteUrl: remoteUrl,
      syncToken: token,
    })
  }, payload)

  expect(status).toMatchObject({
    branch: payload.branch,
    credentialStatus: 'available',
    hasCredentials: true,
    hasRepository: true,
    remoteUrl: payload.remoteUrl,
  })
}

async function loadDesktopSyncStatus(page: Page): Promise<DesktopSyncStatus> {
  return await page.evaluate(async () => {
    const sync = (window as Window & {
      journalSync?: {
        loadStatus(): Promise<DesktopSyncStatus>
      }
    }).journalSync

    if (!sync) {
      throw new Error('Desktop journal sync preload API is unavailable.')
    }

    return await sync.loadStatus()
  })
}
