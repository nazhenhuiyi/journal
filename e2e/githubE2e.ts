import { expect } from '@playwright/test'
import http from 'isomorphic-git/http/node'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  cloneJournalGitSyncRepository,
  getJournalGitSyncStatus,
  syncJournalNow,
  type JournalGitCredentials,
  type JournalGitRuntime,
  type JournalGitSyncConfig,
  type JournalGitTraceEvent,
} from '../packages/journal-sync/src/index'

export type GitHubE2eConfig = {
  branchPrefix: string
  credentials: JournalGitCredentials
  remote: GitHubRemote
  remoteUrl: string
}

export type GitHubRemote = {
  owner: string
  repo: string
}

export type GitHubE2eBranchEnvironment = {
  branch: string
  gitConfig: JournalGitSyncConfig
  dispose(): Promise<void>
}

export function loadGitHubE2eConfig(): GitHubE2eConfig {
  const token = process.env['JOURNAL_E2E_GITHUB_TOKEN']?.trim() ?? ''
  const remoteUrl = process.env['JOURNAL_E2E_GITHUB_REMOTE_URL']?.trim() ?? ''
  const remote = parseGitHubRemote(remoteUrl)

  if (remoteUrl && !remote) {
    throw new Error('JOURNAL_E2E_GITHUB_REMOTE_URL must point at github.com and use an HTTPS GitHub remote URL.')
  }

  if (!remoteUrl || !token) {
    throw new Error([
      'GitHub E2E requires JOURNAL_E2E_GITHUB_REMOTE_URL and JOURNAL_E2E_GITHUB_TOKEN.',
      'Use a dedicated private E2E repository; missing env is a failed test setup, not a skipped test.',
    ].join('\n'))
  }

  return {
    branchPrefix: process.env['JOURNAL_E2E_GITHUB_BRANCH_PREFIX']?.trim() || 'e2e/playwright',
    credentials: {
      token,
      username: 'x-access-token',
    },
    remote,
    remoteUrl,
  }
}

export function createGitHubE2eBranchName(config: GitHubE2eConfig, label: string) {
  return `${config.branchPrefix}/${label}/${Date.now()}-${randomUUID().slice(0, 8)}`
}

export async function createGitHubE2eBranch(config: GitHubE2eConfig, branch: string) {
  const defaultBranchSha = await getOrCreateDefaultBranchSha(config.remote, config.credentials.token)
  const response = await fetch(createGitHubApiUrl(config.remote, '/git/refs'), {
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: defaultBranchSha,
    }),
    headers: createGitHubHeaders(config.credentials.token),
    method: 'POST',
  })

  if (response.status === 201) {
    return
  }

  throw new Error(`GitHub E2E branch creation failed with ${response.status}: ${await response.text()}`)
}

export async function createGitHubE2eBranchEnvironment(
  config: GitHubE2eConfig,
  label: string,
): Promise<GitHubE2eBranchEnvironment> {
  const branch = createGitHubE2eBranchName(config, label)

  await createGitHubE2eBranch(config, branch)

  let disposed = false

  return {
    branch,
    gitConfig: createJournalGitConfig(config, branch),
    dispose: async () => {
      if (disposed) {
        return
      }

      disposed = true
      await deleteGitHubE2eBranch(config, branch)
    },
  }
}

export async function deleteGitHubE2eBranch(config: GitHubE2eConfig, branch: string) {
  const response = await fetch(
    createGitHubApiUrl(config.remote, `/git/refs/${encodeGitHubRefPath(branch)}`),
    {
      headers: createGitHubHeaders(config.credentials.token),
      method: 'DELETE',
    },
  )

  if (response.status === 204 || response.status === 404 || response.status === 422) {
    return
  }

  throw new Error(`GitHub branch cleanup failed with ${response.status}: ${await response.text()}`)
}

export function createJournalGitConfig(
  config: GitHubE2eConfig,
  branch: string,
): JournalGitSyncConfig {
  return {
    authorEmail: 'journal-e2e@example.invalid',
    authorName: 'Journal E2E',
    branch,
    remoteUrl: config.remoteUrl,
  }
}

export function createNodeGitRuntime(dir: string): JournalGitRuntime {
  const traceEvents: JournalGitTraceEvent[] = []

  return {
    cache: {},
    dir,
    fs,
    http,
    trace: (event) => {
      traceEvents.push(event)
    },
  }
}

export function getEntryPath(worktreeDir: string, date: string) {
  const [year, month] = date.split('-')

  return path.join(worktreeDir, 'entries', year, month, `${date}.md`)
}

