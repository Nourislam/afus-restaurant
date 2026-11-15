/** Suppliers, purchase invoices (draft → received → paid) and supplier payments. */
import type { Purchase, PurchaseItem, Supplier, SupplierPayment } from '@shared/types'
import { dbAll, dbGet, dbWrite, transaction } from '../db/client'
import { AppError } from '../utils/errors'
import { nowStamp, today } from '../utils/dates'
import { requireSession } from '../security/session'
import { writeAudit } from './audit'
import { recordMovement } from './inventory'
import { postCashMovement } from './finance'
import { costToMicros, fromBase, microsToUnitCents, toBase, unitFactor } from './units'

/* ---------------- Suppliers ---------------- */

const SUPPLIER_SELECT = `
  SELECT s.id, s.name, s.phone, s.address, s.notes, s.isArchived, s.createdAt,
         COALESCE((SELECT SUM(p.totalCents) FROM purchases p WHERE p.supplierId = s.id AND p.status IN ('received','paid')), 0) AS totalPurchasesCents,
         COALESCE((SELECT SUM(sp.amountCents) FROM supplier_payments sp WHERE sp.supplierId = s.id), 0) AS totalPaidCents
    FROM suppliers s`

function mapSupplier(row: Supplier & { isArchived: number | boolean }): Supplier {
  return { ...row, isArchived: Boolean(row.isArchived), balanceCents: row.totalPurchasesCents - row.totalPaidCents }
}

export function listSuppliers(includeArchived = false): Supplier[] {
  return dbAll<Supplier & { isArchived: number }>(`${SUPPLIER_SELECT} ${includeArchived ? '' : 'WHERE s.isArchived = 0'} ORDER BY s.name COLLATE NOCASE`).map(mapSupplier)
}

export function getSupplier(id: number): Supplier {
  const row = dbGet<Supplier & { isArchived: number }>(`${SUPPLIER_SELECT} WHERE s.id = ?`, [id])
  if (!row) throw new AppError('NOT_FOUND')
  const supplier = mapSupplier(row)
  supplier.purchases = listPurchases({ supplierId: id, limit: 200 })
  supplier.payments = listSupplierPayments(id)
  return supplier
}

export function saveSupplier(input: { id?: number; name: string; phone?: string | null; address?: string | null; notes?: string | null }): Supplier {
  const name = input.name.trim()
  if (!name) throw new AppError('VALIDATION', 'Supplier name is required')
  if (input.id) {
    const result = dbWrite('UPDATE suppliers SET name = ?, phone = ?, address = ?, notes = ? WHERE id = ?', [name, input.phone ?? null, input.address ?? null, input.notes ?? null, input.id])
    if (result.changes === 0) throw new AppError('NOT_FOUND')
    writeAudit('suppliers.update', 'supplier', input.id)
    return getSupplier(input.id)
  }
  const id = Number(dbWrite('INSERT INTO suppliers (name, phone, address, notes, createdAt) VALUES (?, ?, ?, ?, ?)', [name, input.phone ?? null, input.address ?? null, input.notes ?? null, nowStamp()]).lastInsertRowid)
  writeAudit('suppliers.create', 'supplier', id)
  return getSupplier(id)
}

export function archiveSupplier(id: number, archived = true): Supplier {
  const result = dbWrite('UPDATE suppliers SET isArchived = ? WHERE id = ?', [archived ? 1 : 0, id])
  if (result.changes === 0) throw new AppError('NOT_FOUND')
  writeAudit(archived ? 'suppliers.archive' : 'suppliers.restore', 'supplier', id)
  return getSupplier(id)
}

/* ---------------- Purchases ---------------- */

interface PurchaseRow extends Omit<Purchase, 'items'> {}

const PURCHASE_SELECT = `
  SELECT p.id, p.supplierId, s.name AS supplierName, p.invoiceNo, p.purchaseDate, p.subtotalCents, p.discountCents, p.extraCents,
         p.totalCents, p.paidCents, p.status, p.note, u.fullName AS userName, p.createdAt, p.receivedAt
    FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplierId LEFT JOIN users u ON u.id = p.userId`

function purchaseItems(purchaseId: number): PurchaseItem[] {
  return dbAll<PurchaseItem & { baseUnit: string; unitCostMicros: number }>(
    `SELECT pi.id, pi.purchaseId, pi.ingredientId, i.nameAr AS ingredientNameAr, i.nameFr AS ingredientNameFr, i.unit, i.baseUnit,
            pi.qtyBase, pi.unitCostMicros, pi.lineTotalCents
       FROM purchase_items pi JOIN ingredients i ON i.id = pi.ingredientId WHERE pi.purchaseId = ? ORDER BY pi.id`,
    [purchaseId]
  ).map((row) => {
    const factor = unitFactor(row.unit, row.baseUnit)
    return {
      id: row.id,
      purchaseId: row.purchaseId,
      ingredientId: row.ingredientId,
      ingredientNameAr: row.ingredientNameAr,
      ingredientNameFr: row.ingredientNameFr,
      unit: row.unit,
      qtyBase: row.qtyBase,
      qty: fromBase(row.qtyBase, factor),
      unitCostCents: microsToUnitCents(row.unitCostMicros, factor),
      lineTotalCents: row.lineTotalCents
    }
  })
}

