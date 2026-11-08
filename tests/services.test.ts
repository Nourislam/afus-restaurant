import { beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, dbAll, dbGet, dbWrite, openDatabase } from '../src/main/db/client'
import { nowStamp } from '../src/main/utils/dates'
import { dashboardSummary } from '../src/main/services/dashboard'
import { seedCoreData } from '../src/main/db/seed'
import { changePassword, login, logout, me, permissionsForUser } from '../src/main/services/auth'
import { listRoles, listUsers, saveUser, setPassword, setUserActive } from '../src/main/services/users'
import { completeSetup, setupStatus } from '../src/main/services/setup'
import { getSettings, updateSettings } from '../src/main/services/settings'
import { listAudit } from '../src/main/services/audit'
import { clearSession } from '../src/main/security/session'

const OWNER = { ownerFullName: 'مالك المطعم', ownerUsername: 'owner', ownerPassword: 'Owner-2026' }

function seedOwner() {
  return completeSetup({
    restaurantName: 'AFUS Restaurant',
    currency: 'DZD',
    language: 'ar',
    taxEnabled: true,
    taxRateBp: 1900,
    ...OWNER
  })
}

beforeEach(async () => {
  closeDatabase()
  clearSession()
  await openDatabase(null)
  seedCoreData()
})

describe('first-run setup', () => {
  it('reports an uninitialised database before setup', () => {
    expect(setupStatus().initialized).toBe(false)
  })

  it('creates the owner, applies settings and seeds the catalogue', () => {
    const session = seedOwner()
    expect(session.roleId).toBe('owner')
    expect(session.permissions.length).toBeGreaterThan(0)
    expect(setupStatus().initialized).toBe(true)
    expect(getSettings()).toMatchObject({ restaurantName: 'AFUS Restaurant', currency: 'DZD', taxRateBp: 1900 })
    expect(dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM products')?.count).toBe(6)
    expect(me()?.username).toBe('owner')
  })

  it('refuses a second setup run', () => {
    seedOwner()
    expect(() => seedOwner()).toThrowError(expect.objectContaining({ code: 'ALREADY_INITIALIZED' }))
  })

  it('rejects a weak owner password', () => {
    expect(() =>
      completeSetup({
        restaurantName: 'X',
        currency: 'DZD',
        language: 'fr',
        taxEnabled: false,
        taxRateBp: 0,
        ownerFullName: 'A',
        ownerUsername: 'short',
        ownerPassword: '123'
      })
    ).toThrowError(expect.objectContaining({ code: 'WEAK_PASSWORD' }))
  })
})

describe('authentication', () => {
  it('logs in with valid credentials and audits the attempt', () => {
    seedOwner()
    logout()
    const session = login({ username: 'owner', password: OWNER.ownerPassword })
    expect(session.fullName).toBe(OWNER.ownerFullName)
    expect(listAudit().some((entry) => entry.action === 'auth.login')).toBe(true)
  })

  it('accepts a username typed in another letter case', () => {
    seedOwner()
    logout()
    expect(login({ username: 'OWNER', password: OWNER.ownerPassword }).username).toBe('owner')
    expect(dbAll<{ count: number }>('SELECT COUNT(*) AS count FROM users WHERE username = ? COLLATE NOCASE', ['OwNeR'])[0]?.count).toBe(1)
  })

  it('does not reveal whether an unknown account exists', () => {
    seedOwner()
    expect(() => login({ username: 'owner', password: 'wrong-password' })).toThrowError(expect.objectContaining({ code: 'INVALID_CREDENTIALS' }))
    expect(() => login({ username: 'nobody', password: 'wrong-password' })).toThrowError(expect.objectContaining({ code: 'INVALID_CREDENTIALS' }))
  })

  it('refuses a disabled account', () => {
    const owner = seedOwner()
    const staffRole = listRoles().find((role) => role.id !== 'owner')
    if (!staffRole) throw new Error('expected a non-owner role')
    const staff = saveUser({
      username: 'staff',
      fullName: 'Staff',
      roleId: staffRole.id,
      password: 'Staff-2026'
    })
    logout()
    login({ username: 'staff', password: 'Staff-2026' })
    setUserActive(staff.id, false)
    expect(me()).toBeNull()
    expect(() => login({ username: 'staff', password: 'Staff-2026' })).toThrowError(expect.objectContaining({ code: 'ACCOUNT_DISABLED' }))
    expect(owner.id).toBeGreaterThan(0)
  })

  it('drops the session and the permissions when the account is disabled mid-session', () => {
    seedOwner()
    const staffRole = listRoles().find((role) => role.id !== 'owner')
    if (!staffRole) throw new Error('expected a non-owner role')
    const staff = saveUser({ username: 'session-staff', fullName: 'Staff', roleId: staffRole.id, password: 'Staff-2026' })
    logout()
    login({ username: 'session-staff', password: 'Staff-2026' })
    expect(permissionsForUser(staff.id).length).toBeGreaterThan(0)
    setUserActive(staff.id, false)
    expect(permissionsForUser(staff.id)).toEqual([])
    expect(me()).toBeNull()
  })
})

describe('password change', () => {
  it('requires the current password', () => {
    seedOwner()
    expect(() => changePassword({ currentPassword: 'nope', newPassword: 'New-2026' })).toThrowError(
      /INVALID_CREDENTIALS/
    )
  })

  it('rejects a short new password', () => {
    seedOwner()
    expect(() => changePassword({ currentPassword: OWNER.ownerPassword, newPassword: '1' })).toThrowError(
      /WEAK_PASSWORD/
    )
  })

  it('replaces the stored hash', () => {
    seedOwner()
    changePassword({ currentPassword: OWNER.ownerPassword, newPassword: 'New-2026-pass' })
    logout()
    expect(() => login({ username: 'owner', password: OWNER.ownerPassword })).toThrowError(expect.objectContaining({ code: 'INVALID_CREDENTIALS' }))
    expect(login({ username: 'owner', password: 'New-2026-pass' }).username).toBe('owner')
  })
})

describe('user administration', () => {
  it('lists users and roles', () => {
    seedOwner()
    expect(listUsers()).toHaveLength(1)
    expect(listRoles().map((role) => role.id)).toEqual(expect.arrayContaining(['owner']))
  })

  it('rejects a duplicate username case-insensitively', () => {
    seedOwner()
    const role = listRoles().find((entry) => entry.id !== 'owner')
    expect(() =>
      saveUser({ username: 'OWNER', fullName: 'Clone', roleId: role?.id ?? 'owner', password: 'Clone-2026' })
    ).toThrowError(expect.objectContaining({ code: 'CONFLICT' }))
  })

  it('rejects an unknown role and a weak password', () => {
    seedOwner()
    expect(() => saveUser({ username: 'x', fullName: 'X', roleId: 'nope', password: 'Strong-1' })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' })
    )
    expect(() => saveUser({ username: 'y', fullName: 'Y', roleId: 'owner', password: '1' })).toThrowError(expect.objectContaining({ code: 'WEAK_PASSWORD' }))
  })

  it('never disables the last administrator', () => {
    const owner = seedOwner()
    expect(() => setUserActive(owner.id, false)).toThrowError(expect.objectContaining({ code: 'CONFLICT' }))
    expect(dbGet<{ isActive: number }>('SELECT isActive FROM users WHERE id = ?', [owner.id])?.isActive).toBe(1)
  })

  it('allows disabling an administrator once another one exists', () => {
    const owner = seedOwner()
    const second = saveUser({
      username: 'second-owner',
      fullName: 'Second Owner',
      roleId: 'owner',
      password: 'Owner-2026b'
    })
    expect(() => setUserActive(owner.id, false)).not.toThrow()
    expect(dbGet<{ isActive: number }>('SELECT isActive FROM users WHERE id = ?', [second.id])?.isActive).toBe(1)
  })

  it('resets a password through the admin path', () => {
    const owner = seedOwner()
    setPassword(owner.id, 'Reset-2026')
    logout()
    expect(login({ username: 'owner', password: 'Reset-2026' }).id).toBe(owner.id)
  })

  it('audits administrative writes', () => {
    seedOwner()
    const role = listRoles().find((entry) => entry.id !== 'owner')
    saveUser({ username: 'audited', fullName: 'Audited', roleId: role?.id ?? 'owner', password: 'Audit-2026' })
    const actions = dbAll<{ action: string }>('SELECT action FROM audit_log')
    expect(actions.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['setup.complete', 'users.create'])
    )
  })
})

