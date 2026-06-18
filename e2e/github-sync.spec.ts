import { expect, test } from '@playwright/test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  cloneGitHubE2eBranch,
  createGitHubE2eBranchEnvironment,
  createNodeGitRuntime,
  expectHeadAttachedToBranch,
  getEntryPath,
  getErrorMessage,
  loadGitHubE2eConfig,
  pathExists,
  seedGitHubE2eBranch,
  type GitHubE2eBranchEnvironment,
} from './githubE2e'
import {
  cloneJournalGitSyncRepository,
  getJournalGitSyncStatus,
  getJournalSyncBlock,
  resolveJournalContentConflict,
  syncJournalNow,
  type JournalGitConflictResolutionStrategy,
  type JournalGitRuntime,
  type SyncBlock,
} from '../packages/journal-sync/src/index'

test.use({
  screenshot: 'off',
  trace: 'off',
  video: 'off',
})

test('github sync core pushes and clones an isolated e2e branch', async () => {
  const githubConfig = loadGitHubE2eConfig()
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'journal-github-e2e-'))
  const sourceDir = path.join(rootDir, 'source')
  const cloneDir = path.join(rootDir, 'clone')
  let environment: GitHubE2eBranchEnvironment | null = null

  try {
    environment = await createGitHubE2eBranchEnvironment(githubConfig, 'core')

    const sourceRuntime = createNodeGitRuntime(sourceDir)
    const marker = `GitHub sync core E2E ${environment.branch}`
    const entryPath = getEntryPath(sourceDir, '2026-06-09')

    await cloneJournalGitSyncRepository(sourceRuntime, environment.gitConfig, githubConfig.credentials)
    await mkdir(path.dirname(entryPath), { recursive: true })
    await writeFile(entryPath, `---
date: 2026-06-09
---

${marker}
`, 'utf8')

    const result = await syncJournalNow(sourceRuntime, environment.gitConfig, githubConfig.credentials, {
      changedPaths: ['entries/2026/06/2026-06-09.md'],
      collectDirtyPathsAfterSync: true,
    })
    const sourceStatus = await getJournalGitSyncStatus(
      sourceRuntime,
      environment.gitConfig,
      githubConfig.credentials,
    )

    expect(result.localCommitOid || result.mergeCommitOid || result.retriedPush).toBeTruthy()
    expect(result.dirtyPathsAfterSync).toEqual([])
    expect(sourceStatus.branch).toBe(environment.branch)
    expect(sourceStatus.dirtyPaths).toEqual([])
    await expectHeadAttachedToBranch(sourceDir, environment.branch)
    expect(await pathExists(path.join(sourceDir, '.git', environment.branch))).toBe(false)

    const cloneRuntime = createNodeGitRuntime(cloneDir)

    await cloneJournalGitSyncRepository(cloneRuntime, environment.gitConfig, githubConfig.credentials)

    const clonedContent = await readFile(getEntryPath(cloneDir, '2026-06-09'), 'utf8')
    const cloneStatus = await getJournalGitSyncStatus(
      cloneRuntime,
      environment.gitConfig,
      githubConfig.credentials,
    )

    expect(clonedContent).toContain(marker)
    expect(cloneStatus.branch).toBe(environment.branch)
    expect(cloneStatus.dirtyPaths).toEqual([])
    await expectHeadAttachedToBranch(cloneDir, environment.branch)
  } finally {
    await environment?.dispose().catch((error: unknown) => {
      console.warn(`Failed to delete GitHub E2E branch ${environment?.branch}: ${getErrorMessage(error)}`)
    })
    await rm(rootDir, { force: true, recursive: true })
  }
})

