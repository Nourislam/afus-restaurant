/**
 * Kitchen Display System. The board groups the items that have been fired to the
 * kitchen (status pending / preparing / ready) into one ticket per order, with a
 * live elapsed timer and a "late" flag past the configured alert time.
 */
import type { KitchenBoard, KitchenTicket, OrderItem } from '@shared/types'
import { STATIONS } from '@shared/constants'
import { dbAll, dbGet, dbWrite } from '../db/client'
import { getSettings } from './settings'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'

const KITCHEN_STATUSES = ['pending', 'preparing', 'ready']
const NEXT: Record<string, string> = { pending: 'preparing', preparing: 'ready', ready: 'served' }

function minutesSince(stamp: string): number {
  const then = new Date(stamp.replace(' ', 'T')).getTime()
  if (Number.isNaN(then)) return 0
  return Math.max(0, Math.floor((Date.now() - then) / 60000))
}

export function kitchenBoard(input: { station?: string | null } = {}): KitchenBoard {
  const alert = getSettings().kitchenAlertMinutes
  const stationFilter = input.station && input.station !== 'all' ? input.station : null

  const orders = dbAll<{
    id: number
    orderNumber: string
    type: string
    status: string
    note: string | null
    createdAt: string
    tableName: string | null
    waiterName: string | null
    customerName: string | null
  }>(
    `SELECT o.id, o.orderNumber, o.type, o.status, o.note, o.createdAt,
            t.name AS tableName, u.fullName AS waiterName, c.name AS customerName
       FROM orders o
       LEFT JOIN dining_tables t ON t.id = o.tableId
       LEFT JOIN users u ON u.id = o.userId
       LEFT JOIN customers c ON c.id = o.customerId
      WHERE o.status NOT IN ('completed', 'cancelled')
        AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.orderId = o.id AND oi.status IN ('pending','preparing','ready'))
      ORDER BY o.id ASC`
  )

  const tickets: KitchenTicket[] = []
  const counts = { new: 0, preparing: 0, ready: 0, late: 0 }

  for (const order of orders) {
    const items = dbAll<OrderItem>(
      `SELECT * FROM order_items
        WHERE orderId = ? AND status IN ('pending','preparing','ready')
        ${stationFilter ? 'AND station = ?' : ''}
        ORDER BY id`,
      stationFilter ? [order.id, stationFilter] : [order.id]
    ).map((item) => ({ ...item, modifiers: dbAll(
      'SELECT id, modifierId, nameAr, nameFr, priceCents FROM order_item_modifiers WHERE orderItemId = ? ORDER BY id',
      [item.id]
    ) })) as OrderItem[]
    if (items.length === 0) continue

    const elapsedMinutes = minutesSince(order.createdAt)
    const late = elapsedMinutes >= alert
    for (const item of items) {
      if (item.status === 'pending') counts.new += 1
      else if (item.status === 'preparing') counts.preparing += 1
      else if (item.status === 'ready') counts.ready += 1
    }
    if (late) counts.late += 1

    tickets.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      type: order.type,
      status: order.status,
      tableName: order.tableName,
      waiterName: order.waiterName,
      customerName: order.customerName,
      note: order.note,
      createdAt: order.createdAt,
      elapsedMinutes,
      late,
      items
    })
  }

  const stations = STATIONS.map((station) => ({
    value: station.value,
    pending:
      dbGet<{ n: number }>(
        `SELECT COUNT(*) AS n FROM order_items oi JOIN orders o ON o.id = oi.orderId
          WHERE o.status NOT IN ('completed','cancelled') AND oi.station = ? AND oi.status IN ('pending','preparing')`,
        [station.value]
      )?.n ?? 0
  })).filter((station) => station.pending > 0)

  return { tickets, stations, counts }
}

export function setItemKitchenStatus(input: { itemId: number; status: string }): KitchenBoard {
  if (!['pending', 'preparing', 'ready', 'served'].includes(input.status)) {
    throw new AppError('VALIDATION', 'Invalid kitchen status')
  }
  const item = dbGet<{ id: number; status: string }>('SELECT id, status FROM order_items WHERE id = ?', [input.itemId])
  if (!item) throw new AppError('NOT_FOUND')
  dbWrite('UPDATE order_items SET status = ? WHERE id = ?', [input.status, input.itemId])
  dbWrite('UPDATE kitchen_tickets SET status = ?, updatedAt = ? WHERE orderItemId = ?', [
    input.status,
    nowStamp(),
    input.itemId
  ])
  return kitchenBoard()
}

/** Exposed for tests/readability. */
export const KITCHEN_FLOW = { KITCHEN_STATUSES, NEXT }
