import * as SecureStore from 'expo-secure-store'
import { assertSafeRemoteUrl } from '@journal/sync'
import { appendMobileE2eSuffix } from '../e2eEnvironment'

export type GitHubSyncCredentials = {
  token: string
  username?: string
}

export type GitHubSyncCredentialsState =
  | {
      credentials: GitHubSyncCredentials
      status: 'available'
    }
  | {
      message?: string
      status: 'corrupt' | 'missing'
    }

export type GitHubSyncSettings = {
  branch: string
  remoteUrl: string
}

export type GitHubSyncSettingsState =
  | {
      settings: GitHubSyncSettings
      status: 'available'
    }
  | {
      message?: string
      status: 'corrupt' | 'missing'
    }

const credentialsKey = 'journal.githubSyncCredentials.v1'
const settingsKey = 'journal.githubSyncSettings.v1'

export async function saveGitHubSyncCredentials(credentials: GitHubSyncCredentials) {
  await SecureStore.setItemAsync(getCredentialsKey(), JSON.stringify({
    token: credentials.token.trim(),
    username: credentials.username?.trim() || undefined,
  }))
}

export async function loadGitHubSyncCredentials(): Promise<GitHubSyncCredentialsState> {
  const raw = await SecureStore.getItemAsync(getCredentialsKey())

  if (!raw) {
    return { status: 'missing' }
  }

  const parsed = parseCredentials(raw)

  if (!parsed) {
    return {
      message: 'GitHub token 无法读取，请重新保存。',
      status: 'corrupt',
    }
  }

  return {
    credentials: parsed,
    status: 'available',
  }
}

export async function clearGitHubSyncCredentials() {
  await SecureStore.deleteItemAsync(getCredentialsKey())
}

export async function saveGitHubSyncSettings(settings: GitHubSyncSettings) {
  assertSafeRemoteUrl(settings.remoteUrl)

  await SecureStore.setItemAsync(getSettingsKey(), JSON.stringify({
    branch: settings.branch.trim() || 'main',
    remoteUrl: settings.remoteUrl.trim(),
  }))
}

export async function loadGitHubSyncSettings(): Promise<GitHubSyncSettingsState> {
  const raw = await SecureStore.getItemAsync(getSettingsKey())

  if (!raw) {
    return { status: 'missing' }
  }

  const parsed = parseSettings(raw)

  if (!parsed) {
    return {
      message: '同步配置无法读取，请重新保存仓库地址。',
      status: 'corrupt',
    }
  }

  return {
    settings: parsed,
    status: 'available',
  }
}

export async function clearGitHubSyncSettings() {
  await SecureStore.deleteItemAsync(getSettingsKey())
}

function getCredentialsKey() {
  return appendMobileE2eSuffix(credentialsKey)
}

function getSettingsKey() {
  return appendMobileE2eSuffix(settingsKey)
}

function parseCredentials(value: string): GitHubSyncCredentials | null {
  try {
    const parsed = JSON.parse(value) as Partial<GitHubSyncCredentials>

    if (typeof parsed.token !== 'string' || parsed.token.trim().length === 0) {
      return null
    }

    return {
      token: parsed.token.trim(),
      username: typeof parsed.username === 'string' && parsed.username.trim()
        ? parsed.username.trim()
        : undefined,
    }
  } catch {
    return null
  }
}

function parseSettings(value: string): GitHubSyncSettings | null {
  try {
    const parsed = JSON.parse(value) as Partial<GitHubSyncSettings>

    if (typeof parsed.remoteUrl !== 'string' || parsed.remoteUrl.trim().length === 0) {
      return null
    }

    const normalizedSettings = {
      branch: typeof parsed.branch === 'string' && parsed.branch.trim()
        ? parsed.branch.trim()
        : 'main',
      remoteUrl: parsed.remoteUrl.trim(),
    }

    assertSafeRemoteUrl(normalizedSettings.remoteUrl)

    return normalizedSettings
  } catch {
    return null
  }
}
