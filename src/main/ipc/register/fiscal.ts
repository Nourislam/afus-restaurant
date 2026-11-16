import { z } from 'zod'
import { app } from 'electron'
import { attestationHtml, closePeriod, computeStamp, fiscalExport, listClosures, verifyIntegrity } from '../../services/fiscal'
import { archiveYear, deleteArchive, listArchives, verifyArchive } from '../../services/archive'
import { registerMany } from '../registry'

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const fiscalChannels = () =>
  registerMany([
    { channel: 'fiscal.verify', definition: { permission: 'settings.manage', handler: () => verifyIntegrity() } },
    {
      channel: 'fiscal.closePeriod',
      definition: {
        permission: 'settings.manage',
        schema: z.object({ kind: z.enum(['day', 'year']), key: z.string().min(4).max(10) }),
        handler: (input: { kind: 'day' | 'year'; key: string }) => closePeriod(input.kind, input.key)
      }
    },
    { channel: 'fiscal.closures', definition: { permission: 'settings.manage', handler: () => listClosures() } },
    {
      channel: 'fiscal.export',
      definition: {
        permission: 'settings.manage',
        schema: z.object({ from: dateKey, to: dateKey }),
        handler: (input: { from: string; to: string }) => fiscalExport(input.from, input.to)
      }
    },
    {
      channel: 'fiscal.attestation',
      definition: {
        permission: 'settings.manage',
        schema: z.object({ language: z.enum(['ar', 'fr']) }),
        handler: (input: { language: 'ar' | 'fr' }) => ({ html: attestationHtml(input.language, app.getVersion()) })
      }
    },
    {
      channel: 'fiscal.archive',
      definition: {
        permission: 'settings.manage',
        schema: z.object({ year: z.number().int().min(2000).max(2200), passphrase: z.string().min(8).max(200) }),
        handler: (input: { year: number; passphrase: string }) => archiveYear(input.year, input.passphrase)
      }
    },
    { channel: 'fiscal.archives', definition: { permission: 'settings.manage', handler: () => listArchives() } },
    {
      channel: 'fiscal.verifyArchive',
      definition: {
        permission: 'settings.manage',
        schema: z.object({ name: z.string().min(1).max(120), passphrase: z.string().min(1).max(200) }),
        handler: (input: { name: string; passphrase: string }) => verifyArchive(input.name, input.passphrase)
      }
    },
    {
      channel: 'fiscal.deleteArchive',
      definition: {
        permission: 'settings.manage',
        schema: z.object({ name: z.string().min(1).max(120) }),
        handler: (input: { name: string }) => deleteArchive(input.name)
      }
    },
    {
      channel: 'fiscal.previewStamp',
      definition: {
        permission: 'pos.use',
        schema: z.object({ cashCents: z.number().int().min(0) }),
        handler: (input: { cashCents: number }) => ({ stampCents: computeStamp(input.cashCents) })
      }
    }
  ])
