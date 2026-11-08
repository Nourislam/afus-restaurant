import { beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, dbAll, dbGet, dbWrite, openDatabase } from '../src/main/db/client'
import { nowStamp } from '../src/main/utils/dates'
import { dashboardSummary } from '../src/main/services/dashboard'
import { seedCoreData } from '../src/main/db/seed'
import { changePin, listForLogin, loginWithPin, logout, me, permissionsForUser } from '../src/main/services/auth'
import { listRoles, listUsers, saveUser, setPin, setUserActive } from '../src/main/services/users'
import { completeSetup, setupStatus } from '../src/main/services/setup'
import { getSettings, updateSettings } from '../src/main/services/settings'
import { listAudit } from '../src/main/services/audit'
import { clearSession } from '../src/main/security/session'

const OWNER = { ownerFullName: 'مالك المطعم', ownerPin: '1234' }

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

function staffRoleId() {
  const role = listRoles().find((entry) => entry.id !== 'owner')
  if (!role) throw new Error('expected a non-owner role')
  return role.id
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
    expect(getSettings()).toMatchObject({ restaurantName: 'AFUS Restaurant', currency: 'DZD', taxRateBp: 1900, uiMode: 'simple' })
    expect(dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM products')?.count).toBe(6)
    expect(me()?.fullName).toBe(OWNER.ownerFullName)
  })

  it('refuses a second setup run', () => {
    seedOwner()
    expect(() => seedOwner()).toThrowError(expect.objectContaining({ code: 'ALREADY_INITIALIZED' }))
  })

  it('rejects an owner PIN that is not 4 digits', () => {
    expect(() =>
      completeSetup({
        restaurantName: 'X',
        currency: 'DZD',
        language: 'fr',
        taxEnabled: false,
        taxRateBp: 0,
        ownerFullName: 'A',
        ownerPin: '123'
      })
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
  })
})

describe('authentication', () => {
  it('signs in with a profile + PIN and audits the attempt', () => {
    const owner = seedOwner()
    logout()
    const session = loginWithPin({ id: owner.id, pin: OWNER.ownerPin })
    expect(session.fullName).toBe(OWNER.ownerFullName)
    expect(listAudit().some((entry) => entry.action === 'auth.login')).toBe(true)
  })

  it('lists login profiles without leaking any secret', () => {
    seedOwner()
    const profiles = listForLogin()
    expect(profiles).toHaveLength(1)
    expect(profiles[0]).toMatchObject({ fullName: OWNER.ownerFullName, roleId: 'owner' })
    expect(JSON.stringify(profiles)).not.toMatch(/pinHash|passwordHash|scrypt/)
  })

  it('does not reveal whether an account exists (same error for all failures)', () => {
    const owner = seedOwner()
    expect(() => loginWithPin({ id: owner.id, pin: '0000' })).toThrowError(expect.objectContaining({ code: 'INVALID_CREDENTIALS' }))
    expect(() => loginWithPin({ id: 999999, pin: '0000' })).toThrowError(expect.objectContaining({ code: 'INVALID_CREDENTIALS' }))
  })

  it('refuses a disabled account', () => {
    seedOwner()
    const staff = saveUser({ fullName: 'Staff', roleId: staffRoleId(), pin: '5678' })
    logout()
    loginWithPin({ id: staff.id, pin: '5678' })
    setUserActive(staff.id, false)
    expect(me()).toBeNull()
    expect(() => loginWithPin({ id: staff.id, pin: '5678' })).toThrowError(expect.objectContaining({ code: 'INVALID_CREDENTIALS' }))
  })

  it('drops the session and the permissions when the account is disabled mid-session', () => {
    seedOwner()
    const staff = saveUser({ fullName: 'Staff', roleId: staffRoleId(), pin: '5678' })
    logout()
    loginWithPin({ id: staff.id, pin: '5678' })
    expect(permissionsForUser(staff.id).length).toBeGreaterThan(0)
    setUserActive(staff.id, false)
    expect(permissionsForUser(staff.id)).toEqual([])
    expect(me()).toBeNull()
  })
})

