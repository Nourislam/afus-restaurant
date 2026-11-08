import type { SetupStatus, UserSession } from '@shared/types'
import { dbGet, dbWrite } from '../db/client'
import { hashPin, isValidPin, PIN_LENGTH } from '../security/password'
import { setSession } from '../security/session'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { seedStarterCatalog } from '../db/seed'
import { getSettings } from './settings'
import { toSession } from './auth'
import { uniqueUsername } from './users'

export interface CompleteSetupInput {
  restaurantName: string
  phone?: string | null
  address?: string | null
  currency: string
  language: 'ar' | 'fr'
  taxEnabled: boolean
  taxRateBp: number
  /** The owner account: name + a 4-digit PIN (Afus profile + PIN sign-in). */
  ownerFullName: string
  ownerPin: string
}

export function setupStatus(): SetupStatus {
  const count = dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM users')?.count ?? 0
  return { initialized: count > 0, restaurantName: getSettings().restaurantName }
}

export function completeSetup(input: CompleteSetupInput): UserSession {
  if (setupStatus().initialized) throw new AppError('ALREADY_INITIALIZED')

  const restaurantName = input.restaurantName.trim()
  const fullName = input.ownerFullName.trim()
  if (!restaurantName) throw new AppError('VALIDATION', 'restaurantName is required')
  if (!fullName) throw new AppError('VALIDATION', 'owner name is required')
  if (!isValidPin(input.ownerPin)) throw new AppError('VALIDATION', `PIN must be ${PIN_LENGTH} digits`)
  if (input.taxRateBp < 0 || input.taxRateBp > 10000) throw new AppError('VALIDATION', 'Invalid tax rate')

  const stamp = nowStamp()
  const username = uniqueUsername(fullName)
  const created = dbWrite(
    /* passwordHash is the legacy NOT NULL column; staff sign in by PIN now, so it
       stays empty and is never used. */
    'INSERT INTO users (username, fullName, roleId, passwordHash, pinHash, isActive, createdAt) VALUES (?, ?, ?, ?, ?, 1, ?)',
    [username, fullName, 'owner', '', hashPin(input.ownerPin), stamp]
  )

  const settings: Record<string, unknown> = {
    restaurantName,
    restaurantNameFr: restaurantName,
    phone: input.phone ?? '',
    address: input.address ?? '',
    currency: input.currency,
    language: input.language,
    /* New restaurants start in the simple view for floor staff (Afus parity). */
    uiMode: 'simple',
    taxEnabled: input.taxEnabled,
    taxRateBp: input.taxEnabled ? input.taxRateBp : 0
  }
  for (const [key, value] of Object.entries(settings)) {
    dbWrite('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)])
  }

  seedStarterCatalog()
  dbWrite('INSERT INTO audit_log (userId, action, entity, entityId, details, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
    created.lastInsertRowid,
    'setup.complete',
    'app',
    '1',
    JSON.stringify({ restaurantName }),
    stamp
  ])

  setSession({ userId: created.lastInsertRowid, username, issuedAt: Date.now() })
  const row = dbGet<{
    id: number
    username: string
    fullName: string
    roleId: string
    pinHash: string | null
    isActive: number
    labelAr: string
    labelFr: string
    permissions: string
  }>(
    `SELECT u.id, u.username, u.fullName, u.roleId, u.pinHash, u.isActive, r.labelAr, r.labelFr, r.permissions
       FROM users u JOIN roles r ON r.id = u.roleId WHERE u.id = ?`,
    [created.lastInsertRowid]
  )
  if (!row) throw new AppError('INTERNAL')
  return toSession(row)
}
