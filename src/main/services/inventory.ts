/** Ingredients, stock movements and the recipe-driven consumption hooks. */
import type { Ingredient, InventoryMovement } from '@shared/types'
import { dbAll, dbGet, dbWrite, transaction } from '../db/client'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { currentUserId } from '../security/session'
import { writeAudit } from './audit'
import { baseUnitFor, baseValueCents, costToMicros, fromBase, microsToUnitCents, toBase, unitFactor } from './units'

interface IngredientRow {
  id: number
  nameAr: string
  nameFr: string
  unit: string
  baseUnit: string
  costMicrosPerBase: number
  stockQtyBase: number
  minQtyBase: number
  isArchived: number
}

const COLUMNS = 'id, nameAr, nameFr, unit, baseUnit, costMicrosPerBase, stockQtyBase, minQtyBase, isArchived'

function map(row: IngredientRow): Ingredient {
  const factor = unitFactor(row.unit, row.baseUnit)
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameFr: row.nameFr,
    unit: row.unit as Ingredient['unit'],
    baseUnit: row.baseUnit as Ingredient['baseUnit'],
    costMicrosPerBase: row.costMicrosPerBase,
    unitCostCents: microsToUnitCents(row.costMicrosPerBase, factor),
    stockQtyBase: row.stockQtyBase,
    stockQty: fromBase(row.stockQtyBase, factor),
    minQtyBase: row.minQtyBase,
    minQty: fromBase(row.minQtyBase, factor),
    isArchived: Boolean(row.isArchived),
    isLow: row.minQtyBase > 0 && row.stockQtyBase <= row.minQtyBase,
    stockValueCents: baseValueCents(Math.max(0, row.stockQtyBase), row.costMicrosPerBase)
  }
}

function rowOf(id: number): IngredientRow {
  const row = dbGet<IngredientRow>(`SELECT ${COLUMNS} FROM ingredients WHERE id = ?`, [id])
  if (!row) throw new AppError('NOT_FOUND')
  return row
}

export function getIngredient(id: number): Ingredient {
  return map(rowOf(id))
}

export function listIngredients(includeArchived = false): Ingredient[] {
  return dbAll<IngredientRow>(
    `SELECT ${COLUMNS} FROM ingredients ${includeArchived ? '' : 'WHERE isArchived = 0'} ORDER BY nameAr COLLATE NOCASE`
  ).map(map)
}

export interface SaveIngredientInput {
  id?: number
  nameAr: string
  nameFr: string
  unit: string
  costPerUnitCents?: number
  minQty?: number
  openingQty?: number
}

