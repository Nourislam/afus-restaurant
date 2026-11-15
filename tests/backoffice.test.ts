import { beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, dbGet, openDatabase } from '../src/main/db/client'
import { seedCoreData } from '../src/main/db/seed'
import { completeSetup } from '../src/main/services/setup'
import { cancelOrder, createOrder, payOrder } from '../src/main/services/orders'
import { adjustIngredient, getIngredient, listIngredients, listMovements, removeIngredient, saveIngredient, wasteIngredient } from '../src/main/services/inventory'
import { getRecipe, saveRecipe } from '../src/main/services/recipes'
import { cancelPurchase, getSupplier, paySupplier, receivePurchase, savePurchase, saveSupplier } from '../src/main/services/purchases'
import { cashMovement, closeSession, currentSession, expectedCash, openSession, saveExpense, sessionMovements } from '../src/main/services/finance'
import { listReservations, saveReservation, setReservationStatus } from '../src/main/services/reservations'
import { listDeliveries, saveDelivery, setDeliveryStatus } from '../src/main/services/delivery'
import { clock, listAttendance } from '../src/main/services/attendance'
import { productsReport, reportCsv, salesReport, wasteReport } from '../src/main/services/reports'
import { insightAsk, insightOverview } from '../src/main/services/insight'
import { baseUnitFor, costToMicros, fromBase, microsToUnitCents, toBase, unitFactor } from '../src/main/services/units'
import { clearSession } from '../src/main/security/session'
import { today } from '../src/main/utils/dates'

const product = (name: string) => dbGet<{ id: number; priceCents: number }>('SELECT id, priceCents FROM products WHERE nameFr = ?', [name])!
const ingredient = (name: string) => dbGet<{ id: number; stockQtyBase: number }>('SELECT id, stockQtyBase FROM ingredients WHERE nameFr = ?', [name])!
const table = () => dbGet<{ id: number; status: string }>('SELECT id, status FROM dining_tables ORDER BY id LIMIT 1')!

beforeEach(async () => {
  closeDatabase()
  clearSession()
  await openDatabase(null)
  seedCoreData()
  completeSetup({ restaurantName: 'Djemr', currency: 'DZD', language: 'ar', taxEnabled: false, taxRateBp: 0, ownerFullName: 'Owner', ownerPin: '1234' })
})

describe('units', () => {
  it('converts display units to base units and costs both ways', () => {
    expect(baseUnitFor('kg')).toBe('g')
    expect(unitFactor('l', 'ml')).toBe(1000)
    expect(toBase(1.5, 1000)).toBe(1500)
    expect(fromBase(1500, 1000)).toBe(1.5)
    expect(costToMicros(120_000, 1000)).toBe(1_200_000) // 1 200 DA/kg → 1.2 DA/g
    expect(microsToUnitCents(1_200_000, 1000)).toBe(120_000)
  })
})

describe('stock', () => {
  it('creates an ingredient with an opening quantity, adjusts and wastes it', () => {
    const onions = saveIngredient({ nameAr: 'بصل', nameFr: 'Oignons', unit: 'kg', costPerUnitCents: 8_000, minQty: 1, openingQty: 5 })
    expect(onions.stockQty).toBe(5)
    expect(onions.unitCostCents).toBe(8_000)
    expect(onions.stockValueCents).toBe(40_000)
    expect(adjustIngredient(onions.id, 4.5, 'count').stockQty).toBe(4.5)
    const wasted = wasteIngredient(onions.id, 0.5, 'spoiled')
    expect(wasted.stockQty).toBe(4)
    const types = listMovements({ ingredientId: onions.id }).map((m) => m.type)
    expect(types).toEqual(['waste', 'adjustment', 'stockIn'])
    expect(removeIngredient(onions.id)).toEqual({ removed: false }) // has history → archived
    expect(listIngredients().some((i) => i.id === onions.id)).toBe(false)
  })

  it('consumes recipe ingredients when a sale completes and restores them on cancel', () => {
    const burger = product('Grillade mixte')
    const beefBefore = ingredient('Viande de bœuf').stockQtyBase
    const order = createOrder({ type: 'takeaway', items: [{ productId: burger.id, qty: 2 }] })
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(ingredient('Viande de bœuf').stockQtyBase).toBe(beefBefore - 500) // 250 g × 2
    const usage = listMovements({ type: 'usage' })
    expect(usage[0]?.refType).toBe('order')
    /* A second completion must not deduct twice. */
    expect(dbGet<{ stockDeducted: number }>('SELECT stockDeducted FROM orders WHERE id = ?', [order.id])?.stockDeducted).toBe(1)

    const second = createOrder({ type: 'takeaway', items: [{ productId: burger.id, qty: 1 }] })
    cancelOrder({ orderId: second.id, reason: 'test', stockPolicy: 'restore' })
    expect(ingredient('Viande de bœuf').stockQtyBase).toBe(beefBefore - 500) // never deducted, nothing restored
  })
})

