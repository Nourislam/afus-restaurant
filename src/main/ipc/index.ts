import { ipcMain } from 'electron'
import { CHANNELS } from '@shared/channels'
import { missingChannels, dispatch } from './registry'
import { coreChannels } from './register/core'
import { catalogChannels } from './register/catalog'
import { ordersChannels } from './register/orders'
import { fiscalChannels } from './register/fiscal'
import { backofficeChannels } from './register/backoffice'
import { financeChannels } from './register/finance'
import { systemChannels } from './register/system'

/** Registers handlers for every implemented channel (idempotent per process). */
export function registerIpcHandlers(): { implemented: number; pending: string[] } {
  coreChannels()
  catalogChannels()
  ordersChannels()
  fiscalChannels()
  backofficeChannels()
  financeChannels()
  systemChannels()

  for (const channel of CHANNELS) {
    ipcMain.handle(channel, (_event, payload: unknown) => dispatch(channel, payload))
  }

  const pending = missingChannels()
  return { implemented: CHANNELS.length - pending.length, pending }
}
