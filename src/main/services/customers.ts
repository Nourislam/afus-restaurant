/** Customer directory with order aggregates and a simple loyalty balance. */
import type { Customer } from '@shared/types'
import { dbAll, dbGet, dbWrite } from '../db/client'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { writeAudit } from './audit'

const SELECT = `
  SELECT c.id, c.name, c.phone, c.address, c.area, c.notes, c.isFavorite, c.loyaltyPoints, c.createdAt,
         COUNT(o.id) AS orderCount,
         COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.totalCents ELSE 0 END), 0) AS totalSpentCents,
         MAX(o.createdAt) AS lastOrderAt
    FROM customers c
    LEFT JOIN orders o ON o.customerId = c.id
`

function map(row: Record<string, unknown>): Customer {
  return { ...(row as unknown as Customer), isFavorite: Boolean((row as { isFavorite: number }).isFavorite) }
}

export function listCustomers(): Customer[] {
  return dbAll<Record<string, unknown>>(
    `${SELECT} GROUP BY c.id ORDER BY c.isFavorite DESC, c.name COLLATE NOCASE`
  ).map(map)
}

export function getCustomer(id: number): Customer {
  const row = dbGet<Record<string, unknown>>(`${SELECT} WHERE c.id = ? GROUP BY c.id`, [id])
  if (!row) throw new AppError('NOT_FOUND')
  return map(row)
}

export function saveCustomer(input: {
  id?: number
  name: string
  phone?: string | null
  address?: string | null
  area?: string | null
  notes?: string | null
}): Customer {
  const name = input.name.trim()
  if (!name) throw new AppError('VALIDATION', 'name is required')
  if (input.id) {
    const existing = dbGet<{ id: number }>('SELECT id FROM customers WHERE id = ?', [input.id])
    if (!existing) throw new AppError('NOT_FOUND')
    dbWrite('UPDATE customers SET name = ?, phone = ?, address = ?, area = ?, notes = ? WHERE id = ?', [
      name,
      input.phone ?? null,
      input.address ?? null,
      input.area ?? null,
      input.notes ?? null,
      input.id
    ])
    writeAudit('customers.update', 'customer', input.id)
    return getCustomer(input.id)
  }
  const result = dbWrite(
    'INSERT INTO customers (name, phone, address, area, notes, isFavorite, loyaltyPoints, createdAt) VALUES (?, ?, ?, ?, ?, 0, 0, ?)',
    [name, input.phone ?? null, input.address ?? null, input.area ?? null, input.notes ?? null, nowStamp()]
  )
  writeAudit('customers.create', 'customer', result.lastInsertRowid)
  return getCustomer(Number(result.lastInsertRowid))
}

export function toggleFavorite(input: { id: number; favorite: boolean }): Customer {
  const existing = dbGet<{ id: number }>('SELECT id FROM customers WHERE id = ?', [input.id])
  if (!existing) throw new AppError('NOT_FOUND')
  dbWrite('UPDATE customers SET isFavorite = ? WHERE id = ?', [input.favorite ? 1 : 0, input.id])
  return getCustomer(input.id)
}

export function adjustLoyalty(input: { id: number; delta: number }): Customer {
  const existing = dbGet<{ loyaltyPoints: number }>('SELECT loyaltyPoints FROM customers WHERE id = ?', [input.id])
  if (!existing) throw new AppError('NOT_FOUND')
  const next = Math.max(0, existing.loyaltyPoints + Math.floor(input.delta))
  dbWrite('UPDATE customers SET loyaltyPoints = ? WHERE id = ?', [next, input.id])
  writeAudit('customers.loyalty', 'customer', input.id, { delta: input.delta })
  return getCustomer(input.id)
}