test('github sync core skips a clean branch that already matches the remote', async () => {
  const githubConfig = loadGitHubE2eConfig()
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'journal-github-clean-e2e-'))
  const sourceDir = path.join(rootDir, 'source')
  let environment: GitHubE2eBranchEnvironment | null = null

  try {
    environment = await createGitHubE2eBranchEnvironment(githubConfig, 'clean')

    const runtime = createNodeGitRuntime(sourceDir)

    await cloneJournalGitSyncRepository(runtime, environment.gitConfig, githubConfig.credentials)

    const result = await syncJournalNow(runtime, environment.gitConfig, githubConfig.credentials, {
      changedPaths: [],
      collectDirtyPathsAfterSync: true,
    })
    const status = await getJournalGitSyncStatus(
      runtime,
      environment.gitConfig,
      githubConfig.credentials,
    )

    expect(result.localCommitOid).toBeNull()
    expect(result.mergeCommitOid).toBeNull()
    expect(result.pushResult).toBeNull()
    expect(result.retriedPush).toBe(false)
    expect(result.dirtyPathsAfterSync).toEqual([])
    expect(status.dirtyPaths).toEqual([])
    await expectHeadAttachedToBranch(sourceDir, environment.branch)
  } finally {
    await environment?.dispose().catch((error: unknown) => {
      console.warn(`Failed to delete GitHub E2E branch ${environment?.branch}: ${getErrorMessage(error)}`)
    })
    await rm(rootDir, { force: true, recursive: true })
  }
})

test('github sync core merges non-conflicting local and remote changes', async () => {
  const githubConfig = loadGitHubE2eConfig()
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'journal-github-merge-e2e-'))
  const localADir = path.join(rootDir, 'local-a')
  const localBDir = path.join(rootDir, 'local-b')
  const remoteCloneDir = path.join(rootDir, 'remote-clone')
  let environment: GitHubE2eBranchEnvironment | null = null

  try {
    environment = await createGitHubE2eBranchEnvironment(githubConfig, 'non-conflict-merge')

    const localARuntime = createNodeGitRuntime(localADir)
    const localBRuntime = createNodeGitRuntime(localBDir)
    const remoteFirstPath = 'entries/2026/06/2026-06-11.md'
    const localSecondPath = 'entries/2026/06/2026-06-12.md'
    const remoteFirstMarker = `remote first ${environment.branch}`
    const localSecondMarker = `local second ${environment.branch}`

    await cloneJournalGitSyncRepository(localARuntime, environment.gitConfig, githubConfig.credentials)
    await cloneJournalGitSyncRepository(localBRuntime, environment.gitConfig, githubConfig.credentials)

    await mkdir(path.dirname(getEntryPath(localADir, '2026-06-11')), { recursive: true })
    await writeFile(
      getEntryPath(localADir, '2026-06-11'),
      createConflictEntry('2026-06-11', remoteFirstMarker),
      'utf8',
    )
    await syncJournalNow(localARuntime, environment.gitConfig, githubConfig.credentials, {
      changedPaths: [remoteFirstPath],
      collectDirtyPathsAfterSync: true,
    })

    await mkdir(path.dirname(getEntryPath(localBDir, '2026-06-12')), { recursive: true })
    await writeFile(
      getEntryPath(localBDir, '2026-06-12'),
      createConflictEntry('2026-06-12', localSecondMarker),
      'utf8',
    )

    const result = await syncJournalNow(localBRuntime, environment.gitConfig, githubConfig.credentials, {
      changedPaths: [localSecondPath],
      collectDirtyPathsAfterSync: true,
    })

    expect(result.mergeCommitOid).toBeTruthy()
    expect(result.dirtyPathsAfterSync).toEqual([])

    const clone = await cloneGitHubE2eBranch(githubConfig, environment.branch, remoteCloneDir)
    const remoteFirstContent = await readFile(getEntryPath(remoteCloneDir, '2026-06-11'), 'utf8')
    const localSecondContent = await readFile(getEntryPath(remoteCloneDir, '2026-06-12'), 'utf8')

    expect(clone.status.dirtyPaths).toEqual([])
    expect(remoteFirstContent).toContain(remoteFirstMarker)
    expect(localSecondContent).toContain(localSecondMarker)
    await expectHeadAttachedToBranch(remoteCloneDir, environment.branch)
  } finally {
    await environment?.dispose().catch((error: unknown) => {
      console.warn(`Failed to delete GitHub E2E branch ${environment?.branch}: ${getErrorMessage(error)}`)
    })
    await rm(rootDir, { force: true, recursive: true })
  }
})

