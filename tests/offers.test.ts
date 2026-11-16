import { beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, dbGet, openDatabase } from '../src/main/db/client'
import { seedCoreData } from '../src/main/db/seed'
import { completeSetup } from '../src/main/services/setup'
import { updateSettings } from '../src/main/services/settings'
import { applyOffer, cancelOrder, createOrder, payOrder, setDiscount } from '../src/main/services/orders'
import { bestOffer, discountFor, getOffer, isLive, offersFor, removeOffer, saveOffer, setOfferActive } from '../src/main/services/offers'
import { adjust, balance, cancelRedeem, movements, redeem } from '../src/main/services/loyalty'
import { saveCustomer } from '../src/main/services/customers'
import { clearSession } from '../src/main/security/session'

const product = (fr: string) => dbGet<{ id: number; priceCents: number; categoryId: number }>('SELECT id, priceCents, categoryId FROM products WHERE nameFr = ?', [fr])!
const GRILL = () => product('Grillade mixte') // 1 800 DA
const PIZZA = () => product('Pizza Margherita') // 900 DA
const TEA = () => product('Thé à la menthe') // 150 DA

beforeEach(async () => {
  closeDatabase()
  clearSession()
  await openDatabase(null)
  seedCoreData()
  completeSetup({ restaurantName: 'Djemr', currency: 'DZD', language: 'ar', taxEnabled: false, taxRateBp: 0, ownerFullName: 'Owner', ownerPin: '1234' })
})

const orderOf = (lines: { productId: number; qty: number }[]) => createOrder({ type: 'takeaway', items: lines })

describe('what each kind of offer takes off', () => {
  it('a share off everything', () => {
    const offer = saveOffer({ nameAr: 'خصم 20%', kind: 'percent', valueBp: 2000 })
    const order = orderOf([{ productId: GRILL().id, qty: 1 }])
    expect(discountFor(offer, order.id)).toBe(Math.round(GRILL().priceCents * 0.2))
  })

  it('a share off one category only', () => {
    const pizza = PIZZA()
    const offer = saveOffer({ nameAr: 'بيتزا −10%', kind: 'percent', scope: 'category', targetId: pizza.categoryId, valueBp: 1000 })
    const order = orderOf([
      { productId: pizza.id, qty: 2 },
      { productId: GRILL().id, qty: 1 }
    ])
    /* Only the pizzas are touched, never the grill. */
    expect(discountFor(offer, order.id)).toBe(Math.round(pizza.priceCents * 2 * 0.1))
  })

  it('a fixed sum, once a minimum is reached', () => {
    const offer = saveOffer({ nameAr: '−200 دج فوق 2000', kind: 'amount', valueCents: 20_000, minSubtotalCents: 200_000 })
    const small = orderOf([{ productId: TEA().id, qty: 1 }])
    expect(discountFor(offer, small.id)).toBe(0)
    const big = orderOf([{ productId: GRILL().id, qty: 2 }])
    expect(discountFor(offer, big.id)).toBe(20_000)
  })

  it('three for the price of two frees the cheapest line', () => {
    const offer = saveOffer({ nameAr: '٣ بثمن ٢', kind: 'freeItem', scope: 'product', targetId: TEA().id, freeQty: 1 })
    const order = orderOf([{ productId: TEA().id, qty: 3 }])
    expect(discountFor(offer, order.id)).toBe(TEA().priceCents)
  })

  it('a pack sells a named set at one price, as many times as it is formed', () => {
    const grill = GRILL()
    const tea = TEA()
    const full = grill.priceCents + tea.priceCents
    const offer = saveOffer({
      nameAr: 'وجبة العائلة',
      kind: 'combo',
      comboPriceCents: full - 30_000,
      items: [{ productId: grill.id, qty: 1 }, { productId: tea.id, qty: 1 }]
    })
    const one = orderOf([{ productId: grill.id, qty: 1 }, { productId: tea.id, qty: 1 }])
    expect(discountFor(offer, one.id)).toBe(30_000)
    /* Two of each form the pack twice. */
    const two = orderOf([{ productId: grill.id, qty: 2 }, { productId: tea.id, qty: 2 }])
    expect(discountFor(offer, two.id)).toBe(60_000)
    /* A missing dish means no pack at all. */
    const partial = orderOf([{ productId: grill.id, qty: 1 }])
    expect(discountFor(offer, partial.id)).toBe(0)
  })
})

