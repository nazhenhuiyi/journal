import * as SecureStore from 'expo-secure-store'
import { assertSafeRemoteUrl } from '@journal/sync'

export type GitHubSyncCredentials = {
  token: string
  username?: string
}

export type GitHubSyncSettings = {
  branch: string
  remoteUrl: string
}

const credentialsKey = 'journal.githubSyncCredentials.v1'
const settingsKey = 'journal.githubSyncSettings.v1'

export async function saveGitHubSyncCredentials(credentials: GitHubSyncCredentials) {
  await SecureStore.setItemAsync(credentialsKey, JSON.stringify({
    token: credentials.token.trim(),
    username: credentials.username?.trim() || undefined,
  }))
}

export async function loadGitHubSyncCredentials(): Promise<GitHubSyncCredentials | null> {
  const raw = await SecureStore.getItemAsync(credentialsKey)

  if (!raw) {
    return null
  }

  const parsed = parseCredentials(raw)

  if (!parsed) {
    await clearGitHubSyncCredentials()
    return null
  }

  return parsed
}

export async function clearGitHubSyncCredentials() {
  await SecureStore.deleteItemAsync(credentialsKey)
}

export async function saveGitHubSyncSettings(settings: GitHubSyncSettings) {
  assertSafeRemoteUrl(settings.remoteUrl)

  await SecureStore.setItemAsync(settingsKey, JSON.stringify({
    branch: settings.branch.trim() || 'main',
    remoteUrl: settings.remoteUrl.trim(),
  }))
}

export async function loadGitHubSyncSettings(): Promise<GitHubSyncSettings | null> {
  const raw = await SecureStore.getItemAsync(settingsKey)

  if (!raw) {
    return null
  }

  const parsed = parseSettings(raw)

  if (!parsed) {
    await clearGitHubSyncSettings()
    return null
  }

  return parsed
}

export async function clearGitHubSyncSettings() {
  await SecureStore.deleteItemAsync(settingsKey)
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
