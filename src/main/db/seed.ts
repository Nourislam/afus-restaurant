import { ROLE_DEFINITIONS } from '@shared/permissions'
import { dbGet, dbRun, dbWrite, transaction } from './client'
import { nowStamp } from '../utils/dates'
import { DEFAULT_SETTINGS } from '../services/settings'

/** Roles and settings must exist before any user can log in. */
export function seedCoreData(): void {
  transaction(() => {
    for (const role of ROLE_DEFINITIONS) {
      dbRun('INSERT OR REPLACE INTO roles (id, labelAr, labelFr, permissions) VALUES (?, ?, ?, ?)', [
        role.id,
        role.labelAr,
        role.labelFr,
        JSON.stringify(role.permissions)
      ])
    }
    const existing = dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM settings')
    if (!existing || existing.count === 0) {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        dbRun('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)])
      }
    }
  })
}

/** Optional demo catalogue, used by first-run setup so the app is never empty. */
export function seedStarterCatalog(): void {
  const already = dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM categories')
  if (already && already.count > 0) return
  const stamp = nowStamp()

  transaction(() => {
    const area = dbRun('INSERT INTO dining_areas (nameAr, nameFr, color, sortOrder) VALUES (?, ?, ?, ?)', [
      'الصالة الرئيسية',
      'Salle principale',
      '#6366f1',
      0
    ])
    for (let index = 1; index <= 6; index += 1) {
      dbRun('INSERT INTO dining_tables (areaId, name, seats, positionX, positionY) VALUES (?, ?, ?, ?, ?)', [
        area.lastInsertRowid,
        `T${index}`,
        index <= 2 ? 2 : 4,
        (index - 1) * 140,
        0
      ])
    }

    const categories = [
      /* Afus accent palette: indigo (primary), violet (secondary), emerald (success) */
      { nameAr: 'مشاوي', nameFr: 'Grillades', color: '#6366f1', kind: 'food' },
      { nameAr: 'بيتزا', nameFr: 'Pizzas', color: '#8b5cf6', kind: 'food' },
      { nameAr: 'مشروبات', nameFr: 'Boissons', color: '#22c55e', kind: 'drink' }
    ]
    const categoryIds = categories.map(
      (category, index) =>
        dbRun('INSERT INTO categories (nameAr, nameFr, kind, color, sortOrder) VALUES (?, ?, ?, ?, ?)', [
          category.nameAr,
          category.nameFr,
          category.kind,
          category.color,
          index
        ]).lastInsertRowid
    )

    const products = [
      { ar: 'مشوي مختلط', fr: 'Grillade mixte', category: 0, price: 180000, cost: 90000, station: 'grill' },
      { ar: 'كسكس لحم', fr: 'Couscous agneau', category: 0, price: 120000, cost: 55000, station: 'meat' },
      { ar: 'بيتزا مارغريتا', fr: 'Pizza Margherita', category: 1, price: 90000, cost: 35000, station: 'pizza' },
      { ar: 'بيتزا خضار', fr: 'Pizza végétarienne', category: 1, price: 100000, cost: 38000, station: 'pizza' },
      { ar: 'شاي بالنعناع', fr: 'Thé à la menthe', category: 2, price: 15000, cost: 3000, station: 'drinks' },
      { ar: 'عصير برتقال', fr: 'Jus d’orange', category: 2, price: 30000, cost: 12000, station: 'drinks' }
    ]
    const productIds = products.map(
      (product) =>
        dbRun(
          `INSERT INTO products (nameAr, nameFr, categoryId, type, priceCents, costCents, station, prepMinutes, sortOrder)
           VALUES (?, ?, ?, 'main', ?, ?, ?, 10, 0)`,
          [product.ar, product.fr, categoryIds[product.category] ?? 0, product.price, product.cost, product.station]
        ).lastInsertRowid
    )

    const ingredients = [
      { ar: 'لحم بقري', fr: 'Viande de bœuf', unit: 'kg', base: 'g', cost: 1200, stock: 8000, min: 2000 },
      { ar: 'دقيق', fr: 'Farine', unit: 'kg', base: 'g', cost: 120, stock: 20000, min: 5000 },
      { ar: 'جبن موزاريلا', fr: 'Mozzarella', unit: 'kg', base: 'g', cost: 900, stock: 4000, min: 1000 },
      { ar: 'طماطم', fr: 'Tomates', unit: 'kg', base: 'g', cost: 150, stock: 6000, min: 1500 },
      { ar: 'برتقال', fr: 'Oranges', unit: 'kg', base: 'g', cost: 200, stock: 5000, min: 1000 },
      { ar: 'نعناع', fr: 'Menthe', unit: 'kg', base: 'g', cost: 400, stock: 400, min: 200 }
    ]
    const ingredientIds = ingredients.map(
      (ingredient) =>
        dbRun(
          `INSERT INTO ingredients (nameAr, nameFr, unit, baseUnit, costMicrosPerBase, stockQtyBase, minQtyBase)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            ingredient.ar,
            ingredient.fr,
            ingredient.unit,
            ingredient.base,
            /* cost per gram in 1e-6 currency units */ ingredient.cost * 1000,
            ingredient.stock,
            ingredient.min
          ]
        ).lastInsertRowid
    )

    const recipes: { product: number; items: [number, number][] }[] = [
      { product: 0, items: [[ingredientIds[0] ?? 0, 250], [ingredientIds[3] ?? 0, 100]] },
      { product: 2, items: [[ingredientIds[1] ?? 0, 220], [ingredientIds[2] ?? 0, 120], [ingredientIds[3] ?? 0, 80]] }
    ]
    for (const recipe of recipes) {
      const recipeId = dbRun('INSERT INTO recipes (productId, createdAt, updatedAt) VALUES (?, ?, ?)', [
        productIds[recipe.product] ?? 0,
        stamp,
        stamp
      ]).lastInsertRowid
      for (const [ingredientId, qty] of recipe.items) {
        dbRun('INSERT INTO recipe_items (recipeId, ingredientId, qtyBase) VALUES (?, ?, ?)', [recipeId, ingredientId, qty])
      }
    }

    dbRun(
      `INSERT INTO customers (name, phone, address, area, createdAt) VALUES (?, ?, ?, ?, ?)`,
      ['زبون تجريبي', '0550000000', 'شارع الاستقلال', 'الجزائر', stamp]
    )
  })
  dbWrite('DELETE FROM settings WHERE key = ?', ['seededAt'])
  dbWrite('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['seededAt', JSON.stringify(nowStamp())])
}
