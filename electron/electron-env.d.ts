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

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer
  journalStore?: {
    loadToday(): Promise<{
      content: string
      date: string
      fileName: string
      filePath: string
      updatedAt: string | null
    }>
    saveToday(content: string): Promise<{
      content: string
      date: string
      fileName: string
      filePath: string
      updatedAt: string | null
    }>
    refreshTodayWeather(location?: { latitude?: number; longitude?: number }): Promise<{
      content: string
      date: string
      fileName: string
      filePath: string
      updatedAt: string | null
    }>
  }
  codex?: {
    ask(prompt: string): Promise<{
      finalResponse: string
      items: {
        id: string
        type: string
        summary: string
        status?: string
        exitCode?: number
      }[]
      threadId: string | null
      usage: {
        input_tokens: number
        cached_input_tokens: number
        output_tokens: number
      } | null
    }>
  }
}
