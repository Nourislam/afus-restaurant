import { beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, dbGet, openDatabase } from '../src/main/db/client'
import { seedCoreData } from '../src/main/db/seed'
import { completeSetup } from '../src/main/services/setup'
import {
  addItem,
  buildOrder,
  cancelOrder,
  createOrder,
  listOrders,
  payOrder,
  sendToKitchen
} from '../src/main/services/orders'
import { kitchenBoard, setItemKitchenStatus } from '../src/main/services/kitchen'
import { updateSettings } from '../src/main/services/settings'
import { clearSession } from '../src/main/security/session'

function seed() {
  completeSetup({
    restaurantName: 'AFUS', currency: 'DZD', language: 'ar',
    taxEnabled: false, taxRateBp: 0, ownerFullName: 'Owner', ownerPin: '1234'
  })
}
const firstProduct = () => dbGet<{ id: number; priceCents: number }>('SELECT id, priceCents FROM products ORDER BY id LIMIT 1')!
const firstTable = () => dbGet<{ id: number }>('SELECT id FROM dining_tables ORDER BY id LIMIT 1')!

beforeEach(async () => {
  closeDatabase()
  clearSession()
  await openDatabase(null)
  seedCoreData()
  seed()
})

describe('order lifecycle', () => {
  it('opens a dine-in order, occupies the table and prices the items', () => {
    const p = firstProduct()
    const table = firstTable()
    const order = createOrder({ type: 'dineIn', tableId: table.id, covers: 3, items: [{ productId: p.id, qty: 2 }] })
    expect(order.status).toBe('new')
    expect(order.covers).toBe(3)
    expect(order.items).toHaveLength(1)
    expect(order.subtotalCents).toBe(p.priceCents * 2)
    expect(order.totalCents).toBe(p.priceCents * 2)
    expect(dbGet<{ status: string }>('SELECT status FROM dining_tables WHERE id = ?', [table.id])?.status).toBe('occupied')
  })

  it('adds a second line and recomputes the total', () => {
    const p = firstProduct()
    const order = createOrder({ type: 'takeaway', items: [{ productId: p.id, qty: 1 }] })
    const updated = addItem({ orderId: order.id, productId: p.id, qty: 2 })
    expect(updated.items).toHaveLength(2)
    expect(updated.subtotalCents).toBe(p.priceCents * 3)
  })

  it('applies exclusive tax from settings', () => {
    updateSettings({ taxEnabled: true, taxRateBp: 1000, taxInclusive: false }) // 10%
    const p = firstProduct()
    const order = createOrder({ type: 'takeaway', items: [{ productId: p.id, qty: 1 }] })
    expect(order.taxCents).toBe(Math.round(p.priceCents * 0.1))
    expect(order.totalCents).toBe(p.priceCents + Math.round(p.priceCents * 0.1))
  })

  it('fires to the kitchen: items pending, board shows the ticket', () => {
    const p = firstProduct()
    const order = createOrder({ type: 'dineIn', tableId: firstTable().id, items: [{ productId: p.id, qty: 1 }] })
    const sent = sendToKitchen(order.id)
    expect(sent.status).toBe('sent')
    expect(sent.items[0]?.status).toBe('pending')
    const board = kitchenBoard()
    expect(board.tickets).toHaveLength(1)
    expect(board.tickets[0]?.orderNumber).toBe(order.orderNumber)
    expect(board.counts.new).toBe(1)
  })

  it('bumps an item through the kitchen and off the board when served', () => {
    const p = firstProduct()
    const order = createOrder({ type: 'dineIn', tableId: firstTable().id, items: [{ productId: p.id, qty: 1 }] })
    sendToKitchen(order.id)
    const itemId = buildOrder(order.id).items[0]!.id
    expect(setItemKitchenStatus({ itemId, status: 'preparing' }).counts.preparing).toBe(1)
    expect(setItemKitchenStatus({ itemId, status: 'ready' }).counts.ready).toBe(1)
    const after = setItemKitchenStatus({ itemId, status: 'served' })
    expect(after.tickets).toHaveLength(0)
  })

  it('completes on full payment and frees the table', () => {
    const p = firstProduct()
    const table = firstTable()
    const order = createOrder({ type: 'dineIn', tableId: table.id, items: [{ productId: p.id, qty: 1 }] })
    const paid = payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(paid.status).toBe('completed')
    expect(paid.dueCents).toBe(0)
    expect(dbGet<{ status: string }>('SELECT status FROM dining_tables WHERE id = ?', [table.id])?.status).toBe('free')
  })

  it('leaves the order open on partial payment', () => {
    const p = firstProduct()
    const order = createOrder({ type: 'takeaway', items: [{ productId: p.id, qty: 2 }] })
    const paid = payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: p.priceCents }] })
    expect(paid.status).not.toBe('completed')
    expect(paid.dueCents).toBe(p.priceCents)
  })

  it('cancels an order and frees the table', () => {
    const table = firstTable()
    const order = createOrder({ type: 'dineIn', tableId: table.id, items: [{ productId: firstProduct().id, qty: 1 }] })
    const cancelled = cancelOrder({ orderId: order.id, reason: 'test' })
    expect(cancelled.status).toBe('cancelled')
    expect(dbGet<{ status: string }>('SELECT status FROM dining_tables WHERE id = ?', [table.id])?.status).toBe('free')
  })

  it('lists open orders only when asked', () => {
    const p = firstProduct()
    const open = createOrder({ type: 'takeaway', items: [{ productId: p.id, qty: 1 }] })
    const done = createOrder({ type: 'takeaway', items: [{ productId: p.id, qty: 1 }] })
    payOrder({ orderId: done.id, payments: [{ method: 'cash', amountCents: p.priceCents }] })
    const openOnly = listOrders({ status: 'open' }).map((o) => o.id)
    expect(openOnly).toContain(open.id)
    expect(openOnly).not.toContain(done.id)
  })

  it('gives every order a unique number', () => {
    const p = firstProduct()
    const a = createOrder({ type: 'takeaway', items: [{ productId: p.id, qty: 1 }] })
    const b = createOrder({ type: 'takeaway', items: [{ productId: p.id, qty: 1 }] })
    expect(a.orderNumber).not.toBe(b.orderNumber)
  })
})