test('github sync core preserves the managed file type matrix on GitHub', async () => {
  const githubConfig = loadGitHubE2eConfig()
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'journal-github-managed-matrix-e2e-'))
  const seedDir = path.join(rootDir, 'seed')
  const remoteWriterDir = path.join(rootDir, 'remote-writer')
  const localWriterDir = path.join(rootDir, 'local-writer')
  const remoteCloneDir = path.join(rootDir, 'remote-clone')
  const deletedEntryDate = '2026-06-21'
  const deletedEntryPath = getEntryRelativePath(deletedEntryDate)
  const mediaPath = 'media/2026/06/matrix-photo.bin'
  const manifestPath = 'manifest.json'
  const reviewPath = 'reviews/2026/06/2026-06-21.json'
  const annotationPath = 'annotations/2026/06/2026-06-21.json'
  const localMediaBytes = Uint8Array.from([0x6a, 0x6f, 0x75, 0x72, 0x6e, 0x61, 0x6c])
  let environment: GitHubE2eBranchEnvironment | null = null

  try {
    environment = await createGitHubE2eBranchEnvironment(githubConfig, 'managed-matrix')

    await seedGitHubE2eBranch(githubConfig, environment.branch, seedDir, {
      [annotationPath]: createAnnotationFile('base-annotation', '2026-06-21T10:00:00.000Z'),
      [deletedEntryPath]: createConflictEntry(deletedEntryDate, '这篇会在矩阵用例里被删除'),
      [reviewPath]: createReviewFile('base-review', '2026-06-21T10:00:00.000Z'),
    })

    const remoteWriterRuntime = createNodeGitRuntime(remoteWriterDir)
    const localWriterRuntime = createNodeGitRuntime(localWriterDir)

    await cloneJournalGitSyncRepository(remoteWriterRuntime, environment.gitConfig, githubConfig.credentials)
    await cloneJournalGitSyncRepository(localWriterRuntime, environment.gitConfig, githubConfig.credentials)

    await writeRepositoryFile(
      remoteWriterDir,
      reviewPath,
      createReviewFile('remote-older-review', '2026-06-21T11:00:00.000Z'),
    )
    await writeRepositoryFile(
      remoteWriterDir,
      annotationPath,
      createAnnotationFile('remote-older-annotation', '2026-06-21T11:00:00.000Z'),
    )
    await syncJournalNow(remoteWriterRuntime, environment.gitConfig, githubConfig.credentials, {
      changedPaths: [annotationPath, reviewPath],
      collectDirtyPathsAfterSync: true,
    })

    await rm(path.join(localWriterDir, deletedEntryPath))
    await writeRepositoryFile(localWriterDir, mediaPath, localMediaBytes)
    await writeRepositoryFile(
      localWriterDir,
      manifestPath,
      JSON.stringify({
        e2e: 'managed-matrix',
        updatedAt: '2026-06-21T12:00:00.000Z',
      }, null, 2),
    )
    await writeRepositoryFile(
      localWriterDir,
      reviewPath,
      createReviewFile('local-newer-review', '2026-06-21T12:00:00.000Z'),
    )
    await writeRepositoryFile(
      localWriterDir,
      annotationPath,
      createAnnotationFile('local-newer-annotation', '2026-06-21T12:00:00.000Z'),
    )

    const result = await syncJournalNow(localWriterRuntime, environment.gitConfig, githubConfig.credentials, {
      changedPaths: [annotationPath, deletedEntryPath, manifestPath, mediaPath, reviewPath],
      collectDirtyPathsAfterSync: true,
    })
    const localStatus = await getJournalGitSyncStatus(
      localWriterRuntime,
      environment.gitConfig,
      githubConfig.credentials,
    )
    const clone = await cloneGitHubE2eBranch(githubConfig, environment.branch, remoteCloneDir)
    const remoteMediaBytes = await readFile(path.join(remoteCloneDir, mediaPath))
    const remoteManifest = JSON.parse(await readFile(path.join(remoteCloneDir, manifestPath), 'utf8')) as {
      e2e?: unknown
    }
    const remoteReview = JSON.parse(await readFile(path.join(remoteCloneDir, reviewPath), 'utf8')) as {
      marker?: unknown
    }
    const remoteAnnotations = JSON.parse(await readFile(path.join(remoteCloneDir, annotationPath), 'utf8')) as {
      annotations?: Array<{ id?: unknown }>
    }

    expect(result.mergeCommitOid).toBeTruthy()
    expect(result.dirtyPathsAfterSync).toEqual([])
    expect(localStatus.dirtyPaths).toEqual([])
    expect(clone.status.dirtyPaths).toEqual([])
    expect(await pathExists(path.join(remoteCloneDir, deletedEntryPath))).toBe(false)
    expect([...remoteMediaBytes]).toEqual([...localMediaBytes])
    expect(remoteManifest.e2e).toBe('managed-matrix')
    expect(remoteReview.marker).toBe('local-newer-review')
    expect(remoteAnnotations.annotations?.[0]?.id).toBe('local-newer-annotation')
    await expectHeadAttachedToBranch(localWriterDir, environment.branch)
    await expectHeadAttachedToBranch(remoteCloneDir, environment.branch)
  } finally {
    await environment?.dispose().catch((error: unknown) => {
      console.warn(`Failed to delete GitHub E2E branch ${environment?.branch}: ${getErrorMessage(error)}`)
    })
    await rm(rootDir, { force: true, recursive: true })
  }
})