export async function cloneGitHubE2eBranch(
  config: GitHubE2eConfig,
  branch: string,
  cloneDir: string,
) {
  const cloneRuntime = createNodeGitRuntime(cloneDir)
  const gitConfig = createJournalGitConfig(config, branch)

  await cloneJournalGitSyncRepository(cloneRuntime, gitConfig, config.credentials)

  return {
    gitConfig,
    runtime: cloneRuntime,
    status: await getJournalGitSyncStatus(cloneRuntime, gitConfig, config.credentials),
  }
}

export async function seedGitHubE2eBranch(
  config: GitHubE2eConfig,
  branch: string,
  worktreeDir: string,
  files: Record<string, string | Uint8Array>,
) {
  const runtime = createNodeGitRuntime(worktreeDir)
  const gitConfig = createJournalGitConfig(config, branch)

  await cloneJournalGitSyncRepository(runtime, gitConfig, config.credentials)

  for (const [filepath, contents] of Object.entries(files)) {
    const absolutePath = path.join(worktreeDir, filepath)

    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.promises.writeFile(absolutePath, contents)
  }

  await syncJournalNow(runtime, gitConfig, config.credentials, {
    changedPaths: Object.keys(files),
    collectDirtyPathsAfterSync: true,
  })

  return {
    gitConfig,
    runtime,
    status: await getJournalGitSyncStatus(runtime, gitConfig, config.credentials),
  }
}

export async function expectHeadAttachedToBranch(worktreeDir: string, branch: string) {
  await expect.poll(
    async () => readFile(path.join(worktreeDir, '.git', 'HEAD'), 'utf8'),
  ).toBe(`ref: refs/heads/${branch}\n`)
}

export async function pathExists(filePath: string) {
  return fs.promises.access(filePath).then(
    () => true,
    () => false,
  )
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function parseGitHubRemote(remoteUrl: string): GitHubRemote | null {
  const httpsMatch = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remoteUrl)

  if (httpsMatch) {
    return {
      owner: httpsMatch[1],
      repo: httpsMatch[2],
    }
  }

  return null
}

async function getOrCreateDefaultBranchSha(remote: GitHubRemote, token: string) {
  const repository = await requestGitHubJson<{ default_branch?: string }>(
    remote,
    '',
    token,
  )
  const defaultBranch = repository.default_branch || 'main'
  const existingSha = await getGitHubBranchSha(remote, defaultBranch, token)

  if (existingSha) {
    return existingSha
  }

  const response = await fetch(createGitHubApiUrl(remote, '/contents/.journal-e2e-bootstrap.md'), {
    body: JSON.stringify({
      branch: defaultBranch,
      content: Buffer.from('Journal sync E2E bootstrap repository.\n').toString('base64'),
      message: 'Initialize Journal sync E2E repository',
    }),
    headers: createGitHubHeaders(token),
    method: 'PUT',
  })

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`GitHub E2E bootstrap failed with ${response.status}: ${await response.text()}`)
  }

  const createdSha = await getGitHubBranchSha(remote, defaultBranch, token)

  if (!createdSha) {
    throw new Error(`GitHub E2E bootstrap did not create ${defaultBranch}.`)
  }

  return createdSha
}

async function getGitHubBranchSha(remote: GitHubRemote, branch: string, token: string) {
  const response = await fetch(createGitHubApiUrl(remote, `/git/ref/${encodeGitHubRefPath(branch)}`), {
    headers: createGitHubHeaders(token),
  })

  if (response.status === 404 || response.status === 409) {
    return null
  }

  if (!response.ok) {
    throw new Error(`GitHub branch lookup failed with ${response.status}: ${await response.text()}`)
  }

  const payload = await response.json() as { object?: { sha?: unknown } }

  return typeof payload.object?.sha === 'string' ? payload.object.sha : null
}

async function requestGitHubJson<T>(remote: GitHubRemote, pathName: string, token: string) {
  const response = await fetch(createGitHubApiUrl(remote, pathName), {
    headers: createGitHubHeaders(token),
  })

  if (!response.ok) {
    throw new Error(`GitHub request failed with ${response.status}: ${await response.text()}`)
  }

  return await response.json() as T
}

function createGitHubApiUrl(remote: GitHubRemote, pathName: string) {
  return `https://api.github.com/repos/${encodeURIComponent(remote.owner)}/${encodeURIComponent(remote.repo)}${pathName}`
}

function createGitHubHeaders(token: string) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function encodeGitHubRefPath(branch: string) {
  return ['heads', ...branch.split('/')]
    .map((part) => encodeURIComponent(part))
    .join('/')
}
