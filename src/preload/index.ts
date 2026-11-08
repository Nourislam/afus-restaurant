import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CHANNELS } from '@shared/channels'
import { BRIDGE_CHANNEL, type AppEvent, type IpcResult } from '@shared/ipc'

/**
 * The renderer never gets `ipcRenderer`. It gets two functions over a fixed
 * allowlist; anything else is rejected before it reaches the main process.
 */
const allowed = new Set<string>(CHANNELS)

const bridge = {
  invoke: async (channel: string, payload?: unknown): Promise<IpcResult> => {
    if (!allowed.has(channel)) return { ok: false, error: { code: 'CHANNEL_NOT_ALLOWED' } }
    try {
      return (await ipcRenderer.invoke(channel, payload)) as IpcResult
    } catch {
      return { ok: false, error: { code: 'INTERNAL' } }
    }
  },
  onEvent: (handler: (event: AppEvent) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: AppEvent) => handler(payload)
    ipcRenderer.on(BRIDGE_CHANNEL, listener)
    return () => {
      ipcRenderer.removeListener(BRIDGE_CHANNEL, listener)
    }
  }
}

contextBridge.exposeInMainWorld('afus', bridge)

export type AfusBridge = typeof bridge