test('github sync core blocks true content conflicts without polluting the remote', async () => {
  const githubConfig = loadGitHubE2eConfig()
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'journal-github-conflict-e2e-'))
  const remoteCloneDir = path.join(rootDir, 'remote-clone')
  const entryDate = '2026-06-10'
  let environment: GitHubE2eBranchEnvironment | null = null

  try {
    environment = await createGitHubE2eBranchEnvironment(githubConfig, 'content-conflict')
    const scenario = await createBlockedContentConflict({
      entryDate,
      environment,
      githubConfig,
      label: 'block-only',
      localBody: '本机后来写入的内容',
      remoteBody: '远端先写入的内容',
      rootDir,
    })
    const block = scenario.block

    expect(block).toMatchObject({
      reason: 'content-conflict',
    })
    expect(block.paths).toContain(scenario.entryRelativePath)
    expect(block.conflicts?.[0]).toMatchObject({
      path: scenario.entryRelativePath,
    })
    expect(block.conflicts?.[0]?.ours).toContain('本机后来写入的内容')
    expect(block.conflicts?.[0]?.theirs).toContain('远端先写入的内容')

    const clone = await cloneGitHubE2eBranch(githubConfig, environment.branch, remoteCloneDir)
    const remoteContent = await readFile(getEntryPath(remoteCloneDir, entryDate), 'utf8')

    expect(clone.status.dirtyPaths).toEqual([])
    expect(remoteContent).toContain('远端先写入的内容')
    expect(remoteContent).not.toContain('本机后来写入的内容')
    expect(remoteContent).not.toContain('<<<<<<<')
    expect(remoteContent).not.toContain('>>>>>>>')
    await expectHeadAttachedToBranch(remoteCloneDir, environment.branch)
  } finally {
    await environment?.dispose().catch((error: unknown) => {
      console.warn(`Failed to delete GitHub E2E branch ${environment?.branch}: ${getErrorMessage(error)}`)
    })
    await rm(rootDir, { force: true, recursive: true })
  }
})

