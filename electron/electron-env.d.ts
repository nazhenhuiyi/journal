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
