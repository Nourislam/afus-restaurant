/**
 * Order lifecycle: dine-in / takeaway / delivery / pre-order, from opening a
 * table to payment. Every mutation returns the full assembled Order so the POS
 * can re-render from one source of truth. Totals are recomputed server-side.
 */
import type { Order, OrderItem, OrderSummary } from '@shared/types'
import { dbAll, dbGet, dbWrite, transaction } from '../db/client'
import { requireSession } from '../security/session'
import { getSettings } from './settings'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { writeAudit } from './audit'

interface CreateItemInput {
  productId: number
  qty: number
  variantId?: number | null
  modifierIds?: number[]
  note?: string | null
}

export interface CreateOrderInput {
  type: string
  tableId?: number | null
  customerId?: number | null
  covers?: number | null
  note?: string | null
  scheduledFor?: string | null
  items?: CreateItemInput[]
  delivery?: {
    customerName: string
    phone: string
    address: string
    area?: string | null
    feeCents?: number
    courier?: string | null
  } | null
}

const OPEN_STATUSES = ['new', 'sent', 'preparing', 'ready', 'inProgress', 'held']

function nextOrderNumber(): string {
  const row = dbGet<{ n: number }>('SELECT COUNT(*) AS n FROM orders')
  return `A-${(row?.n ?? 0) + 1}`
}

/** Resolve a product (+ optional variant + modifiers) into a priced line. */
function resolveLine(input: CreateItemInput) {
  const product = dbGet<{
    id: number
    nameAr: string
    nameFr: string
    priceCents: number
    costCents: number
    station: string
    isAvailable: number
  }>('SELECT id, nameAr, nameFr, priceCents, costCents, station, isAvailable FROM products WHERE id = ? AND isArchived = 0', [
    input.productId
  ])
  if (!product) throw new AppError('NOT_FOUND', 'Product not found')

  let variant: { id: number; nameAr: string; nameFr: string; priceDeltaCents: number } | null = null
  if (input.variantId) {
    variant =
      dbGet<{ id: number; nameAr: string; nameFr: string; priceDeltaCents: number }>(
        'SELECT id, nameAr, nameFr, priceDeltaCents FROM product_variants WHERE id = ? AND productId = ?',
        [input.variantId, input.productId]
      ) ?? null
  }

  const modifiers = (input.modifierIds ?? [])
    .map((id) =>
      dbGet<{ id: number; nameAr: string; nameFr: string; priceCents: number }>(
        'SELECT id, nameAr, nameFr, priceCents FROM modifiers WHERE id = ?',
        [id]
      )
    )
    .filter((m): m is { id: number; nameAr: string; nameFr: string; priceCents: number } => Boolean(m))

  const unitPriceCents = product.priceCents + (variant?.priceDeltaCents ?? 0)
  const modifiersCents = modifiers.reduce((sum, m) => sum + m.priceCents, 0)
  const qty = Math.max(1, Math.floor(input.qty || 1))
  return { product, variant, modifiers, unitPriceCents, modifiersCents, qty, note: input.note ?? null }
}