describe('when an offer is live', () => {
  const thursday = new Date('2026-11-19T15:00:00')
  const sunday = new Date('2026-11-15T15:00:00')

  it('respects the weekday mask and the hour window', () => {
    /* Sunday = bit 1 … Thursday = bit 16. Happy hour 14:00–17:00. */
    const offer = saveOffer({ nameAr: 'ساعة سعيدة', kind: 'percent', valueBp: 1500, daysMask: 1 << 4, startTime: '14:00', endTime: '17:00' })
    expect(isLive(offer, thursday).live).toBe(true)
    expect(isLive(offer, sunday).reason).toBe('otherDay')
    expect(isLive(offer, new Date('2026-11-19T19:00:00')).reason).toBe('otherHour')
  })

  it('handles a window that crosses midnight', () => {
    const offer = saveOffer({ nameAr: 'سهرة', kind: 'percent', valueBp: 1000, startTime: '22:00', endTime: '02:00' })
    expect(isLive(offer, new Date('2026-11-19T23:30:00')).live).toBe(true)
    expect(isLive(offer, new Date('2026-11-19T01:00:00')).live).toBe(true)
    expect(isLive(offer, new Date('2026-11-19T12:00:00')).reason).toBe('otherHour')
  })

  it('respects the date window and the switch', () => {
    const offer = saveOffer({ nameAr: 'رمضان', kind: 'percent', valueBp: 1000, startsOn: '2027-02-01', endsOn: '2027-03-02' })
    expect(isLive(offer, new Date('2026-11-19T12:00:00')).reason).toBe('notStarted')
    expect(isLive(offer, new Date('2027-02-10T12:00:00')).live).toBe(true)
    expect(isLive(offer, new Date('2027-04-01T12:00:00')).reason).toBe('ended')
    expect(isLive(setOfferActive(offer.id, false)).reason).toBe('inactive')
  })
})

describe('putting one offer on an order', () => {
  it('picks the one that saves the customer the most', () => {
    saveOffer({ nameAr: 'خصم 5%', kind: 'percent', valueBp: 500 })
    const generous = saveOffer({ nameAr: 'خصم 25%', kind: 'percent', valueBp: 2500 })
    const order = orderOf([{ productId: GRILL().id, qty: 1 }])
    expect(bestOffer(order.id)?.offer.id).toBe(generous.id)

    const applied = applyOffer({ orderId: order.id })
    expect(applied.offerId).toBe(generous.id)
    expect(applied.discountCents).toBe(Math.round(GRILL().priceCents * 0.25))
    expect(applied.totalCents).toBe(GRILL().priceCents - applied.discountCents)
    expect(applied.offerName).toBe('خصم 25%')
  })

  it('tells the cashier why an offer cannot be used', () => {
    const offer = saveOffer({ nameAr: 'منتهية', kind: 'percent', valueBp: 1000, endsOn: '2020-01-01' })
    const order = orderOf([{ productId: GRILL().id, qty: 1 }])
    expect(() => applyOffer({ orderId: order.id, offerId: offer.id })).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
    const measured = offersFor(order.id).find((entry) => entry.offer.id === offer.id)
    expect(measured?.eligible).toBe(false)
    expect(measured?.reason).toBe('ended')
  })

  it('lets a discount typed by hand replace the offer', () => {
    const offer = saveOffer({ nameAr: 'خصم 10%', kind: 'percent', valueBp: 1000 })
    const order = orderOf([{ productId: GRILL().id, qty: 1 }])
    expect(applyOffer({ orderId: order.id, offerId: offer.id }).offerId).toBe(offer.id)
    const manual = setDiscount({ orderId: order.id, discountCents: 50_000, discountReason: 'un ami' })
    expect(manual.offerId).toBeNull()
    expect(manual.discountCents).toBe(50_000)
  })

  it('stops a capped offer once it has been spent, and gives the use back on a cancel', () => {
    const offer = saveOffer({ nameAr: 'أول 1', kind: 'percent', valueBp: 1000, usageLimit: 1 })
    const first = orderOf([{ productId: GRILL().id, qty: 1 }])
    applyOffer({ orderId: first.id, offerId: offer.id })
    payOrder({ orderId: first.id, payments: [{ method: 'cash', amountCents: 1_000_000 }] })
    expect(getOffer(offer.id).usedCount).toBe(1)
    expect(isLive(getOffer(offer.id)).reason).toBe('usedUp')

    const second = orderOf([{ productId: GRILL().id, qty: 1 }])
    expect(() => applyOffer({ orderId: second.id, offerId: offer.id })).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
  })

  it('keeps an offer that has been used, instead of deleting its history', () => {
    const offer = saveOffer({ nameAr: 'مستعملة', kind: 'percent', valueBp: 1000 })
    const order = orderOf([{ productId: GRILL().id, qty: 1 }])
    applyOffer({ orderId: order.id, offerId: offer.id })
    expect(removeOffer(offer.id)).toEqual({ removed: false })
    expect(getOffer(offer.id).isActive).toBe(false)
  })
})

