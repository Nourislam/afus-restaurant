/**
 * Loyalty: three numbers the owner sets, and a ledger that explains every point.
 * `customers.loyaltyPoints` is only a cache of this ledger, so a balance can
 * always be justified to a customer standing at the counter.
 */
import type { LoyaltyMovement, LoyaltyRules } from '@shared/types'
import { dbAll, dbGet, dbWrite, transaction } from '../db/client'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { currentUserId } from '../security/session'
import { writeAudit } from './audit'
import { getSettings } from './settings'

export function loyaltyRules(): LoyaltyRules {
  const settings = getSettings()
  return {
    enabled: settings.loyaltyEnabled,
    earnPer100: settings.loyaltyEarnPer100,
    pointValueCents: settings.loyaltyPointValueCents,
    minRedeem: settings.loyaltyMinRedeem
  }
}

const SELECT = `
  SELECT m.id, m.customerId, m.orderId, o.orderNumber, m.kind, m.points, m.note,
         u.fullName AS userName, m.createdAt
    FROM loyalty_movements m
    LEFT JOIN orders o ON o.id = m.orderId
    LEFT JOIN users u ON u.id = m.userId`

export function movements(customerId: number, limit = 100): LoyaltyMovement[] {
  return dbAll<LoyaltyMovement>(`${SELECT} WHERE m.customerId = ? ORDER BY m.id DESC LIMIT ?`, [
    customerId,
    Math.min(500, limit)
  ])
}

/** The balance the ledger says, which is what `customers.loyaltyPoints` caches. */
export function balance(customerId: number): number {
  return dbGet<{ total: number | null }>('SELECT SUM(points) AS total FROM loyalty_movements WHERE customerId = ?', [customerId])?.total ?? 0
}

function post(input: {
  customerId: number
  orderId?: number | null
  kind: 'earn' | 'redeem' | 'adjust'
  points: number
  note?: string | null
  userId?: number | null
}): void {
  if (input.points === 0) return
  dbWrite(
    'INSERT INTO loyalty_movements (customerId, orderId, kind, points, note, userId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      input.customerId,
      input.orderId ?? null,
      input.kind,
      Math.round(input.points),
      input.note ?? null,
      input.userId === undefined ? currentUserId() : input.userId,
      nowStamp()
    ]
  )
  dbWrite('UPDATE customers SET loyaltyPoints = ? WHERE id = ?', [balance(input.customerId), input.customerId])
}

/** Points for a finished sale. Runs once: a sale that already earned is skipped. */
export function earnForOrder(orderId: number, userId: number | null): number {
  const rules = loyaltyRules()
  if (!rules.enabled || rules.earnPer100 <= 0) return 0
  const order = dbGet<{ customerId: number | null; totalCents: number; loyaltyPointsEarned: number; loyaltyDiscountCents: number }>(
    'SELECT customerId, totalCents, loyaltyPointsEarned, loyaltyDiscountCents FROM orders WHERE id = ?',
    [orderId]
  )
  if (!order?.customerId || order.loyaltyPointsEarned > 0) return 0
  /* Points are earned on money actually spent, not on what points already paid. */
  const spent = Math.max(0, order.totalCents - order.loyaltyDiscountCents)
  const points = Math.floor((spent / 10_000) * rules.earnPer100)
  if (points <= 0) return 0
  post({ customerId: order.customerId, orderId, kind: 'earn', points, userId })
  dbWrite('UPDATE orders SET loyaltyPointsEarned = ? WHERE id = ?', [points, orderId])
  return points
}

/** Give back what a cancelled sale had earned, and return any points it spent. */
export function reverseForOrder(orderId: number, userId: number | null): void {
  const order = dbGet<{ customerId: number | null; loyaltyPointsEarned: number; loyaltyPointsRedeemed: number }>(
    'SELECT customerId, loyaltyPointsEarned, loyaltyPointsRedeemed FROM orders WHERE id = ?',
    [orderId]
  )
  if (!order?.customerId) return
  if (order.loyaltyPointsEarned > 0) {
    post({ customerId: order.customerId, orderId, kind: 'adjust', points: -order.loyaltyPointsEarned, note: 'cancelled', userId })
    dbWrite('UPDATE orders SET loyaltyPointsEarned = 0 WHERE id = ?', [orderId])
  }
  if (order.loyaltyPointsRedeemed > 0) {
    post({ customerId: order.customerId, orderId, kind: 'adjust', points: order.loyaltyPointsRedeemed, note: 'cancelled', userId })
    dbWrite('UPDATE orders SET loyaltyPointsRedeemed = 0, loyaltyDiscountCents = 0 WHERE id = ?', [orderId])
  }
}

