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
})

contextBridge.exposeInMainWorld('journalStore', {
  loadToday() {
    return ipcRenderer.invoke('journal:loadToday')
  },
  saveToday(content: string) {
    return ipcRenderer.invoke('journal:saveToday', content)
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
  refreshTodayWeather(location?: { latitude?: number; longitude?: number }) {
    return ipcRenderer.invoke('journal:refreshTodayWeather', location)
  },
})
