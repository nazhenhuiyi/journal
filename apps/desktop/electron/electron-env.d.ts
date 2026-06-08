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
  fileName: string
  filePath: string
  updatedAt: string | null
}

type JournalEntryPayload = Omit<JournalFilePayload, 'content'>

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
      version: 1
      weatherLocation: string
      workingDirectory: string
      settingsPath: string
    }>
    save(payload: {
      weatherLocation: string
    }): Promise<{
      version: 1
      weatherLocation: string
      workingDirectory: string
      settingsPath: string
    }>
  }
}
