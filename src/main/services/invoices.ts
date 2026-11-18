/**
 * The formal invoice. A ticket and an invoice are two different documents in
 * Algerian law: a company cannot deduct a meal with a till ticket, it needs a
 * *facture* carrying both parties' fiscal identity, its own unbroken number, the
 * VAT broken out, and the total written in words.
 */
import type { Invoice, InvoiceBuyer } from '@shared/types'
import { dbAll, dbGet, dbWrite, transaction } from '../db/client'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { requireSession } from '../security/session'
import { writeAudit } from './audit'
import { getSettings } from './settings'

const SELECT = `
  SELECT i.id, i.orderId, o.orderNumber, i.number, i.seq, i.year, i.buyerName, i.buyerAddress,
         i.buyerNif, i.buyerRc, i.buyerPhone, i.subtotalCents, i.discountCents, i.taxCents,
         i.stampCents, i.totalCents, i.taxRateBp, i.currency, i.issuedAt, u.fullName AS userName
    FROM invoices i
    JOIN orders o ON o.id = i.orderId
    LEFT JOIN users u ON u.id = i.userId`

export function getInvoice(id: number): Invoice {
  const row = dbGet<Invoice>(`${SELECT} WHERE i.id = ?`, [id])
  if (!row) throw new AppError('NOT_FOUND')
  return row
}

export function invoiceForOrder(orderId: number): Invoice | null {
  return dbGet<Invoice>(`${SELECT} WHERE i.orderId = ?`, [orderId])
}

export function listInvoices(input: { from?: string | null; to?: string | null; search?: string | null; limit?: number } = {}): Invoice[] {
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (input.from) {
    clauses.push('i.issuedAt >= ?')
    params.push(`${input.from} 00:00:00`)
  }
  if (input.to) {
    clauses.push('i.issuedAt <= ?')
    params.push(`${input.to} 23:59:59`)
  }
  if (input.search) {
    clauses.push('(i.number LIKE ? OR i.buyerName LIKE ? OR i.buyerNif LIKE ? OR o.orderNumber LIKE ?)')
    const like = `%${input.search.trim()}%`
    params.push(like, like, like, like)
  }
  params.push(Math.min(1000, input.limit ?? 300))
  return dbAll<Invoice>(`${SELECT} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY i.id DESC LIMIT ?`, params)
}

/**
 * Issue the invoice for a finished sale. Asking twice returns the one already
 * issued: a document a tax inspector may ask for must never be reissued under a
 * second number.
 */
export function issueInvoice(input: { orderId: number; buyer: InvoiceBuyer }): Invoice {
  const existing = invoiceForOrder(input.orderId)
  if (existing) return existing

  const order = dbGet<{
    id: number
    status: string
    paidAt: string | null
    subtotalCents: number
    discountCents: number
    taxCents: number
    stampCents: number
    totalCents: number
  }>('SELECT id, status, paidAt, subtotalCents, discountCents, taxCents, stampCents, totalCents FROM orders WHERE id = ?', [input.orderId])
  if (!order) throw new AppError('NOT_FOUND')
  /* Only a settled sale: once it owes nothing its figures can never change. A
     guest who paid at the counter can take their facture without waiting for
     the food. */
  if (order.status === 'cancelled' || !order.paidAt) throw new AppError('INVALID_STATUS', 'Settle the sale first')

  const buyerName = input.buyer.name.trim()
  if (!buyerName) throw new AppError('VALIDATION', 'The invoice needs a buyer')

  const settings = getSettings()
  const session = requireSession()
  const year = Number(nowStamp().slice(0, 4))
  let id = 0

  transaction(() => {
    /* One unbroken series per year, counted from what is already issued. */
    const last = dbGet<{ seq: number | null }>('SELECT MAX(seq) AS seq FROM invoices WHERE year = ?', [year])?.seq ?? 0
    const seq = last + 1
    const number = `FA-${year}-${String(seq).padStart(5, '0')}`
    id = Number(
      dbWrite(
        `INSERT INTO invoices (orderId, number, seq, year, buyerName, buyerAddress, buyerNif, buyerRc, buyerPhone,
           subtotalCents, discountCents, taxCents, stampCents, totalCents, taxRateBp, currency, issuedAt, userId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.orderId,
          number,
          seq,
          year,
          buyerName,
          input.buyer.address?.trim() || null,
          input.buyer.nif?.trim() || null,
          input.buyer.rc?.trim() || null,
          input.buyer.phone?.trim() || null,
          order.subtotalCents,
          order.discountCents,
          order.taxCents,
          order.stampCents,
          order.totalCents,
          settings.taxEnabled ? settings.taxRateBp : 0,
          settings.currency,
          nowStamp(),
          session.userId
        ]
      ).lastInsertRowid
    )
  })
  const invoice = getInvoice(id)
  writeAudit('invoices.issue', 'invoice', id, { number: invoice.number, orderId: input.orderId, buyer: buyerName })
  return invoice
}

/** The next number that would be issued, so the screen can show it beforehand. */
export function nextInvoiceNumber(): string {
  const year = Number(nowStamp().slice(0, 4))
  const last = dbGet<{ seq: number | null }>('SELECT MAX(seq) AS seq FROM invoices WHERE year = ?', [year])?.seq ?? 0
  return `FA-${year}-${String(last + 1).padStart(5, '0')}`
}
