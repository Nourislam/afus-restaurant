/** Table reservations with a light table-status lifecycle. */
import type { Reservation } from '@shared/types'
import { dbAll, dbGet, dbWrite, transaction } from '../db/client'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { writeAudit } from './audit'

const SELECT = `
  SELECT r.id, r.customerName, r.phone, r.date, r.time, r.partySize, r.tableId, t.name AS tableName, r.note, r.status, r.createdAt
    FROM reservations r LEFT JOIN dining_tables t ON t.id = r.tableId`

const FLOW: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled', 'arrived', 'noShow'],
  confirmed: ['arrived', 'noShow', 'cancelled', 'pending'],
  arrived: ['cancelled'],
  noShow: ['confirmed'],
  cancelled: ['pending']
}

export function getReservation(id: number): Reservation {
  const row = dbGet<Reservation>(`${SELECT} WHERE r.id = ?`, [id])
  if (!row) throw new AppError('NOT_FOUND')
  return row
}

export function listReservations(input: { from?: string | null; to?: string | null; status?: string | null; search?: string | null; limit?: number } = {}): Reservation[] {
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (input.from) {
    clauses.push('r.date >= ?')
    params.push(input.from)
  }
  if (input.to) {
    clauses.push('r.date <= ?')
    params.push(input.to)
  }
  if (input.status) {
    clauses.push('r.status = ?')
    params.push(input.status)
  }
  if (input.search) {
    clauses.push('(r.customerName LIKE ? OR r.phone LIKE ?)')
    params.push(`%${input.search}%`, `%${input.search}%`)
  }
  params.push(Math.min(1000, input.limit ?? 300))
  return dbAll<Reservation>(`${SELECT} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY r.date, r.time, r.id LIMIT ?`, params)
}

function syncTable(tableId: number | null, status: string): void {
  if (!tableId) return
  if (status === 'confirmed') {
    dbWrite("UPDATE dining_tables SET status = 'reserved' WHERE id = ? AND status = 'free'", [tableId])
  } else if (status === 'arrived') {
    dbWrite("UPDATE dining_tables SET status = 'occupied' WHERE id = ? AND status IN ('free','reserved')", [tableId])
  } else if (status === 'cancelled' || status === 'noShow') {
    dbWrite("UPDATE dining_tables SET status = 'free' WHERE id = ? AND status = 'reserved'", [tableId])
  }
}

export function saveReservation(input: {
  id?: number
  customerName: string
  phone: string
  date: string
  time: string
  partySize: number
  tableId?: number | null
  note?: string | null
  status?: string
}): Reservation {
  const customerName = input.customerName.trim()
  const phone = input.phone.trim()
  if (!customerName || !phone) throw new AppError('VALIDATION', 'Name and phone are required')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) throw new AppError('VALIDATION', 'Bad date or time')
  const status = input.status ?? 'pending'
  if (!(status in FLOW)) throw new AppError('VALIDATION', 'Unknown status')
  if (input.tableId && !dbGet('SELECT id FROM dining_tables WHERE id = ?', [input.tableId])) throw new AppError('NOT_FOUND', 'Table')
  let id = input.id ?? 0
  transaction(() => {
    if (input.id) {
      const previous = getReservation(input.id)
      dbWrite('UPDATE reservations SET customerName = ?, phone = ?, date = ?, time = ?, partySize = ?, tableId = ?, note = ?, status = ? WHERE id = ?', [
        customerName,
        phone,
        input.date,
        input.time,
        Math.max(1, Math.floor(input.partySize)),
        input.tableId ?? null,
        input.note ?? null,
        status,
        input.id
      ])
      if (previous.tableId && previous.tableId !== (input.tableId ?? null)) syncTable(previous.tableId, 'cancelled')
    } else {
      id = Number(
        dbWrite('INSERT INTO reservations (customerName, phone, date, time, partySize, tableId, note, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          customerName,
          phone,
          input.date,
          input.time,
          Math.max(1, Math.floor(input.partySize)),
          input.tableId ?? null,
          input.note ?? null,
          status,
          nowStamp()
        ]).lastInsertRowid
      )
    }
    syncTable(input.tableId ?? null, status)
  })
  writeAudit(input.id ? 'reservations.update' : 'reservations.create', 'reservation', id)
  return getReservation(id)
}

export function setReservationStatus(id: number, status: string): Reservation {
  const current = getReservation(id)
  if (current.status === status) return current
  if (!(FLOW[current.status] ?? []).includes(status)) throw new AppError('INVALID_STATUS', `${current.status} → ${status}`)
  transaction(() => {
    dbWrite('UPDATE reservations SET status = ? WHERE id = ?', [status, id])
    syncTable(current.tableId, status)
  })
  writeAudit('reservations.status', 'reservation', id, { from: current.status, to: status })
  return getReservation(id)
}
