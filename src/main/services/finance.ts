/** Cash drawer sessions, their ledger, and expenses. */
import type { CashMovement, CashSession, Expense } from '@shared/types'
import { dbAll, dbGet, dbWrite, transaction } from '../db/client'
import { AppError } from '../utils/errors'
import { nowStamp, today } from '../utils/dates'
import { currentUserId, requireSession } from '../security/session'
import { writeAudit } from './audit'

interface SessionRow {
  id: number
  openedBy: number
  openedByName: string | null
  openedAt: string
  openingFloatCents: number
  closedBy: number | null
  closedByName: string | null
  closedAt: string | null
  expectedCents: number | null
  countedCents: number | null
  differenceCents: number | null
  status: 'open' | 'closed'
  note: string | null
}

const SELECT = `
  SELECT s.id, s.openedBy, uo.fullName AS openedByName, s.openedAt, s.openingFloatCents,
         s.closedBy, uc.fullName AS closedByName, s.closedAt, s.expectedCents, s.countedCents, s.differenceCents, s.status, s.note
    FROM cash_sessions s
    LEFT JOIN users uo ON uo.id = s.openedBy
    LEFT JOIN users uc ON uc.id = s.closedBy`

function sumType(sessionId: number, type: string): number {
  return dbGet<{ total: number | null }>('SELECT SUM(amountCents) AS total FROM cash_movements WHERE sessionId = ? AND type = ?', [sessionId, type])?.total ?? 0
}

function hydrate(row: SessionRow): CashSession {
  return {
    ...row,
    cashSalesCents: sumType(row.id, 'sale') - sumType(row.id, 'refund'),
    expensesCents: sumType(row.id, 'expense'),
    supplierPaymentsCents: sumType(row.id, 'supplierPayment'),
    depositsCents: sumType(row.id, 'deposit'),
    withdrawalsCents: sumType(row.id, 'withdrawal')
  }
}

export function expectedCash(session: CashSession): number {
  return session.openingFloatCents + session.cashSalesCents + session.depositsCents - session.expensesCents - session.supplierPaymentsCents - session.withdrawalsCents
}

export function getSession(id: number): CashSession {
  const row = dbGet<SessionRow>(`${SELECT} WHERE s.id = ?`, [id])
  if (!row) throw new AppError('NOT_FOUND')
  return hydrate(row)
}

export function currentSession(): CashSession | null {
  const row = dbGet<SessionRow>(`${SELECT} WHERE s.status = 'open' ORDER BY s.id DESC LIMIT 1`)
  return row ? hydrate(row) : null
}

export function listSessions(limit = 50): CashSession[] {
  return dbAll<SessionRow>(`${SELECT} ORDER BY s.id DESC LIMIT ?`, [Math.min(500, limit)]).map(hydrate)
}

export function openSession(input: { openingFloatCents: number; note?: string | null }): CashSession {
  if (currentSession()) throw new AppError('CONFLICT', 'A cash session is already open')
  const session = requireSession()
  const id = Number(
    dbWrite("INSERT INTO cash_sessions (openedBy, openedAt, openingFloatCents, status, note) VALUES (?, ?, ?, 'open', ?)", [
      session.userId,
      nowStamp(),
      Math.max(0, Math.round(input.openingFloatCents)),
      input.note ?? null
    ]).lastInsertRowid
  )
  writeAudit('finance.openSession', 'cashSession', id, { openingFloatCents: input.openingFloatCents })
  return getSession(id)
}

export function closeSession(input: { countedCents: number; note?: string | null }): CashSession {
  const open = currentSession()
  if (!open) throw new AppError('SESSION_CLOSED')
  const session = requireSession()
  const expected = expectedCash(open)
  const counted = Math.max(0, Math.round(input.countedCents))
  dbWrite(
    "UPDATE cash_sessions SET closedBy = ?, closedAt = ?, expectedCents = ?, countedCents = ?, differenceCents = ?, status = 'closed', note = COALESCE(?, note) WHERE id = ?",
    [session.userId, nowStamp(), expected, counted, counted - expected, input.note ?? null, open.id]
  )
  writeAudit('finance.closeSession', 'cashSession', open.id, { expected, counted, difference: counted - expected })
  return getSession(open.id)
}

/** Post a cash movement to the open session; silently skipped when no drawer is open
 *  (sales can never be blocked by the back office). */
export function postCashMovement(input: {
  type: 'sale' | 'refund' | 'expense' | 'supplierPayment' | 'deposit' | 'withdrawal'
  amountCents: number
  method?: string
  refType?: string | null
  refId?: string | number | null
  note?: string | null
  userId?: number | null
}): boolean {
  const open = dbGet<{ id: number }>("SELECT id FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1")
  if (!open || input.amountCents <= 0) return false
  dbWrite(
    'INSERT INTO cash_movements (sessionId, type, amountCents, method, refType, refId, note, userId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      open.id,
      input.type,
      Math.round(input.amountCents),
      input.method ?? 'cash',
      input.refType ?? null,
      input.refId === null || input.refId === undefined ? null : String(input.refId),
      input.note ?? null,
      input.userId === undefined ? currentUserId() : input.userId,
      nowStamp()
    ]
  )
  return true
}

