import type { RoleRow, UserRow } from '@shared/types'
import type { Permission } from '@shared/permissions'
import { ROLE_DEFINITIONS } from '@shared/permissions'
import { dbAll, dbGet, dbWrite } from '../db/client'
import { hashPin, isValidPin, PIN_LENGTH } from '../security/password'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { writeAudit } from './audit'
import { parsePermissions } from './auth'

/** Usernames are internal-only now (staff sign in by profile + PIN). Derive a
    stable, unique slug from the name, falling back to `user` for non-Latin names. */
export function uniqueUsername(fullName: string): string {
  const base =
    fullName
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 24) || 'user'
  let candidate = base
  let n = 1
  while (dbGet<{ id: number }>('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [candidate])) {
    candidate = `${base}-${n++}`
  }
  return candidate
}

export interface Page<T> {
  items: T[]
  total: number
}

export function listUsers(): UserRow[] {
  return dbAll<UserRow>(
    `SELECT u.id, u.username, u.fullName, u.roleId, u.phone, u.isActive, u.lastLoginAt, u.createdAt
       FROM users u ORDER BY u.isActive DESC, u.fullName COLLATE NOCASE`
  )
}

export function listRoles(): RoleRow[] {
  const rows = dbAll<{ id: string; labelAr: string; labelFr: string; permissions: string }>(
    'SELECT id, labelAr, labelFr, permissions FROM roles ORDER BY id'
  )
  return rows.map((row) => ({
    id: row.id,
    labelAr: row.labelAr,
    labelFr: row.labelFr,
    permissions: parsePermissions(row.permissions) as Permission[]
  }))
}

export interface SaveUserInput {
  id?: number
  fullName: string
  roleId: string
  phone?: string | null
  /** 4-digit PIN. Required when creating; optional when editing (to change it). */
  pin?: string
}

export function saveUser(input: SaveUserInput): UserRow {
  if (!ROLE_DEFINITIONS.some((role) => role.id === input.roleId)) throw new AppError('VALIDATION', 'Unknown role')
  const fullName = input.fullName.trim()
  if (!fullName) throw new AppError('VALIDATION', 'fullName is required')

  if (input.id) {
    const existing = dbGet<{ id: number }>('SELECT id FROM users WHERE id = ?', [input.id])
    if (!existing) throw new AppError('NOT_FOUND')
    dbWrite('UPDATE users SET fullName = ?, roleId = ?, phone = ? WHERE id = ?', [
      fullName,
      input.roleId,
      input.phone ?? null,
      input.id
    ])
    if (input.pin) setPin(input.id, input.pin)
    writeAudit('users.update', 'user', input.id, { roleId: input.roleId })
    return dbGet<UserRow>(
      'SELECT id, username, fullName, roleId, phone, isActive, lastLoginAt, createdAt FROM users WHERE id = ?',
      [input.id]
    ) as UserRow
  }

  if (!isValidPin(input.pin)) throw new AppError('VALIDATION', `PIN must be ${PIN_LENGTH} digits`)
  const result = dbWrite(
    /* passwordHash is the legacy NOT NULL column; kept empty (PIN sign-in only). */
    'INSERT INTO users (username, fullName, roleId, phone, passwordHash, pinHash, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
    [uniqueUsername(fullName), fullName, input.roleId, input.phone ?? null, '', hashPin(input.pin), nowStamp()]
  )
  writeAudit('users.create', 'user', result.lastInsertRowid, { roleId: input.roleId })
  return dbGet<UserRow>(
    'SELECT id, username, fullName, roleId, phone, isActive, lastLoginAt, createdAt FROM users WHERE id = ?',
    [result.lastInsertRowid]
  ) as UserRow
}

export function setPin(userId: number, pin: string): { ok: true } {
  if (!isValidPin(pin)) throw new AppError('VALIDATION', `PIN must be ${PIN_LENGTH} digits`)
  const user = dbGet<{ id: number }>('SELECT id FROM users WHERE id = ?', [userId])
  if (!user) throw new AppError('NOT_FOUND')
  dbWrite('UPDATE users SET pinHash = ? WHERE id = ?', [hashPin(pin), userId])
  writeAudit('users.resetPin', 'user', userId)
  return { ok: true }
}

export function setUserActive(userId: number, active: boolean): { id: number; isActive: boolean } {
  const user = dbGet<{ id: number; username: string }>('SELECT id, username FROM users WHERE id = ?', [userId])
  if (!user) throw new AppError('NOT_FOUND')
  /* Never allow the last active owner/administrator to be disabled. */
  if (!active) {
    const admins = dbGet<{ count: number }>(
      `SELECT COUNT(*) AS count FROM users WHERE isActive = 1 AND roleId IN ('owner', 'admin')`
    )
    const target = dbGet<{ roleId: string }>('SELECT roleId FROM users WHERE id = ?', [userId])
    if (admins && admins.count <= 1 && target && (target.roleId === 'owner' || target.roleId === 'admin')) {
      throw new AppError('CONFLICT', 'Cannot disable the last administrator')
    }
  }
  dbWrite('UPDATE users SET isActive = ? WHERE id = ?', [active ? 1 : 0, userId])
  writeAudit(active ? 'users.activate' : 'users.deactivate', 'user', userId)
  return { id: userId, isActive: active }
}
