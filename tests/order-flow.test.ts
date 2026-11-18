/**
 * The two orders of business a restaurant actually works in.
 *
 * At a table the kitchen cooks, the guest eats, and the bill is settled at the
 * end. At a counter the guest pays first and the order is only then fired. Both
 * have to work, and the first one has to keep working exactly as it did.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, dbAll, dbGet, openDatabase } from '../src/main/db/client'
import { seedCoreData } from '../src/main/db/seed'
import { completeSetup } from '../src/main/services/setup'
import { DEFAULT_SETTINGS, updateSettings } from '../src/main/services/settings'
import { stampCentsFor } from '../src/shared/stamp'
import {
  addItem,
  cancelOrder,
  completeOrder,
  createOrder,
  flowFor,
  holdOrder,
  listOrders,
  payOrder,
  sendToKitchen,
  setStatus
} from '../src/main/services/orders'
import { setItemKitchenStatus } from '../src/main/services/kitchen'
import { openSession } from '../src/main/services/finance'
import { verifyIntegrity } from '../src/main/services/fiscal'
import { issueInvoice } from '../src/main/services/invoices'
import { clearSession } from '../src/main/security/session'

const product = (fr: string) =>
  dbGet<{ id: number; priceCents: number }>('SELECT id, priceCents FROM products WHERE nameFr = ?', [fr])!
const GRILL = () => product('Grillade mixte')
const TEA = () => product('Thé à la menthe')

beforeEach(async () => {
  closeDatabase()
  clearSession()
  await openDatabase(null)
  seedCoreData()
  completeSetup({
    restaurantName: 'Djemr',
    currency: 'DZD',
    language: 'ar',
    taxEnabled: false,
    taxRateBp: 0,
    ownerFullName: 'Owner',
    ownerPin: '1234'
  })
})

const counter = () => updateSettings({ orderFlow: { takeaway: 'payFirst' } })
const table = () => updateSettings({ orderFlow: { dineIn: 'payLast' } })

const takeaway = () => createOrder({ type: 'takeaway', items: [{ productId: GRILL().id, qty: 1 }] })
const dineIn = () => createOrder({ type: 'dineIn', items: [{ productId: GRILL().id, qty: 1 }] })

const itemStatuses = (orderId: number) =>
  dbAll<{ status: string }>("SELECT status FROM order_items WHERE orderId = ? AND status != 'removed'", [orderId]).map(
    (row) => row.status
  )

describe('settling at the end, the way a table works', () => {
  it('still closes the order the moment it is paid', () => {
    table()
    const order = dineIn()
    const sent = sendToKitchen(order.id)
    expect(sent.status).toBe('sent')
    const paid = payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(paid.status).toBe('completed')
    expect(paid.dueCents).toBe(0)
    expect(paid.paidAt).not.toBeNull()
    expect(paid.completedAt).not.toBeNull()
    expect(itemStatuses(order.id)).toEqual(['served'])
  })

  it('closes it even when nobody pressed Send, because some houses never do', () => {
    table()
    const order = dineIn()
    const paid = payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(paid.status).toBe('completed')
  })

  it('frees the table', () => {
    table()
    const tableId = dbGet<{ id: number }>('SELECT id FROM dining_tables LIMIT 1')!.id
    const order = createOrder({ type: 'dineIn', tableId, items: [{ productId: TEA().id, qty: 1 }] })
    expect(dbGet<{ status: string }>('SELECT status FROM dining_tables WHERE id = ?', [tableId])?.status).toBe('occupied')
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(dbGet<{ status: string }>('SELECT status FROM dining_tables WHERE id = ?', [tableId])?.status).toBe('free')
  })
})

describe('paying first, the way a counter works', () => {
  it('will not let the kitchen start before the money is in', () => {
    counter()
    const order = takeaway()
    expect(() => sendToKitchen(order.id)).toThrowError(/paid before it is prepared/)
    expect(dbGet<{ n: number }>('SELECT COUNT(*) AS n FROM kitchen_tickets')?.n).toBe(0)
  })

  it('fires the order itself the moment it is paid, and does not close it', () => {
    counter()
    const order = takeaway()
    const paid = payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(paid.dueCents).toBe(0)
    expect(paid.paidAt).not.toBeNull()
    /* The money is in and the kitchen has it — but nobody has eaten yet. */
    expect(paid.status).toBe('sent')
    expect(paid.completedAt).toBeNull()
    expect(paid.sentAt).not.toBeNull()
    expect(itemStatuses(order.id)).toEqual(['pending'])
  })

  it('leaves the sending to the cashier when the house asked for that', () => {
    counter()
    updateSettings({ autoSendOnPrepay: false })
    const order = takeaway()
    const paid = payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(paid.sentAt).toBeNull()
    /* Now that it is paid, the guard lets it through. */
    expect(sendToKitchen(order.id).sentAt).not.toBeNull()
  })

  it('closes itself when the kitchen serves the last dish', () => {
    counter()
    const order = createOrder({
      type: 'takeaway',
      items: [
        { productId: GRILL().id, qty: 1 },
        { productId: TEA().id, qty: 1 }
      ]
    })
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    const items = dbAll<{ id: number }>('SELECT id FROM order_items WHERE orderId = ? ORDER BY id', [order.id])
    setItemKitchenStatus({ itemId: items[0]!.id, status: 'served' })
    expect(dbGet<{ status: string }>('SELECT status FROM orders WHERE id = ?', [order.id])?.status).toBe('sent')
    setItemKitchenStatus({ itemId: items[1]!.id, status: 'served' })
    expect(dbGet<{ status: string }>('SELECT status FROM orders WHERE id = ?', [order.id])?.status).toBe('completed')
  })

  it('can also be handed over by the counter itself', () => {
    counter()
    const order = takeaway()
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    const done = completeOrder(order.id)
    expect(done.status).toBe('completed')
    expect(itemStatuses(order.id)).toEqual(['served'])
  })

  it('refuses to be handed over while it still owes money', () => {
    counter()
    const order = takeaway()
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: 10_000 }] })
    expect(() => completeOrder(order.id)).toThrowError(/still owes money/)
  })
})

