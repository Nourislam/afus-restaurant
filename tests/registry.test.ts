import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { dispatch, missingChannels, register, registeredCount, resetRegistry } from '../src/main/ipc/registry'
import { closeDatabase, openDatabase } from '../src/main/db/client'
import { seedCoreData } from '../src/main/db/seed'
import { listRoles, saveUser } from '../src/main/services/users'
import { logout } from '../src/main/services/auth'
import { clearSession, setSession } from '../src/main/security/session'
import { getSettings, updateSettings } from '../src/main/services/settings'

const errorCode = (result: { ok: boolean }): string | undefined =>
  result.ok ? undefined : (result as { ok: false; error: { code: string } }).error.code

beforeEach(async () => {
  resetRegistry()
  closeDatabase()
  clearSession()
  await openDatabase(null)
  seedCoreData()
})

const signInAsOwner = (): number => {
  const role = listRoles().find((entry) => entry.id === 'owner')
  if (!role) throw new Error('owner role missing')
  const user = saveUser({ username: 'tester', fullName: 'Tester', roleId: 'owner', password: 'Tester-2026' })
  setSession({ userId: user.id, username: 'tester', issuedAt: Date.now() })
  return user.id
}

describe('channel allowlist', () => {
  it('rejects channels outside the shared allowlist', async () => {
    register('settings.get', { allowAnonymous: true, handler: getSettings as () => unknown })
    const result = await dispatch('evil.escape', {})
    expect(errorCode(result)).toBe('CHANNEL_NOT_ALLOWED')
  })

  it('answers NOT_IMPLEMENTED for an allowed but unregistered channel', async () => {
    register('settings.get', { allowAnonymous: true, handler: getSettings as () => unknown })
    expect(registeredCount()).toBe(1)
    const result = await dispatch('orders.list', {})
    expect(errorCode(result)).toBe('NOT_IMPLEMENTED')
    expect(missingChannels()).toContain('orders.list')
    expect(missingChannels()).not.toContain('settings.get')
  })

  it('refuses to register the same channel twice', () => {
    register('settings.get', { allowAnonymous: true, handler: getSettings as () => unknown })
    expect(() => register('settings.get', { allowAnonymous: true, handler: getSettings as () => unknown })).toThrow()
  })
})

describe('request pipeline', () => {
  it('requires a session by default', async () => {
    register('settings.get', { handler: getSettings as () => unknown })
    const result = await dispatch('settings.get', {})
    expect(errorCode(result)).toBe('UNAUTHENTICATED')
  })

  it('allows anonymous channels that opt in', async () => {
    register('setup.status', { allowAnonymous: true, handler: () => ({ initialized: false }) })
    const result = await dispatch('setup.status', {})
    expect(result).toEqual({ ok: true, data: { initialized: false } })
  })

  it('enforces the declared permission', async () => {
    signInAsOwner()
    logout()
    const staffRole = listRoles().find((entry) => entry.id !== 'owner')
    const staff = saveUser({
      username: 'waiter1',
      fullName: 'Waiter',
      roleId: staffRole?.id ?? 'owner',
      password: 'Waiter-2026'
    })
    setSession({ userId: staff.id, username: staff.username, issuedAt: Date.now() })
    register('settings.update', { permission: 'settings.manage', handler: updateSettings as never })
    const result = await dispatch('settings.update', { restaurantName: 'Hacked' })
    expect(errorCode(result)).toBe('FORBIDDEN')
  })

  it('validates the payload with zod before the handler runs', async () => {
    signInAsOwner()
    let called = false
    register('settings.update', {
      permission: 'settings.manage',
      schema: z.object({ taxRateBp: z.number().int().min(0).max(10000) }),
      handler: () => {
        called = true
        return {}
      }
    })
    const result = await dispatch('settings.update', { taxRateBp: 50000 })
    expect(errorCode(result)).toBe('VALIDATION')
    expect(called).toBe(false)
    const details = (result as { ok: false; error: { details: { path: string }[] } }).error.details
    expect(details[0]?.path).toBe('taxRateBp')
  })

  it('passes parsed input to the handler and wraps the result', async () => {
    signInAsOwner()
    register('settings.get', {
      permission: 'settings.manage',
      schema: z.object({ key: z.string() }).optional(),
      handler: (input: unknown) => ({ received: input })
    })
    const result = await dispatch('settings.get', { key: 'currency' })
    expect(result).toEqual({ ok: true, data: { received: { key: 'currency' } } })
  })

  it('re-reads permissions on every call, so a role change applies immediately', async () => {
    const ownerId = signInAsOwner()
    register('settings.get', { permission: 'settings.manage', handler: getSettings as () => unknown })
    expect((await dispatch('settings.get', {})).ok).toBe(true)

    const staffRole = listRoles().find((entry) => entry.id !== 'owner')
    if (!staffRole) throw new Error('expected a non-owner role')
    const { dbWrite } = await import('../src/main/db/client')
    dbWrite('UPDATE users SET roleId = ? WHERE id = ?', [staffRole.id, ownerId])

    const result = await dispatch('settings.get', {})
    expect(errorCode(result)).toBe('FORBIDDEN')
  })

  it('never leaks a thrown error message to the renderer', async () => {
    signInAsOwner()
    register('settings.get', {
      permission: 'settings.manage',
      handler: () => {
        throw new Error('/Users/secret/path.sqlite is locked')
      }
    })
    const result = await dispatch('settings.get', {})
    expect(errorCode(result)).toBe('INTERNAL')
    expect(JSON.stringify(result)).not.toContain('/Users/secret')
  })
})