describe('PIN change', () => {
  it('requires the current PIN', () => {
    seedOwner()
    expect(() => changePin({ currentPin: '0000', newPin: '4321' })).toThrowError(/INVALID_CREDENTIALS/)
  })

  it('rejects a new PIN that is not 4 digits', () => {
    seedOwner()
    expect(() => changePin({ currentPin: OWNER.ownerPin, newPin: '12' })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' })
    )
  })

  it('replaces the stored PIN', () => {
    const owner = seedOwner()
    changePin({ currentPin: OWNER.ownerPin, newPin: '4321' })
    logout()
    expect(() => loginWithPin({ id: owner.id, pin: OWNER.ownerPin })).toThrowError(expect.objectContaining({ code: 'INVALID_CREDENTIALS' }))
    expect(loginWithPin({ id: owner.id, pin: '4321' }).id).toBe(owner.id)
  })
})

describe('user administration', () => {
  it('lists users and roles', () => {
    seedOwner()
    expect(listUsers()).toHaveLength(1)
    expect(listRoles().map((role) => role.id)).toEqual(expect.arrayContaining(['owner']))
  })

  it('gives two staff with the same name distinct internal usernames', () => {
    seedOwner()
    const a = saveUser({ fullName: 'Ali', roleId: staffRoleId(), pin: '1111' })
    const b = saveUser({ fullName: 'Ali', roleId: staffRoleId(), pin: '2222' })
    const ua = dbGet<{ username: string }>('SELECT username FROM users WHERE id = ?', [a.id])?.username
    const ub = dbGet<{ username: string }>('SELECT username FROM users WHERE id = ?', [b.id])?.username
    expect(ua).toBeTruthy()
    expect(ua).not.toBe(ub)
  })

  it('rejects an unknown role and an invalid PIN', () => {
    seedOwner()
    expect(() => saveUser({ fullName: 'X', roleId: 'nope', pin: '1234' })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' })
    )
    expect(() => saveUser({ fullName: 'Y', roleId: 'owner', pin: '1' })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' })
    )
  })

  it('never disables the last administrator', () => {
    const owner = seedOwner()
    expect(() => setUserActive(owner.id, false)).toThrowError(expect.objectContaining({ code: 'CONFLICT' }))
    expect(dbGet<{ isActive: number }>('SELECT isActive FROM users WHERE id = ?', [owner.id])?.isActive).toBe(1)
  })

  it('allows disabling an administrator once another one exists', () => {
    const owner = seedOwner()
    const second = saveUser({ fullName: 'Second Owner', roleId: 'owner', pin: '8888' })
    expect(() => setUserActive(owner.id, false)).not.toThrow()
    expect(dbGet<{ isActive: number }>('SELECT isActive FROM users WHERE id = ?', [second.id])?.isActive).toBe(1)
  })

  it('resets a PIN through the admin path', () => {
    const owner = seedOwner()
    setPin(owner.id, '4242')
    logout()
    expect(loginWithPin({ id: owner.id, pin: '4242' }).id).toBe(owner.id)
  })

  it('audits administrative writes', () => {
    seedOwner()
    saveUser({ fullName: 'Audited', roleId: staffRoleId(), pin: '3333' })
    const actions = dbAll<{ action: string }>('SELECT action FROM audit_log')
    expect(actions.map((entry) => entry.action)).toEqual(expect.arrayContaining(['setup.complete', 'users.create']))
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
    expect(settings.uiMode).toBe('simple')
  })

  it('validates and persists a patch', () => {
    const updated = updateSettings({ restaurantName: 'AFUS 2', taxRateBp: 900, paymentMethods: ['cash'] })
    expect(updated.restaurantName).toBe('AFUS 2')
    expect(getSettings().taxRateBp).toBe(900)
  })

  it('switches the UI mode', () => {
    expect(updateSettings({ uiMode: 'full' }).uiMode).toBe('full')
  })

  it('rejects an out-of-range tax rate', () => {
    expect(() => updateSettings({ taxRateBp: 20000 })).toThrow()
  })

  it('rejects an empty patch', () => {
    expect(() => updateSettings({})).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
  })
})
