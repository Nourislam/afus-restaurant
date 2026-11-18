/**
 * Order lifecycle: dine-in / takeaway / delivery / pre-order, from opening a
 * table to payment. Every mutation returns the full assembled Order so the POS
 * can re-render from one source of truth. Totals are recomputed server-side.
 *
 * Paying and finishing are two different things, because restaurants do them in
 * both orders. At a table the kitchen cooks, the guest eats, and the bill is
 * settled at the end. At a counter the guest pays first and the order is only
 * then fired to the kitchen. The second case used to be impossible here:
 * paying closed the order outright, so nothing could be sent afterwards.
 *
 *   paidAt      nothing more is owed — the fiscal moment of the sale
 *   sentAt      the kitchen has the order
 *   completedAt the food was handed over and the order is closed
 *
 * `settings.orderFlow` says which order to expect, per order type; see
 * ORDER_FLOWS. It decides defaults and guardrails, never what is possible.
 */
import type { Order, OrderFlow, OrderItem, OrderSummary } from '@shared/types'
import { dbAll, dbGet, dbWrite, transaction } from '../db/client'
import { currentUserId, requireSession } from '../security/session'
import { getSettings } from './settings'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { writeAudit } from './audit'
import { computeStamp, sealOrder } from './fiscal'
import { consumeStockForOrder, restoreStockForOrder } from './inventory'
import { bestOffer, discountFor, getOffer, isLive, markOfferUsed, releaseOfferUse } from './offers'
import { earnForOrder, reverseForOrder } from './loyalty'
import { resolveBranchFilter, terminalBranchId } from './scope'
import { postCashMovement } from './finance'

interface CreateItemInput {
  productId: number
  qty: number
  variantId?: number | null
  modifierIds?: number[]
  note?: string | null
}

export interface CreateOrderInput {
  type: string
  /** Set by a web order; otherwise the terminal's own branch is used. */
  branchId?: number | null
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

/**
 * Which comes first for this kind of order, the money or the kitchen. An order
 * type the owner never configured falls back to settling at the end, which is
 * what a restaurant does unless it decides otherwise.
 */
export function flowFor(type: string): OrderFlow {
  const configured = getSettings().orderFlow?.[type]
  return configured === 'payFirst' || configured === 'flexible' ? configured : 'payLast'
}

/** How many of the order's items have never been fired to the kitchen. */
function unsentCount(orderId: number): number {
  return (
    dbGet<{ n: number }>("SELECT COUNT(*) AS n FROM order_items WHERE orderId = ? AND status = 'active'", [orderId])
      ?.n ?? 0
  )
}

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
  const order = dbGet<{
    discountCents: number
    deliveryFeeCents: number
    paidCents: number
    stampCents: number
    loyaltyDiscountCents: number
  }>(
    'SELECT discountCents, deliveryFeeCents, paidCents, stampCents, loyaltyDiscountCents FROM orders WHERE id = ?',
    [orderId]
  )
  if (!order) return
  /* The offer or the cashier's own discount, then the points, both off the
     dishes — never more than the dishes are worth. */
  const discountCents = Math.min(order.discountCents + (order.loyaltyDiscountCents ?? 0), subtotalCents)
  const taxable = Math.max(0, subtotalCents - discountCents)
  const rate = settings.taxEnabled ? settings.taxRateBp : 0
  let taxCents = 0
  if (rate > 0) {
    taxCents = settings.taxInclusive
      ? Math.round((taxable * rate) / (10000 + rate))
      : Math.round((taxable * rate) / 10000)
  }
  const addedTax = settings.taxInclusive ? 0 : taxCents
  /* The stamp duty on cash is owed by the customer and appears as its own line. */
  const totalCents = taxable + addedTax + order.deliveryFeeCents + (order.stampCents ?? 0)
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

/** The offer's own name, so a receipt can say why the price was lower. */
function offerNameOf(offerId: number | null | undefined): string | null {
  if (!offerId) return null
  return dbGet<{ nameAr: string }>('SELECT nameAr FROM offers WHERE id = ?', [offerId])?.nameAr ?? null
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
    offerName: offerNameOf((row as { offerId: number | null }).offerId),
    items,
    payments: payments as Order['payments'],
    history: history as Order['history'],
    delivery: delivery as Order['delivery'],
    itemCount
  }
}