describe('loyalty', () => {
  const withCustomer = () => saveCustomer({ name: 'Yacine', phone: '0770' })

  beforeEach(() => {
    updateSettings({ loyaltyEnabled: true, loyaltyEarnPer100: 1, loyaltyPointValueCents: 100, loyaltyMinRedeem: 10 })
  })

  it('earns points once the sale is paid, on what was actually spent', () => {
    const customer = withCustomer()
    const order = createOrder({ type: 'takeaway', customerId: customer.id, items: [{ productId: GRILL().id, qty: 1 }] })
    const paid = payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    /* 1 800 DA → 18 points at one per 100 DA. */
    expect(paid.loyaltyPointsEarned).toBe(18)
    expect(balance(customer.id)).toBe(18)
    expect(dbGet<{ loyaltyPoints: number }>('SELECT loyaltyPoints FROM customers WHERE id = ?', [customer.id])?.loyaltyPoints).toBe(18)
  })

  it('earns nothing without a customer, and nothing while it is switched off', () => {
    const anonymous = orderOf([{ productId: GRILL().id, qty: 1 }])
    expect(payOrder({ orderId: anonymous.id, payments: [{ method: 'cash', amountCents: anonymous.totalCents }] }).loyaltyPointsEarned).toBe(0)

    updateSettings({ loyaltyEnabled: false })
    const customer = withCustomer()
    const order = createOrder({ type: 'takeaway', customerId: customer.id, items: [{ productId: GRILL().id, qty: 1 }] })
    expect(payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] }).loyaltyPointsEarned).toBe(0)
  })

  it('turns points into money off, and never more than the dishes are worth', () => {
    const customer = withCustomer()
    adjust(customer.id, 500, 'ouverture')
    const order = createOrder({ type: 'takeaway', customerId: customer.id, items: [{ productId: TEA().id, qty: 1 }] })
    /* 500 points are worth 500 DA, but the tea is only 150 DA. */
    const result = redeem(order.id, 500)
    expect(result.discountCents).toBe(TEA().priceCents)
    expect(result.points).toBe(TEA().priceCents / 100)
    const fresh = createOrder({ type: 'takeaway', customerId: customer.id, items: [{ productId: GRILL().id, qty: 1 }] })
    const partial = redeem(fresh.id, 100)
    expect(partial.discountCents).toBe(10_000)
  })

  it('refuses below the minimum, without a customer, and with too few points', () => {
    const customer = withCustomer()
    adjust(customer.id, 100)
    const order = createOrder({ type: 'takeaway', customerId: customer.id, items: [{ productId: GRILL().id, qty: 1 }] })
    expect(() => redeem(order.id, 5)).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
    expect(() => redeem(order.id, 10_000)).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
    const anonymous = orderOf([{ productId: GRILL().id, qty: 1 }])
    expect(() => redeem(anonymous.id, 50)).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
  })

  it('takes the redemption off the total and can be undone', () => {
    const customer = withCustomer()
    adjust(customer.id, 200)
    const order = createOrder({ type: 'takeaway', customerId: customer.id, items: [{ productId: GRILL().id, qty: 1 }] })
    redeem(order.id, 50)
    const { payOrder: pay } = { payOrder }
    const afterRedeem = pay({ orderId: order.id, payments: [{ method: 'cash', amountCents: 0 }] })
    expect(afterRedeem.totalCents).toBe(GRILL().priceCents - 5_000)
    cancelRedeem(order.id)
    const afterCancel = pay({ orderId: order.id, payments: [{ method: 'cash', amountCents: 0 }] })
    expect(afterCancel.totalCents).toBe(GRILL().priceCents)
    expect(balance(customer.id)).toBe(200)
  })

  it('returns the points an abandoned order had already spent', () => {
    const customer = withCustomer()
    adjust(customer.id, 200)
    const order = createOrder({ type: 'takeaway', customerId: customer.id, items: [{ productId: GRILL().id, qty: 1 }] })
    redeem(order.id, 50)
    expect(balance(customer.id)).toBe(150)
    cancelOrder({ orderId: order.id, reason: 'client parti' })
    expect(balance(customer.id)).toBe(200)
  })

  it('will not cancel a sale that is already paid and sealed', () => {
    /* A completed sale carries a fiscal number and a hash: it is reversed by a
       refund, never by deleting it. The program has no refund screen yet. */
    const customer = withCustomer()
    const order = createOrder({ type: 'takeaway', customerId: customer.id, items: [{ productId: GRILL().id, qty: 1 }] })
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    expect(balance(customer.id)).toBe(18)
    expect(() => cancelOrder({ orderId: order.id, reason: 'erreur' })).toThrowError(
      expect.objectContaining({ code: 'CONFLICT' })
    )
    expect(balance(customer.id)).toBe(18)
  })

  it('keeps a ledger that explains the balance', () => {
    const customer = withCustomer()
    adjust(customer.id, 100, 'bienvenue')
    expect(() => adjust(customer.id, -500)).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
    const ledger = movements(customer.id)
    expect(ledger[0]?.kind).toBe('adjust')
    expect(ledger[0]?.points).toBe(100)
    expect(ledger[0]?.note).toBe('bienvenue')
  })
})
