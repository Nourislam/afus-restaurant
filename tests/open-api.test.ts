import { beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, dbGet, openDatabase } from '../src/main/db/client'
import { seedCoreData } from '../src/main/db/seed'
import { completeSetup } from '../src/main/services/setup'
import { authenticate, createToken, listTokens, removeToken, setTokenActive } from '../src/main/services/apiTokens'
import { clearSession } from '../src/main/security/session'

beforeEach(async () => {
  closeDatabase()
  clearSession()
  await openDatabase(null)
  seedCoreData()
  completeSetup({ restaurantName: 'Djemr', currency: 'DZD', language: 'ar', taxEnabled: false, taxRateBp: 0, ownerFullName: 'Owner', ownerPin: '1234' })
})

describe('keys for the open API', () => {
  it('shows the key once and keeps only its hash', () => {
    const { token, secret } = createToken({ name: 'Comptable', scopes: ['read'] })
    expect(secret).toMatch(/^afus_[A-Za-z0-9_-]{30,}$/)
    expect(token.prefix).toBe(secret.slice(0, 11))
    /* The key itself must not be recoverable from the database. */
    const row = dbGet<{ tokenHash: string }>('SELECT tokenHash FROM api_tokens WHERE id = ?', [token.id])
    expect(row?.tokenHash).not.toBe(secret)
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(listTokens())).not.toContain(secret)
  })

  it('accepts the right key and says what it may do', () => {
    const { secret } = createToken({ name: 'Livraison', scopes: ['read', 'write'] })
    const auth = authenticate(secret)
    expect(auth?.scopes).toEqual(['read', 'write'])
    expect(authenticate(`${secret}x`)).toBeNull()
    expect(authenticate('')).toBeNull()
    expect(authenticate(null)).toBeNull()
  })

  it('counts each use, so an unused key is visible', () => {
    const { token, secret } = createToken({ name: 'Caisse' })
    expect(listTokens().find((entry) => entry.id === token.id)?.useCount).toBe(0)
    authenticate(secret)
    authenticate(secret)
    const after = listTokens().find((entry) => entry.id === token.id)
    expect(after?.useCount).toBe(2)
    expect(after?.lastUsedAt).toBeTruthy()
  })

  it('stops working the moment it is revoked, and can be given back', () => {
    const { token, secret } = createToken({ name: 'Ancien' })
    setTokenActive(token.id, false)
    expect(authenticate(secret)).toBeNull()
    setTokenActive(token.id, true)
    expect(authenticate(secret)).not.toBeNull()
    removeToken(token.id)
    expect(authenticate(secret)).toBeNull()
    expect(listTokens()).toHaveLength(0)
  })

  it('defaults to read only, and refuses a key with no name or a bad scope', () => {
    expect(createToken({ name: 'Simple' }).token.scopes).toEqual(['read'])
    expect(() => createToken({ name: '  ' })).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
    expect(() => createToken({ name: 'X', scopes: ['delete' as 'read'] })).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
  })

  it('never gives two keys the same secret', () => {
    const secrets = new Set(Array.from({ length: 20 }, (_, i) => createToken({ name: `K${i}` }).secret))
    expect(secrets.size).toBe(20)
  })
})
