import { z } from 'zod'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createBackup, deleteBackup, listBackups, restoreBackup, revealBackup } from '../../services/backup'
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
