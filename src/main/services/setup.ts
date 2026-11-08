import type { SetupStatus, UserSession } from '@shared/types'
import { dbGet, dbWrite } from '../db/client'
import { hashPassword, PASSWORD_MIN_LENGTH } from '../security/password'
import { setSession } from '../security/session'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { seedStarterCatalog } from '../db/seed'
import { getSettings } from './settings'
import { toSession } from './auth'

export interface CompleteSetupInput {
  restaurantName: string
  phone?: string | null
  address?: string | null
  currency: string
  language: 'ar' | 'fr'
  taxEnabled: boolean
  taxRateBp: number
  ownerFullName: string
  ownerUsername: string
  ownerPassword: string
}

export function setupStatus(): SetupStatus {
  const count = dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM users')?.count ?? 0
  return { initialized: count > 0, restaurantName: getSettings().restaurantName }
}

export function completeSetup(input: CompleteSetupInput): UserSession {
  if (setupStatus().initialized) throw new AppError('ALREADY_INITIALIZED')

  const restaurantName = input.restaurantName.trim()
  const fullName = input.ownerFullName.trim()
  const username = input.ownerUsername.trim()
  if (!restaurantName) throw new AppError('VALIDATION', 'restaurantName is required')
  if (!fullName || !username) throw new AppError('VALIDATION', 'owner name and username are required')
  if (input.ownerPassword.length < PASSWORD_MIN_LENGTH) throw new AppError('WEAK_PASSWORD')
  if (input.taxRateBp < 0 || input.taxRateBp > 10000) throw new AppError('VALIDATION', 'Invalid tax rate')
  if (dbGet<{ id: number }>('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [username])) {
    throw new AppError('CONFLICT', 'Username already exists')
  }

  const stamp = nowStamp()
  const created = dbWrite(
    'INSERT INTO users (username, fullName, roleId, passwordHash, isActive, createdAt) VALUES (?, ?, ?, ?, 1, ?)',
    [username, fullName, 'owner', hashPassword(input.ownerPassword), stamp]
  )

  const settings: Record<string, unknown> = {
    restaurantName,
    restaurantNameFr: restaurantName,
    phone: input.phone ?? '',
    address: input.address ?? '',
    currency: input.currency,
    language: input.language,
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
    passwordHash: string
    isActive: number
    labelAr: string
    labelFr: string
    permissions: string
  }>(
    `SELECT u.id, u.username, u.fullName, u.roleId, u.passwordHash, u.isActive, r.labelAr, r.labelFr, r.permissions
       FROM users u JOIN roles r ON r.id = u.roleId WHERE u.id = ?`,
    [created.lastInsertRowid]
  )
  if (!row) throw new AppError('INTERNAL')
  return toSession(row)
}
