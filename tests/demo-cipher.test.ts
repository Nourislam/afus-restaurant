/**
 * The web demo's AES-256-GCM has to be the real thing, not a look-alike: the
 * program seals its yearly archive with it, and an archive that cannot be
 * opened again — or that only looks sealed — is worse than none.
 *
 * So both directions are checked against Node's own crypto.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain JavaScript shim, loaded for this test only
import { createCipher, createDecipher } from '../demo-web/shims/aes-gcm.js'

const KEY = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8') // 32 bytes
const IV = Buffer.from('0123456789ab', 'utf8') // 12 bytes

const sealWithShim = (plain: Buffer, key = KEY, iv = IV) => {
  const cipher = createCipher(key, iv)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return { body, tag: cipher.getAuthTag() as Buffer }
}

const sealWithNode = (plain: Buffer, key = KEY, iv = IV) => {
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return { body, tag: cipher.getAuthTag() }
}

describe("the demo's cipher is the real cipher", () => {
  for (const [label, plain] of [
    ['one short line', Buffer.from('مطعم الجمر — archive 2026', 'utf8')],
    ['exactly one block', Buffer.alloc(16, 7)],
    ['several blocks and a remainder', Buffer.from('x'.repeat(1000), 'utf8')],
    ['nothing at all', Buffer.alloc(0)]
  ] as [string, Buffer][]) {
    it(`gives Node's answer for ${label}`, () => {
      const mine = sealWithShim(plain)
      const theirs = sealWithNode(plain)
      expect(mine.body.toString('base64')).toBe(theirs.body.toString('base64'))
      expect(mine.tag.toString('base64')).toBe(theirs.tag.toString('base64'))
    })
  }

  it('opens what Node sealed', () => {
    const plain = Buffer.from(JSON.stringify({ sales: 412, year: 2026 }), 'utf8')
    const { body, tag } = sealWithNode(plain)
    const decipher = createDecipher(KEY, IV)
    decipher.setAuthTag(tag)
    const out = Buffer.concat([decipher.update(body), decipher.final()])
    expect(out.toString('utf8')).toBe(plain.toString('utf8'))
  })

  it('Node opens what it sealed', () => {
    const plain = Buffer.from('ventes de l’année', 'utf8')
    const { body, tag } = sealWithShim(plain)
    const decipher = createDecipheriv('aes-256-gcm', KEY, IV)
    decipher.setAuthTag(tag)
    expect(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')).toBe(plain.toString('utf8'))
  })

  it('refuses a tampered body, which is the whole point of the tag', () => {
    const { body, tag } = sealWithShim(Buffer.from('1 200 000 DA', 'utf8'))
    body[0] = (body[0] ?? 0) ^ 0x01
    const decipher = createDecipher(KEY, IV)
    decipher.setAuthTag(tag)
    decipher.update(body)
    expect(() => decipher.final()).toThrowError(/authenticate/)
  })

  it('refuses the wrong key', () => {
    const { body, tag } = sealWithShim(Buffer.from('1 200 000 DA', 'utf8'))
    const decipher = createDecipher(randomBytes(32), IV)
    decipher.setAuthTag(tag)
    decipher.update(body)
    expect(() => decipher.final()).toThrowError(/authenticate/)
  })
})
