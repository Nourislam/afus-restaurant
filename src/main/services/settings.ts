import { z } from 'zod'
import type { AppSettings } from '@shared/types'
import { dbAll, dbWrite, transaction } from '../db/client'
import { AppError } from '../utils/errors'

export const DEFAULT_SETTINGS: AppSettings = {
  restaurantName: 'AFUS Restaurant',
  restaurantNameFr: 'AFUS Restaurant',
  phone: '',
  address: '',
  logo: '',
  currency: 'DZD',
  language: 'ar',
  theme: 'dark',
  uiMode: 'simple',
  restaurantSlug: 'restaurant',
  /* Fiscal identity (Algeria) — printed on every ticket once filled in. */
  legalName: '',
  nif: '',
  nis: '',
  rc: '',
  ai: '',
  fiscalAddress: '',
  touristClassified: false,
  /* Stamp duty on cash receipts. Off by default; brackets are editable —
     the owner must confirm the current rates with their accountant. */
  stampEnabled: false,
  stampBrackets: [
    { uptoCents: 3_000_000, ratePerHundred: 1 },
    { uptoCents: 10_000_000, ratePerHundred: 1.5 },
    { uptoCents: null, ratePerHundred: 2 }
  ],
  stampMinCents: 500,
  stampMaxCents: 0,
  loyaltyEnabled: false,
  loyaltyEarnPer100: 1,
  loyaltyPointValueCents: 100,
  loyaltyMinRedeem: 50,
  taxEnabled: false,
  taxRateBp: 0,
  taxInclusive: false,
  receiptFooter: '',
  printerName: '',
  paperWidth: '80',
  autoBackupEnabled: true,
  backupIntervalHours: 24,
  backupDir: '',
  backupKeep: 30,
  paymentMethods: ['cash', 'card'],
  kitchenAlertMinutes: 12,
  preorderLeadMinutes: 30
}

const settingsPatchSchema = z
  .object({
    restaurantName: z.string().min(1).max(120),
    restaurantNameFr: z.string().max(120),
    phone: z.string().max(40),
    address: z.string().max(240),
    logo: z.string().max(400000),
    currency: z.string().length(3),
    language: z.enum(['ar', 'fr']),
    theme: z.enum(['light', 'dark']),
    uiMode: z.enum(['simple', 'full']),
    restaurantSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/),
    legalName: z.string().max(160),
    nif: z.string().max(32),
    nis: z.string().max(32),
    rc: z.string().max(40),
    ai: z.string().max(32),
    fiscalAddress: z.string().max(240),
    touristClassified: z.boolean(),
    stampEnabled: z.boolean(),
    stampBrackets: z
      .array(z.object({ uptoCents: z.number().int().positive().nullable(), ratePerHundred: z.number().min(0).max(100) }))
      .min(1)
      .max(8),
    stampMinCents: z.number().int().min(0).max(1_000_000),
    stampMaxCents: z.number().int().min(0).max(100_000_000),

    loyaltyEarnPer100: z.number().min(0).max(1000),
    loyaltyPointValueCents: z.number().int().min(0).max(100_000),
    loyaltyMinRedeem: z.number().int().min(0).max(1_000_000),
    taxEnabled: z.boolean(),
    taxRateBp: z.number().int().min(0).max(10000),
    taxInclusive: z.boolean(),
    receiptFooter: z.string().max(240),
    printerName: z.string().max(120),
    paperWidth: z.enum(['80', '58', 'a4']),
    autoBackupEnabled: z.boolean(),
    backupIntervalHours: z.number().int().min(1).max(168),
    backupDir: z.string().max(400),
    backupKeep: z.number().int().min(1).max(365),
    loyaltyEnabled: z.boolean(),
    paymentMethods: z.array(z.string().min(1).max(24)).min(1),
    kitchenAlertMinutes: z.number().int().min(1).max(240),
    preorderLeadMinutes: z.number().int().min(0).max(10080)
  })
  .partial()

export const settingsPatch = settingsPatchSchema

export function getSettings(): AppSettings {
  const rows = dbAll<{ key: string; value: string }>('SELECT key, value FROM settings')
  const merged: AppSettings = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    if (!(row.key in DEFAULT_SETTINGS)) continue
    try {
      ;(merged as unknown as Record<string, unknown>)[row.key] = JSON.parse(row.value)
    } catch {
      /* keep the default when a stored value is corrupt */
    }
  }
  return merged
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const parsed = settingsPatchSchema.parse(patch)
  const entries = Object.entries(parsed).filter(([, value]) => value !== undefined)
  if (entries.length === 0) throw new AppError('VALIDATION', 'No settings supplied')
  transaction(() => {
    for (const [key, value] of entries) {
      dbWrite('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)])
    }
  })
  return getSettings()
}