describe('recipes', () => {
  it('saves a recipe and syncs the product cost', () => {
    const tea = product('Thé à la menthe')
    const mint = ingredient('Menthe')
    const recipe = saveRecipe({ productId: tea.id, items: [{ ingredientId: mint.id, qty: 0.01 }] }) // 10 g at 400 DA/kg = 4 DA
    expect(recipe.hasRecipe).toBe(true)
    expect(recipe.totalCostCents).toBe(400)
    expect(recipe.marginCents).toBe(tea.priceCents - 400)
    expect(dbGet<{ costCents: number }>('SELECT costCents FROM products WHERE id = ?', [tea.id])?.costCents).toBe(400)
    expect(getRecipe(tea.id).items[0]?.qty).toBe(0.01)
    expect(() => saveRecipe({ productId: tea.id, items: [] })).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
  })
})

describe('purchases', () => {
  it('receives an invoice into stock with a weighted cost and tracks the supplier balance', () => {
    const supplier = saveSupplier({ name: 'Boucherie El Baraka', phone: '0550' })
    const beef = ingredient('Viande de bœuf') // 8 kg at 1 200 DA/kg
    const purchase = savePurchase({ supplierId: supplier.id, invoiceNo: 'F-1', items: [{ ingredientId: beef.id, qty: 2, unitCostCents: 150_000 }] })
    expect(purchase.status).toBe('draft')
    expect(purchase.totalCents).toBe(300_000)
    expect(ingredient('Viande de bœuf').stockQtyBase).toBe(8000)

    const received = receivePurchase(purchase.id)
    expect(received.status).toBe('received')
    expect(ingredient('Viande de bœuf').stockQtyBase).toBe(10_000)
    /* (8 000 × 1.2 + 2 000 × 1.5) / 10 000 = 1.26 DA/g */
    expect(getIngredient(beef.id).unitCostCents).toBe(126_000)

    expect(getSupplier(supplier.id).balanceCents).toBe(300_000)
    paySupplier({ supplierId: supplier.id, purchaseId: purchase.id, amountCents: 100_000, method: 'cash' })
    expect(getSupplier(supplier.id).balanceCents).toBe(200_000)
    paySupplier({ supplierId: supplier.id, purchaseId: purchase.id, amountCents: 200_000, method: 'card' })
    const ledger = getSupplier(supplier.id)
    expect(ledger.balanceCents).toBe(0)
    expect(ledger.purchases?.[0]?.status).toBe('paid')
    expect(() => cancelPurchase(purchase.id)).toThrowError(expect.objectContaining({ code: 'CONFLICT' }))
  })

  it('cancelling a received, unpaid invoice returns the goods', () => {
    const supplier = saveSupplier({ name: 'Légumes' })
    const tomatoes = ingredient('Tomates')
    const purchase = receivePurchase(savePurchase({ supplierId: supplier.id, items: [{ ingredientId: tomatoes.id, qty: 3, unitCostCents: 10_000 }] }).id)
    expect(ingredient('Tomates').stockQtyBase).toBe(tomatoes.stockQtyBase + 3000)
    cancelPurchase(purchase.id)
    expect(ingredient('Tomates').stockQtyBase).toBe(tomatoes.stockQtyBase)
  })
})

