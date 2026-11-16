/**
 * The customer display: a second window, on the second screen, showing what the
 * cashier is ringing up. The customer watches their own order being built,
 * which is the cheapest way to stop a dispute at the till.
 *
 * It is a window of the same renderer on its own route, so it shares the
 * program's fonts, theme and language, and receives live updates over the same
 * event bridge the screens already use.
 */
import { app, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { BRIDGE_CHANNEL, type AppEvent } from '@shared/ipc'
import { AppError } from '../utils/errors'

const ROUTE = '/customer-display'
let display: BrowserWindow | null = null

export interface DisplayState {
  open: boolean
  screenCount: number
  /** Which screen it is on, as an index into the list the owner sees. */
  screenIndex: number | null
}

export interface ScreenInfo {
  index: number
  label: string
  width: number
  height: number
  primary: boolean
}

export function listScreens(): ScreenInfo[] {
  /* No window system (a headless run, or the app still starting): an empty
     list is the right answer, not an exception that takes a screen down. */
  if (!screen?.getAllDisplays) return []
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((entry, index) => ({
    index,
    label: entry.label || `${entry.size.width}×${entry.size.height}`,
    width: entry.size.width,
    height: entry.size.height,
    primary: entry.id === primaryId
  }))
}

export function displayState(): DisplayState {
  if (!screen?.getAllDisplays) return { open: false, screenCount: 0, screenIndex: null }
  const screens = screen.getAllDisplays()
  let screenIndex: number | null = null
  if (display && !display.isDestroyed()) {
    const bounds = display.getBounds()
    const on = screen.getDisplayMatching(bounds)
    screenIndex = screens.findIndex((entry) => entry.id === on.id)
    if (screenIndex < 0) screenIndex = null
  }
  return { open: Boolean(display && !display.isDestroyed()), screenCount: screens.length, screenIndex }
}

/** Open it, or move it to another screen if it is already open. */
export function openDisplay(screenIndex?: number | null): DisplayState {
  if (!screen?.getAllDisplays) throw new AppError('INTERNAL', 'No screen available')
  const screens = screen.getAllDisplays()
  /* Default to the screen that is not the till's: a one-screen machine still
     works, the window simply sits on top of the same one. */
  const primaryId = screen.getPrimaryDisplay().id
  const fallback = screens.findIndex((entry) => entry.id !== primaryId)
  const index = screenIndex ?? (fallback >= 0 ? fallback : 0)
  const target = screens[Math.max(0, Math.min(index, screens.length - 1))] ?? screen.getPrimaryDisplay()

  if (display && !display.isDestroyed()) {
    display.setBounds(target.bounds)
    display.show()
    return displayState()
  }

  display = new BrowserWindow({
    ...target.bounds,
    frame: false,
    fullscreen: screens.length > 1,
    backgroundColor: '#0b0b0d',
    /* Nothing on this window is for the customer to click. */
    focusable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  display.on('closed', () => {
    display = null
  })
  display.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && rendererUrl) {
    void display.loadURL(`${rendererUrl}#${ROUTE}`)
  } else {
    void display.loadFile(join(__dirname, '../../dist/renderer/index.html'), { hash: ROUTE })
  }
  return displayState()
}

export function closeDisplay(): DisplayState {
  if (display && !display.isDestroyed()) display.close()
  display = null
  return displayState()
}

/** Push what the till is showing right now. Silently does nothing when closed. */
export function pushToDisplay(data: unknown): void {
  if (!display || display.isDestroyed()) return
  const event: AppEvent = { channel: 'display.order', type: 'result', data }
  display.webContents.send(BRIDGE_CHANNEL, event)
}

export function closeDisplayOnQuit(): void {
  closeDisplay()
}
