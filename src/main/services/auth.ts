import type { LoginProfile, UserSession } from '@shared/types'
import type { Permission } from '@shared/permissions'
import { dbAll, dbGet, dbWrite } from '../db/client'
import { hashPin, verifyPin, isValidPin, PIN_LENGTH } from '../security/password'
import { clearSession, getSession, requireSession, setSession } from '../security/session'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { writeAudit } from './audit'

interface UserAuthRow {
  id: number
  username: string
  fullName: string
  roleId: string
  pinHash: string | null
  isActive: number
  labelAr: string
  labelFr: string
  permissions: string
}

function findUserById(id: number): UserAuthRow | null {
  return dbGet<UserAuthRow>(
    `SELECT u.id, u.username, u.fullName, u.roleId, u.pinHash, u.isActive,
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

/** Pre-auth: the active profiles shown on the login screen (Afus-style). No secrets. */
export function listForLogin(): LoginProfile[] {
  const rows = dbAll<{ id: number; fullName: string; roleId: string; labelAr: string; labelFr: string }>(
    `SELECT u.id, u.fullName, u.roleId, r.labelAr, r.labelFr
       FROM users u JOIN roles r ON r.id = u.roleId
      WHERE u.isActive = 1
      ORDER BY u.roleId = 'owner' DESC, u.fullName COLLATE NOCASE`
  )
  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    roleId: row.roleId,
    roleLabel: { ar: row.labelAr, fr: row.labelFr }
  }))
}

/** Sign in by picking a profile and entering its 4-digit PIN. */
export function loginWithPin(input: { id: number; pin: string }): UserSession {
  const row = findUserById(input.id)
  /* Same error for unknown/disabled/wrong-PIN: no account enumeration. */
  if (!row || row.isActive !== 1 || !verifyPin(input.pin, row.pinHash)) {
    throw new AppError('INVALID_CREDENTIALS')
  }
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

export function changePin(input: { currentPin: string; newPin: string }): { ok: true } {
  const session = requireSession()
  const row = findUserById(session.userId)
  if (!row) throw new AppError('UNAUTHENTICATED')
  if (!verifyPin(input.currentPin, row.pinHash)) {
    throw new AppError('INVALID_CREDENTIALS')
  }
  if (!isValidPin(input.newPin)) throw new AppError('VALIDATION', `PIN must be ${PIN_LENGTH} digits`)
  dbWrite('UPDATE users SET pinHash = ? WHERE id = ?', [hashPin(input.newPin), row.id])
  writeAudit('auth.changePin', 'user', row.id)
  return { ok: true }
}