export function getPurchase(id: number): Purchase {
  const row = dbGet<PurchaseRow>(`${PURCHASE_SELECT} WHERE p.id = ?`, [id])
  if (!row) throw new AppError('NOT_FOUND')
  return { ...row, items: purchaseItems(id) }
}

export function listPurchases(input: { supplierId?: number | null; status?: string | null; from?: string | null; to?: string | null; limit?: number } = {}): Purchase[] {
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (input.supplierId) {
    clauses.push('p.supplierId = ?')
    params.push(input.supplierId)
  }
  if (input.status) {
    clauses.push('p.status = ?')
    params.push(input.status)
  }
  if (input.from) {
    clauses.push('p.purchaseDate >= ?')
    params.push(input.from)
  }
  if (input.to) {
    clauses.push('p.purchaseDate <= ?')
    params.push(input.to)
  }
  params.push(Math.min(1000, input.limit ?? 300))
  return dbAll<PurchaseRow>(`${PURCHASE_SELECT} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY p.purchaseDate DESC, p.id DESC LIMIT ?`, params).map((row) => ({
    ...row,
    items: purchaseItems(row.id)
  }))
}

export interface SavePurchaseInput {
  id?: number
  supplierId: number
  invoiceNo?: string | null
  purchaseDate?: string | null
  discountCents?: number
  extraCents?: number
  note?: string | null
  items: { ingredientId: number; qty: number; unitCostCents: number }[]
}

export function savePurchase(input: SavePurchaseInput): Purchase {
  if (!input.items.length) throw new AppError('VALIDATION', 'An invoice needs at least one line')
  if (!dbGet('SELECT id FROM suppliers WHERE id = ?', [input.supplierId])) throw new AppError('NOT_FOUND', 'Supplier')
  const session = requireSession()
  let id = input.id ?? 0
  transaction(() => {
    if (input.id) {
      const existing = dbGet<{ status: string }>('SELECT status FROM purchases WHERE id = ?', [input.id])
      if (!existing) throw new AppError('NOT_FOUND')
      if (existing.status !== 'draft') throw new AppError('INVALID_STATUS', 'Only drafts can be edited')
      dbWrite('UPDATE purchases SET supplierId = ?, invoiceNo = ?, purchaseDate = ?, discountCents = ?, extraCents = ?, note = ? WHERE id = ?', [
        input.supplierId,
        input.invoiceNo ?? null,
        input.purchaseDate ?? today(),
        Math.max(0, input.discountCents ?? 0),
        Math.max(0, input.extraCents ?? 0),
        input.note ?? null,
        input.id
      ])
      dbWrite('DELETE FROM purchase_items WHERE purchaseId = ?', [input.id])
    } else {
      id = Number(
        dbWrite(
          "INSERT INTO purchases (supplierId, invoiceNo, purchaseDate, discountCents, extraCents, status, note, userId, createdAt) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)",
          [input.supplierId, input.invoiceNo ?? null, input.purchaseDate ?? today(), Math.max(0, input.discountCents ?? 0), Math.max(0, input.extraCents ?? 0), input.note ?? null, session.userId, nowStamp()]
        ).lastInsertRowid
      )
    }
    let subtotal = 0
    for (const line of input.items) {
      const ingredient = dbGet<{ unit: string; baseUnit: string }>('SELECT unit, baseUnit FROM ingredients WHERE id = ?', [line.ingredientId])
      if (!ingredient) throw new AppError('NOT_FOUND', `Ingredient ${line.ingredientId}`)
      if (line.qty <= 0) throw new AppError('VALIDATION', 'Quantity must be positive')
      const factor = unitFactor(ingredient.unit, ingredient.baseUnit)
      const lineTotal = Math.round(line.qty * Math.max(0, line.unitCostCents))
      subtotal += lineTotal
      dbWrite('INSERT INTO purchase_items (purchaseId, ingredientId, qtyBase, unitCostMicros, lineTotalCents) VALUES (?, ?, ?, ?, ?)', [
        id,
        line.ingredientId,
        toBase(line.qty, factor),
        costToMicros(Math.max(0, line.unitCostCents), factor),
        lineTotal
      ])
    }
    const total = Math.max(0, subtotal - Math.max(0, input.discountCents ?? 0) + Math.max(0, input.extraCents ?? 0))
    dbWrite('UPDATE purchases SET subtotalCents = ?, totalCents = ? WHERE id = ?', [subtotal, total, id])
  })
  writeAudit(input.id ? 'purchases.update' : 'purchases.create', 'purchase', id)
  return getPurchase(id)
}

