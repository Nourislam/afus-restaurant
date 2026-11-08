import type { RoleRow, UserRow } from '@shared/types'
import type { Permission } from '@shared/permissions'
import { ROLE_DEFINITIONS } from '@shared/permissions'
import { dbAll, dbGet, dbWrite } from '../db/client'
import { hashPassword, PASSWORD_MIN_LENGTH } from '../security/password'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { writeAudit } from './audit'
import { parsePermissions } from './auth'

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
  username: string
  fullName: string
  roleId: string
  phone?: string | null
  password?: string
}

export function saveUser(input: SaveUserInput): UserRow {
  if (!ROLE_DEFINITIONS.some((role) => role.id === input.roleId)) throw new AppError('VALIDATION', 'Unknown role')
  const username = input.username.trim()
  const fullName = input.fullName.trim()
  if (!username || !fullName) throw new AppError('VALIDATION', 'username and fullName are required')

  const clash = dbGet<{ id: number }>('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [username])
  if (clash && clash.id !== input.id) throw new AppError('CONFLICT', 'Username already exists')

  if (input.id) {
    const existing = dbGet<{ id: number }>('SELECT id FROM users WHERE id = ?', [input.id])
    if (!existing) throw new AppError('NOT_FOUND')
    dbWrite('UPDATE users SET username = ?, fullName = ?, roleId = ?, phone = ? WHERE id = ?', [
      username,
      fullName,
      input.roleId,
      input.phone ?? null,
      input.id
    ])
    if (input.password) setPassword(input.id, input.password)
    writeAudit('users.update', 'user', input.id, { roleId: input.roleId })
    return dbGet<UserRow>(
      'SELECT id, username, fullName, roleId, phone, isActive, lastLoginAt, createdAt FROM users WHERE id = ?',
      [input.id]
    ) as UserRow
  }

  if (!input.password || input.password.length < PASSWORD_MIN_LENGTH) throw new AppError('WEAK_PASSWORD')
  const result = dbWrite(
    'INSERT INTO users (username, fullName, roleId, phone, passwordHash, isActive, createdAt) VALUES (?, ?, ?, ?, ?, 1, ?)',
    [username, fullName, input.roleId, input.phone ?? null, hashPassword(input.password), nowStamp()]
  )
  writeAudit('users.create', 'user', result.lastInsertRowid, { roleId: input.roleId })
  return dbGet<UserRow>(
    'SELECT id, username, fullName, roleId, phone, isActive, lastLoginAt, createdAt FROM users WHERE id = ?',
    [result.lastInsertRowid]
  ) as UserRow
}

export function setPassword(userId: number, password: string): { ok: true } {
  if (password.length < PASSWORD_MIN_LENGTH) throw new AppError('WEAK_PASSWORD')
  const user = dbGet<{ id: number }>('SELECT id FROM users WHERE id = ?', [userId])
  if (!user) throw new AppError('NOT_FOUND')
  dbWrite('UPDATE users SET passwordHash = ? WHERE id = ?', [hashPassword(password), userId])
  writeAudit('users.resetPassword', 'user', userId)
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
