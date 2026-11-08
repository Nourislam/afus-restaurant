import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { closeDatabase, openDatabase } from './db/client'
import { seedCoreData } from './db/seed'
import { appPaths, ensureDirectories } from './paths'
import { registerIpcHandlers } from './ipc'
import { writeAudit } from './services/audit'

/* Restaurant and office machines vary a lot, and some GPU drivers flood the
   console with harmless "EGL ... Bad attribute" errors. Software rendering is
   smooth enough for this UI and far more consistent across machines, so we turn
   hardware acceleration off. Must run before the app is ready. */
app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b0b0d',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  /* Never let the app navigate away from its own renderer; open links outside. */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    if (rendererUrl && url.startsWith(rendererUrl)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
    void shell.openExternal(url)
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../../dist/renderer/index.html'))
  }
}

async function bootstrap(): Promise<void> {
  const paths = appPaths()
  ensureDirectories(paths)
  await openDatabase(paths.database)
  seedCoreData()
  const { implemented, pending } = registerIpcHandlers()
  console.info(`[afus] ${implemented} channels ready, ${pending.length} pending: ${pending.slice(0, 6).join(', ')}…`)
  writeAudit('app.start', 'app', null, { version: app.getVersion() })
  createWindow()
}

app.whenReady().then(bootstrap).catch((error: unknown) => {
  console.error('[afus] failed to start', error)
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeDatabase()
})
