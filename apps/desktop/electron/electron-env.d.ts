/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

type JournalFilePayload = {
  content: string
  date: string
  didWrite: boolean
  fileName: string
  filePath: string
  updatedAt: string | null
}

type JournalEntryPayload = Omit<JournalFilePayload, 'content'>

type JournalGitRecentCommitPayload = {
  committedAt: string | null
  message: string
  oid: string
  shortOid: string
}

type JournalGitOperationOptionsPayload = {
  changedPaths?: readonly string[]
  collectDirtyPathsAfterSync?: boolean
}

// Used in Renderer process, exposed in `preload.ts`.
interface Window {
  ipcRenderer: import('electron').IpcRenderer
  journalStore?: {
    loadToday(): Promise<JournalFilePayload>
    saveToday(content: string): Promise<JournalFilePayload>
    listEntries?(): Promise<JournalEntryPayload[]>
    loadDate?(date: string): Promise<JournalFilePayload>
    saveDate?(date: string, content: string): Promise<JournalFilePayload>
    readAnnotations(date: string): Promise<import('@journal/core').AnnotationFile>
    saveAnnotations(
      date: string,
      annotations: import('@journal/core').Annotation[],
    ): Promise<import('@journal/core').AnnotationFile>
    refreshTodayWeather(location?: { latitude?: number; longitude?: number }): Promise<JournalFilePayload>
    importImages(date: string): Promise<
      {
        id: string
        src: string
        fileName: string
        filePath: string
        location?: import('@journal/core').ImageLocation
      }[]
    >
  }
  journalSettings?: {
    load(): Promise<{
      settingsMessage?: string
      syncBranch: string
      syncRemoteUrl: string
      version: 1
      weatherLocation: string
      workingDirectory: string
      settingsStatus: 'corrupt' | 'created' | 'ready'
      settingsPath: string
    }>
    save(payload: {
      syncBranch?: string
      syncRemoteUrl?: string
      weatherLocation: string
    }): Promise<{
      syncBranch: string
      syncRemoteUrl: string
      version: 1
      weatherLocation: string
      workingDirectory: string
      settingsMessage?: string
      settingsStatus: 'corrupt' | 'created' | 'ready'
      settingsPath: string
    }>
  }
  journalSync?: {
    loadStatus(): Promise<{
      branch: string
      credentialMessage?: string
      credentialStatus: 'available' | 'corrupt' | 'encryption-unavailable' | 'missing'
      dirtyPaths: string[]
      hasCredentials: boolean
      hasRepository: boolean
      recentCommits: JournalGitRecentCommitPayload[]
      remoteUrl: string
    }>
    pull(): Promise<{
      changed: boolean
      dirtyPaths: string[]
      message: string
    }>
    push(options?: JournalGitOperationOptionsPayload): Promise<{
      changed: boolean
      dirtyPaths: string[]
      message: string
    }>
    saveSettings(payload: {
      syncBranch?: string
      syncRemoteUrl?: string
      syncToken?: string
    }): Promise<{
      branch: string
      credentialMessage?: string
      credentialStatus: 'available' | 'corrupt' | 'encryption-unavailable' | 'missing'
      dirtyPaths: string[]
      hasCredentials: boolean
      hasRepository: boolean
      recentCommits: JournalGitRecentCommitPayload[]
      remoteUrl: string
    }>
    syncNow(options?: JournalGitOperationOptionsPayload): Promise<{
      changed: boolean
      dirtyPaths: string[]
      message: string
    }>
  }
}
