/**
 * The demo restaurant is what a buyer sees first, so it has to be a real
 * restaurant and not a stage set: the figures must add up, the fiscal chain
 * must verify, and the service in progress must be in progress.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, dbAll, dbGet, openDatabase } from '../src/main/db/client'
import { seedCoreData } from '../src/main/db/seed'
import { DEMO_PIN, seedDemoRestaurant } from '../src/main/services/demo'
import { completeSetup } from '../src/main/services/setup'
import { verifyIntegrity } from '../src/main/services/fiscal'
import { dashboardSummary } from '../src/main/services/dashboard'
import { kitchenBoard } from '../src/main/services/kitchen'
import { tableMap } from '../src/main/services/venue'
import { listOrders } from '../src/main/services/orders'
import { listForLogin, loginWithPin } from '../src/main/services/auth'
import { clearSession } from '../src/main/security/session'

beforeEach(async () => {
  closeDatabase()
  clearSession()
  await openDatabase(null)
  seedCoreData()
})

const count = (sql: string, params: unknown[] = []): number =>
  dbGet<{ n: number }>(`SELECT COUNT(*) AS n FROM ${sql}`, params as never[])?.n ?? 0

describe('the demo restaurant', () => {
  it('refuses to touch a database that already has a restaurant', () => {
    completeSetup({
      restaurantName: 'Real',
      currency: 'DZD',
      language: 'ar',
      taxEnabled: false,
      taxRateBp: 0,
      ownerFullName: 'Owner',
      ownerPin: '1234'
    })
    expect(() => seedDemoRestaurant()).toThrowError(/already has a restaurant/)
  })

  it('opens on a restaurant in the middle of a service', { timeout: 30_000 }, () => {
    seedDemoRestaurant({ historyDays: 6 })

    /* A floor with rooms and tables in more than one state. */
    const map = tableMap()
    expect(map.areas.length).toBeGreaterThanOrEqual(3)
    expect(map.tables.length).toBeGreaterThanOrEqual(13)
    const states = new Set(map.tables.map((table) => table.status))
    expect(states.size).toBeGreaterThanOrEqual(3)
    expect(map.tables.filter((table) => table.openOrderId).length).toBeGreaterThanOrEqual(3)

    /* Tickets on the kitchen board, at more than one stage. */
    const board = kitchenBoard()
    expect(board.tickets.length).toBeGreaterThanOrEqual(3)
    expect(board.counts.new + board.counts.preparing + board.counts.ready).toBeGreaterThan(0)
    expect(board.counts.preparing).toBeGreaterThan(0)
    expect(board.counts.ready).toBeGreaterThan(0)

    /* Both orders of business on display: a prepaid order still waiting. */
    const open = listOrders({ status: 'open' })
    expect(open.some((order) => order.paidAt !== null && order.dueCents === 0)).toBe(true)
    expect(open.some((order) => order.dueCents > 0)).toBe(true)

    /* A card, staff, customers, an offer and tonight's book. */
    expect(count('products WHERE isArchived = 0')).toBeGreaterThanOrEqual(16)
    expect(count('users WHERE isActive = 1')).toBe(5)
    expect(count('customers')).toBeGreaterThanOrEqual(4)
    expect(count('offers WHERE isActive = 1')).toBe(1)
    expect(count('reservations')).toBe(3)
    expect(count("cash_sessions WHERE status = 'open'")).toBe(1)
  })

  it('is written in the language it was asked for', () => {
    seedDemoRestaurant({ lang: 'fr', historyDays: 2 })
    const settings = dbGet<{ value: string }>("SELECT value FROM settings WHERE key = 'language'")
    expect(JSON.parse(settings!.value)).toBe('fr')
    const names = dbAll<{ fullName: string }>('SELECT fullName FROM users').map((row) => row.fullName)
    expect(names).toContain('Islam Nouri')
    expect(names).toContain('Amina Kaci')
    /* Not a single Arabic letter in a French demo's staff list. */
    expect(names.some((name) => /[\u0600-\u06FF]/.test(name))).toBe(false)
  })

  it('every member of staff can sign in with the demo PIN', () => {
    seedDemoRestaurant({ historyDays: 2 })
    const profiles = listForLogin()
    expect(profiles).toHaveLength(5)
    for (const person of profiles) {
      const session = loginWithPin({ id: person.id, pin: DEMO_PIN })
      expect(session.permissions.length).toBeGreaterThan(0)
    }
    /* Every role a restaurant has, so a visitor can see each person's screen. */
    const roles = new Set(dbAll<{ roleId: string }>('SELECT roleId FROM users').map((r) => r.roleId))
    expect([...roles].sort()).toEqual(['cashier', 'kitchen', 'owner', 'stock', 'waiter'])
  })

  it('has weeks of takings behind it, and the dashboard reads them', { timeout: 30_000 }, () => {
    seedDemoRestaurant({ historyDays: 12 })
    const summary = dashboardSummary()
    expect(summary.salesCents).toBeGreaterThan(0)
    expect(summary.ordersCount).toBeGreaterThan(50)
    expect(summary.topProducts.length).toBeGreaterThan(0)
    expect(summary.dailySales.length).toBeGreaterThanOrEqual(10)
    /* Spread over real days, not all stacked on today. */
    const days = new Set(dbAll<{ d: string }>('SELECT substr(createdAt, 1, 10) AS d FROM orders').map((r) => r.d))
    expect(days.size).toBeGreaterThanOrEqual(10)
  })

  it('leaves a fiscal chain that verifies, in date order', { timeout: 30_000 }, () => {
    seedDemoRestaurant({ historyDays: 8 })
    const report = verifyIntegrity()
    expect(report.orders.brokenAt).toBeNull()
    expect(report.audit.brokenAt).toBeNull()
    expect(report.ok).toBe(true)
    expect(report.orders.checked).toBeGreaterThan(50)

    /* Sealed in the order the money came in: a tax inspector's first question. */
    const sealed = dbAll<{ fiscalSeq: number; soldAt: string }>(
      'SELECT fiscalSeq, COALESCE(paidAt, completedAt) AS soldAt FROM orders WHERE fiscalSeq IS NOT NULL ORDER BY fiscalSeq'
    )
    for (let i = 1; i < sealed.length; i += 1) {
      expect(sealed[i]!.fiscalSeq).toBe(sealed[i - 1]!.fiscalSeq + 1)
      expect(sealed[i]!.soldAt >= sealed[i - 1]!.soldAt).toBe(true)
    }
  })

  it('is the same restaurant every time it is built', { timeout: 30_000 }, async () => {
    seedDemoRestaurant({ historyDays: 5 })
    const first = dbGet<{ total: number; n: number }>(
      "SELECT COALESCE(SUM(totalCents), 0) AS total, COUNT(*) AS n FROM orders WHERE status = 'completed'"
    )
    closeDatabase()
    clearSession()
    await openDatabase(null)
    seedCoreData()
    seedDemoRestaurant({ historyDays: 5 })
    const second = dbGet<{ total: number; n: number }>(
      "SELECT COALESCE(SUM(totalCents), 0) AS total, COUNT(*) AS n FROM orders WHERE status = 'completed'"
    )
    expect(second).toEqual(first)
  })
})
