import { ipcMain } from 'electron'
import { CHANNELS } from '@shared/channels'
import { missingChannels, dispatch } from './registry'
import { coreChannels } from './register/core'
import { catalogChannels } from './register/catalog'

/** Registers handlers for every implemented channel (idempotent per process). */
export function registerIpcHandlers(): { implemented: number; pending: string[] } {
  coreChannels()
  catalogChannels()

  for (const channel of CHANNELS) {
    ipcMain.handle(channel, (_event, payload: unknown) => dispatch(channel, payload))
  }

  const pending = missingChannels()
  return { implemented: CHANNELS.length - pending.length, pending }
}
