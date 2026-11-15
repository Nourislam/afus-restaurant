import { beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, dbAll, dbGet, dbWrite, openDatabase } from '../src/main/db/client'
import { seedCoreData } from '../src/main/db/seed'
import { completeSetup } from '../src/main/services/setup'
import { updateSettings } from '../src/main/services/settings'
import { createOrder, payOrder } from '../src/main/services/orders'
import { writeAudit } from '../src/main/services/audit'
import { attestationHtml, closePeriod, computeStamp, listClosures, verifyIntegrity } from '../src/main/services/fiscal'
import { clearSession } from '../src/main/security/session'
import { nowStamp } from '../src/main/utils/dates'

function seed() {
  completeSetup({ restaurantName: 'Djemr', currency: 'DZD', language: 'ar', taxEnabled: false, taxRateBp: 0, ownerFullName: 'Owner', ownerPin: '1234' })
}
const product = () => dbGet<{ id: number; priceCents: number }>('SELECT id, priceCents FROM products ORDER BY id LIMIT 1')!
function sale(cashCents?: number) {
  const p = product()
  const order = createOrder({ type: 'takeaway', items: [{ productId: p.id, qty: 1 }] })
  return payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: cashCents ?? order.totalCents }] })
}

beforeEach(async () => {
  closeDatabase()
  clearSession()
  await openDatabase(null)
  seedCoreData()
  seed()
})

describe('stamp duty', () => {
  it('is zero while disabled', () => {
    expect(computeStamp(160_000)).toBe(0)
  })
  it('applies the bracket rate per started 100 DA, with a minimum', () => {
    updateSettings({ stampEnabled: true })
    expect(computeStamp(160_000)).toBe(1_600) // 1 600 DA → 16 × 1 DA
    expect(computeStamp(10_000)).toBe(500) // 100 DA → 1 DA → min 5 DA
    expect(computeStamp(3_000_000)).toBe(30_000) // 30 000 DA still in the 1% bracket
    expect(computeStamp(3_000_100)).toBe(Math.round(301 * 1.5 * 100)) // next bracket, 1.5 DA / 100 DA
    expect(computeStamp(20_000_000)).toBe(400_000) // 200 000 DA × 2%
  })
  it('respects the cap', () => {
    updateSettings({ stampEnabled: true, stampMaxCents: 250_000 })
    expect(computeStamp(20_000_000)).toBe(250_000)
  })
  it('is added to a cash sale and shown on the order', () => {
    updateSettings({ stampEnabled: true })
    const p = product()
    const order = createOrder({ type: 'takeaway', items: [{ productId: p.id, qty: 1 }] })
    const base = order.totalCents
    const paid = payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: base }] })
    expect(paid.stampCents).toBeGreaterThan(0)
    expect(paid.totalCents).toBe(base + paid.stampCents)
    expect(paid.status).not.toBe('completed') // the stamp is still owed
    const done = payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: paid.dueCents }] })
    expect(done.status).toBe('completed')
    expect(done.fiscalSeq).toBe(1)
  })
  it('does not apply to card payments', () => {
    updateSettings({ stampEnabled: true })
    const p = product()
    const order = createOrder({ type: 'takeaway', items: [{ productId: p.id, qty: 1 }] })
    const paid = payOrder({ orderId: order.id, payments: [{ method: 'card', amountCents: order.totalCents }] })
    expect(paid.stampCents).toBe(0)
    expect(paid.status).toBe('completed')
  })
})

describe('sealed sales + integrity', () => {
  it('numbers completed sales sequentially and chains their hashes', () => {
    const a = sale()
    const b = sale()
    expect(a.fiscalSeq).toBe(1)
    expect(b.fiscalSeq).toBe(2)
    expect(a.fiscalHash).toMatch(/^[0-9a-f]{64}$/)
    expect(dbGet<{ fiscalPrevHash: string }>('SELECT fiscalPrevHash FROM orders WHERE id = ?', [b.id])?.fiscalPrevHash).toBe(a.fiscalHash)
    const report = verifyIntegrity()
    expect(report.ok).toBe(true)
    expect(report.orders.checked).toBe(2)
    expect(report.orders.headHash).toBe(b.fiscalHash)
  })
  it('detects a sale altered behind the program', () => {
    const a = sale()
    sale()
    dbWrite('UPDATE orders SET totalCents = totalCents + 100 WHERE id = ?', [a.id])
    const report = verifyIntegrity()
    expect(report.ok).toBe(false)
    expect(report.orders.brokenAt).toBe(1)
  })
  it('chains the audit log and detects a tampered entry', () => {
    writeAudit('test.one', 'x', 1)
    writeAudit('test.two', 'x', 2)
    const rows = dbAll<{ id: number; prevHash: string; hash: string }>('SELECT id, prevHash, hash FROM audit_log ORDER BY id DESC LIMIT 2')
    expect(rows[0]!.prevHash).toBe(rows[1]!.hash)
    expect(verifyIntegrity().audit.brokenAt).toBeNull()
    dbWrite("UPDATE audit_log SET action = 'forged' WHERE id = ?", [rows[1]!.id])
    expect(verifyIntegrity().audit.brokenAt).toBe(rows[1]!.id)
  })
})

describe('closures, export, attestation', () => {
  it('closes the day with the right totals and lists it', () => {
    const a = sale()
    const b = sale()
    const today = nowStamp().slice(0, 10)
    const z = closePeriod('day', today)
    expect(z.salesCount).toBe(2)
    expect(z.grossCents).toBe(a.totalCents + b.totalCents)
    expect(z.firstSeq).toBe(1)
    expect(z.lastSeq).toBe(2)
    expect(z.chainHash).toMatch(/^[0-9a-f]{64}$/)
    expect(closePeriod('day', today).id).toBe(z.id) // idempotent
    expect(listClosures()[0]?.periodKey).toBe(today)
  })
  it('rejects a malformed period key', () => {
    expect(() => closePeriod('day', '2026/11/14')).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
  })
  it('renders the attestation with the fiscal identity and integrity state', () => {
    updateSettings({ legalName: 'SARL Djemr', nif: '000123456789012', nis: '000987654321098', rc: '16/00-1234567B26', ai: '16011234567' })
    sale()
    const fr = attestationHtml('fr', '1.0.0-test')
    expect(fr).toContain('SARL Djemr')
    expect(fr).toContain('000123456789012')
    expect(fr).toContain('Intègre')
    expect(fr).toContain('1.0.0-test')
    expect(attestationHtml('ar', '1.0.0-test')).toContain('dir="rtl"')
  })
})