test('github sync core blocks then resolves a content conflict after a manual keep-local choice', async () => {
  const githubConfig = loadGitHubE2eConfig()
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'journal-github-manual-resolve-e2e-'))
  const beforeResolveCloneDir = path.join(rootDir, 'before-resolve-clone')
  const afterResolveCloneDir = path.join(rootDir, 'after-resolve-clone')
  const entryDate = '2026-06-14'
  const localBody = '用户手动选择保留的本机内容'
  const remoteBody = '冲突发生前已经在远端的内容'
  let environment: GitHubE2eBranchEnvironment | null = null

  try {
    environment = await createGitHubE2eBranchEnvironment(githubConfig, 'manual-resolve')
    const scenario = await createBlockedContentConflict({
      entryDate,
      environment,
      githubConfig,
      label: 'manual-keep-local',
      localBody,
      remoteBody,
      rootDir,
    })

    const beforeResolveClone = await cloneGitHubE2eBranch(
      githubConfig,
      environment.branch,
      beforeResolveCloneDir,
    )
    const beforeResolveRemoteContent = await readFile(getEntryPath(beforeResolveCloneDir, entryDate), 'utf8')

    expect(scenario.block.reason).toBe('content-conflict')
    expect(scenario.block.conflicts?.[0]?.ours).toContain(localBody)
    expect(scenario.block.conflicts?.[0]?.theirs).toContain(remoteBody)
    expect(beforeResolveClone.status.dirtyPaths).toEqual([])
    expect(beforeResolveRemoteContent).toContain(remoteBody)
    expect(beforeResolveRemoteContent).not.toContain(localBody)
    expect(beforeResolveRemoteContent).not.toContain('<<<<<<<')
    expect(beforeResolveRemoteContent).not.toContain('>>>>>>>')

    const resolution = await resolveJournalContentConflict(
      scenario.localBRuntime,
      environment.gitConfig,
      githubConfig.credentials,
      { strategy: 'keep-local' },
    )
    const resolvedStatus = await getJournalGitSyncStatus(
      scenario.localBRuntime,
      environment.gitConfig,
      githubConfig.credentials,
    )
    const afterResolveClone = await cloneGitHubE2eBranch(
      githubConfig,
      environment.branch,
      afterResolveCloneDir,
    )
    const localContent = await readFile(getEntryPath(scenario.localBDir, entryDate), 'utf8')
    const afterResolveRemoteContent = await readFile(getEntryPath(afterResolveCloneDir, entryDate), 'utf8')

    expect(resolution.strategy).toBe('keep-local')
    expect(resolution.pushResult).toBeTruthy()
    expect(resolution.updatedWorktree).toBe(false)
    expect(resolvedStatus.dirtyPaths).toEqual([])
    expect(afterResolveClone.status.dirtyPaths).toEqual([])
    expect(localContent).toContain(localBody)
    expect(afterResolveRemoteContent).toContain(localBody)
    expect(afterResolveRemoteContent).not.toContain(remoteBody)
    expect(afterResolveRemoteContent).not.toContain('<<<<<<<')
    expect(afterResolveRemoteContent).not.toContain('>>>>>>>')
    await expectHeadAttachedToBranch(scenario.localBDir, environment.branch)
    await expectHeadAttachedToBranch(afterResolveCloneDir, environment.branch)
  } finally {
    await environment?.dispose().catch((error: unknown) => {
      console.warn(`Failed to delete GitHub E2E branch ${environment?.branch}: ${getErrorMessage(error)}`)
    })
    await rm(rootDir, { force: true, recursive: true })
  }
})

test('github sync core resolves a true content conflict by keeping local content', async () => {
  await expectConflictResolutionStrategy({
    assertLocalContent: ({ localContent, localBody, remoteBody }) => {
      expect(localContent).toContain(localBody)
      expect(localContent).not.toContain(remoteBody)
    },
    assertRemoteContent: ({ localBody, remoteBody, remoteContent }) => {
      expect(remoteContent).toContain(localBody)
      expect(remoteContent).not.toContain(remoteBody)
    },
    expectedPush: true,
    expectedUpdatedWorktree: false,
    strategy: 'keep-local',
  })
})

test('github sync core resolves a true content conflict by keeping both sides', async () => {
  await expectConflictResolutionStrategy({
    assertLocalContent: ({ localContent, localBody, remoteBody }) => {
      expect(localContent).toContain(localBody)
      expect(localContent).toContain(remoteBody)
      expect(localContent).not.toContain('<<<<<<<')
      expect(localContent).not.toContain('>>>>>>>')
    },
    assertRemoteContent: ({ localBody, remoteBody, remoteContent }) => {
      expect(remoteContent).toContain(localBody)
      expect(remoteContent).toContain(remoteBody)
      expect(remoteContent).not.toContain('<<<<<<<')
      expect(remoteContent).not.toContain('>>>>>>>')
    },
    expectedPush: true,
    expectedUpdatedWorktree: true,
    strategy: 'keep-both',
  })
})

