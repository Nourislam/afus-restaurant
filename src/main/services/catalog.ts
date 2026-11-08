import type { Category, Modifier, ModifierGroup, Product, ProductVariant } from '@shared/types'
import { dbAll, dbGet, dbWrite } from '../db/client'
import { AppError } from '../utils/errors'
import { writeAudit } from './audit'

export function listCategories(includeArchived = false): Category[] {
  return dbAll<Category>(
    `SELECT c.id, c.nameAr, c.nameFr, c.kind, c.color, c.sortOrder, c.isArchived,
            (SELECT COUNT(*) FROM products p WHERE p.categoryId = c.id AND p.isArchived = 0) AS productCount
       FROM categories c
      ${includeArchived ? '' : 'WHERE c.isArchived = 0'}
      ORDER BY c.sortOrder, c.id`
  )
}

export interface SaveCategoryInput {
  id?: number
  nameAr: string
  nameFr: string
  kind?: string
  color?: string
  sortOrder?: number
}

export function saveCategory(input: SaveCategoryInput): Category {
  const nameAr = input.nameAr.trim()
  const nameFr = input.nameFr.trim()
  if (!nameAr || !nameFr) throw new AppError('VALIDATION', 'Both category names are required')
  if (input.id) {
    const result = dbWrite(
      'UPDATE categories SET nameAr = ?, nameFr = ?, kind = ?, color = ?, sortOrder = ? WHERE id = ?',
      [nameAr, nameFr, input.kind ?? 'food', input.color ?? '#1239B0', input.sortOrder ?? 0, input.id]
    )
    if (result.changes === 0) throw new AppError('NOT_FOUND')
    writeAudit('categories.update', 'category', input.id)
    return dbGet<Category>('SELECT id, nameAr, nameFr, kind, color, sortOrder, isArchived FROM categories WHERE id = ?', [
      input.id
    ]) as Category
  }
  const created = dbWrite('INSERT INTO categories (nameAr, nameFr, kind, color, sortOrder) VALUES (?, ?, ?, ?, ?)', [
    nameAr,
    nameFr,
    input.kind ?? 'food',
    input.color ?? '#1239B0',
    input.sortOrder ?? 0
  ])
  writeAudit('categories.create', 'category', created.lastInsertRowid)
  return dbGet<Category>('SELECT id, nameAr, nameFr, kind, color, sortOrder, isArchived FROM categories WHERE id = ?', [
    created.lastInsertRowid
  ]) as Category
}

export function archiveCategory(id: number): { archived: boolean } {
  const products = dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM products WHERE categoryId = ? AND isArchived = 0', [
    id
  ])
  if (products && products.count > 0) throw new AppError('CONFLICT', 'Category still has products')
  const result = dbWrite('UPDATE categories SET isArchived = 1 WHERE id = ?', [id])
  if (result.changes === 0) throw new AppError('NOT_FOUND')
  writeAudit('categories.archive', 'category', id)
  return { archived: true }
}

interface ProductRow extends Omit<Product, 'variants' | 'modifierGroups'> {}

function variantsFor(productId: number): ProductVariant[] {
  return dbAll<ProductVariant>(
    'SELECT id, productId, nameAr, nameFr, priceDeltaCents, isDefault, sortOrder FROM product_variants WHERE productId = ? ORDER BY sortOrder, id',
    [productId]
  )
}

export function modifierGroupsForProduct(productId: number): ModifierGroup[] {
  const groups = dbAll<Omit<ModifierGroup, 'modifiers'>>(
    `SELECT g.id, g.nameAr, g.nameFr, g.minSelect, g.maxSelect, g.isRequired, g.sortOrder, g.isArchived
       FROM modifier_groups g
       JOIN product_modifier_groups pg ON pg.groupId = g.id
      WHERE pg.productId = ? AND g.isArchived = 0
      ORDER BY g.sortOrder, g.id`,
    [productId]
  )
  return groups.map((group) => ({
    ...group,
    modifiers: dbAll<Modifier>(
      'SELECT id, groupId, nameAr, nameFr, priceCents, isActive, sortOrder FROM modifiers WHERE groupId = ? ORDER BY sortOrder, id',
      [group.id]
    )
  }))
}

function hydrate(row: ProductRow): Product {
  return {
    ...row,
    variants: variantsFor(row.id),
    modifierGroups: modifierGroupsForProduct(row.id)
  }
}