describe('cash drawer', () => {
  it('posts sales, expenses and supplier payments to the open session and closes with a difference', () => {
    const session = openSession({ openingFloatCents: 500_000 })
    expect(() => openSession({ openingFloatCents: 0 })).toThrowError(expect.objectContaining({ code: 'CONFLICT' }))
    const burger = product('Grillade mixte')
    const order = createOrder({ type: 'takeaway', items: [{ productId: burger.id, qty: 1 }] })
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    saveExpense({ category: 'utilities', description: 'Gaz', amountCents: 20_000 })
    saveExpense({ category: 'rent', description: 'Loyer', amountCents: 999, method: 'transfer' }) // not cash → not in drawer
    const supplier = saveSupplier({ name: 'X' })
    paySupplier({ supplierId: supplier.id, amountCents: 30_000, method: 'cash' })
    cashMovement({ type: 'withdrawal', amountCents: 50_000, note: 'bank' })

    const open = currentSession()!
    expect(open.id).toBe(session.id)
    expect(open.cashSalesCents).toBe(order.totalCents)
    expect(open.expensesCents).toBe(20_000)
    expect(open.supplierPaymentsCents).toBe(30_000)
    expect(open.withdrawalsCents).toBe(50_000)
    const expected = 500_000 + order.totalCents - 20_000 - 30_000 - 50_000
    expect(expectedCash(open)).toBe(expected)
    expect(sessionMovements(open.id).map((m) => m.type).sort()).toEqual(['expense', 'sale', 'supplierPayment', 'withdrawal'])

    const closed = closeSession({ countedCents: expected - 1_000 })
    expect(closed.status).toBe('closed')
    expect(closed.differenceCents).toBe(-1_000)
    expect(currentSession()).toBeNull()
  })
})

describe('reservations + delivery + attendance', () => {
  it('reserves a table on confirmation and frees it on no-show', () => {
    const t = table()
    const r = saveReservation({ customerName: 'Amine', phone: '0661', date: today(), time: '20:00', partySize: 4, tableId: t.id })
    expect(listReservations({ from: today(), to: today() })).toHaveLength(1)
    setReservationStatus(r.id, 'confirmed')
    expect(table().status).toBe('reserved')
    setReservationStatus(r.id, 'noShow')
    expect(table().status).toBe('free')
    expect(() => setReservationStatus(r.id, 'arrived')).toThrowError(expect.objectContaining({ code: 'INVALID_STATUS' }))
  })

  it('walks a delivery through courier assignment and cancels the order when cancelled', () => {
    const burger = product('Grillade mixte')
    const order = createOrder({ type: 'delivery', items: [{ productId: burger.id, qty: 1 }], delivery: { customerName: 'Sara', phone: '0770', address: 'Rue 1', feeCents: 20_000 } })
    const [row] = listDeliveries({ status: 'pending' })
    expect(row?.orderId).toBe(order.id)
    expect(() => setDeliveryStatus(row!.id, 'assigned')).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
    saveDelivery({ id: row!.id, courier: 'Yacine' })
    expect(setDeliveryStatus(row!.id, 'assigned').status).toBe('assigned')
    const cancelled = setDeliveryStatus(row!.id, 'cancelled', 'client absent')
    expect(cancelled.orderStatus).toBe('cancelled')
  })

  it('clocks in and out', () => {
    const shift = clock({ type: 'in' })
    expect(shift.clockOut).toBeNull()
    expect(() => clock({ type: 'in' })).toThrowError(expect.objectContaining({ code: 'CONFLICT' }))
    expect(clock({ type: 'out' }).minutes).toBe(0)
    expect(listAttendance(today())).toHaveLength(1)
  })
})

describe('reports + insight', () => {
  it('totals sales and products and exports CSV', () => {
    const burger = product('Grillade mixte')
    const order = createOrder({ type: 'takeaway', items: [{ productId: burger.id, qty: 3 }] })
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    wasteIngredient(ingredient('Tomates').id, 1, 'test')
    const sales = salesReport(today(), today())
    expect(sales.totals?.orders).toBe(1)
    expect(sales.totals?.totalCents).toBe(order.totalCents)
    const products = productsReport(today(), today())
    expect(products.rows[0]?.qty).toBe(3)
    expect(wasteReport(today(), today()).rows[0]?.qty).toBe(1)
    const csv = reportCsv(sales, 'fr')
    expect(csv.split('\r\n')).toHaveLength(3)
    expect(csv).toContain('Commandes')
  })

  it('answers a bilingual question and builds the overview', () => {
    const burger = product('Grillade mixte')
    const order = createOrder({ type: 'takeaway', items: [{ productId: burger.id, qty: 1 }] })
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    const answer = insightAsk('مبيعات اليوم')
    expect(answer.understood).toBe(true)
    expect(answer.data?.totals?.orders).toBe(1)
    expect(insightAsk('ventes aujourd’hui').understood).toBe(true)
    expect(insightAsk('blabla').understood).toBe(false)
    const overview = insightOverview(30)
    expect(overview.bestProfit[0]?.nameFr).toBe('Grillade mixte')
    expect(overview.peakHours.length).toBeGreaterThan(0)
  })
})
