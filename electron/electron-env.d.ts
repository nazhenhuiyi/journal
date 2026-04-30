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
    loadDate?(date: string): Promise<{
      content: string
      date: string
      fileName: string
      filePath: string
      updatedAt: string | null
    }>
    saveDate?(date: string, content: string): Promise<{
      content: string
      date: string
      fileName: string
      filePath: string
      updatedAt: string | null
    }>
    readAnnotations(date: string): Promise<import('../src/domain/annotations/types').AnnotationFile>
    saveAnnotations(
      date: string,
      annotations: import('../src/domain/annotations/types').Annotation[],
    ): Promise<import('../src/domain/annotations/types').AnnotationFile>
    refreshTodayWeather(location?: { latitude?: number; longitude?: number }): Promise<{
      content: string
      date: string
      fileName: string
      filePath: string
      updatedAt: string | null
    }>
    importImages(date: string): Promise<
      {
        id: string
        src: string
        fileName: string
        filePath: string
      }[]
    >
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
    generateAnnotationDrafts(payload: {
      date: string
      longEntryMarkdown: string
    }): Promise<{
      drafts: import('../src/domain/annotations/annotationDrafts').AiAnnotationDraft[]
      threadId: string | null
      usage: {
        input_tokens: number
        cached_input_tokens: number
        output_tokens: number
      } | null
    }>
    chatWithAnnotation(payload: {
      date: string
      journalMarkdown: string
      annotation: import('../src/domain/annotations/types').Annotation
      message: string
      threadId?: string
    }): Promise<{
      response: string
      threadId: string | null
      usage: {
        input_tokens: number
        cached_input_tokens: number
        output_tokens: number
      } | null
    }>
    readAnnotationThread(threadId: string): Promise<{
      messages: {
        id: string
        role: 'user' | 'assistant'
        content: string
      }[]
    }>
  }
  codexSettings?: {
    load(): Promise<{
      version: 1
      model: string
      modelReasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
      systemPrompt: string
      workingDirectory: string
      directory: string
      settingsPath: string
      systemPromptPath: string
    }>
    save(payload: {
      model: string
      modelReasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
      systemPrompt: string
    }): Promise<{
      version: 1
      model: string
      modelReasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
      systemPrompt: string
      workingDirectory: string
      directory: string
      settingsPath: string
      systemPromptPath: string
    }>
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
