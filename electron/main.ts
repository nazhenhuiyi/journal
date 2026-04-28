import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { askCodex } from './codex'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_MIN_WIDTH = 1180
const JOURNAL_DIR_NAME = '.journal'

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

ipcMain.handle('codex:ask', (_event, prompt: unknown) => askCodex(prompt, process.env.APP_ROOT))
ipcMain.handle('journal:loadToday', () => loadTodayJournal())
ipcMain.handle('journal:saveToday', (_event, content: unknown) => saveTodayJournal(content))

type JournalFile = {
  content: string
  date: string
  fileName: string
  filePath: string
  updatedAt: string | null
}

function getTodayDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function createDefaultJournalMarkdown(dateKey: string) {
  return `---\ndate: ${dateKey}\n---\n\n`
}

function getTodayJournalPath() {
  const date = getTodayDateKey()
  const fileName = `${date}.md`
  const directory = path.join(app.getPath('home'), JOURNAL_DIR_NAME)

  return {
    date,
    directory,
    fileName,
    filePath: path.join(directory, fileName),
  }
}

async function journalFilePayload(content: string): Promise<JournalFile> {
  const { date, fileName, filePath } = getTodayJournalPath()
  const fileStat = await stat(filePath).catch(() => null)

  return {
    content,
    date,
    fileName,
    filePath,
    updatedAt: fileStat?.mtime.toISOString() ?? null,
  }
}

async function loadTodayJournal() {
  const { date, directory, filePath } = getTodayJournalPath()

  await mkdir(directory, { recursive: true })

  const existingContent = await readFile(filePath, 'utf8').catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }

    throw error
  })

  if (existingContent !== null) {
    return journalFilePayload(existingContent)
  }

  const content = createDefaultJournalMarkdown(date)

  await writeFile(filePath, content, 'utf8')

  return journalFilePayload(content)
}

async function saveTodayJournal(content: unknown) {
  if (typeof content !== 'string') {
    throw new TypeError('Journal content must be a string.')
  }

  const { directory, filePath } = getTodayJournalPath()
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`

  await mkdir(directory, { recursive: true })
  await writeFile(temporaryPath, content, 'utf8')
  await rename(temporaryPath, filePath)

  return journalFilePayload(content)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: APP_MIN_WIDTH,
    minHeight: 720,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
