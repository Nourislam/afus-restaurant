/**
 * Keys for the open API.
 *
 * Only the hash of a key is stored. The key itself is shown once, when it is
 * created, and never again — a key that can be read back out of the database is
 * a key that leaks with the database.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { dbAll, dbGet, dbWrite } from '../db/client'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { currentUserId } from '../security/session'
import { sha256, writeAudit } from './audit'

export type ApiScope = 'read' | 'write'

export interface ApiToken {
  id: number
  name: string
  /** The first characters, so a key can be recognised in a list. */
  prefix: string
  scopes: ApiScope[]
  isActive: boolean
  lastUsedAt: string | null
  useCount: number
  createdAt: string
  userName: string | null
}

const SELECT = `
  SELECT t.id, t.name, t.prefix, t.scopes, t.isActive, t.lastUsedAt, t.useCount, t.createdAt, u.fullName AS userName
    FROM api_tokens t LEFT JOIN users u ON u.id = t.userId`

interface TokenRow extends Omit<ApiToken, 'scopes' | 'isActive'> {
  scopes: string
  isActive: number
}

const hydrate = (row: TokenRow): ApiToken => ({
  ...row,
  isActive: Boolean(row.isActive),
  scopes: row.scopes.split(',').filter(Boolean) as ApiScope[]
})

export function listTokens(): ApiToken[] {
  return dbAll<TokenRow>(`${SELECT} ORDER BY t.isActive DESC, t.id DESC`).map(hydrate)
}

/** Creates a key and returns it **once**; afterwards only its hash remains. */
export function createToken(input: { name: string; scopes?: ApiScope[] }): { token: ApiToken; secret: string } {
  const name = input.name.trim()
  if (!name) throw new AppError('VALIDATION', 'The key needs a name')
  const scopes = (input.scopes?.length ? input.scopes : ['read']) as ApiScope[]
  if (scopes.some((scope) => scope !== 'read' && scope !== 'write')) throw new AppError('VALIDATION', 'Unknown scope')

  const secret = `afus_${randomBytes(24).toString('base64url')}`
  const id = Number(
    dbWrite(
      'INSERT INTO api_tokens (name, prefix, tokenHash, scopes, isActive, createdAt, userId) VALUES (?, ?, ?, ?, 1, ?, ?)',
      [name, secret.slice(0, 11), sha256(secret), scopes.join(','), nowStamp(), currentUserId()]
    ).lastInsertRowid
  )
  writeAudit('api.token.create', 'apiToken', id, { name, scopes })
  return { token: hydrate(dbGet<TokenRow>(`${SELECT} WHERE t.id = ?`, [id])!), secret }
}

export function setTokenActive(id: number, active: boolean): ApiToken {
  const result = dbWrite('UPDATE api_tokens SET isActive = ? WHERE id = ?', [active ? 1 : 0, id])
  if (result.changes === 0) throw new AppError('NOT_FOUND')
  writeAudit(active ? 'api.token.enable' : 'api.token.revoke', 'apiToken', id)
  return hydrate(dbGet<TokenRow>(`${SELECT} WHERE t.id = ?`, [id])!)
}

export function removeToken(id: number): { removed: boolean } {
  const result = dbWrite('DELETE FROM api_tokens WHERE id = ?', [id])
  if (result.changes === 0) throw new AppError('NOT_FOUND')
  writeAudit('api.token.delete', 'apiToken', id)
  return { removed: true }
}

/**
 * Check a presented key. Returns what it may do, or null. The comparison is
 * over the hash and constant-time, so a wrong key tells an attacker nothing
 * about how wrong it was.
 */
export function authenticate(presented: string | null | undefined): { id: number; scopes: ApiScope[] } | null {
  if (!presented) return null
  const hash = sha256(presented.trim())
  const row = dbGet<{ id: number; tokenHash: string; scopes: string; isActive: number }>(
    'SELECT id, tokenHash, scopes, isActive FROM api_tokens WHERE tokenHash = ?',
    [hash]
  )
  if (!row || !row.isActive) return null
  const a = Buffer.from(row.tokenHash)
  const b = Buffer.from(hash)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  dbWrite('UPDATE api_tokens SET lastUsedAt = ?, useCount = useCount + 1 WHERE id = ?', [nowStamp(), row.id])
  return { id: row.id, scopes: String(row.scopes).split(',').filter(Boolean) as ApiScope[] }
}
