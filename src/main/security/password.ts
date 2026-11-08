import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64
const SALT_BYTES = 16
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const
const PREFIX = 'scrypt'

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES)
  const key = scryptSync(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS)
  return `${PREFIX}$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('hex')}$${key.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== PREFIX) return false
  const [, n, r, p, saltHex, keyHex] = parts as [string, string, string, string, string, string]
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(keyHex, 'hex')
  if (salt.length === 0 || expected.length === 0) return false
  const actual = scryptSync(password.normalize('NFKC'), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export const PASSWORD_MIN_LENGTH = 6

export function assertPasswordStrength(password: string): void {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    const error = new Error('WEAK_PASSWORD')
    error.name = 'AppError'
    throw error
  }
}
