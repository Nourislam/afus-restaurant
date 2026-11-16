/** The delivery sheet: couriers, statuses and the link back to the order. */
import type { DeliveryRecord } from '@shared/types'
import { dbAll, dbGet, dbWrite, transaction } from '../db/client'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { writeAudit } from './audit'
import { cancelOrder } from './orders'

const SELECT = `
  SELECT d.id, d.orderId, d.customerName, d.phone, d.address, d.area, d.feeCents, d.courier, d.status, d.note, d.deliveredAt,
         o.orderNumber, o.totalCents AS orderTotalCents, o.paidCents AS orderPaidCents, o.status AS orderStatus, o.createdAt AS orderCreatedAt
    FROM delivery_info d JOIN orders o ON o.id = d.orderId`

const FLOW: Record<string, string[]> = {
  pending: ['assigned', 'delivered', 'cancelled'],
  assigned: ['delivered', 'cancelled', 'pending'],
  delivered: [],
  cancelled: []
}

export function getDelivery(id: number): DeliveryRecord {
  const row = dbGet<DeliveryRecord>(`${SELECT} WHERE d.id = ?`, [id])
  if (!row) throw new AppError('NOT_FOUND')
  return row
}

export function listDeliveries(input: { status?: string | null; search?: string | null; from?: string | null; to?: string | null; limit?: number } = {}): DeliveryRecord[] {
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (input.status) {
    clauses.push('d.status = ?')
    params.push(input.status)
  }
  if (input.search) {
    clauses.push('(d.customerName LIKE ? OR d.phone LIKE ? OR d.address LIKE ? OR o.orderNumber LIKE ? OR d.courier LIKE ?)')
    const like = `%${input.search.trim()}%`
    params.push(like, like, like, like, like)
  }
  if (input.from) {
    clauses.push('o.createdAt >= ?')
    params.push(`${input.from} 00:00:00`)
  }
  if (input.to) {
    clauses.push('o.createdAt <= ?')
    params.push(`${input.to} 23:59:59`)
  }
  params.push(Math.min(1000, input.limit ?? 300))
  return dbAll<DeliveryRecord>(`${SELECT} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY o.createdAt DESC LIMIT ?`, params)
}

export function saveDelivery(input: { id: number; courier?: string | null; area?: string | null; note?: string | null; address?: string | null; phone?: string | null }): DeliveryRecord {
  const current = getDelivery(input.id)
  dbWrite('UPDATE delivery_info SET courier = ?, area = ?, note = ?, address = ?, phone = ? WHERE id = ?', [
    input.courier === undefined ? current.courier : input.courier,
    input.area === undefined ? current.area : input.area,
    input.note === undefined ? current.note : input.note,
    input.address === undefined || input.address === null ? current.address : input.address,
    input.phone === undefined || input.phone === null ? current.phone : input.phone,
    input.id
  ])
  writeAudit('delivery.update', 'delivery', input.id)
  return getDelivery(input.id)
}

export function setDeliveryStatus(id: number, status: string, note?: string | null): DeliveryRecord {
  const current = getDelivery(id)
  if (!(FLOW[current.status] ?? []).includes(status)) throw new AppError('INVALID_STATUS', `${current.status} → ${status}`)
  if (status === 'assigned' && !current.courier) throw new AppError('VALIDATION', 'Assign a courier first')
  /* One step: the sheet and the order it belongs to move together, or not at
     all. cancelOrder opens its own transaction, which joins this one. */
  transaction(() => {
    dbWrite('UPDATE delivery_info SET status = ?, deliveredAt = ?, note = COALESCE(?, note) WHERE id = ?', [
      status,
      status === 'delivered' ? nowStamp() : null,
      note ?? null,
      id
    ])
    if (status === 'cancelled' && !['completed', 'cancelled'].includes(current.orderStatus)) {
      cancelOrder({ orderId: current.orderId, reason: note ?? 'delivery cancelled' })
    }
  })
  writeAudit('delivery.status', 'delivery', id, { from: current.status, to: status })
  return getDelivery(id)
}