export function createOrder(input: CreateOrderInput): Order {
  return createOrderAs(requireSession().userId, input)
}

/** Create an order on behalf of a given user id — used by the website order
    intake, where there is no logged-in session (the customer is anonymous). */
export function createOrderAs(actorUserId: number, input: CreateOrderInput): Order {
  const stamp = nowStamp()
  let orderId = 0
  transaction(() => {
    const result = dbWrite(
      `INSERT INTO orders
        (orderNumber, type, status, tableId, customerId, userId, covers, note, scheduledFor, branchId, createdAt, updatedAt)
       VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nextOrderNumber(),
        input.type,
        input.type === 'dineIn' ? input.tableId ?? null : null,
        input.customerId ?? null,
        actorUserId,
        Math.max(1, Math.floor(input.covers || 1)),
        input.note ?? null,
        input.scheduledFor ?? null,
        /* Where it was sold: a web order says so, otherwise this terminal. */
        input.branchId ?? terminalBranchId(),
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
    dbWrite(
      'INSERT INTO order_status_history (orderId, fromStatus, toStatus, userId, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [orderId, null, 'new', actorUserId, null, stamp]
    )
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

/**
 * For anything that changes what is owed. Once an order is settled its figures
 * are sealed into the fiscal chain, so they can never move again — the guest
 * paid for exactly this. Another dish is another order, which is also how a
 * counter actually works.
 */
function assertEditable(orderId: number): Record<string, unknown> {
  const order = assertOpen(orderId)
  if (order.paidAt) throw new AppError('ORDER_SETTLED', 'The order is paid; its contents can no longer change')
  return order
}

export function addItem(input: { orderId: number } & CreateItemInput): Order {
  assertEditable(input.orderId)
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
  assertEditable(item.orderId)
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
  assertEditable(item.orderId)
  transaction(() => {
    dbWrite("UPDATE order_items SET status = 'removed' WHERE id = ?", [itemId])
    recompute(item.orderId)
  })
  return buildOrder(item.orderId)
}

export function setDiscount(input: { orderId: number; discountCents: number; discountReason: string | null }): Order {
  assertEditable(input.orderId)
  transaction(() => {
    /* Typed by hand on purpose, so it replaces whatever offer was on the order. */
    dbWrite('UPDATE orders SET discountCents = ?, discountReason = ?, offerId = NULL, offerDiscountCents = 0 WHERE id = ?', [
      Math.max(0, Math.floor(input.discountCents || 0)),
      input.discountReason ?? null,
      input.orderId
    ])
    recompute(input.orderId)
  })
  return buildOrder(input.orderId)
}

/**
 * Put an offer on the order, or let the program pick the one that saves the
 * customer the most. Passing no offer and `auto: false` takes the offer off.
 */
export function applyOffer(input: { orderId: number; offerId?: number | null; auto?: boolean }): Order {
  assertEditable(input.orderId)
  transaction(() => {
    let offerId: number | null = null
    let discountCents = 0
    let reason: string | null = null

    if (input.offerId) {
      const offer = getOffer(input.offerId)
      const live = isLive(offer)
      if (!live.live) throw new AppError('VALIDATION', `Offer not available: ${live.reason}`)
      discountCents = discountFor(offer, input.orderId)
      if (discountCents <= 0) throw new AppError('VALIDATION', 'This offer does not apply to the order')
      offerId = offer.id
      reason = offer.nameAr
    } else if (input.auto !== false) {
      const best = bestOffer(input.orderId)
      if (best) {
        offerId = best.offer.id
        discountCents = best.discountCents
        reason = best.offer.nameAr
      }
    }

    dbWrite('UPDATE orders SET offerId = ?, offerDiscountCents = ?, discountCents = ?, discountReason = ? WHERE id = ?', [
      offerId,
      discountCents,
      discountCents,
      reason,
      input.orderId
    ])
    recompute(input.orderId)
  })
  writeAudit('orders.offer', 'order', input.orderId, { offerId: input.offerId ?? null })
  return buildOrder(input.orderId)
}

export function setNote(input: { orderId: number; note: string | null }): Order {
  assertOpen(input.orderId)
  dbWrite('UPDATE orders SET note = ?, updatedAt = ? WHERE id = ?', [input.note, nowStamp(), input.orderId])
  return buildOrder(input.orderId)
}

export function setStatus(input: { orderId: number; status: string; note?: string | null }): Order {
  const order = assertOpen(input.orderId)
  /* Finishing and cancelling are not status edits. They seal the sale, take the
     ingredients off the stock, free the table and write the fiscal record, so
     they have their own operations and must not be reachable from here — a
     sale closed this way would never be sealed and would vanish from the
     fiscal chain. */
  if (input.status === 'completed') throw new AppError('VALIDATION', 'Hand the order over instead')
  if (input.status === 'cancelled') throw new AppError('VALIDATION', 'Cancel the order instead')
  logStatus(input.orderId, String(order.status), input.status, input.note ?? null)
  dbWrite('UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?', [input.status, nowStamp(), input.orderId])
  return buildOrder(input.orderId)
}

/**
 * Write a kitchen ticket for every item not yet fired, and move the order to
 * `sent`. Shared by the Send button and by a prepaid order that fires itself
 * the moment the money is in. Returns how many items went out.
 */
function fireItems(orderId: number, order: Record<string, unknown>): number {
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
  if (items.length > 0 && !order.sentAt) {
    dbWrite('UPDATE orders SET sentAt = ? WHERE id = ?', [nowStamp(), orderId])
  }
  if (order.status === 'new' || order.status === 'held') {
    logStatus(orderId, String(order.status), 'sent')
    dbWrite("UPDATE orders SET status = 'sent', isHeld = 0, updatedAt = ? WHERE id = ?", [nowStamp(), orderId])
  }
  return items.length
}

/** Fire the order to the kitchen: a ticket per not-yet-sent item, items -> preparing. */
export function sendToKitchen(orderId: number): Order {
  const order = assertOpen(orderId)
  /* Where the house takes the money first, the kitchen does not start until it
     has. The owner can switch the type to 'flexible' if they want no such rule. */
  if (flowFor(String(order.type)) === 'payFirst' && Number(order.dueCents ?? 0) > 0) {
    throw new AppError('PAYMENT_REQUIRED_FIRST', 'This kind of order is paid before it is prepared')
  }
  if (unsentCount(orderId) === 0) throw new AppError('NOTHING_TO_SEND', 'Every item is already with the kitchen')
  transaction(() => {
    fireItems(orderId, order)
  })
  writeAudit('orders.sendToKitchen', 'order', orderId)
  return buildOrder(orderId)
}

export function holdOrder(orderId: number): Order {
  assertEditable(orderId)
  dbWrite("UPDATE orders SET isHeld = 1, status = 'held', updatedAt = ? WHERE id = ?", [nowStamp(), orderId])
  return buildOrder(orderId)
}

export function resumeOrder(orderId: number): Order {
  assertOpen(orderId)
  dbWrite("UPDATE orders SET isHeld = 0, status = 'new', updatedAt = ? WHERE id = ?", [nowStamp(), orderId])
  return buildOrder(orderId)
}

/**
 * Nothing more is owed. This is the moment the sale becomes real, whether or not
 * the food has left the kitchen: ingredients come off the stock, the offer is
 * counted as used, the customer earns their points, and the sale is sealed into
 * the fiscal chain. It happens once — a second call does nothing.
 */
function markSettled(orderId: number, userId: number | null): void {
  const row = dbGet<{ paidAt: string | null; offerId: number | null }>('SELECT paidAt, offerId FROM orders WHERE id = ?', [
    orderId
  ])
  if (!row || row.paidAt) return
  dbWrite('UPDATE orders SET paidAt = ?, updatedAt = ? WHERE id = ?', [nowStamp(), nowStamp(), orderId])
  /* Recipes consume their ingredients the moment the sale is final. */
  consumeStockForOrder(orderId, userId)
  /* A capped offer really runs out, and the customer gets their points. */
  markOfferUsed(row.offerId)
  earnForOrder(orderId, userId)
  /* Seal the sale: sequential fiscal number + chained hash. */
  sealOrder(orderId)
}

/** Hand the order over and close it: everything outstanding counts as served. */
function closeOut(orderId: number, order: Record<string, unknown>): void {
  logStatus(orderId, String(order.status), 'completed')
  dbWrite("UPDATE orders SET status = 'completed', completedAt = ?, updatedAt = ? WHERE id = ?", [
    nowStamp(),
    nowStamp(),
    orderId
  ])
  dbWrite(
    "UPDATE order_items SET status = 'served' WHERE orderId = ? AND status IN ('active','pending','preparing','ready')",
    [orderId]
  )
  setTableStatus((order as { tableId: number | null }).tableId, 'free')
}

/**
 * Does paying also finish this order?
 *  - payLast  yes. The guest ate and is settling the bill; this is the last act,
 *             and it stays a single tap for a house that works that way.
 *  - payFirst no. The money comes in before anything is cooked.
 *  - flexible only if the kitchen has already had everything — otherwise there
 *             is food still to make and the order has to stay open.
 * The caller can always say outright with `closeNow`.
 */
function closesOnPayment(orderId: number, type: string, closeNow: boolean | undefined): boolean {
  if (closeNow !== undefined) return closeNow
  const flow = flowFor(type)
  if (flow === 'payFirst') return false
  if (flow === 'flexible') return unsentCount(orderId) === 0
  return true
}

export function payOrder(input: {
  orderId: number
  payments: { method: string; amountCents: number; reference?: string | null }[]
  /** Force the decision instead of letting the order type's flow make it. */
  closeNow?: boolean
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
      if (p.method === 'cash') postCashMovement({ type: 'sale', amountCents: Math.floor(p.amountCents), refType: 'order', refId: input.orderId, userId: session.userId })
    }
    /* Stamp duty applies to the cash part of the sale itself (never to the stamp already owed);
       recompute then folds it into the total as its own line. */
    const cashCents =
      dbGet<{ total: number }>("SELECT COALESCE(SUM(amountCents), 0) AS total FROM order_payments WHERE orderId = ? AND method = 'cash'", [
        input.orderId
      ])?.total ?? 0
    const money = dbGet<{ totalCents: number; stampCents: number }>('SELECT totalCents, stampCents FROM orders WHERE id = ?', [input.orderId])
    const saleCents = Math.max(0, (money?.totalCents ?? 0) - (money?.stampCents ?? 0))
    dbWrite('UPDATE orders SET stampCents = ? WHERE id = ?', [computeStamp(Math.min(cashCents, saleCents)), input.orderId])
    recompute(input.orderId)
    const paidCents =
      dbGet<{ total: number }>('SELECT COALESCE(SUM(amountCents), 0) AS total FROM order_payments WHERE orderId = ?', [
        input.orderId
      ])?.total ?? 0
    const totalCents = dbGet<{ totalCents: number }>('SELECT totalCents FROM orders WHERE id = ?', [input.orderId])?.totalCents ?? 0
    dbWrite('UPDATE orders SET paidCents = ?, dueCents = ?, updatedAt = ? WHERE id = ?', [
      paidCents,
      Math.max(0, totalCents - paidCents),
      nowStamp(),
      input.orderId
    ])
    if (paidCents < totalCents) return

    markSettled(input.orderId, session.userId)
    if (closesOnPayment(input.orderId, String(order.type), input.closeNow)) {
      closeOut(input.orderId, order)
      return
    }
    /* Paid and still to be made. Unless the house would rather press Send
       itself, the kitchen gets it now — that is the whole point of paying up
       front, and nobody should have to remember a second button. */
    if (getSettings().autoSendOnPrepay && unsentCount(input.orderId) > 0) {
      fireItems(input.orderId, dbGet<Record<string, unknown>>('SELECT * FROM orders WHERE id = ?', [input.orderId]) ?? order)
    }
  })
  writeAudit('orders.pay', 'order', input.orderId)
  return buildOrder(input.orderId)
}

/**
 * Hand over a paid order and close it. This is the end of a pay-first sale: the
 * money came in earlier, the kitchen has finished, and the guest now has the
 * food. The kitchen screen calls it on its own when the last item is served.
 */
export function completeOrder(orderId: number): Order {
  const order = assertOpen(orderId)
  const session = requireSession()
  if (Number(order.dueCents ?? 0) > 0) {
    throw new AppError('PAYMENT_REQUIRED', 'The order still owes money')
  }
  const itemCount =
    dbGet<{ n: number }>("SELECT COUNT(*) AS n FROM order_items WHERE orderId = ? AND status != 'removed'", [orderId])?.n ?? 0
  if (itemCount === 0) throw new AppError('VALIDATION', 'The order is empty')
  transaction(() => {
    /* A giveaway owes nothing and was never "paid", but it is still a sale and
       still has to be sealed and taken off the stock. */
    markSettled(orderId, session.userId)
    closeOut(orderId, order)
  })
  writeAudit('orders.complete', 'order', orderId)
  return buildOrder(orderId)
}

export function cancelOrder(input: { orderId: number; reason: string; stockPolicy?: string | null }): Order {
  const order = assertOpen(input.orderId)
  /* A settled sale is sealed into the fiscal chain and can never be made to
     disappear. Before, this was true only by accident: paying closed the order,
     so cancelling it was already impossible. A prepaid order stays open, so the
     rule has to be stated. Giving the money back is a refund — its own
     document — not the un-happening of a sale. */
  if (order.paidAt) throw new AppError('ORDER_SETTLED', 'A paid sale cannot be cancelled; refund it instead')
  /* Part-payment on an order that is being abandoned: the cash was taken and
     has to go back out, or the drawer will not add up at closing time. */
  const refundCents =
    dbGet<{ total: number }>(
      "SELECT COALESCE(SUM(amountCents), 0) AS total FROM order_payments WHERE orderId = ? AND method = 'cash'",
      [input.orderId]
    )?.total ?? 0
  transaction(() => {
    logStatus(input.orderId, String(order.status), 'cancelled', input.reason)
    dbWrite("UPDATE orders SET status = 'cancelled', cancelledAt = ?, cancelReason = ?, updatedAt = ? WHERE id = ?", [
      nowStamp(),
      input.reason,
      nowStamp(),
      input.orderId
    ])
    setTableStatus((order as { tableId: number | null }).tableId, 'free')
    if (input.stockPolicy === 'restore') restoreStockForOrder(input.orderId, currentUserId())
    releaseOfferUse((order as { offerId: number | null }).offerId)
    reverseForOrder(input.orderId, currentUserId())
    if (refundCents > 0) {
      postCashMovement({
        type: 'refund',
        amountCents: refundCents,
        refType: 'order',
        refId: input.orderId,
        note: input.reason,
        userId: currentUserId()
      })
    }
  })
  writeAudit('orders.cancel', 'order', input.orderId, {
    reason: input.reason,
    stockPolicy: input.stockPolicy ?? null,
    refundCents
  })
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
  assertEditable(input.fromOrderId)
  assertEditable(input.toOrderId)
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

export function listOrders(input: { status?: string | null; limit?: number; branchId?: number | null } = {}): OrderSummary[] {
  const clauses: string[] = []
  const params: (string | number)[] = []
  /* A branch only ever sees its own orders, whatever it asks for. */
  const branch = resolveBranchFilter(input.branchId)
  if (branch !== null) {
    clauses.push('o.branchId = ?')
    params.push(branch)
  }
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
            u.fullName AS waiterName, o.totalCents, o.paidCents, o.dueCents, o.isHeld, o.createdAt,
            o.paidAt, o.sentAt, o.scheduledFor,
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
