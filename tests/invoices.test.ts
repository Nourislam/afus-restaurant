import { beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, dbGet, dbWrite, openDatabase } from '../src/main/db/client'
import { seedCoreData } from '../src/main/db/seed'
import { completeSetup } from '../src/main/services/setup'
import { updateSettings, getSettings } from '../src/main/services/settings'
import { buildOrder, createOrder, payOrder } from '../src/main/services/orders'
import { getInvoice, invoiceForOrder, issueInvoice, listInvoices, nextInvoiceNumber } from '../src/main/services/invoices'
import { invoiceHtml } from '../src/shared/invoiceDocument'
import { clearSession } from '../src/main/security/session'

const product = () => dbGet<{ id: number; priceCents: number }>('SELECT id, priceCents FROM products ORDER BY id LIMIT 1')!
const BUYER = { name: 'SARL Bâtiment Est', address: 'Zone industrielle, Oran', nif: '000216001234567', rc: '31/00-9876543B21', phone: '0551020304' }

function paidOrder() {
  const p = product()
  const order = createOrder({ type: 'takeaway', items: [{ productId: p.id, qty: 2 }] })
  return payOrder({ orderId: order.id, payments: [{ method: 'card', amountCents: order.totalCents }] })
}

beforeEach(async () => {
  closeDatabase()
  clearSession()
  await openDatabase(null)
  seedCoreData()
  completeSetup({ restaurantName: 'Djemr', currency: 'DZD', language: 'ar', taxEnabled: true, taxRateBp: 900, ownerFullName: 'Owner', ownerPin: '1234' })
  updateSettings({ legalName: 'SARL Djemr', nif: '000123456789012', nis: '000987654321098', rc: '16/00-1234567B26', ai: '16011234567', fiscalAddress: 'Alger Centre' })
})

describe('issuing an invoice', () => {
  it('numbers the series without a gap and keeps it per year', () => {
    expect(nextInvoiceNumber()).toMatch(/^FA-\d{4}-00001$/)
    const first = issueInvoice({ orderId: paidOrder().id, buyer: BUYER })
    const second = issueInvoice({ orderId: paidOrder().id, buyer: { name: 'Client 2' } })
    expect(first.seq).toBe(1)
    expect(second.seq).toBe(2)
    expect(first.number).toMatch(/^FA-\d{4}-00001$/)
    expect(second.number).toMatch(/^FA-\d{4}-00002$/)
    expect(first.year).toBe(second.year)
  })

  it('restarts the count in a new year', () => {
    const invoice = issueInvoice({ orderId: paidOrder().id, buyer: BUYER })
    /* Pretend last year's invoices are on file; this year still starts at one. */
    dbWrite('UPDATE invoices SET year = year - 1, seq = 42 WHERE id = ?', [invoice.id])
    expect(nextInvoiceNumber()).toMatch(/-00001$/)
  })

  it('returns the invoice already issued instead of making a second one', () => {
    const order = paidOrder()
    const first = issueInvoice({ orderId: order.id, buyer: BUYER })
    const again = issueInvoice({ orderId: order.id, buyer: { name: 'Quelqu’un d’autre' } })
    expect(again.id).toBe(first.id)
    expect(again.buyerName).toBe(BUYER.name)
    expect(listInvoices()).toHaveLength(1)
  })

  it('refuses a sale that is not finished, and a buyer with no name', () => {
    const open = createOrder({ type: 'takeaway', items: [{ productId: product().id, qty: 1 }] })
    expect(() => issueInvoice({ orderId: open.id, buyer: BUYER })).toThrowError(expect.objectContaining({ code: 'INVALID_STATUS' }))
    expect(() => issueInvoice({ orderId: paidOrder().id, buyer: { name: '  ' } })).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
    expect(() => issueInvoice({ orderId: 99_999, buyer: BUYER })).toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }))
  })

  it('snapshots the figures, so a later change cannot rewrite the document', () => {
    const order = paidOrder()
    const invoice = issueInvoice({ orderId: order.id, buyer: BUYER })
    expect(invoice.totalCents).toBe(order.totalCents)
    expect(invoice.taxRateBp).toBe(900)
    /* Even if the rate is changed afterwards, the issued invoice keeps its own. */
    updateSettings({ taxRateBp: 1900 })
    expect(getInvoice(invoice.id).taxRateBp).toBe(900)
  })

  it('finds the invoice from its order, and filters the list', () => {
    const order = paidOrder()
    expect(invoiceForOrder(order.id)).toBeNull()
    const invoice = issueInvoice({ orderId: order.id, buyer: BUYER })
    expect(invoiceForOrder(order.id)?.id).toBe(invoice.id)
    expect(listInvoices({ search: 'Bâtiment' })).toHaveLength(1)
    expect(listInvoices({ search: '000216001234567' })).toHaveLength(1)
    expect(listInvoices({ search: 'introuvable' })).toHaveLength(0)
  })
})

describe('the document itself', () => {
  const render = (language: 'ar' | 'fr') => {
    const order = paidOrder()
    const invoice = issueInvoice({ orderId: order.id, buyer: BUYER })
    return { html: invoiceHtml(invoice, buildOrder(order.id), getSettings(), language), invoice, order }
  }

  it('carries both identities and the order it settles', () => {
    const { html } = render('fr')
    expect(html).toContain('SARL Djemr')
    expect(html).toContain('000123456789012')
    expect(html).toContain('16/00-1234567B26')
    expect(html).toContain('SARL Bâtiment Est')
    expect(html).toContain('000216001234567')
    expect(html).toContain('31/00-9876543B21')
    expect(html).toContain('FACTURE')
  })

  it('breaks the VAT out and states its rate', () => {
    const { html } = render('fr')
    expect(html).toContain('Base imposable')
    expect(html).toContain('TVA (Taux 9 %)')
    expect(html).toContain('Net à payer')
  })

  it('writes the total in words, in the invoice language', () => {
    const fr = render('fr')
    expect(fr.html).toContain('Arrêtée la présente facture à la somme de')
    expect(fr.html).toContain('dinars algériens')
    const ar = render('ar')
    expect(ar.html).toContain('المبلغ بالحروف')
    expect(ar.html).toContain('dir="rtl"')
    expect(ar.html).toContain('فاتورة')
  })

  it('prints A4 and shows each line excluding tax', () => {
    const { html, order } = render('fr')
    expect(html).toContain('size:A4')
    /* Two of the same dish: the unit price excluding tax is shown once. */
    expect(html).toContain('>2<')
    expect(order.items[0]!.qty).toBe(2)
  })

  it('escapes a buyer name that contains markup', () => {
    const order = paidOrder()
    const invoice = issueInvoice({ orderId: order.id, buyer: { name: '<script>alert(1)</script>' } })
    const html = invoiceHtml(invoice, buildOrder(order.id), getSettings(), 'fr')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
