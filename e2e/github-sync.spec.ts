import { expect, test } from '@playwright/test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createGitHubE2eBranch,
  createGitHubE2eBranchName,
  createJournalGitConfig,
  createNodeGitRuntime,
  deleteGitHubE2eBranch,
  expectHeadAttachedToBranch,
  getEntryPath,
  getErrorMessage,
  loadGitHubE2eConfig,
  pathExists,
} from './githubE2e'
import {
  cloneJournalGitSyncRepository,
  getJournalGitSyncStatus,
  syncJournalNow,
} from '../packages/journal-sync/src/index'

test.use({
  screenshot: 'off',
  trace: 'off',
  video: 'off',
})

test('github sync core pushes and clones an isolated e2e branch', async () => {
  const githubConfig = loadGitHubE2eConfig()

  test.skip(!githubConfig, 'Set JOURNAL_E2E_GITHUB_TOKEN and JOURNAL_E2E_GITHUB_REMOTE_URL to run this test.')

  const branch = createGitHubE2eBranchName(githubConfig, 'core')
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'journal-github-e2e-'))
  const sourceDir = path.join(rootDir, 'source')
  const cloneDir = path.join(rootDir, 'clone')
  const syncConfig = createJournalGitConfig(githubConfig, branch)

  try {
    await createGitHubE2eBranch(githubConfig, branch)

    const sourceRuntime = createNodeGitRuntime(sourceDir)
    const marker = `GitHub sync core E2E ${branch}`
    const entryPath = getEntryPath(sourceDir, '2026-06-09')

    await cloneJournalGitSyncRepository(sourceRuntime, syncConfig, githubConfig.credentials)
    await mkdir(path.dirname(entryPath), { recursive: true })
    await writeFile(entryPath, `---
date: 2026-06-09
---

${marker}
`, 'utf8')

    const result = await syncJournalNow(sourceRuntime, syncConfig, githubConfig.credentials, {
      changedPaths: ['entries/2026/06/2026-06-09.md'],
      collectDirtyPathsAfterSync: true,
    })
    const sourceStatus = await getJournalGitSyncStatus(
      sourceRuntime,
      syncConfig,
      githubConfig.credentials,
    )

    expect(result.localCommitOid || result.mergeCommitOid || result.retriedPush).toBeTruthy()
    expect(result.dirtyPathsAfterSync).toEqual([])
    expect(sourceStatus.branch).toBe(branch)
    expect(sourceStatus.dirtyPaths).toEqual([])
    await expectHeadAttachedToBranch(sourceDir, branch)
    expect(await pathExists(path.join(sourceDir, '.git', branch))).toBe(false)

    const cloneRuntime = createNodeGitRuntime(cloneDir)

    await cloneJournalGitSyncRepository(cloneRuntime, syncConfig, githubConfig.credentials)

    const clonedContent = await readFile(getEntryPath(cloneDir, '2026-06-09'), 'utf8')
    const cloneStatus = await getJournalGitSyncStatus(
      cloneRuntime,
      syncConfig,
      githubConfig.credentials,
    )

    expect(clonedContent).toContain(marker)
    expect(cloneStatus.branch).toBe(branch)
    expect(cloneStatus.dirtyPaths).toEqual([])
    await expectHeadAttachedToBranch(cloneDir, branch)
  } finally {
    await deleteGitHubE2eBranch(githubConfig, branch).catch((error: unknown) => {
      console.warn(`Failed to delete GitHub E2E branch ${branch}: ${getErrorMessage(error)}`)
    })
    await rm(rootDir, { force: true, recursive: true })
  }
})
