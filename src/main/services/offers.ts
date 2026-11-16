/**
 * Offers: the rules a restaurant already runs on paper — a lunch price, a family
 * pack, a happy hour — written down so the money comes off for a reason the
 * owner can audit, instead of a manual discount whose reason is lost.
 *
 * An order carries **at most one** offer. Stacked rules cannot be reasoned about
 * by a cashier under pressure, nor audited afterwards.
 */
import type { Offer, OfferItem, OfferKind, OfferOffer, OfferScope } from '@shared/types'
import { dbAll, dbGet, dbWrite, transaction } from '../db/client'
import { AppError } from '../utils/errors'
import { nowStamp, today } from '../utils/dates'
import { writeAudit } from './audit'

const KINDS: OfferKind[] = ['percent', 'amount', 'combo', 'freeItem']
const SCOPES: OfferScope[] = ['order', 'category', 'product']

const SELECT = `
  SELECT o.id, o.nameAr, o.nameFr, o.kind, o.scope, o.targetId, o.valueBp, o.valueCents,
         o.minSubtotalCents, o.comboPriceCents, o.freeQty, o.startsOn, o.endsOn, o.daysMask,
         o.startTime, o.endTime, o.usageLimit, o.usedCount, o.isActive, o.createdAt,
         CASE o.scope WHEN 'category' THEN c.nameAr WHEN 'product' THEN p.nameAr END AS targetNameAr,
         CASE o.scope WHEN 'category' THEN c.nameFr WHEN 'product' THEN p.nameFr END AS targetNameFr
    FROM offers o
    LEFT JOIN categories c ON o.scope = 'category' AND c.id = o.targetId
    LEFT JOIN products p ON o.scope = 'product' AND p.id = o.targetId`

function items(offerId: number): OfferItem[] {
  return dbAll<OfferItem>(
    `SELECT oi.productId, p.nameAr, p.nameFr, oi.qty
       FROM offer_items oi JOIN products p ON p.id = oi.productId
      WHERE oi.offerId = ? ORDER BY oi.id`,
    [offerId]
  )
}

const hydrate = (row: Offer & { isActive: number | boolean }): Offer => ({
  ...row,
  isActive: Boolean(row.isActive),
  items: items(row.id)
})

export function getOffer(id: number): Offer {
  const row = dbGet<Offer & { isActive: number }>(`${SELECT} WHERE o.id = ?`, [id])
  if (!row) throw new AppError('NOT_FOUND')
  return hydrate(row)
}

export function listOffers(includeInactive = true): Offer[] {
  return dbAll<Offer & { isActive: number }>(
    `${SELECT} ${includeInactive ? '' : 'WHERE o.isActive = 1'} ORDER BY o.isActive DESC, o.id DESC`
  ).map(hydrate)
}

export interface SaveOfferInput {
  id?: number
  nameAr: string
  nameFr?: string
  kind: OfferKind
  scope?: OfferScope
  targetId?: number | null
  valueBp?: number
  valueCents?: number
  minSubtotalCents?: number
  comboPriceCents?: number
  freeQty?: number
  startsOn?: string | null
  endsOn?: string | null
  daysMask?: number
  startTime?: string | null
  endTime?: string | null
  usageLimit?: number
  isActive?: boolean
  items?: { productId: number; qty?: number }[]
}

