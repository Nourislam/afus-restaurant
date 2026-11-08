import { BrowserWindow } from 'electron'
import { BRIDGE_CHANNEL, type AppEvent } from '@shared/ipc'

/** Broadcast a domain event to every open window. */
export function emitEvent(channel: string, data: unknown): void {
  const event: AppEvent = { channel, type: 'result', data }
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(BRIDGE_CHANNEL, event)
  }
}
