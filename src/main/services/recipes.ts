/** One recipe per product; the recipe cost feeds the product's cost price. */
import type { Recipe, RecipeItem } from '@shared/types'
import { dbAll, dbGet, dbWrite, transaction } from '../db/client'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { writeAudit } from './audit'
import { baseValueCents, fromBase, toBase, unitFactor } from './units'

interface ItemRow {
  id: number
  recipeId: number
  ingredientId: number
  ingredientNameAr: string
  ingredientNameFr: string
  unit: string
  baseUnit: string
  qtyBase: number
  costMicrosPerBase: number
}

function items(recipeId: number): RecipeItem[] {
  return dbAll<ItemRow>(
    `SELECT ri.id, ri.recipeId, ri.ingredientId, i.nameAr AS ingredientNameAr, i.nameFr AS ingredientNameFr,
            i.unit, i.baseUnit, ri.qtyBase, i.costMicrosPerBase
       FROM recipe_items ri JOIN ingredients i ON i.id = ri.ingredientId
      WHERE ri.recipeId = ? ORDER BY ri.id`,
    [recipeId]
  ).map((row) => ({
    id: row.id,
    recipeId: row.recipeId,
    ingredientId: row.ingredientId,
    ingredientNameAr: row.ingredientNameAr,
    ingredientNameFr: row.ingredientNameFr,
    unit: row.unit,
    qtyBase: row.qtyBase,
    qty: fromBase(row.qtyBase, unitFactor(row.unit, row.baseUnit)),
    costCents: baseValueCents(row.qtyBase, row.costMicrosPerBase)
  }))
}

export function getRecipe(productId: number): Recipe {
  const product = dbGet<{ id: number; nameAr: string; nameFr: string; priceCents: number }>(
    'SELECT id, nameAr, nameFr, priceCents FROM products WHERE id = ?',
    [productId]
  )
  if (!product) throw new AppError('NOT_FOUND')
  const recipe = dbGet<{ id: number }>('SELECT id FROM recipes WHERE productId = ?', [productId])
  const list = recipe ? items(recipe.id) : []
  const totalCostCents = list.reduce((sum, item) => sum + item.costCents, 0)
  const marginCents = product.priceCents - totalCostCents
  return {
    productId,
    productNameAr: product.nameAr,
    productNameFr: product.nameFr,
    hasRecipe: Boolean(recipe),
    items: list,
    totalCostCents,
    salePriceCents: product.priceCents,
    marginCents,
    marginBp: product.priceCents > 0 ? Math.round((marginCents * 10_000) / product.priceCents) : 0
  }
}

export function saveRecipe(input: {
  productId: number
  note?: string | null
  items: { ingredientId: number; qty?: number; qtyBase?: number }[]
}): Recipe {
  if (!input.items.length) throw new AppError('VALIDATION', 'RECIPE_EMPTY')
  if (!dbGet('SELECT id FROM products WHERE id = ?', [input.productId])) throw new AppError('NOT_FOUND')
  transaction(() => {
    const stamp = nowStamp()
    let recipeId = dbGet<{ id: number }>('SELECT id FROM recipes WHERE productId = ?', [input.productId])?.id
    if (recipeId) {
      dbWrite('UPDATE recipes SET note = ?, updatedAt = ? WHERE id = ?', [input.note ?? null, stamp, recipeId])
      dbWrite('DELETE FROM recipe_items WHERE recipeId = ?', [recipeId])
    } else {
      recipeId = Number(
        dbWrite('INSERT INTO recipes (productId, note, createdAt, updatedAt) VALUES (?, ?, ?, ?)', [input.productId, input.note ?? null, stamp, stamp]).lastInsertRowid
      )
    }
    const merged = new Map<number, number>()
    for (const item of input.items) {
      const ingredient = dbGet<{ unit: string; baseUnit: string }>('SELECT unit, baseUnit FROM ingredients WHERE id = ?', [item.ingredientId])
      if (!ingredient) throw new AppError('NOT_FOUND', `Ingredient ${item.ingredientId}`)
      const qtyBase = item.qtyBase ?? toBase(item.qty ?? 0, unitFactor(ingredient.unit, ingredient.baseUnit))
      if (qtyBase <= 0) throw new AppError('VALIDATION', 'Quantity must be positive')
      merged.set(item.ingredientId, (merged.get(item.ingredientId) ?? 0) + qtyBase)
    }
    for (const [ingredientId, qtyBase] of merged) {
      dbWrite('INSERT INTO recipe_items (recipeId, ingredientId, qtyBase) VALUES (?, ?, ?)', [recipeId, ingredientId, qtyBase])
    }
    /* Keep the menu's cost price honest: it is the recipe cost from now on. */
    const cost = items(recipeId).reduce((sum, item) => sum + item.costCents, 0)
    dbWrite('UPDATE products SET costCents = ? WHERE id = ?', [cost, input.productId])
  })
  writeAudit('recipes.save', 'product', input.productId, { items: input.items.length })
  return getRecipe(input.productId)
}
