import type { UserSession } from '@shared/types'
import type { Permission } from '@shared/permissions'
import { dbGet, dbWrite } from '../db/client'
import { hashPassword, verifyPassword, PASSWORD_MIN_LENGTH } from '../security/password'
import { clearSession, getSession, requireSession, setSession } from '../security/session'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { writeAudit } from './audit'

interface UserAuthRow {
  id: number
  username: string
  fullName: string
  roleId: string
  passwordHash: string
  isActive: number
  labelAr: string
  labelFr: string
  permissions: string
}

function findUserByUsername(username: string): UserAuthRow | null {
  return dbGet<UserAuthRow>(
    `SELECT u.id, u.username, u.fullName, u.roleId, u.passwordHash, u.isActive,
            r.labelAr, r.labelFr, r.permissions
       FROM users u
       JOIN roles r ON r.id = u.roleId
      WHERE u.username = ? COLLATE NOCASE`,
    [username]
  )
}

function findUserById(id: number): UserAuthRow | null {
  return dbGet<UserAuthRow>(
    `SELECT u.id, u.username, u.fullName, u.roleId, u.passwordHash, u.isActive,
            r.labelAr, r.labelFr, r.permissions
       FROM users u
       JOIN roles r ON r.id = u.roleId
      WHERE u.id = ?`,
    [id]
  )
}

export function parsePermissions(raw: string | null | undefined): Permission[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed.filter((value) => typeof value === 'string') as Permission[]) : []
  } catch {
    return []
  }
}

export function permissionsForUser(userId: number): Permission[] {
  const row = findUserById(userId)
  if (!row || row.isActive !== 1) return []
  return parsePermissions(row.permissions)
}

export function toSession(row: UserAuthRow): UserSession {
  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    roleId: row.roleId,
    roleName: row.roleId,
    roleLabel: { ar: row.labelAr, fr: row.labelFr },
    permissions: parsePermissions(row.permissions)
  }
}

export function login(input: { username: string; password: string }): UserSession {
  const username = input.username.trim()
  const row = findUserByUsername(username)
  /* Same error for unknown user and wrong password: no account enumeration. */
  if (!row || !verifyPassword(input.password, row.passwordHash)) {
    throw new AppError('INVALID_CREDENTIALS')
  }
  if (row.isActive !== 1) throw new AppError('ACCOUNT_DISABLED')

  const stamp = nowStamp()
  dbWrite('UPDATE users SET lastLoginAt = ? WHERE id = ?', [stamp, row.id])
  setSession({ userId: row.id, username: row.username, issuedAt: Date.now() })
  writeAudit('auth.login', 'user', row.id)
  return toSession(row)
}

export function me(): UserSession | null {
  const session = getSession()
  if (!session) return null
  const row = findUserById(session.userId)
  if (!row || row.isActive !== 1) {
    clearSession()
    return null
  }
  return toSession(row)
}

export function logout(): { ok: true } {
  const session = getSession()
  if (session) writeAudit('auth.logout', 'user', session.userId)
  clearSession()
  return { ok: true }
}

export function changePassword(input: { currentPassword: string; newPassword: string }): { ok: true } {
  const session = requireSession()
  const row = findUserById(session.userId)
  if (!row) throw new AppError('UNAUTHENTICATED')
  if (!verifyPassword(input.currentPassword, row.passwordHash)) {
    throw new AppError('INVALID_CREDENTIALS')
  }
  if (input.newPassword.length < PASSWORD_MIN_LENGTH) throw new AppError('WEAK_PASSWORD')
  dbWrite('UPDATE users SET passwordHash = ? WHERE id = ?', [hashPassword(input.newPassword), row.id])
  writeAudit('auth.changePassword', 'user', row.id)
  return { ok: true }
}
