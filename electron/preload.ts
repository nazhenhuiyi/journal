import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

contextBridge.exposeInMainWorld('codex', {
  ask(prompt: string) {
    return ipcRenderer.invoke('codex:ask', prompt)
  },
  generateAnnotationDrafts(payload: unknown) {
    return ipcRenderer.invoke('codex:generateAnnotationDrafts', payload)
  },
  generateFrontMatterDraft(payload: unknown) {
    return ipcRenderer.invoke('codex:generateFrontMatterDraft', payload)
  },
  generateDailyCurationDraft(payload: unknown) {
    return ipcRenderer.invoke('codex:generateDailyCurationDraft', payload)
  },
  chatWithAnnotation(payload: unknown) {
    return ipcRenderer.invoke('codex:chatWithAnnotation', payload)
  },
  readAnnotationThread(threadId: string) {
    return ipcRenderer.invoke('codex:readAnnotationThread', threadId)
  },
})

contextBridge.exposeInMainWorld('codexSettings', {
  load() {
    return ipcRenderer.invoke('codexSettings:load')
  },
  save(payload: unknown) {
    return ipcRenderer.invoke('codexSettings:save', payload)
  },
})

contextBridge.exposeInMainWorld('journalSettings', {
  load() {
    return ipcRenderer.invoke('journalSettings:load')
  },
  save(payload: unknown) {
    return ipcRenderer.invoke('journalSettings:save', payload)
  },
})

contextBridge.exposeInMainWorld('journalStore', {
  loadToday() {
    return ipcRenderer.invoke('journal:loadToday')
  },
  saveToday(content: string) {
    return ipcRenderer.invoke('journal:saveToday', content)
  },
  listEntries() {
    return ipcRenderer.invoke('journal:listEntries')
  },
  listIndex() {
    return ipcRenderer.invoke('journal:listIndex')
  },
  loadDailyCuration(date: string) {
    return ipcRenderer.invoke('journal:loadDailyCuration', date)
  },
  saveDailyCuration(curation: import('../src/domain/dailyCuration').DailyCuration) {
    return ipcRenderer.invoke('journal:saveDailyCuration', curation)
  },
  loadDate(date: string) {
    return ipcRenderer.invoke('journal:loadDate', date)
  },
  saveDate(date: string, content: string) {
    return ipcRenderer.invoke('journal:saveDate', date, content)
  },
  readAnnotations(date: string) {
    return ipcRenderer.invoke('journal:readAnnotations', date)
  },
  saveAnnotations(date: string, annotations: import('../src/domain/annotations/types').Annotation[]) {
    return ipcRenderer.invoke('journal:saveAnnotations', date, annotations)
  },
  refreshTodayWeather(location?: { latitude?: number; longitude?: number }) {
    return ipcRenderer.invoke('journal:refreshTodayWeather', location)
  },
  importImages(date: string) {
    return ipcRenderer.invoke('journal:importImages', date)
  },
})

contextBridge.exposeInMainWorld('sketchStore', {
  list() {
    return ipcRenderer.invoke('sketch:list')
  },
  create(payload?: { title?: string; canvasPreset?: import('../src/domain/sketch').SketchCanvasPreset }) {
    return ipcRenderer.invoke('sketch:create', payload)
  },
  load(id: string) {
    return ipcRenderer.invoke('sketch:load', id)
  },
  save(document: import('../src/domain/sketch').SketchDocument) {
    return ipcRenderer.invoke('sketch:save', document)
  },
  import() {
    return ipcRenderer.invoke('sketch:import')
  },
  delete(id: string) {
    return ipcRenderer.invoke('sketch:delete', id)
  },
})
