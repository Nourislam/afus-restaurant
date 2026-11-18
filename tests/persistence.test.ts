import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, dbAll, dbGet, dbWrite, openDatabase, transaction } from '../src/main/db/client'
import { seedCoreData } from '../src/main/db/seed'
import { completeSetup } from '../src/main/services/setup'
import { cancelOrder, createOrder, payOrder, sendToKitchen } from '../src/main/services/orders'
import { setItemKitchenStatus } from '../src/main/services/kitchen'
import { updateSettings } from '../src/main/services/settings'
import { clearSession, setSession } from '../src/main/security/session'

/**
 * Every other test runs on an in-memory database, where saving to disk is a
 * no-op. That hid a fault that broke the real program completely: sql.js
 * refuses to export while a write transaction is open, and the code saved on
 * every write — so creating an order, sending it to the kitchen and paying it
 * all threw and rolled back. These tests use a real file, like the shop does.
 */
let file: string

const product = () => dbGet<{ id: number; priceCents: number }>('SELECT id, priceCents FROM products ORDER BY id LIMIT 1')!

beforeEach(async () => {
  closeDatabase()
  clearSession()
  file = join(mkdtempSync(join(tmpdir(), 'afus-persist-')), 'afus.sqlite')
  await openDatabase(file)
  seedCoreData()
  const owner = completeSetup({
    restaurantName: 'Djemr', currency: 'DZD', language: 'ar',
    taxEnabled: false, taxRateBp: 0, ownerFullName: 'Owner', ownerPin: '1234'
  })
  setSession({ userId: owner.id, username: owner.username, issuedAt: Date.now() })
})

describe('a database that lives in a file', () => {
  it('writes an order through, instead of rolling it back', () => {
    const order = createOrder({ type: 'takeaway', items: [{ productId: product().id, qty: 2 }] })
    expect(order.id).toBeGreaterThan(0)
    expect(order.items).toHaveLength(1)
    expect(dbGet<{ n: number }>('SELECT COUNT(*) AS n FROM orders')?.n).toBe(1)
  })

  it('carries a sale all the way to paid', () => {
    const order = createOrder({ type: 'takeaway', items: [{ productId: product().id, qty: 1 }] })
    expect(sendToKitchen(order.id).status).toBe('sent')
    const paid = payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(paid.status).toBe('completed')
    expect(paid.fiscalSeq).toBe(1)
  })

  it('actually saves it, so the next launch still has it', async () => {
    const order = createOrder({ type: 'takeaway', items: [{ productId: product().id, qty: 1 }] })
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(existsSync(file)).toBe(true)
    expect(statSync(file).size).toBeGreaterThan(0)

    /* Close it and open the file again: the sale must still be there. */
    closeDatabase()
    await openDatabase(file)
    const reread = dbGet<{ orderNumber: string; status: string }>('SELECT orderNumber, status FROM orders WHERE id = ?', [order.id])
    expect(reread?.orderNumber).toBe(order.orderNumber)
    expect(reread?.status).toBe('completed')
  })

  it('carries a prepaid sale from the counter to the kitchen and out', async () => {
    /* The other order of business, on a real file: the money first, then the
       cooking, and the order closing itself when the dish is served. Closing
       happens inside the kitchen's own transaction, which is exactly the shape
       that used to fail against a file. */
    updateSettings({ orderFlow: { takeaway: 'payFirst' } })
    const order = createOrder({ type: 'takeaway', items: [{ productId: product().id, qty: 1 }] })
    const paid = payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(paid.status).toBe('sent')
    expect(paid.paidAt).not.toBeNull()
    expect(paid.fiscalSeq).toBe(1)

    const item = dbGet<{ id: number }>('SELECT id FROM order_items WHERE orderId = ?', [order.id])!
    setItemKitchenStatus({ itemId: item.id, status: 'served' })

    closeDatabase()
    await openDatabase(file)
    const reread = dbGet<{ status: string; paidAt: string | null; completedAt: string | null; fiscalSeq: number | null }>(
      'SELECT status, paidAt, completedAt, fiscalSeq FROM orders WHERE id = ?',
      [order.id]
    )
    expect(reread?.status).toBe('completed')
    expect(reread?.paidAt).not.toBeNull()
    expect(reread?.completedAt).not.toBeNull()
    /* The seal was struck at payment and must not have moved since. */
    expect(reread?.fiscalSeq).toBe(1)
  })

  it('leaves no half-finished operation behind when one fails', () => {
    const before = dbGet<{ n: number }>('SELECT COUNT(*) AS n FROM orders')?.n ?? 0
    expect(() => createOrder({ type: 'takeaway', items: [{ productId: 999_999, qty: 1 }] })).toThrow()
    expect(dbGet<{ n: number }>('SELECT COUNT(*) AS n FROM orders')?.n).toBe(before)
    /* And the database is still usable afterwards. */
    const good = createOrder({ type: 'takeaway', items: [{ productId: product().id, qty: 1 }] })
    expect(good.id).toBeGreaterThan(0)
  })

  it('lets one transaction sit inside another', () => {
    /* A cancelled delivery cancels its order: two transactions, one operation. */
    const order = createOrder({
      type: 'delivery',
      items: [{ productId: product().id, qty: 1 }],
      delivery: { customerName: 'Sara', phone: '0770', address: 'Rue 1', feeCents: 10_000 }
    })
    transaction(() => {
      transaction(() => {
        dbWrite("UPDATE orders SET note = 'inner' WHERE id = ?", [order.id])
      })
      dbWrite("UPDATE orders SET cancelReason = 'outer' WHERE id = ?", [order.id])
    })
    const row = dbGet<{ note: string; cancelReason: string }>('SELECT note, cancelReason FROM orders WHERE id = ?', [order.id])
    expect(row?.note).toBe('inner')
    expect(row?.cancelReason).toBe('outer')
    expect(cancelOrder({ orderId: order.id, reason: 'test' }).status).toBe('cancelled')
  })

  it('keeps the audit chain intact across a real save', async () => {
    const order = createOrder({ type: 'takeaway', items: [{ productId: product().id, qty: 1 }] })
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    closeDatabase()
    await openDatabase(file)
    const rows = dbAll<{ prevHash: string; hash: string }>('SELECT prevHash, hash FROM audit_log ORDER BY id')
    expect(rows.length).toBeGreaterThan(2)
    for (let i = 1; i < rows.length; i += 1) expect(rows[i]!.prevHash).toBe(rows[i - 1]!.hash)
  })

  it('never writes a file while a transaction is open', () => {
    /* The direct proof: saving mid-transaction is what used to throw. */
    const order = createOrder({ type: 'takeaway', items: [{ productId: product().id, qty: 1 }] })
    const sizeBefore = statSync(file).size
    expect(() =>
      transaction(() => {
        dbWrite("UPDATE orders SET note = 'x' WHERE id = ?", [order.id])
        dbWrite("UPDATE orders SET note = 'y' WHERE id = ?", [order.id])
      })
    ).not.toThrow()
    expect(statSync(file).size).toBeGreaterThanOrEqual(sizeBefore)
    expect(readFileSync(file).length).toBeGreaterThan(0)
  })
})
