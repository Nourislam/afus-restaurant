import { describe, expect, it, afterEach } from 'vitest'
import {
  assertPasswordStrength,
  hashPassword,
  PASSWORD_MIN_LENGTH,
  verifyPassword
} from '../src/main/security/password'
import {
  assertPermission,
  clearSession,
  getSession,
  requireSession,
  setSession
} from '../src/main/security/session'

afterEach(() => clearSession())

describe('password hashing', () => {
  it('stores a salted scrypt hash, never the password', () => {
    const hash = hashPassword('Chef-2026')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(hash).not.toContain('Chef-2026')
    expect(hash.split('$')).toHaveLength(6)
    expect(verifyPassword('Chef-2026', hash)).toBe(true)
  })

  it('salts every hash, so equal passwords produce different digests', () => {
    expect(hashPassword('same-password')).not.toBe(hashPassword('same-password'))
  })

  it('rejects a wrong password', () => {
    const hash = hashPassword('correct horse')
    expect(verifyPassword('correct horsE', hash)).toBe(false)
  })

  it('fails closed on a malformed or truncated hash', () => {
    expect(verifyPassword('x', '')).toBe(false)
    expect(verifyPassword('x', 'plain-text')).toBe(false)
    expect(verifyPassword('x', 'scrypt$16384$8$1$abcd$')).toBe(false)
    expect(verifyPassword('x', 'bcrypt$16384$8$1$aabb$ccdd')).toBe(false)
  })

  it('normalises unicode before hashing', () => {
    const decomposed = 'e\u0301quipe'
    const composed = '\u00e9quipe'
    expect(verifyPassword(decomposed, hashPassword(composed))).toBe(true)
  })

  it('enforces the minimum length', () => {
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(6)
    expect(() => assertPasswordStrength('12345')).toThrow()
    expect(() => assertPasswordStrength('123456')).not.toThrow()
  })
})

describe('session guard', () => {
  it('has no session until one is set', () => {
    expect(getSession()).toBeNull()
    expect(() => requireSession()).toThrowError(/UNAUTHENTICATED/)
  })

  it('returns the session once set and drops it on clear', () => {
    setSession({ userId: 7, username: 'chef', issuedAt: 1 })
    expect(requireSession().userId).toBe(7)
    clearSession()
    expect(getSession()).toBeNull()
  })

  it('allows any-of semantics for permission lists', () => {
    expect(() => assertPermission(['pos.use'], ['tables.manage', 'pos.use'])).not.toThrow()
    expect(() => assertPermission(['menu.view'], ['tables.manage', 'pos.use'])).toThrowError(/FORBIDDEN/)
  })

  it('treats a missing requirement as authenticated-only', () => {
    expect(() => assertPermission([], undefined)).not.toThrow()
    expect(() => assertPermission([], [])).not.toThrow()
  })

  it('denies a single missing permission', () => {
    expect(() => assertPermission(['menu.view'], 'settings.manage')).toThrowError(/FORBIDDEN/)
  })
})
