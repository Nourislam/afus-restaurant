import { beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, dbGet, openDatabase } from '../src/main/db/client'
import { seedCoreData } from '../src/main/db/seed'
import { completeSetup } from '../src/main/services/setup'
import { updateSettings } from '../src/main/services/settings'
import { saveBranch } from '../src/main/services/branches'
import { listUsers, saveUser } from '../src/main/services/users'
import { createOrder, listOrders, payOrder } from '../src/main/services/orders'
import { report } from '../src/main/services/reports'
import { isHeadOffice, resolveBranchFilter, terminalBranchId, userBranchId } from '../src/main/services/scope'
import { clearSession, setSession } from '../src/main/security/session'

const product = () => dbGet<{ id: number; priceCents: number }>('SELECT id, priceCents FROM products ORDER BY id LIMIT 1')!
const signIn = (user: { id: number; username: string }) => setSession({ userId: user.id, username: user.username, issuedAt: Date.now() })

let owner: { id: number; username: string }
let alger: number
let oran: number

function sellAt(branchId: number, times = 1) {
  updateSettings({ currentBranchId: branchId })
  for (let i = 0; i < times; i += 1) {
    const order = createOrder({ type: 'takeaway', items: [{ productId: product().id, qty: 1 }] })
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
  }
}

beforeEach(async () => {
  closeDatabase()
  clearSession()
  await openDatabase(null)
  seedCoreData()
  owner = completeSetup({ restaurantName: 'Djemr', currency: 'DZD', language: 'ar', taxEnabled: false, taxRateBp: 0, ownerFullName: 'Owner', ownerPin: '1234' })
  signIn(owner)
  alger = saveBranch({ nameAr: 'الجزائر', nameFr: 'Alger' }).id
  oran = saveBranch({ nameAr: 'وهران', nameFr: 'Oran' }).id
})

describe('a sale knows where it was sold', () => {
  it('takes the branch of the terminal that opened it', () => {
    updateSettings({ currentBranchId: oran })
    const order = createOrder({ type: 'takeaway', items: [{ productId: product().id, qty: 1 }] })
    expect(dbGet<{ branchId: number }>('SELECT branchId FROM orders WHERE id = ?', [order.id])?.branchId).toBe(oran)
  })

  it('lets a web order name its own branch instead', () => {
    updateSettings({ currentBranchId: oran })
    const order = createOrder({ type: 'delivery', branchId: alger, items: [{ productId: product().id, qty: 1 }], delivery: { customerName: 'A', phone: '1', address: 'B' } })
    expect(dbGet<{ branchId: number }>('SELECT branchId FROM orders WHERE id = ?', [order.id])?.branchId).toBe(alger)
  })

  it('prefers the seller\'s own branch over the terminal setting', () => {
    const manager = saveUser({ fullName: 'Chef Oran', roleId: 'admin', pin: '2222', branchId: oran })
    updateSettings({ currentBranchId: alger })
    signIn(manager)
    expect(terminalBranchId()).toBe(oran)
  })
})

describe('who is head office and who is a branch', () => {
  it('reads it from the person, not from the screen', () => {
    expect(isHeadOffice()).toBe(true)
    expect(userBranchId()).toBeNull()
    const manager = saveUser({ fullName: 'Chef Alger', roleId: 'admin', pin: '3333', branchId: alger })
    signIn(manager)
    expect(isHeadOffice()).toBe(false)
    expect(userBranchId()).toBe(alger)
  })

  it('overrides what a branch user asks for, instead of trusting it', () => {
    const manager = saveUser({ fullName: 'Chef Alger', roleId: 'admin', pin: '3333', branchId: alger })
    signIn(manager)
    /* Asking for Oran still answers Alger: the rule is in the service. */
    expect(resolveBranchFilter(oran)).toBe(alger)
    expect(resolveBranchFilter(null)).toBe(alger)
  })

  it('lets head office choose a branch or all of them', () => {
    expect(resolveBranchFilter(oran)).toBe(oran)
    expect(resolveBranchFilter(null)).toBeNull()
  })

  it('shows the branch beside the employee', () => {
    saveUser({ fullName: 'Chef Oran', roleId: 'admin', pin: '2222', branchId: oran })
    const row = listUsers().find((user) => user.fullName === 'Chef Oran')
    expect(row?.branchId).toBe(oran)
    expect(row?.branchName).toBe('وهران')
  })
})

describe('the figures each one sees', () => {
  beforeEach(() => {
    sellAt(alger, 3)
    sellAt(oran, 2)
  })

  it('gives head office the whole network, or one branch of it', () => {
    const all = report('sales') as any
    expect(all.totals.orders).toBe(5)
    expect((report('sales', undefined, undefined, alger) as any).totals.orders).toBe(3)
    expect((report('sales', undefined, undefined, oran) as any).totals.orders).toBe(2)
  })

  it('gives a branch only its own, whatever it asks for', () => {
    const manager = saveUser({ fullName: 'Chef Oran', roleId: 'admin', pin: '2222', branchId: oran })
    signIn(manager)
    expect((report('sales') as any).totals.orders).toBe(2)
    /* Asking for the other branch, or for everything, still answers two. */
    expect((report('sales', undefined, undefined, alger) as any).totals.orders).toBe(2)
    expect((report('sales', undefined, undefined, null) as any).totals.orders).toBe(2)
    expect(listOrders({}).length).toBe(2)
  })

  it('scopes the other sales reports the same way', () => {
    const manager = saveUser({ fullName: 'Chef Oran', roleId: 'admin', pin: '2222', branchId: oran })
    signIn(manager)
    expect((report('products') as any).totals.qty).toBe(2)
    expect((report('payments') as any).totals.count).toBe(2)
    expect((report('orderTypes') as any).totals.orders).toBe(2)
  })

  it('compares the branches for head office, and refuses a branch user', () => {
    const comparison = report('branches') as any
    expect(comparison.rows).toHaveLength(2)
    /* The comparison adds up to the network total. */
    expect(comparison.totals.orders).toBe(5)
    expect(comparison.rows.reduce((sum: number, row: any) => sum + Number(row.orders), 0)).toBe(5)
    const biggest = comparison.rows[0]
    expect(Number(biggest.orders)).toBe(3)

    const manager = saveUser({ fullName: 'Chef Oran', roleId: 'admin', pin: '2222', branchId: oran })
    signIn(manager)
    expect(() => report('branches')).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }))
  })
})