const PRODUCT_SELECT = `SELECT p.id, p.code, p.nameAr, p.nameFr, p.descriptionAr, p.descriptionFr, p.image,
       p.categoryId, c.nameAr AS categoryNameAr, c.nameFr AS categoryNameFr,
       p.type, p.priceCents, p.costCents, p.prepMinutes, p.station, p.isAvailable, p.isArchived, p.sortOrder,
       EXISTS (SELECT 1 FROM recipes r WHERE r.productId = p.id) AS hasRecipe
  FROM products p JOIN categories c ON c.id = p.categoryId`

export interface ListProductsInput {
  page?: number
  pageSize?: number
  search?: string | null
  categoryId?: number | null
  includeArchived?: boolean
}

export function listProducts(input: ListProductsInput = {}): Product[] {
  const where: string[] = []
  const params: (string | number)[] = []
  if (!input.includeArchived) where.push('p.isArchived = 0')
  if (input.categoryId) {
    where.push('p.categoryId = ?')
    params.push(input.categoryId)
  }
  if (input.search?.trim()) {
    where.push('(p.nameAr LIKE ? OR p.nameFr LIKE ? OR p.code LIKE ?)')
    const like = `%${input.search.trim()}%`
    params.push(like, like, like)
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const rows = dbAll<ProductRow>(`${PRODUCT_SELECT} ${clause} ORDER BY p.sortOrder, p.id`, params)
  return rows.map(hydrate)
}

export function getProduct(id: number): Product {
  const row = dbGet<ProductRow>(`${PRODUCT_SELECT} WHERE p.id = ?`, [id])
  if (!row) throw new AppError('NOT_FOUND')
  return hydrate(row)
}

export interface SaveProductInput {
  id?: number
  code?: string | null
  nameAr: string
  nameFr: string
  descriptionAr?: string | null
  descriptionFr?: string | null
  image?: string | null
  categoryId: number
  type?: string
  priceCents: number
  costCents?: number
  prepMinutes?: number
  station?: string
  isAvailable?: boolean
  sortOrder?: number
  variants?: { id?: number; nameAr: string; nameFr: string; priceDeltaCents?: number; isDefault?: boolean; sortOrder?: number }[]
}

export function saveProduct(input: SaveProductInput): Product {
  const nameAr = input.nameAr.trim()
  const nameFr = input.nameFr.trim()
  if (!nameAr || !nameFr) throw new AppError('VALIDATION', 'Both product names are required')
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) throw new AppError('VALIDATION', 'Invalid price')
  if (!dbGet('SELECT id FROM categories WHERE id = ?', [input.categoryId])) throw new AppError('NOT_FOUND', 'Category not found')

  const values = [
    input.code ?? null,
    nameAr,
    nameFr,
    input.descriptionAr ?? null,
    input.descriptionFr ?? null,
    input.image ?? null,
    input.categoryId,
    input.type ?? 'main',
    input.priceCents,
    Math.max(0, Math.trunc(input.costCents ?? 0)),
    Math.max(0, Math.trunc(input.prepMinutes ?? 0)),
    input.station ?? 'grill',
    input.isAvailable === false ? 0 : 1,
    Math.trunc(input.sortOrder ?? 0)
  ]

  let id = input.id ?? 0
  if (input.id) {
    const result = dbWrite(
      `UPDATE products SET code = ?, nameAr = ?, nameFr = ?, descriptionAr = ?, descriptionFr = ?, image = ?,
              categoryId = ?, type = ?, priceCents = ?, costCents = ?, prepMinutes = ?, station = ?,
              isAvailable = ?, sortOrder = ?
        WHERE id = ?`,
      [...values, input.id]
    )
    if (result.changes === 0) throw new AppError('NOT_FOUND')
    writeAudit('products.update', 'product', input.id)
  } else {
    const created = dbWrite(
      `INSERT INTO products (code, nameAr, nameFr, descriptionAr, descriptionFr, image, categoryId, type,
              priceCents, costCents, prepMinutes, station, isAvailable, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values
    )
    id = created.lastInsertRowid
    writeAudit('products.create', 'product', id)
  }

  if (input.variants) {
    dbWrite('DELETE FROM product_variants WHERE productId = ?', [id])
    input.variants.forEach((variant, index) => {
      dbWrite(
        'INSERT INTO product_variants (productId, nameAr, nameFr, priceDeltaCents, isDefault, sortOrder) VALUES (?, ?, ?, ?, ?, ?)',
        [
          id,
          variant.nameAr.trim(),
          variant.nameFr.trim(),
          Math.trunc(variant.priceDeltaCents ?? 0),
          variant.isDefault ? 1 : 0,
          variant.sortOrder ?? index
        ]
      )
    })
  }
  return getProduct(id)
}

export function setProductAvailability(id: number, available: boolean): { id: number; isAvailable: boolean } {
  const result = dbWrite('UPDATE products SET isAvailable = ? WHERE id = ?', [available ? 1 : 0, id])
  if (result.changes === 0) throw new AppError('NOT_FOUND')
  writeAudit('products.availability', 'product', id, { available })
  return { id, isAvailable: available }
}

export function archiveProduct(id: number): { id: number; isArchived: boolean } {
  const result = dbWrite('UPDATE products SET isArchived = 1, isAvailable = 0 WHERE id = ?', [id])
  if (result.changes === 0) throw new AppError('NOT_FOUND')
  writeAudit('products.archive', 'product', id)
  return { id, isArchived: true }
}

export function listModifierGroups(): ModifierGroup[] {
  const groups = dbAll<Omit<ModifierGroup, 'modifiers'>>(
    `SELECT id, nameAr, nameFr, minSelect, maxSelect, isRequired, sortOrder, isArchived
       FROM modifier_groups WHERE isArchived = 0 ORDER BY sortOrder, id`
  )
  return groups.map((group) => ({
    ...group,
    modifiers: dbAll<Modifier>(
      'SELECT id, groupId, nameAr, nameFr, priceCents, isActive, sortOrder FROM modifiers WHERE groupId = ? ORDER BY sortOrder, id',
      [group.id]
    )
  }))
}

export interface SaveModifierGroupInput {
  id?: number
  nameAr: string
  nameFr: string
  minSelect?: number
  maxSelect?: number
  isRequired?: boolean
  sortOrder?: number
  modifiers?: { id?: number; nameAr: string; nameFr: string; priceCents?: number; isActive?: boolean; sortOrder?: number }[]
}

export function saveModifierGroup(input: SaveModifierGroupInput): ModifierGroup {
  const nameAr = input.nameAr.trim()
  const nameFr = input.nameFr.trim()
  if (!nameAr || !nameFr) throw new AppError('VALIDATION', 'Both group names are required')
  const values = [
    nameAr,
    nameFr,
    Math.max(0, Math.trunc(input.minSelect ?? 0)),
    Math.max(1, Math.trunc(input.maxSelect ?? 1)),
    input.isRequired ? 1 : 0,
    Math.trunc(input.sortOrder ?? 0)
  ]
  let id = input.id ?? 0
  if (input.id) {
    dbWrite(
      'UPDATE modifier_groups SET nameAr = ?, nameFr = ?, minSelect = ?, maxSelect = ?, isRequired = ?, sortOrder = ? WHERE id = ?',
      [...values, input.id]
    )
    id = input.id
  } else {
    id = dbWrite(
      'INSERT INTO modifier_groups (nameAr, nameFr, minSelect, maxSelect, isRequired, sortOrder) VALUES (?, ?, ?, ?, ?, ?)',
      values
    ).lastInsertRowid
  }
  if (input.modifiers) {
    dbWrite('DELETE FROM modifiers WHERE groupId = ?', [id])
    input.modifiers.forEach((modifier, index) => {
      dbWrite(
        'INSERT INTO modifiers (groupId, nameAr, nameFr, priceCents, isActive, sortOrder) VALUES (?, ?, ?, ?, ?, ?)',
        [
          id,
          modifier.nameAr.trim(),
          modifier.nameFr.trim(),
          Math.trunc(modifier.priceCents ?? 0),
          modifier.isActive === false ? 0 : 1,
          modifier.sortOrder ?? index
        ]
      )
    })
  }
  writeAudit(input.id ? 'modifierGroups.update' : 'modifierGroups.create', 'modifierGroup', id)
  return (
    listModifierGroups().find((group) => group.id === id) ?? {
      id,
      nameAr,
      nameFr,
      minSelect: 0,
      maxSelect: 1,
      isRequired: Boolean(input.isRequired),
      sortOrder: 0,
      isArchived: false,
      modifiers: []
    }
  )
}

export function removeModifierGroup(id: number): { removed: boolean } {
  const result = dbWrite('UPDATE modifier_groups SET isArchived = 1 WHERE id = ?', [id])
  if (result.changes === 0) throw new AppError('NOT_FOUND')
  writeAudit('modifierGroups.remove', 'modifierGroup', id)
  return { removed: true }
}
