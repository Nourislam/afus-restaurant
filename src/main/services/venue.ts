import { TABLE_STATUSES } from '@shared/constants'
import type { DiningArea, RestaurantTable, TableMap } from '@shared/types'
import { dbAll, dbGet, dbWrite } from '../db/client'
import { AppError } from '../utils/errors'
import { writeAudit } from './audit'

const OPEN_ORDER = `o.status NOT IN ('completed', 'cancelled') AND o.isHeld = 0`

export function listAreas(): DiningArea[] {
  return dbAll<DiningArea>(
    `SELECT a.id, a.nameAr, a.nameFr, a.color, a.sortOrder, a.isArchived,
            (SELECT COUNT(*) FROM dining_tables t WHERE t.areaId = a.id AND t.isArchived = 0) AS tableCount
       FROM dining_areas a
      WHERE a.isArchived = 0
      ORDER BY a.sortOrder, a.id`
  )
}

export function tableMap(): TableMap {
  const tables = dbAll<RestaurantTable>(
    `SELECT t.id, t.areaId, t.name, t.seats, t.status, t.positionX, t.positionY, t.isArchived,
            o.id AS openOrderId, o.orderNumber AS openOrderNumber,
            COALESCE(o.totalCents, 0) AS openOrderTotalCents, u.fullName AS waiterName,
            o.covers AS openOrderCovers, o.createdAt AS openOrderOpenedAt
       FROM dining_tables t
       LEFT JOIN orders o ON o.tableId = t.id AND ${OPEN_ORDER}
       LEFT JOIN users u ON u.id = o.userId
      WHERE t.isArchived = 0
      ORDER BY t.areaId, t.name`
  )
  return { areas: listAreas(), tables }
}

export function listTables(): { id: number; name: string; status: string; seats: number; areaId: number }[] {
  return dbAll<{ id: number; name: string; status: string; seats: number; areaId: number }>(
    'SELECT id, name, status, seats, areaId FROM dining_tables WHERE isArchived = 0 ORDER BY areaId, name'
  )
}

export interface SaveTableInput {
  id?: number
  areaId: number
  name: string
  seats?: number
  positionX?: number
  positionY?: number
}

export function saveTable(input: SaveTableInput): { id: number; name: string; status: string; seats: number; areaId: number } {
  const name = input.name.trim()
  if (!name) throw new AppError('VALIDATION', 'Table name is required')
  const area = dbGet<{ id: number }>('SELECT id FROM dining_areas WHERE id = ? AND isArchived = 0', [input.areaId])
  if (!area) throw new AppError('NOT_FOUND', 'Area not found')
  const seats = Math.max(1, Math.trunc(input.seats ?? 2))

  const clash = dbGet<{ id: number }>('SELECT id FROM dining_tables WHERE areaId = ? AND name = ?', [input.areaId, name])
  if (clash && clash.id !== input.id) throw new AppError('CONFLICT', 'A table with this name already exists in the area')

  if (input.id) {
    const existing = dbGet<{ id: number }>('SELECT id FROM dining_tables WHERE id = ?', [input.id])
    if (!existing) throw new AppError('NOT_FOUND')
    dbWrite('UPDATE dining_tables SET areaId = ?, name = ?, seats = ?, positionX = ?, positionY = ? WHERE id = ?', [
      input.areaId,
      name,
      seats,
      input.positionX ?? 0,
      input.positionY ?? 0,
      input.id
    ])
    writeAudit('tables.update', 'table', input.id)
    return dbGet('SELECT id, name, status, seats, areaId FROM dining_tables WHERE id = ?', [input.id]) as {
      id: number
      name: string
      status: string
      seats: number
      areaId: number
    }
  }

  const created = dbWrite(
    'INSERT INTO dining_tables (areaId, name, seats, positionX, positionY) VALUES (?, ?, ?, ?, ?)',
    [input.areaId, name, seats, input.positionX ?? 0, input.positionY ?? 0]
  )
  writeAudit('tables.create', 'table', created.lastInsertRowid)
  return dbGet('SELECT id, name, status, seats, areaId FROM dining_tables WHERE id = ?', [created.lastInsertRowid]) as {
    id: number
    name: string
    status: string
    seats: number
    areaId: number
  }
}

export function setTableStatus(id: number, status: string): { id: number; name: string; status: string } {
  if (!TABLE_STATUSES.some((entry) => entry.value === status)) throw new AppError('INVALID_STATUS')
  const table = dbGet<{ id: number; name: string }>('SELECT id, name FROM dining_tables WHERE id = ?', [id])
  if (!table) throw new AppError('NOT_FOUND')
  const open = dbGet<{ id: number }>(`SELECT id FROM orders WHERE tableId = ? AND ${OPEN_ORDER}`, [id])
  if (open && status === 'free') throw new AppError('CONFLICT', 'Table has an open order')
  dbWrite('UPDATE dining_tables SET status = ? WHERE id = ?', [status, id])
  writeAudit('tables.status', 'table', id, { status })
  return { id, name: table.name, status }
}

export function removeTable(id: number): { removed: boolean } {
  const open = dbGet<{ id: number }>(`SELECT id FROM orders WHERE tableId = ? AND ${OPEN_ORDER}`, [id])
  if (open) throw new AppError('CONFLICT', 'Table has an open order')
  const result = dbWrite('UPDATE dining_tables SET isArchived = 1 WHERE id = ?', [id])
  if (result.changes === 0) throw new AppError('NOT_FOUND')
  writeAudit('tables.remove', 'table', id)
  return { removed: true }
}

export interface SaveAreaInput {
  id?: number
  nameAr: string
  nameFr: string
  color?: string
  sortOrder?: number
}

export function saveArea(input: SaveAreaInput): DiningArea {
  const nameAr = input.nameAr.trim()
  const nameFr = input.nameFr.trim()
  if (!nameAr || !nameFr) throw new AppError('VALIDATION', 'Both area names are required')
  if (input.id) {
    dbWrite('UPDATE dining_areas SET nameAr = ?, nameFr = ?, color = ?, sortOrder = ? WHERE id = ?', [
      nameAr,
      nameFr,
      input.color ?? '#1239B0',
      input.sortOrder ?? 0,
      input.id
    ])
    writeAudit('areas.update', 'area', input.id)
    return dbGet<DiningArea>('SELECT id, nameAr, nameFr, color, sortOrder, isArchived FROM dining_areas WHERE id = ?', [
      input.id
    ]) as DiningArea
  }
  const created = dbWrite('INSERT INTO dining_areas (nameAr, nameFr, color, sortOrder) VALUES (?, ?, ?, ?)', [
    nameAr,
    nameFr,
    input.color ?? '#1239B0',
    input.sortOrder ?? 0
  ])
  writeAudit('areas.create', 'area', created.lastInsertRowid)
  return dbGet<DiningArea>('SELECT id, nameAr, nameFr, color, sortOrder, isArchived FROM dining_areas WHERE id = ?', [
    created.lastInsertRowid
  ]) as DiningArea
}

export function archiveArea(id: number): { archived: boolean } {
  const tables = dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM dining_tables WHERE areaId = ? AND isArchived = 0', [
    id
  ])
  if (tables && tables.count > 0) throw new AppError('CONFLICT', 'Area still has tables')
  const result = dbWrite('UPDATE dining_areas SET isArchived = 1 WHERE id = ?', [id])
  if (result.changes === 0) throw new AppError('NOT_FOUND')
  writeAudit('areas.archive', 'area', id)
  return { archived: true }
}

export { OPEN_ORDER }