describe('dashboard', () => {
  it('summarises an empty database without a SQL error', () => {
    seedOwner()
    const summary = dashboardSummary()
    expect(summary.salesCents).toBe(0)
    expect(summary.ordersCount).toBe(0)
    expect(summary.topProducts).toEqual([])
    expect(summary.itemsSold).toBe(0)
  })

  it('does not treat joined order_items columns as ambiguous', () => {
    const owner = seedOwner()
    dbWrite(
      "INSERT INTO orders (orderNumber, type, status, userId, subtotalCents, totalCents, createdAt, updatedAt) VALUES ('T-1', 'dineIn', 'completed', ?, 1000, 1000, ?, ?)",
      [owner.id, nowStamp(), nowStamp()]
    )
    const orderId = dbGet<{ id: number }>("SELECT id FROM orders WHERE orderNumber = 'T-1'")?.id ?? 0
    const product = dbGet<{ id: number }>('SELECT id FROM products LIMIT 1')?.id ?? 0
    dbWrite(
      "INSERT INTO order_items (orderId, productId, productNameAr, productNameFr, unitPriceCents, qty, lineTotalCents, status, createdAt) VALUES (?, ?, 'شاي', 'Thé', 500, 2, 1000, 'active', ?)",
      [orderId, product, nowStamp()]
    )
    const summary = dashboardSummary()
    expect(summary.salesCents).toBe(1000)
    expect(summary.itemsSold).toBe(2)
  })
})

describe('settings', () => {
  it('falls back to defaults for unset keys', () => {
    const settings = getSettings()
    expect(settings.currency).toBe('DZD')
    expect(settings.paperWidth).toBe('80')
  })

  it('validates and persists a patch', () => {
    const updated = updateSettings({ restaurantName: 'AFUS 2', taxRateBp: 900, paymentMethods: ['cash'] })
    expect(updated.restaurantName).toBe('AFUS 2')
    expect(getSettings().taxRateBp).toBe(900)
  })

  it('rejects an out-of-range tax rate', () => {
    expect(() => updateSettings({ taxRateBp: 20000 })).toThrow()
  })

  it('rejects an empty patch', () => {
    expect(() => updateSettings({})).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
  })
})