test('github sync core resolves a true content conflict by keeping remote content without pushing', async () => {
  await expectConflictResolutionStrategy({
    assertLocalContent: ({ localContent, localBody, remoteBody }) => {
      expect(localContent).toContain(remoteBody)
      expect(localContent).not.toContain(localBody)
    },
    assertRemoteContent: ({ localBody, remoteBody, remoteContent }) => {
      expect(remoteContent).toContain(remoteBody)
      expect(remoteContent).not.toContain(localBody)
    },
    expectedPush: false,
    expectedUpdatedWorktree: true,
    strategy: 'keep-remote',
  })
})

type ContentConflictScenario = {
  block: SyncBlock
  entryDate: string
  entryRelativePath: string
  localBDir: string
  localBRuntime: JournalGitRuntime
}

type ConflictResolutionExpectation = {
  assertLocalContent(input: ConflictResolutionContent): void
  assertRemoteContent(input: ConflictResolutionContent): void
  expectedPush: boolean
  expectedUpdatedWorktree: boolean
  strategy: JournalGitConflictResolutionStrategy
}

type ConflictResolutionContent = {
  localBody: string
  localContent: string
  remoteBody: string
  remoteContent: string
}

async function expectConflictResolutionStrategy(input: ConflictResolutionExpectation) {
  const githubConfig = loadGitHubE2eConfig()
  const rootDir = await mkdtemp(path.join(os.tmpdir(), `journal-github-${input.strategy}-e2e-`))
  const remoteCloneDir = path.join(rootDir, 'remote-clone')
  const entryDate = '2026-06-13'
  const localBody = `本机 ${input.strategy} ${Date.now()}`
  const remoteBody = `远端 ${input.strategy} ${Date.now()}`
  let environment: GitHubE2eBranchEnvironment | null = null

  try {
    environment = await createGitHubE2eBranchEnvironment(githubConfig, input.strategy)

    const scenario = await createBlockedContentConflict({
      entryDate,
      environment,
      githubConfig,
      label: input.strategy,
      localBody,
      remoteBody,
      rootDir,
    })

    const resolution = await resolveJournalContentConflict(
      scenario.localBRuntime,
      environment.gitConfig,
      githubConfig.credentials,
      { strategy: input.strategy },
    )
    const status = await getJournalGitSyncStatus(
      scenario.localBRuntime,
      environment.gitConfig,
      githubConfig.credentials,
    )
    const clone = await cloneGitHubE2eBranch(githubConfig, environment.branch, remoteCloneDir)
    const localContent = await readFile(getEntryPath(scenario.localBDir, entryDate), 'utf8')
    const remoteContent = await readFile(getEntryPath(remoteCloneDir, entryDate), 'utf8')

    expect(resolution.strategy).toBe(input.strategy)
    expect(Boolean(resolution.pushResult)).toBe(input.expectedPush)
    expect(resolution.updatedWorktree).toBe(input.expectedUpdatedWorktree)
    expect(status.dirtyPaths).toEqual([])
    expect(clone.status.dirtyPaths).toEqual([])
    expect(localContent).not.toContain('<<<<<<<')
    expect(localContent).not.toContain('>>>>>>>')
    expect(remoteContent).not.toContain('<<<<<<<')
    expect(remoteContent).not.toContain('>>>>>>>')
    input.assertLocalContent({ localBody, localContent, remoteBody, remoteContent })
    input.assertRemoteContent({ localBody, localContent, remoteBody, remoteContent })
    await expectHeadAttachedToBranch(scenario.localBDir, environment.branch)
    await expectHeadAttachedToBranch(remoteCloneDir, environment.branch)
  } finally {
    await environment?.dispose().catch((error: unknown) => {
      console.warn(`Failed to delete GitHub E2E branch ${environment?.branch}: ${getErrorMessage(error)}`)
    })
    await rm(rootDir, { force: true, recursive: true })
  }
}