/** A manual correction by the owner, always with a reason. */
export function adjust(customerId: number, points: number, note?: string | null): number {
  if (!dbGet('SELECT id FROM customers WHERE id = ?', [customerId])) throw new AppError('NOT_FOUND')
  if (points === 0) throw new AppError('VALIDATION', 'Nothing to adjust')
  if (balance(customerId) + points < 0) throw new AppError('VALIDATION', 'That would leave a negative balance')
  post({ customerId, kind: 'adjust', points, note: note ?? null })
  writeAudit('loyalty.adjust', 'customer', customerId, { points, note: note ?? null })
  return balance(customerId)
}

export interface RedeemResult {
  points: number
  discountCents: number
  balance: number
}

/**
 * Turn points into money off, before payment. Capped three ways: the customer's
 * balance, the order's own total, and the owner's minimum.
 */
export function redeem(orderId: number, points: number): RedeemResult {
  const rules = loyaltyRules()
  if (!rules.enabled) throw new AppError('VALIDATION', 'Loyalty is off')
  if (rules.pointValueCents <= 0) throw new AppError('VALIDATION', 'A point is worth nothing yet')
  const order = dbGet<{ customerId: number | null; status: string; subtotalCents: number; discountCents: number; loyaltyPointsRedeemed: number }>(
    'SELECT customerId, status, subtotalCents, discountCents, loyaltyPointsRedeemed FROM orders WHERE id = ?',
    [orderId]
  )
  if (!order) throw new AppError('NOT_FOUND')
  if (!order.customerId) throw new AppError('VALIDATION', 'Attach the customer first')
  if (['completed', 'cancelled'].includes(order.status)) throw new AppError('INVALID_STATUS')
  const wanted = Math.floor(points)
  if (wanted <= 0) throw new AppError('VALIDATION', 'Choose how many points')
  if (wanted < rules.minRedeem) throw new AppError('VALIDATION', `Minimum ${rules.minRedeem} points`)
  const available = balance(order.customerId) + order.loyaltyPointsRedeemed
  if (wanted > available) throw new AppError('VALIDATION', 'Not enough points')

  /* Never take off more than what is left to pay for the dishes themselves. */
  const payable = Math.max(0, order.subtotalCents - order.discountCents)
  const asked = wanted * rules.pointValueCents
  const discountCents = Math.min(asked, payable)
  const spent = Math.ceil(discountCents / rules.pointValueCents)

  let result: RedeemResult = { points: spent, discountCents, balance: 0 }
  transaction(() => {
    if (order.loyaltyPointsRedeemed > 0) {
      post({ customerId: order.customerId!, orderId, kind: 'adjust', points: order.loyaltyPointsRedeemed, note: 'changed' })
    }
    post({ customerId: order.customerId!, orderId, kind: 'redeem', points: -spent })
    dbWrite('UPDATE orders SET loyaltyPointsRedeemed = ?, loyaltyDiscountCents = ? WHERE id = ?', [spent, discountCents, orderId])
    result = { points: spent, discountCents, balance: balance(order.customerId!) }
  })
  writeAudit('loyalty.redeem', 'order', orderId, { points: spent, discountCents })
  return result
}

/** Undo a redemption while the order is still open. */
export function cancelRedeem(orderId: number): RedeemResult {
  const order = dbGet<{ customerId: number | null; loyaltyPointsRedeemed: number }>(
    'SELECT customerId, loyaltyPointsRedeemed FROM orders WHERE id = ?',
    [orderId]
  )
  if (!order) throw new AppError('NOT_FOUND')
  if (order.customerId && order.loyaltyPointsRedeemed > 0) {
    post({ customerId: order.customerId, orderId, kind: 'adjust', points: order.loyaltyPointsRedeemed, note: 'cancelled' })
  }
  dbWrite('UPDATE orders SET loyaltyPointsRedeemed = 0, loyaltyDiscountCents = 0 WHERE id = ?', [orderId])
  return { points: 0, discountCents: 0, balance: order.customerId ? balance(order.customerId) : 0 }
}