/** Receive the goods: stock in at the invoice cost; the ingredient cost becomes a weighted average. */
export function receivePurchase(id: number): Purchase {
  const purchase = getPurchase(id)
  if (purchase.status !== 'draft') throw new AppError('INVALID_STATUS', 'Only drafts can be received')
  transaction(() => {
    for (const item of purchase.items) {
      const ingredient = dbGet<{ stockQtyBase: number; costMicrosPerBase: number; unit: string; baseUnit: string }>(
        'SELECT stockQtyBase, costMicrosPerBase, unit, baseUnit FROM ingredients WHERE id = ?',
        [item.ingredientId]
      )
      if (!ingredient) throw new AppError('NOT_FOUND')
      const factor = unitFactor(ingredient.unit, ingredient.baseUnit)
      const incomingMicros = costToMicros(item.unitCostCents, factor)
      const onHand = Math.max(0, ingredient.stockQtyBase)
      const averaged = onHand > 0 && ingredient.costMicrosPerBase > 0 ? Math.round((onHand * ingredient.costMicrosPerBase + item.qtyBase * incomingMicros) / (onHand + item.qtyBase)) : incomingMicros
      recordMovement({ ingredientId: item.ingredientId, type: 'stockIn', qtyDeltaBase: item.qtyBase, unitCostMicros: incomingMicros, refType: 'purchase', refId: id })
      if (incomingMicros > 0) dbWrite('UPDATE ingredients SET costMicrosPerBase = ? WHERE id = ?', [averaged, item.ingredientId])
    }
    dbWrite("UPDATE purchases SET status = CASE WHEN paidCents >= totalCents THEN 'paid' ELSE 'received' END, receivedAt = ? WHERE id = ?", [nowStamp(), id])
  })
  writeAudit('purchases.receive', 'purchase', id)
  return getPurchase(id)
}

export function cancelPurchase(id: number): Purchase {
  const purchase = getPurchase(id)
  if (purchase.status === 'cancelled') return purchase
  if (purchase.paidCents > 0) throw new AppError('CONFLICT', 'Refund the supplier payments first')
  transaction(() => {
    if (purchase.status !== 'draft') {
      for (const item of purchase.items) {
        recordMovement({ ingredientId: item.ingredientId, type: 'return', qtyDeltaBase: -item.qtyBase, refType: 'purchase', refId: id, note: 'cancelled' })
      }
    }
    dbWrite("UPDATE purchases SET status = 'cancelled' WHERE id = ?", [id])
  })
  writeAudit('purchases.cancel', 'purchase', id)
  return getPurchase(id)
}

export function listSupplierPayments(supplierId: number): SupplierPayment[] {
  return dbAll<SupplierPayment>(
    `SELECT sp.id, sp.supplierId, sp.purchaseId, sp.amountCents, sp.method, sp.note, u.fullName AS userName, sp.createdAt
       FROM supplier_payments sp LEFT JOIN users u ON u.id = sp.userId WHERE sp.supplierId = ? ORDER BY sp.id DESC`,
    [supplierId]
  )
}

export function paySupplier(input: { supplierId: number; purchaseId?: number | null; amountCents: number; method: string; note?: string | null }): SupplierPayment {
  if (input.amountCents <= 0) throw new AppError('VALIDATION', 'Amount must be positive')
  if (!dbGet('SELECT id FROM suppliers WHERE id = ?', [input.supplierId])) throw new AppError('NOT_FOUND', 'Supplier')
  const session = requireSession()
  let id = 0
  transaction(() => {
    if (input.purchaseId) {
      const purchase = dbGet<{ supplierId: number; status: string }>('SELECT supplierId, status FROM purchases WHERE id = ?', [input.purchaseId])
      if (!purchase || purchase.supplierId !== input.supplierId) throw new AppError('NOT_FOUND', 'Purchase')
      if (purchase.status === 'cancelled') throw new AppError('INVALID_STATUS')
      dbWrite("UPDATE purchases SET paidCents = paidCents + ?, status = CASE WHEN status = 'received' AND paidCents + ? >= totalCents THEN 'paid' ELSE status END WHERE id = ?", [
        Math.round(input.amountCents),
        Math.round(input.amountCents),
        input.purchaseId
      ])
    }
    id = Number(
      dbWrite('INSERT INTO supplier_payments (supplierId, purchaseId, amountCents, method, note, userId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        input.supplierId,
        input.purchaseId ?? null,
        Math.round(input.amountCents),
        input.method,
        input.note ?? null,
        session.userId,
        nowStamp()
      ]).lastInsertRowid
    )
    if (input.method === 'cash') postCashMovement({ type: 'supplierPayment', amountCents: input.amountCents, refType: 'supplierPayment', refId: id })
  })
  writeAudit('purchases.pay', 'supplier', input.supplierId, { purchaseId: input.purchaseId ?? null, amountCents: input.amountCents })
  return dbGet<SupplierPayment>(
    `SELECT sp.id, sp.supplierId, sp.purchaseId, sp.amountCents, sp.method, sp.note, u.fullName AS userName, sp.createdAt
       FROM supplier_payments sp LEFT JOIN users u ON u.id = sp.userId WHERE sp.id = ?`,
    [id]
  ) as SupplierPayment
}