/** Append a movement and apply it to the stock level (one transaction by the caller). */
export function recordMovement(input: {
  ingredientId: number
  type: string
  qtyDeltaBase: number
  unitCostMicros?: number
  refType?: string | null
  refId?: string | number | null
  note?: string | null
  userId?: number | null
}): void {
  if (input.qtyDeltaBase === 0) return
  dbWrite(
    `INSERT INTO ingredient_movements (ingredientId, type, qtyDeltaBase, unitCostMicros, refType, refId, note, userId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.ingredientId,
      input.type,
      input.qtyDeltaBase,
      input.unitCostMicros ?? 0,
      input.refType ?? null,
      input.refId === null || input.refId === undefined ? null : String(input.refId),
      input.note ?? null,
      input.userId === undefined ? currentUserId() : input.userId,
      nowStamp()
    ]
  )
  dbWrite('UPDATE ingredients SET stockQtyBase = stockQtyBase + ? WHERE id = ?', [input.qtyDeltaBase, input.ingredientId])
}

export function saveIngredient(input: SaveIngredientInput): Ingredient {
  const nameAr = input.nameAr.trim()
  const nameFr = input.nameFr.trim() || nameAr
  if (!nameAr) throw new AppError('VALIDATION', 'Ingredient name is required')
  const unit = input.unit
  const baseUnit = baseUnitFor(unit)
  const factor = unitFactor(unit, baseUnit)
  const minQtyBase = toBase(Math.max(0, input.minQty ?? 0), factor)
  const costMicros = costToMicros(Math.max(0, input.costPerUnitCents ?? 0), factor)

  if (input.id) {
    const existing = rowOf(input.id)
    /* Changing the unit family would silently rescale history; keep the base unit stable. */
    if (baseUnitFor(existing.unit) !== baseUnit) throw new AppError('VALIDATION', 'Unit family cannot change')
    dbWrite('UPDATE ingredients SET nameAr = ?, nameFr = ?, unit = ?, baseUnit = ?, costMicrosPerBase = ?, minQtyBase = ? WHERE id = ?', [
      nameAr,
      nameFr,
      unit,
      baseUnit,
      costMicros,
      minQtyBase,
      input.id
    ])
    writeAudit('ingredients.update', 'ingredient', input.id)
    return getIngredient(input.id)
  }

  let id = 0
  transaction(() => {
    id = Number(
      dbWrite(
        'INSERT INTO ingredients (nameAr, nameFr, unit, baseUnit, costMicrosPerBase, stockQtyBase, minQtyBase) VALUES (?, ?, ?, ?, ?, 0, ?)',
        [nameAr, nameFr, unit, baseUnit, costMicros, minQtyBase]
      ).lastInsertRowid
    )
    const opening = toBase(Math.max(0, input.openingQty ?? 0), factor)
    if (opening > 0) recordMovement({ ingredientId: id, type: 'stockIn', qtyDeltaBase: opening, unitCostMicros: costMicros, refType: 'opening', note: null })
  })
  writeAudit('ingredients.create', 'ingredient', id)
  return getIngredient(id)
}

/** Set the stock to a counted quantity (display units); the delta is logged as an adjustment. */
export function adjustIngredient(id: number, newQty: number, note?: string | null): Ingredient {
  const row = rowOf(id)
  const factor = unitFactor(row.unit, row.baseUnit)
  const target = toBase(newQty, factor)
  const delta = target - row.stockQtyBase
  transaction(() => recordMovement({ ingredientId: id, type: 'adjustment', qtyDeltaBase: delta, unitCostMicros: row.costMicrosPerBase, note: note ?? null }))
  writeAudit('ingredients.adjust', 'ingredient', id, { from: row.stockQtyBase, to: target, note: note ?? null })
  return getIngredient(id)
}

export function wasteIngredient(id: number, qty: number, note?: string | null): Ingredient {
  if (qty <= 0) throw new AppError('VALIDATION', 'Quantity must be positive')
  const row = rowOf(id)
  const factor = unitFactor(row.unit, row.baseUnit)
  transaction(() => recordMovement({ ingredientId: id, type: 'waste', qtyDeltaBase: -toBase(qty, factor), unitCostMicros: row.costMicrosPerBase, note: note ?? null }))
  writeAudit('ingredients.waste', 'ingredient', id, { qty, note: note ?? null })
  return getIngredient(id)
}

export function removeIngredient(id: number): { removed: boolean } {
  rowOf(id)
  const used =
    (dbGet<{ n: number }>('SELECT COUNT(*) AS n FROM ingredient_movements WHERE ingredientId = ?', [id])?.n ?? 0) +
    (dbGet<{ n: number }>('SELECT COUNT(*) AS n FROM recipe_items WHERE ingredientId = ?', [id])?.n ?? 0) +
    (dbGet<{ n: number }>('SELECT COUNT(*) AS n FROM purchase_items WHERE ingredientId = ?', [id])?.n ?? 0)
  if (used > 0) {
    dbWrite('UPDATE ingredients SET isArchived = 1 WHERE id = ?', [id])
    writeAudit('ingredients.archive', 'ingredient', id)
    return { removed: false }
  }
  dbWrite('DELETE FROM ingredients WHERE id = ?', [id])
  writeAudit('ingredients.delete', 'ingredient', id)
  return { removed: true }
}

export function listMovements(input: { ingredientId?: number | null; from?: string | null; to?: string | null; type?: string | null; limit?: number } = {}): InventoryMovement[] {
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (input.ingredientId) {
    clauses.push('m.ingredientId = ?')
    params.push(input.ingredientId)
  }
  if (input.type) {
    clauses.push('m.type = ?')
    params.push(input.type)
  }
  if (input.from) {
    clauses.push('m.createdAt >= ?')
    params.push(`${input.from} 00:00:00`)
  }
  if (input.to) {
    clauses.push('m.createdAt <= ?')
    params.push(`${input.to} 23:59:59`)
  }
  params.push(Math.min(2000, input.limit ?? 500))
  const rows = dbAll<InventoryMovement & { baseUnit: string }>(
    `SELECT m.id, m.ingredientId, i.nameAr AS ingredientNameAr, i.nameFr AS ingredientNameFr, i.unit, i.baseUnit,
            m.type, m.qtyDeltaBase, m.unitCostMicros, m.refType, m.refId, m.note, u.fullName AS userName, m.createdAt
       FROM ingredient_movements m
       JOIN ingredients i ON i.id = m.ingredientId
       LEFT JOIN users u ON u.id = m.userId
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY m.id DESC LIMIT ?`,
    params
  )
  return rows.map((row) => {
    const factor = unitFactor(row.unit, row.baseUnit)
    const { baseUnit: _baseUnit, ...rest } = row
    void _baseUnit
    return { ...rest, qtyDelta: fromBase(row.qtyDeltaBase, factor) }
  })
}

/* ---------------- Order hooks ---------------- */

interface Consumption {
  ingredientId: number
  qtyBase: number
  costMicros: number
}

function consumptionFor(orderId: number): Consumption[] {
  return dbAll<Consumption>(
    `SELECT ri.ingredientId, SUM(ri.qtyBase * oi.qty) AS qtyBase, i.costMicrosPerBase AS costMicros
       FROM order_items oi
       JOIN recipes r ON r.productId = oi.productId
       JOIN recipe_items ri ON ri.recipeId = r.id
       JOIN ingredients i ON i.id = ri.ingredientId
      WHERE oi.orderId = ? AND oi.status != 'removed'
      GROUP BY ri.ingredientId`,
    [orderId]
  )
}

/** Consume recipe ingredients for a completed order (idempotent). */
export function consumeStockForOrder(orderId: number, userId: number | null): void {
  const order = dbGet<{ stockDeducted: number }>('SELECT stockDeducted FROM orders WHERE id = ?', [orderId])
  if (!order || order.stockDeducted) return
  for (const line of consumptionFor(orderId)) {
    recordMovement({ ingredientId: line.ingredientId, type: 'usage', qtyDeltaBase: -line.qtyBase, unitCostMicros: line.costMicros, refType: 'order', refId: orderId, userId })
  }
  dbWrite('UPDATE orders SET stockDeducted = 1 WHERE id = ?', [orderId])
}

/** Put the ingredients back when a deducted order is cancelled with the restore policy. */
export function restoreStockForOrder(orderId: number, userId: number | null): void {
  const order = dbGet<{ stockDeducted: number }>('SELECT stockDeducted FROM orders WHERE id = ?', [orderId])
  if (!order || !order.stockDeducted) return
  for (const line of consumptionFor(orderId)) {
    recordMovement({ ingredientId: line.ingredientId, type: 'return', qtyDeltaBase: line.qtyBase, unitCostMicros: line.costMicros, refType: 'order', refId: orderId, userId })
  }
  dbWrite('UPDATE orders SET stockDeducted = 0 WHERE id = ?', [orderId])
}