/** Insert one resolved line (and its modifiers) into an order. */
function insertLine(orderId: number, input: CreateItemInput): void {
  const { product, variant, modifiers, unitPriceCents, modifiersCents, qty, note } = resolveLine(input)
  const lineTotalCents = (unitPriceCents + modifiersCents) * qty
  const result = dbWrite(
    `INSERT INTO order_items
      (orderId, productId, variantId, productNameAr, productNameFr, variantNameAr, variantNameFr,
       unitPriceCents, unitCostCents, qty, modifiersCents, lineTotalCents, note, station, status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [
      orderId,
      product.id,
      variant?.id ?? null,
      product.nameAr,
      product.nameFr,
      variant?.nameAr ?? null,
      variant?.nameFr ?? null,
      unitPriceCents,
      product.costCents,
      qty,
      modifiersCents,
      lineTotalCents,
      note,
      product.station,
      nowStamp()
    ]
  )
  for (const m of modifiers) {
    dbWrite(
      'INSERT INTO order_item_modifiers (orderItemId, modifierId, nameAr, nameFr, priceCents) VALUES (?, ?, ?, ?, ?)',
      [result.lastInsertRowid, m.id, m.nameAr, m.nameFr, m.priceCents]
    )
  }
}

/** Recompute an order's money columns from its active items + settings. */
function recompute(orderId: number): void {
  const settings = getSettings()
  const subtotalCents =
    dbGet<{ total: number }>(
      "SELECT COALESCE(SUM(lineTotalCents), 0) AS total FROM order_items WHERE orderId = ? AND status != 'removed'",
      [orderId]
    )?.total ?? 0
  const order = dbGet<{ discountCents: number; deliveryFeeCents: number; paidCents: number }>(
    'SELECT discountCents, deliveryFeeCents, paidCents FROM orders WHERE id = ?',
    [orderId]
  )
  if (!order) return
  const discountCents = Math.min(order.discountCents, subtotalCents)
  const taxable = Math.max(0, subtotalCents - discountCents)
  const rate = settings.taxEnabled ? settings.taxRateBp : 0
  let taxCents = 0
  if (rate > 0) {
    taxCents = settings.taxInclusive
      ? Math.round((taxable * rate) / (10000 + rate))
      : Math.round((taxable * rate) / 10000)
  }
  const addedTax = settings.taxInclusive ? 0 : taxCents
  const totalCents = taxable + addedTax + order.deliveryFeeCents
  const dueCents = Math.max(0, totalCents - order.paidCents)
  dbWrite(
    'UPDATE orders SET subtotalCents = ?, taxCents = ?, totalCents = ?, dueCents = ?, updatedAt = ? WHERE id = ?',
    [subtotalCents, taxCents, totalCents, dueCents, nowStamp(), orderId]
  )
}

function setTableStatus(tableId: number | null | undefined, status: string): void {
  if (!tableId) return
  dbWrite('UPDATE dining_tables SET status = ? WHERE id = ?', [status, tableId])
}

function logStatus(orderId: number, from: string | null, to: string, note: string | null = null): void {
  dbWrite(
    'INSERT INTO order_status_history (orderId, fromStatus, toStatus, userId, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [orderId, from, to, requireSession().userId, note, nowStamp()]
  )
}

/** Assemble the full Order object the renderer expects. */
export function buildOrder(id: number): Order {
  const row = dbGet<Record<string, unknown>>(
    `SELECT o.*, t.name AS tableName, c.name AS customerName, u.fullName AS waiterName
       FROM orders o
       LEFT JOIN dining_tables t ON t.id = o.tableId
       LEFT JOIN customers c ON c.id = o.customerId
       LEFT JOIN users u ON u.id = o.userId
      WHERE o.id = ?`,
    [id]
  )
  if (!row) throw new AppError('NOT_FOUND', 'Order not found')

  const items = dbAll<OrderItem>(
    "SELECT * FROM order_items WHERE orderId = ? AND status != 'removed' ORDER BY id",
    [id]
  ).map((item) => ({
    ...item,
    modifiers: dbAll(
      'SELECT id, modifierId, nameAr, nameFr, priceCents FROM order_item_modifiers WHERE orderItemId = ? ORDER BY id',
      [item.id]
    )
  })) as OrderItem[]

  const payments = dbAll(
    `SELECT p.id, p.method, p.amountCents, p.reference, u.fullName AS userName, p.createdAt
       FROM order_payments p LEFT JOIN users u ON u.id = p.userId
      WHERE p.orderId = ? ORDER BY p.id`,
    [id]
  )
  const history = dbAll(
    `SELECT h.id, h.fromStatus, h.toStatus, u.fullName AS userName, h.note, h.createdAt
       FROM order_status_history h LEFT JOIN users u ON u.id = h.userId
      WHERE h.orderId = ? ORDER BY h.id`,
    [id]
  )
  const delivery =
    dbGet('SELECT * FROM delivery_info WHERE orderId = ?', [id]) ?? null

  const itemCount = items.reduce((sum, item) => sum + item.qty, 0)
  return {
    ...(row as unknown as Order),
    isHeld: Boolean((row as { isHeld: number }).isHeld),
    stockDeducted: Boolean((row as { stockDeducted: number }).stockDeducted),
    items,
    payments: payments as Order['payments'],
    history: history as Order['history'],
    delivery: delivery as Order['delivery'],
    itemCount
  }
}

export function createOrder(input: CreateOrderInput): Order {
  const session = requireSession()
  const stamp = nowStamp()
  let orderId = 0
  transaction(() => {
    const result = dbWrite(
      `INSERT INTO orders
        (orderNumber, type, status, tableId, customerId, userId, covers, note, scheduledFor, createdAt, updatedAt)
       VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nextOrderNumber(),
        input.type,
        input.type === 'dineIn' ? input.tableId ?? null : null,
        input.customerId ?? null,
        session.userId,
        Math.max(1, Math.floor(input.covers || 1)),
        input.note ?? null,
        input.scheduledFor ?? null,
        stamp,
        stamp
      ]
    )
    orderId = Number(result.lastInsertRowid)
    if (input.type === 'delivery' && input.delivery) {
      const d = input.delivery
      dbWrite('UPDATE orders SET deliveryFeeCents = ? WHERE id = ?', [d.feeCents ?? 0, orderId])
      dbWrite(
        `INSERT INTO delivery_info (orderId, customerName, phone, address, area, feeCents, courier, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [orderId, d.customerName, d.phone, d.address, d.area ?? null, d.feeCents ?? 0, d.courier ?? null]
      )
    }
    for (const item of input.items ?? []) insertLine(orderId, item)
    recompute(orderId)
    if (input.type === 'dineIn' && input.tableId) setTableStatus(input.tableId, 'occupied')
    logStatus(orderId, null, 'new')
  })
  writeAudit('orders.create', 'order', orderId, { type: input.type })
  return buildOrder(orderId)
}

function assertOpen(orderId: number): Record<string, unknown> {
  const order = dbGet<Record<string, unknown>>('SELECT * FROM orders WHERE id = ?', [orderId])
  if (!order) throw new AppError('NOT_FOUND', 'Order not found')
  if (order.status === 'completed' || order.status === 'cancelled') throw new AppError('CONFLICT', 'Order is closed')
  return order
}

export function addItem(input: { orderId: number } & CreateItemInput): Order {
  assertOpen(input.orderId)
  transaction(() => {
    insertLine(input.orderId, input)
    recompute(input.orderId)
  })
  return buildOrder(input.orderId)
}

export function updateItem(input: { itemId: number; qty?: number; note?: string | null }): Order {
  const item = dbGet<{ id: number; orderId: number; unitPriceCents: number; modifiersCents: number }>(
    'SELECT id, orderId, unitPriceCents, modifiersCents FROM order_items WHERE id = ?',
    [input.itemId]
  )
  if (!item) throw new AppError('NOT_FOUND')
  assertOpen(item.orderId)
  transaction(() => {
    if (input.qty !== undefined) {
      const qty = Math.max(1, Math.floor(input.qty))
      dbWrite('UPDATE order_items SET qty = ?, lineTotalCents = ? WHERE id = ?', [
        qty,
        (item.unitPriceCents + item.modifiersCents) * qty,
        input.itemId
      ])
    }
    if (input.note !== undefined) dbWrite('UPDATE order_items SET note = ? WHERE id = ?', [input.note, input.itemId])
    recompute(item.orderId)
  })
  return buildOrder(item.orderId)
}

export function removeItem(itemId: number): Order {
  const item = dbGet<{ orderId: number }>('SELECT orderId FROM order_items WHERE id = ?', [itemId])
  if (!item) throw new AppError('NOT_FOUND')
  assertOpen(item.orderId)
  transaction(() => {
    dbWrite("UPDATE order_items SET status = 'removed' WHERE id = ?", [itemId])
    recompute(item.orderId)
  })
  return buildOrder(item.orderId)
}

export function setDiscount(input: { orderId: number; discountCents: number; discountReason: string | null }): Order {
  assertOpen(input.orderId)
  transaction(() => {
    dbWrite('UPDATE orders SET discountCents = ?, discountReason = ? WHERE id = ?', [
      Math.max(0, Math.floor(input.discountCents || 0)),
      input.discountReason ?? null,
      input.orderId
    ])
    recompute(input.orderId)
  })
  return buildOrder(input.orderId)
}

export function setNote(input: { orderId: number; note: string | null }): Order {
  assertOpen(input.orderId)
  dbWrite('UPDATE orders SET note = ?, updatedAt = ? WHERE id = ?', [input.note, nowStamp(), input.orderId])
  return buildOrder(input.orderId)
}

export function setStatus(input: { orderId: number; status: string; note?: string | null }): Order {
  const order = assertOpen(input.orderId)
  logStatus(input.orderId, String(order.status), input.status, input.note ?? null)
  dbWrite('UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?', [input.status, nowStamp(), input.orderId])
  return buildOrder(input.orderId)
}

/** Fire the order to the kitchen: a ticket per not-yet-sent item, items -> preparing. */
export function sendToKitchen(orderId: number): Order {
  const order = assertOpen(orderId)
  transaction(() => {
    const items = dbAll<{ id: number; station: string }>(
      "SELECT id, station FROM order_items WHERE orderId = ? AND status = 'active'",
      [orderId]
    )
    for (const item of items) {
      dbWrite(
        "INSERT INTO kitchen_tickets (orderId, orderItemId, station, status, createdAt, updatedAt) VALUES (?, ?, ?, 'pending', ?, ?)",
        [orderId, item.id, item.station, nowStamp(), nowStamp()]
      )
      dbWrite("UPDATE order_items SET status = 'pending' WHERE id = ?", [item.id])
    }
    if (order.status === 'new' || order.status === 'held') {
      logStatus(orderId, String(order.status), 'sent')
      dbWrite("UPDATE orders SET status = 'sent', isHeld = 0, updatedAt = ? WHERE id = ?", [nowStamp(), orderId])
    }
  })
  writeAudit('orders.sendToKitchen', 'order', orderId)
  return buildOrder(orderId)
}

export function holdOrder(orderId: number): Order {
  assertOpen(orderId)
  dbWrite("UPDATE orders SET isHeld = 1, status = 'held', updatedAt = ? WHERE id = ?", [nowStamp(), orderId])
  return buildOrder(orderId)
}

export function resumeOrder(orderId: number): Order {
  assertOpen(orderId)
  dbWrite("UPDATE orders SET isHeld = 0, status = 'new', updatedAt = ? WHERE id = ?", [nowStamp(), orderId])
  return buildOrder(orderId)
}

export function payOrder(input: {
  orderId: number
  payments: { method: string; amountCents: number; reference?: string | null }[]
}): Order {
  const order = assertOpen(input.orderId)
  const session = requireSession()
  transaction(() => {
    for (const p of input.payments) {
      if (p.amountCents <= 0) continue
      dbWrite(
        'INSERT INTO order_payments (orderId, method, amountCents, reference, userId, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        [input.orderId, p.method, Math.floor(p.amountCents), p.reference ?? null, session.userId, nowStamp()]
      )
    }
    const paidCents =
      dbGet<{ total: number }>('SELECT COALESCE(SUM(amountCents), 0) AS total FROM order_payments WHERE orderId = ?', [
        input.orderId
      ])?.total ?? 0
    const totalCents = Number((order as { totalCents: number }).totalCents)
    dbWrite('UPDATE orders SET paidCents = ?, dueCents = ?, updatedAt = ? WHERE id = ?', [
      paidCents,
      Math.max(0, totalCents - paidCents),
      nowStamp(),
      input.orderId
    ])
    if (paidCents >= totalCents) {
      logStatus(input.orderId, String(order.status), 'completed')
      dbWrite("UPDATE orders SET status = 'completed', completedAt = ? WHERE id = ?", [nowStamp(), input.orderId])
      dbWrite(
        "UPDATE order_items SET status = 'served' WHERE orderId = ? AND status IN ('pending','preparing','ready','active')",
        [input.orderId]
      )
      setTableStatus((order as { tableId: number | null }).tableId, 'free')
    }
  })
  writeAudit('orders.pay', 'order', input.orderId)
  return buildOrder(input.orderId)
}

export function cancelOrder(input: { orderId: number; reason: string; stockPolicy?: string | null }): Order {
  const order = assertOpen(input.orderId)
  transaction(() => {
    logStatus(input.orderId, String(order.status), 'cancelled', input.reason)
    dbWrite("UPDATE orders SET status = 'cancelled', cancelledAt = ?, cancelReason = ?, updatedAt = ? WHERE id = ?", [
      nowStamp(),
      input.reason,
      nowStamp(),
      input.orderId
    ])
    setTableStatus((order as { tableId: number | null }).tableId, 'free')
  })
  writeAudit('orders.cancel', 'order', input.orderId, { reason: input.reason })
  return buildOrder(input.orderId)
}

export function moveTable(input: { orderId: number; tableId: number | null }): Order {
  const order = assertOpen(input.orderId)
  const oldTable = (order as { tableId: number | null }).tableId
  transaction(() => {
    dbWrite('UPDATE orders SET tableId = ?, updatedAt = ? WHERE id = ?', [input.tableId, nowStamp(), input.orderId])
    if (oldTable && oldTable !== input.tableId) setTableStatus(oldTable, 'free')
    if (input.tableId) setTableStatus(input.tableId, 'occupied')
  })
  return buildOrder(input.orderId)
}

export function mergeOrders(input: { fromOrderId: number; toOrderId: number }): Order {
  assertOpen(input.fromOrderId)
  assertOpen(input.toOrderId)
  transaction(() => {
    dbWrite('UPDATE order_items SET orderId = ? WHERE orderId = ?', [input.toOrderId, input.fromOrderId])
    dbWrite(
      "UPDATE orders SET status = 'cancelled', cancelledAt = ?, cancelReason = 'merged', updatedAt = ? WHERE id = ?",
      [nowStamp(), nowStamp(), input.fromOrderId]
    )
    const fromTable = dbGet<{ tableId: number | null }>('SELECT tableId FROM orders WHERE id = ?', [input.fromOrderId])
    setTableStatus(fromTable?.tableId ?? null, 'free')
    recompute(input.toOrderId)
  })
  writeAudit('orders.merge', 'order', input.toOrderId, { from: input.fromOrderId })
  return buildOrder(input.toOrderId)
}

export function getOrder(id: number): Order {
  return buildOrder(id)
}

export function listOrders(input: { status?: string | null; limit?: number } = {}): OrderSummary[] {
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (input.status === 'open') {
    clauses.push(`o.status IN (${OPEN_STATUSES.map(() => '?').join(',')})`)
    params.push(...OPEN_STATUSES)
  } else if (input.status) {
    clauses.push('o.status = ?')
    params.push(input.status)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  params.push(Math.min(500, input.limit ?? 200))
  return dbAll<OrderSummary>(
    `SELECT o.id, o.orderNumber, o.type, o.status, t.name AS tableName, c.name AS customerName,
            u.fullName AS waiterName, o.totalCents, o.paidCents, o.dueCents, o.isHeld, o.createdAt, o.scheduledFor,
            (SELECT COALESCE(SUM(qty),0) FROM order_items oi WHERE oi.orderId = o.id AND oi.status != 'removed') AS itemCount
       FROM orders o
       LEFT JOIN dining_tables t ON t.id = o.tableId
       LEFT JOIN customers c ON c.id = o.customerId
       LEFT JOIN users u ON u.id = o.userId
       ${where}
      ORDER BY o.id DESC LIMIT ?`,
    params
  ).map((row) => ({ ...row, isHeld: Boolean((row as unknown as { isHeld: number }).isHeld) }))
}
