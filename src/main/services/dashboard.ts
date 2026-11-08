import type { DashboardSummary } from '@shared/types'
import { dbAll, dbGet } from '../db/client'
import { dayString, monthStart, today } from '../utils/dates'

interface Range {
  from?: string | null
  to?: string | null
}

export function dashboardSummary(range: Range = {}): DashboardSummary {
  const from = dayString(range.from ?? null, monthStart())
  const to = dayString(range.to ?? null, today())
  const params = [`${from} 00:00:00`, `${to} 23:59:59`]
  /* Always qualify the columns: order_items also has status/createdAt, so an unqualified
     fragment makes joined queries fail with "ambiguous column name: createdAt". */
  const completedOn = (alias: string): string =>
    `${alias}.status = 'completed' AND ${alias}.createdAt BETWEEN ? AND ?`
  const completed = `status = 'completed' AND createdAt BETWEEN ? AND ?`

  const sales = dbGet<{ total: number | null; count: number; items: number | null }>(
    `SELECT SUM(o.totalCents) AS total,
            COUNT(*) AS count,
            (SELECT SUM(oi.qty) FROM order_items oi JOIN orders o2 ON o2.id = oi.orderId
              WHERE ${completedOn('o2')}) AS items
       FROM orders o WHERE ${completedOn('o')}`,
    [...params, ...params]
  )

  const expensesCents =
    dbGet<{ total: number | null }>('SELECT SUM(amountCents) AS total FROM expenses WHERE expenseDate BETWEEN ? AND ?', [
      from,
      to
    ])?.total ?? 0

  const salesCents = sales?.total ?? 0
  const ordersCount = sales?.count ?? 0

  const statusCount = (status: string): number =>
    dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM orders WHERE status = ?', [status])?.count ?? 0

  const topProducts = dbAll<{ productId: number; nameAr: string; nameFr: string; qty: number; revenueCents: number }>(
    `SELECT oi.productId,
            oi.productNameAr AS nameAr,
            oi.productNameFr AS nameFr,
            SUM(oi.qty) AS qty,
            SUM(oi.lineTotalCents) AS revenueCents
       FROM order_items oi
       JOIN orders o ON o.id = oi.orderId
      WHERE ${completedOn('o')} AND oi.status = 'active'
      GROUP BY oi.productId
      ORDER BY qty DESC
      LIMIT 8`,
    params
  )

  const lowStock = dbAll<{ id: number; nameAr: string; nameFr: string; unit: string; stockQty: number; minQty: number }>(
    `SELECT id, nameAr, nameFr, unit, stockQtyBase AS stockQty, minQtyBase AS minQty
       FROM ingredients
      WHERE isArchived = 0 AND minQtyBase > 0 AND stockQtyBase <= minQtyBase
      ORDER BY (stockQtyBase - minQtyBase) ASC
      LIMIT 10`
  )

  const recentActivity = dbAll<{ id: number; orderNumber: string; status: string; totalCents: number; createdAt: string }>(
    'SELECT id, orderNumber, status, totalCents, createdAt FROM orders ORDER BY id DESC LIMIT 8'
  )

  const hourlySales = dbAll<{ hour: string; salesCents: number; orders: number }>(
    `SELECT substr(createdAt, 12, 2) || ':00' AS hour,
            SUM(totalCents) AS salesCents,
            COUNT(*) AS orders
       FROM orders WHERE ${completed}
      GROUP BY hour ORDER BY hour`,
    params
  )

  const dailySales = dbAll<{ date: string; salesCents: number; orders: number }>(
    `SELECT substr(createdAt, 1, 10) AS date,
            SUM(totalCents) AS salesCents,
            COUNT(*) AS orders
       FROM orders WHERE ${completed}
      GROUP BY date ORDER BY date`,
    params
  )

  return {
    from,
    to,
    salesCents,
    ordersCount,
    preparingCount: statusCount('preparing'),
    readyCount: statusCount('ready'),
    averageOrderCents: ordersCount > 0 ? Math.round(salesCents / ordersCount) : 0,
    expensesCents,
    netResultCents: salesCents - expensesCents,
    itemsSold: sales?.items ?? 0,
    topProducts,
    lowStock,
    recentActivity,
    hourlySales,
    dailySales
  }
}