async function createBlockedContentConflict(input: {
  entryDate: string
  environment: GitHubE2eBranchEnvironment
  githubConfig: ReturnType<typeof loadGitHubE2eConfig>
  label: string
  localBody: string
  remoteBody: string
  rootDir: string
}): Promise<ContentConflictScenario> {
  const scenarioRoot = path.join(input.rootDir, input.label)
  const seedDir = path.join(scenarioRoot, 'seed')
  const localADir = path.join(scenarioRoot, 'local-a')
  const localBDir = path.join(scenarioRoot, 'local-b')
  const entryRelativePath = getEntryRelativePath(input.entryDate)

  await seedGitHubE2eBranch(input.githubConfig, input.environment.branch, seedDir, {
    [entryRelativePath]: createConflictEntry(input.entryDate, '原始内容'),
  })

  const localARuntime = createNodeGitRuntime(localADir)
  const localBRuntime = createNodeGitRuntime(localBDir)

  await cloneJournalGitSyncRepository(localARuntime, input.environment.gitConfig, input.githubConfig.credentials)
  await cloneJournalGitSyncRepository(localBRuntime, input.environment.gitConfig, input.githubConfig.credentials)

  await writeFile(
    getEntryPath(localADir, input.entryDate),
    createConflictEntry(input.entryDate, input.remoteBody),
    'utf8',
  )
  await syncJournalNow(localARuntime, input.environment.gitConfig, input.githubConfig.credentials, {
    changedPaths: [entryRelativePath],
    collectDirtyPathsAfterSync: true,
  })

  await writeFile(
    getEntryPath(localBDir, input.entryDate),
    createConflictEntry(input.entryDate, input.localBody),
    'utf8',
  )

  const blockedError = await getBlockedSyncError(async () => {
    await syncJournalNow(localBRuntime, input.environment.gitConfig, input.githubConfig.credentials, {
      changedPaths: [entryRelativePath],
      collectDirtyPathsAfterSync: true,
    })
  })
  const block = getJournalSyncBlock(blockedError)
  const localContent = await readFile(getEntryPath(localBDir, input.entryDate), 'utf8')

  expect(block).toMatchObject({
    reason: 'content-conflict',
  })
  expect(block?.paths).toContain(entryRelativePath)
  expect(block?.conflicts?.[0]?.ours).toContain(input.localBody)
  expect(block?.conflicts?.[0]?.theirs).toContain(input.remoteBody)
  expect(localContent).toContain(input.localBody)
  expect(localContent).not.toContain('<<<<<<<')
  expect(localContent).not.toContain('>>>>>>>')

  return {
    block: block!,
    entryDate: input.entryDate,
    entryRelativePath,
    localBDir,
    localBRuntime,
  }
}

async function getBlockedSyncError(action: () => Promise<void>) {
  try {
    await action()
  } catch (error) {
    return error
  }

  throw new Error('Expected sync to block with content-conflict.')
}

function getEntryRelativePath(date: string) {
  const [year, month] = date.split('-')

  return `entries/${year}/${month}/${date}.md`
}

function createConflictEntry(date: string, body: string) {
  return `---
date: ${date}
---

# 同步冲突

${body}
`
}

async function writeRepositoryFile(worktreeDir: string, filepath: string, contents: string | Uint8Array) {
  const absolutePath = path.join(worktreeDir, filepath)

  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, contents)
}

function createReviewFile(marker: string, generatedAt: string) {
  return JSON.stringify({
    date: '2026-06-21',
    generatedAt,
    marker,
    version: 1,
  }, null, 2)
}

function createAnnotationFile(id: string, updatedAt: string) {
  return JSON.stringify({
    annotations: [
      {
        id,
        text: id,
        updatedAt,
      },
    ],
    date: '2026-06-21',
    source: 'entries/2026/06/2026-06-21.md',
    sourceHash: 'e2e-matrix',
    version: 1,
  }, null, 2)
}