describe('what a paid order no longer allows', () => {
  it('refuses another dish, because the price is already sealed', () => {
    counter()
    const order = takeaway()
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(() => addItem({ orderId: order.id, productId: TEA().id, qty: 1 })).toThrowError(/can no longer change/)
  })

  it('refuses to be cancelled, because a sale cannot un-happen', () => {
    counter()
    const order = takeaway()
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(() => cancelOrder({ orderId: order.id, reason: 'الزبون غيّر رأيه' })).toThrowError(/refund it instead/)
  })

  it('gives the cash back in the drawer when a part-paid order is abandoned', () => {
    counter()
    openSession({ openingFloatCents: 100_000 })
    const order = takeaway()
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: 50_000 }] })
    cancelOrder({ orderId: order.id, reason: 'الزبون انصرف' })
    const refund = dbGet<{ total: number }>(
      "SELECT COALESCE(SUM(amountCents), 0) AS total FROM cash_movements WHERE type = 'refund'"
    )?.total
    expect(refund).toBe(50_000)
  })
})

describe('the books do not care which order it happened in', () => {
  it('seals the sale when the money comes in, and the chain still verifies after handover', () => {
    counter()
    const order = takeaway()
    const paid = payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(paid.fiscalSeq).toBe(1)
    const sealed = paid.fiscalHash
    /* Handing it over later must not move the sale's own record. */
    completeOrder(order.id)
    const after = dbGet<{ fiscalHash: string; fiscalSeq: number }>(
      'SELECT fiscalHash, fiscalSeq FROM orders WHERE id = ?',
      [order.id]
    )
    expect(after?.fiscalHash).toBe(sealed)
    expect(after?.fiscalSeq).toBe(1)
    expect(verifyIntegrity().orders.brokenAt).toBeNull()
    expect(verifyIntegrity().ok).toBe(true)
  })

  it('takes the ingredients off the stock once, at payment, not twice', () => {
    counter()
    const order = takeaway()
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    const afterPayment = dbGet<{ n: number }>(
      "SELECT COUNT(*) AS n FROM ingredient_movements WHERE refType = 'order' AND refId = ?",
      [order.id]
    )?.n
    completeOrder(order.id)
    const afterHandover = dbGet<{ n: number }>(
      "SELECT COUNT(*) AS n FROM ingredient_movements WHERE refType = 'order' AND refId = ?",
      [order.id]
    )?.n
    expect(afterHandover).toBe(afterPayment)
  })

  it("counts a prepaid order that is still cooking in today's takings", () => {
    counter()
    const order = takeaway()
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(dbGet<{ status: string }>('SELECT status FROM orders WHERE id = ?', [order.id])?.status).not.toBe('completed')
    const sold = dbGet<{ total: number }>(
      "SELECT COALESCE(SUM(totalCents), 0) AS total FROM orders WHERE status != 'cancelled' AND (paidAt IS NOT NULL OR status = 'completed')"
    )?.total
    expect(sold).toBe(order.totalCents)
  })

  it('lets a company take its facture as soon as it has paid', () => {
    counter()
    const order = takeaway()
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    const invoice = issueInvoice({ orderId: order.id, buyer: { name: 'SARL Amel' } })
    expect(invoice.number).toMatch(/^FA-/)
  })
})

describe('there is only one way to finish a sale', () => {
  it('refuses to close an order through a plain status change', () => {
    /* Closed this way the sale would never be sealed, so it would be missing
       from the fiscal chain and from the day's Z report while its money sat in
       the drawer. Finishing has to go through the hand-over. */
    counter()
    const order = takeaway()
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(() => setStatus({ orderId: order.id, status: 'completed' })).toThrowError(/Hand the order over/)
    expect(() => setStatus({ orderId: order.id, status: 'cancelled' })).toThrowError(/Cancel the order/)
    /* The ordinary preparation moves still work. */
    expect(setStatus({ orderId: order.id, status: 'preparing' }).status).toBe('preparing')
  })
})