export function cashMovement(input: { type: 'deposit' | 'withdrawal'; amountCents: number; note?: string | null }): CashSession {
  const open = currentSession()
  if (!open) throw new AppError('SESSION_CLOSED')
  if (input.amountCents <= 0) throw new AppError('VALIDATION', 'Amount must be positive')
  postCashMovement({ type: input.type, amountCents: input.amountCents, note: input.note ?? null })
  writeAudit(`finance.${input.type}`, 'cashSession', open.id, { amountCents: input.amountCents })
  return getSession(open.id)
}

export function sessionMovements(sessionId: number): CashMovement[] {
  return dbAll<CashMovement>(
    `SELECT m.id, m.sessionId, m.type, m.amountCents, m.method, m.refType, m.refId, m.note, u.fullName AS userName, m.createdAt
       FROM cash_movements m LEFT JOIN users u ON u.id = m.userId
      WHERE m.sessionId = ? ORDER BY m.id DESC`,
    [sessionId]
  )
}

/* ---------------- Expenses ---------------- */

const EXPENSE_SELECT = `SELECT e.id, e.category, e.description, e.amountCents, e.method, e.expenseDate, u.fullName AS userName, e.createdAt
                          FROM expenses e LEFT JOIN users u ON u.id = e.userId`

export function listExpenses(input: { from?: string | null; to?: string | null; limit?: number } = {}): Expense[] {
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (input.from) {
    clauses.push('e.expenseDate >= ?')
    params.push(input.from)
  }
  if (input.to) {
    clauses.push('e.expenseDate <= ?')
    params.push(input.to)
  }
  params.push(Math.min(1000, input.limit ?? 200))
  return dbAll<Expense>(`${EXPENSE_SELECT} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY e.expenseDate DESC, e.id DESC LIMIT ?`, params)
}

export function saveExpense(input: { id?: number; category: string; description: string; amountCents: number; method?: string; expenseDate?: string | null }): Expense {
  const description = input.description.trim()
  if (!description) throw new AppError('VALIDATION', 'Description is required')
  if (input.amountCents <= 0) throw new AppError('VALIDATION', 'Amount must be positive')
  const method = input.method ?? 'cash'
  const date = input.expenseDate ?? today()
  const session = requireSession()
  if (input.id) {
    const result = dbWrite('UPDATE expenses SET category = ?, description = ?, amountCents = ?, method = ?, expenseDate = ? WHERE id = ?', [
      input.category,
      description,
      Math.round(input.amountCents),
      method,
      date,
      input.id
    ])
    if (result.changes === 0) throw new AppError('NOT_FOUND')
    writeAudit('finance.expense.update', 'expense', input.id)
    return dbGet<Expense>(`${EXPENSE_SELECT} WHERE e.id = ?`, [input.id]) as Expense
  }
  let id = 0
  transaction(() => {
    const open = method === 'cash' ? dbGet<{ id: number }>("SELECT id FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1") : null
    id = Number(
      dbWrite('INSERT INTO expenses (category, description, amountCents, method, expenseDate, userId, cashSessionId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        input.category,
        description,
        Math.round(input.amountCents),
        method,
        date,
        session.userId,
        open?.id ?? null,
        nowStamp()
      ]).lastInsertRowid
    )
    if (method === 'cash') postCashMovement({ type: 'expense', amountCents: input.amountCents, refType: 'expense', refId: id, note: description })
  })
  writeAudit('finance.expense.create', 'expense', id, { amountCents: input.amountCents, category: input.category })
  return dbGet<Expense>(`${EXPENSE_SELECT} WHERE e.id = ?`, [id]) as Expense
}

export function removeExpense(id: number): { removed: boolean } {
  transaction(() => {
    const result = dbWrite('DELETE FROM expenses WHERE id = ?', [id])
    if (result.changes === 0) throw new AppError('NOT_FOUND')
    dbWrite("DELETE FROM cash_movements WHERE refType = 'expense' AND refId = ?", [String(id)])
  })
  writeAudit('finance.expense.delete', 'expense', id)
  return { removed: true }
}

/** Recent order payments (all methods) — the "encaissements" view. */
export function listPayments(limit = 200): { id: number; orderId: number; orderNumber: string; method: string; amountCents: number; reference: string | null; userName: string | null; createdAt: string }[] {
  return dbAll(
    `SELECT p.id, p.orderId, o.orderNumber, p.method, p.amountCents, p.reference, u.fullName AS userName, p.createdAt
       FROM order_payments p JOIN orders o ON o.id = p.orderId LEFT JOIN users u ON u.id = p.userId
      ORDER BY p.id DESC LIMIT ?`,
    [Math.min(1000, limit)]
  )
}
