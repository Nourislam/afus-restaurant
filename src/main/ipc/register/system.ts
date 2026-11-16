import { z } from 'zod'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { autoBackup, createBackup, deleteBackup, listBackups, restoreBackup, revealBackup } from '../../services/backup'
import { dialog } from 'electron'
import { createToken, listTokens, removeToken, setTokenActive } from '../../services/apiTokens'
import { exportSite, getWebsiteState, setWebsiteConfig, startSite } from '../../services/website'
import { appPaths } from '../../paths'
import { nowStamp } from '../../utils/dates'
import { registerMany } from '../registry'

const name = z.string().min(1).max(80)

export const systemChannels = () =>
  registerMany([
    { channel: 'backup.list', definition: { permission: 'backup.manage', handler: () => listBackups() } },
    { channel: 'backup.create', definition: { permission: 'backup.manage', schema: z.object({ name }), handler: (input: { name: string }) => createBackup(input.name) } },
    { channel: 'backup.restore', definition: { permission: 'backup.manage', schema: z.object({ name }), handler: (input: { name: string }) => restoreBackup(input.name) } },
    { channel: 'backup.delete', definition: { permission: 'backup.manage', schema: z.object({ name }), handler: (input: { name: string }) => deleteBackup(input.name) } },
    { channel: 'backup.reveal', definition: { permission: 'backup.manage', schema: z.object({ path: z.string().max(1024) }), handler: (input: { path: string }) => revealBackup(input.path) } },

    /* ---------------- Keys for the open API ---------------- */
    { channel: 'api.tokens', definition: { permission: 'settings.manage', handler: () => listTokens() } },
    {
      channel: 'api.createToken',
      definition: {
        permission: 'settings.manage',
        schema: z.object({ name: z.string().min(1).max(80), scopes: z.array(z.enum(['read', 'write'])).min(1).max(2).optional() }),
        handler: (input: { name: string; scopes?: ('read' | 'write')[] }) => createToken(input)
      }
    },
    { channel: 'api.setTokenActive', definition: { permission: 'settings.manage', schema: z.object({ id: z.number().int().positive(), active: z.boolean() }), handler: (input: { id: number; active: boolean }) => setTokenActive(input.id, input.active) } },
    { channel: 'api.removeToken', definition: { permission: 'settings.manage', schema: z.object({ id: z.number().int().positive() }), handler: (input: { id: number }) => removeToken(input.id) } },

    {
      channel: 'backup.chooseFolder',
      definition: {
        permission: 'backup.manage',
        handler: async () => {
          /* Pointed at a synced folder, this is how the data leaves the shop. */
          const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
          return { directory: result.canceled ? null : (result.filePaths[0] ?? null) }
        }
      }
    },
    { channel: 'backup.runNow', definition: { permission: 'backup.manage', handler: () => autoBackup(true) } },

    /* Legacy aliases of the website service (kept so older renderer builds keep working). */
    {
      channel: 'web.export',
      definition: {
        permission: 'settings.manage',
        handler: () => {
          const result = exportSite()
          const file = join(result.dir, 'index.html')
          return { file, url: `file://${file}` }
        }
      }
    },
    {
      channel: 'web.server',
      definition: {
        permission: 'settings.manage',
        schema: z.object({ port: z.number().int().min(1024).max(65535).optional(), directory: z.string().optional() }).passthrough(),
        handler: async (input: { port?: number }) => {
          if (input.port) setWebsiteConfig({ port: input.port })
          const config = await startSite()
          const state = await getWebsiteState()
          return { running: config.running, url: state.url ?? '' }
        }
      }
    },
    {
      channel: 'web.status',
      definition: {
        permission: 'settings.manage',
        handler: async () => {
          const state = await getWebsiteState()
          const index = join(appPaths().webMenu, 'index.html')
          return { running: state.running, url: state.url, directory: appPaths().webMenu, lastExportedAt: existsSync(index) ? nowStamp(statSync(index).mtime) : null }
        }
      }
    }
  ])