describe('when the house has not decided', () => {
  it('treats an unconfigured type as settling at the end', () => {
    updateSettings({ orderFlow: {} })
    expect(flowFor('takeaway')).toBe('payLast')
    expect(flowFor('whatever')).toBe('payLast')
  })

  it('in flexible mode closes a served order and keeps an unsent one open', () => {
    updateSettings({ orderFlow: { takeaway: 'flexible' } })
    const unsent = takeaway()
    const stillOpen = payOrder({ orderId: unsent.id, payments: [{ method: 'cash', amountCents: unsent.totalCents }] })
    expect(stillOpen.status).not.toBe('completed')

    const other = takeaway()
    sendToKitchen(other.id)
    const item = dbGet<{ id: number }>('SELECT id FROM order_items WHERE orderId = ?', [other.id])!
    setItemKitchenStatus({ itemId: item.id, status: 'served' })
    const closed = payOrder({ orderId: other.id, payments: [{ method: 'cash', amountCents: other.totalCents }] })
    expect(closed.status).toBe('completed')
  })

  it('lets the caller override the flow outright', () => {
    counter()
    const order = takeaway()
    const paid = payOrder({
      orderId: order.id,
      payments: [{ method: 'cash', amountCents: order.totalCents }],
      closeNow: true
    })
    expect(paid.status).toBe('completed')
  })
})

describe('stamp duty on a cash sale', () => {
  it('is collected with the bill, not left behind as a balance', () => {
    /* The till used to charge the dishes only, so every cash sale ended one
       stamp short and the order stayed open. The bill the cashier presents has
       to include the stamp. */
    updateSettings({ stampEnabled: true, orderFlow: { dineIn: 'payLast' } })
    const order = dineIn()
    const stamp = stampCentsFor(order.totalCents, {
      stampEnabled: true,
      stampBrackets: DEFAULT_SETTINGS.stampBrackets,
      stampMinCents: DEFAULT_SETTINGS.stampMinCents,
      stampMaxCents: DEFAULT_SETTINGS.stampMaxCents
    })
    expect(stamp).toBeGreaterThan(0)
    const paid = payOrder({
      orderId: order.id,
      payments: [{ method: 'cash', amountCents: order.totalCents + stamp }]
    })
    expect(paid.stampCents).toBe(stamp)
    expect(paid.dueCents).toBe(0)
    expect(paid.status).toBe('completed')
  })

  it('is not charged on a card payment', () => {
    updateSettings({ stampEnabled: true, orderFlow: { dineIn: 'payLast' } })
    const order = dineIn()
    const paid = payOrder({ orderId: order.id, payments: [{ method: 'card', amountCents: order.totalCents }] })
    expect(paid.stampCents).toBe(0)
    expect(paid.status).toBe('completed')
  })
})

describe('the till’s parked orders', () => {
  it('lists the parked ones, not every order in the restaurant', () => {
    /* The flag was dropped on the way in, so the list came back holding the
       whole day's trade and "resume" offered orders that were never parked. */
    table()
    const parked = dineIn()
    holdOrder(parked.id)
    const busy = dineIn()
    sendToKitchen(busy.id)

    const held = listOrders({ held: true })
    expect(held.map((order) => order.id)).toEqual([parked.id])
    expect(listOrders({}).length).toBeGreaterThan(1)
  })
})

describe('finding an order', () => {
  /* The orders screen asks the main process to filter; it used to throw the
     whole filter away, so choosing a status or typing a name changed nothing. */
  it('filters by status, type, day and search term', () => {
    table()
    const seated = dineIn()
    sendToKitchen(seated.id)
    const parcel = createOrder({ type: 'takeaway', items: [{ productId: TEA().id, qty: 1 }] })

    expect(listOrders({ type: 'takeaway' }).map((o) => o.id)).toEqual([parcel.id])
    expect(listOrders({ type: 'dineIn' }).map((o) => o.id)).toEqual([seated.id])
    expect(listOrders({ status: 'sent' }).map((o) => o.id)).toEqual([seated.id])
    expect(listOrders({ search: parcel.orderNumber }).map((o) => o.id)).toEqual([parcel.id])
    expect(listOrders({ search: 'لا يوجد' })).toEqual([])

    const today = new Date().toISOString().slice(0, 10)
    expect(listOrders({ from: today, to: today }).length).toBe(2)
    expect(listOrders({ from: '2000-01-01', to: '2000-01-02' })).toEqual([])
  })

  it('finds a delivery by the customer’s phone', () => {
    const ride = createOrder({
      type: 'delivery',
      items: [{ productId: TEA().id, qty: 1 }],
      delivery: { customerName: 'محمد', phone: '0661 23 45 67', address: 'حي النصر' }
    })
    expect(listOrders({ search: '0661' }).map((o) => o.id)).toEqual([ride.id])
  })
})