export function saveOffer(input: SaveOfferInput): Offer {
  const nameAr = input.nameAr.trim()
  const nameFr = (input.nameFr ?? '').trim() || nameAr
  if (!nameAr) throw new AppError('VALIDATION', 'An offer needs a name')
  if (!KINDS.includes(input.kind)) throw new AppError('VALIDATION', 'Unknown offer kind')
  const scope = input.scope ?? 'order'
  if (!SCOPES.includes(scope)) throw new AppError('VALIDATION', 'Unknown offer scope')
  if (scope !== 'order' && !input.targetId) throw new AppError('VALIDATION', 'Choose what the offer applies to')
  if (input.kind === 'percent' && !(input.valueBp && input.valueBp > 0)) throw new AppError('VALIDATION', 'Set a percentage')
  if (input.kind === 'amount' && !(input.valueCents && input.valueCents > 0)) throw new AppError('VALIDATION', 'Set an amount')
  if (input.kind === 'combo' && !(input.items && input.items.length > 0)) throw new AppError('VALIDATION', 'A pack needs its dishes')
  if (input.kind === 'freeItem' && !(input.freeQty && input.freeQty > 0)) throw new AppError('VALIDATION', 'Set how many are free')

  const values = [
    nameAr,
    nameFr,
    input.kind,
    scope,
    scope === 'order' ? null : (input.targetId ?? null),
    Math.max(0, Math.min(10_000, input.valueBp ?? 0)),
    Math.max(0, input.valueCents ?? 0),
    Math.max(0, input.minSubtotalCents ?? 0),
    Math.max(0, input.comboPriceCents ?? 0),
    Math.max(0, input.freeQty ?? 0),
    input.startsOn ?? null,
    input.endsOn ?? null,
    input.daysMask ?? 127,
    input.startTime ?? null,
    input.endTime ?? null,
    Math.max(0, input.usageLimit ?? 0),
    input.isActive === false ? 0 : 1
  ]

  let id = input.id ?? 0
  transaction(() => {
    if (input.id) {
      const result = dbWrite(
        `UPDATE offers SET nameAr = ?, nameFr = ?, kind = ?, scope = ?, targetId = ?, valueBp = ?, valueCents = ?,
           minSubtotalCents = ?, comboPriceCents = ?, freeQty = ?, startsOn = ?, endsOn = ?, daysMask = ?,
           startTime = ?, endTime = ?, usageLimit = ?, isActive = ? WHERE id = ?`,
        [...values, input.id]
      )
      if (result.changes === 0) throw new AppError('NOT_FOUND')
    } else {
      id = Number(
        dbWrite(
          `INSERT INTO offers (nameAr, nameFr, kind, scope, targetId, valueBp, valueCents, minSubtotalCents,
             comboPriceCents, freeQty, startsOn, endsOn, daysMask, startTime, endTime, usageLimit, isActive, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [...values, nowStamp()]
        ).lastInsertRowid
      )
    }
    if (input.items) {
      dbWrite('DELETE FROM offer_items WHERE offerId = ?', [id])
      const merged = new Map<number, number>()
      for (const item of input.items) merged.set(item.productId, (merged.get(item.productId) ?? 0) + Math.max(1, item.qty ?? 1))
      for (const [productId, qty] of merged) {
        if (!dbGet('SELECT id FROM products WHERE id = ?', [productId])) throw new AppError('NOT_FOUND', `Product ${productId}`)
        dbWrite('INSERT INTO offer_items (offerId, productId, qty) VALUES (?, ?, ?)', [id, productId, qty])
      }
    }
  })
  writeAudit(input.id ? 'offers.update' : 'offers.create', 'offer', id, { name: nameAr, kind: input.kind })
  return getOffer(id)
}

export function setOfferActive(id: number, active: boolean): Offer {
  const result = dbWrite('UPDATE offers SET isActive = ? WHERE id = ?', [active ? 1 : 0, id])
  if (result.changes === 0) throw new AppError('NOT_FOUND')
  writeAudit(active ? 'offers.activate' : 'offers.deactivate', 'offer', id)
  return getOffer(id)
}

export function removeOffer(id: number): { removed: boolean } {
  const used = dbGet<{ n: number }>('SELECT COUNT(*) AS n FROM orders WHERE offerId = ?', [id])?.n ?? 0
  if (used > 0) {
    dbWrite('UPDATE offers SET isActive = 0 WHERE id = ?', [id])
    writeAudit('offers.deactivate', 'offer', id, { reason: 'already used' })
    return { removed: false }
  }
  const result = dbWrite('DELETE FROM offers WHERE id = ?', [id])
  if (result.changes === 0) throw new AppError('NOT_FOUND')
  writeAudit('offers.delete', 'offer', id)
  return { removed: true }
}

/* ---------------- Matching an offer against an order ---------------- */

interface Line {
  productId: number
  categoryId: number | null
  qty: number
  lineTotalCents: number
}

const lines = (orderId: number): Line[] =>
  dbAll<Line>(
    `SELECT oi.productId, p.categoryId, oi.qty, oi.lineTotalCents
       FROM order_items oi LEFT JOIN products p ON p.id = oi.productId
      WHERE oi.orderId = ? AND oi.status != 'removed'`,
    [orderId]
  )

const inScope = (offer: Offer, line: Line): boolean => {
  if (offer.scope === 'order') return true
  if (offer.scope === 'category') return line.categoryId === offer.targetId
  return line.productId === offer.targetId
}

/** Is the rule live right now: active, in its dates, its weekday and its hours? */
export function isLive(offer: Offer, at: Date = new Date()): { live: boolean; reason: string | null } {
  if (!offer.isActive) return { live: false, reason: 'inactive' }
  if (offer.usageLimit > 0 && offer.usedCount >= offer.usageLimit) return { live: false, reason: 'usedUp' }
  const day = today(at)
  if (offer.startsOn && day < offer.startsOn) return { live: false, reason: 'notStarted' }
  if (offer.endsOn && day > offer.endsOn) return { live: false, reason: 'ended' }
  /* Sunday = bit 1, Monday = 2 … Saturday = 64. */
  const bit = 1 << at.getDay()
  if ((offer.daysMask & bit) === 0) return { live: false, reason: 'otherDay' }
  if (offer.startTime && offer.endTime) {
    const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    const within =
      offer.startTime <= offer.endTime
        ? clock >= offer.startTime && clock <= offer.endTime
        : /* an hour window that crosses midnight */ clock >= offer.startTime || clock <= offer.endTime
    if (!within) return { live: false, reason: 'otherHour' }
  }
  return { live: true, reason: null }
}

/** What the rule would take off this order, in centimes. 0 means it does not bite. */
export function discountFor(offer: Offer, orderId: number): number {
  const all = lines(orderId)
  const matching = all.filter((line) => inScope(offer, line))
  if (matching.length === 0) return 0
  const matchingTotal = matching.reduce((sum, line) => sum + line.lineTotalCents, 0)
  const orderTotal = all.reduce((sum, line) => sum + line.lineTotalCents, 0)
  if (offer.minSubtotalCents > 0 && orderTotal < offer.minSubtotalCents) return 0

  if (offer.kind === 'percent') return Math.min(matchingTotal, Math.round((matchingTotal * offer.valueBp) / 10_000))
  if (offer.kind === 'amount') return Math.min(matchingTotal, offer.valueCents)

  if (offer.kind === 'freeItem') {
    /* The cheapest units among the matching lines are the free ones. */
    const units: number[] = []
    for (const line of matching) {
      const unit = Math.round(line.lineTotalCents / Math.max(1, line.qty))
      for (let i = 0; i < line.qty; i += 1) units.push(unit)
    }
    units.sort((a, b) => a - b)
    return units.slice(0, Math.min(offer.freeQty, units.length)).reduce((sum, unit) => sum + unit, 0)
  }

  /* combo: every dish of the set must be on the order; the set is then sold at
     the pack price, as many times as the order can form it. */
  if (offer.items.length === 0) return 0
  const have = new Map<number, { qty: number; unit: number }>()
  for (const line of all) {
    const unit = Math.round(line.lineTotalCents / Math.max(1, line.qty))
    const seen = have.get(line.productId)
    have.set(line.productId, { qty: (seen?.qty ?? 0) + line.qty, unit: seen?.unit ?? unit })
  }
  let sets = Infinity
  let setValue = 0
  for (const needed of offer.items) {
    const owned = have.get(needed.productId)
    if (!owned) return 0
    sets = Math.min(sets, Math.floor(owned.qty / needed.qty))
    setValue += owned.unit * needed.qty
  }
  if (!Number.isFinite(sets) || sets < 1) return 0
  const saving = (setValue - offer.comboPriceCents) * sets
  return Math.max(0, Math.min(orderTotal, saving))
}

/** Every offer measured against the order, best saving first. */
export function offersFor(orderId: number, at: Date = new Date()): OfferOffer[] {
  return listOffers(true)
    .map((offer) => {
      const live = isLive(offer, at)
      const discountCents = live.live ? discountFor(offer, orderId) : 0
      return {
        offer,
        discountCents,
        eligible: live.live && discountCents > 0,
        reason: live.reason ?? (discountCents === 0 ? 'noMatch' : null)
      }
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.discountCents - a.discountCents)
}

/** The offer that saves the customer the most, or nothing when none bites. */
export function bestOffer(orderId: number, at: Date = new Date()): OfferOffer | null {
  const best = offersFor(orderId, at).find((entry) => entry.eligible)
  return best ?? null
}

/** Count a use once the sale is final, so a capped offer really runs out. */
export function markOfferUsed(offerId: number | null | undefined): void {
  if (!offerId) return
  dbWrite('UPDATE offers SET usedCount = usedCount + 1 WHERE id = ?', [offerId])
}

export function releaseOfferUse(offerId: number | null | undefined): void {
  if (!offerId) return
  dbWrite('UPDATE offers SET usedCount = MAX(0, usedCount - 1) WHERE id = ?', [offerId])
}
