import { z } from 'zod'
import { cashMovement, closeSession, currentSession, listExpenses, listPayments, listSessions, openSession, removeExpense, saveExpense, sessionMovements } from '../../services/finance'
import { REPORT_TYPES, exportReport, report } from '../../services/reports'
import { insightAsk, insightOverview } from '../../services/insight'
import { exportPdf } from '../../services/print'
import { registerMany } from '../registry'

const id = z.number().int().positive()
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const rangeSchema = z.object({ from: day.optional(), to: day.optional(), branchId: id.nullable().optional() }).passthrough()
const reportType = z.enum(REPORT_TYPES)

export const financeChannels = () =>
  registerMany([
    { channel: 'finance.currentSession', definition: { permission: ['finance.view', 'pos.use'], handler: () => currentSession() } },
    { channel: 'finance.sessions', definition: { permission: 'finance.view', schema: z.object({ limit: z.number().int().min(1).max(500).optional() }).passthrough(), handler: (input: { limit?: number }) => listSessions(input.limit ?? 50) } },
    {
      channel: 'finance.openSession',
      definition: {
        permission: ['finance.manage', 'pos.use'],
        schema: z.object({ openingFloatCents: z.number().int().min(0), note: z.string().max(200).nullable().optional() }),
        handler: (input: { openingFloatCents: number; note?: string | null }) => openSession(input)
      }
    },
    {
      channel: 'finance.closeSession',
      definition: {
        permission: ['finance.manage', 'pos.use'],
        schema: z.object({ countedCents: z.number().int().min(0), note: z.string().max(300).nullable().optional() }),
        handler: (input: { countedCents: number; note?: string | null }) => closeSession(input)
      }
    },
    {
      channel: 'finance.cashMovement',
      definition: {
        permission: 'finance.manage',
        schema: z.object({ type: z.enum(['deposit', 'withdrawal']), amountCents: z.number().int().positive(), note: z.string().max(200).nullable().optional() }),
        handler: (input: { type: 'deposit' | 'withdrawal'; amountCents: number; note?: string | null }) => cashMovement(input)
      }
    },
    { channel: 'finance.session.movements', definition: { permission: 'finance.view', schema: z.object({ sessionId: id }), handler: (input: { sessionId: number }) => sessionMovements(input.sessionId) } },
    { channel: 'finance.expenses.list', definition: { permission: 'finance.view', schema: rangeSchema.extend({ limit: z.number().int().min(1).max(1000).optional() }), handler: (input: Parameters<typeof listExpenses>[0]) => listExpenses(input) } },
    {
      channel: 'finance.expenses.save',
      definition: {
        permission: 'finance.manage',
        schema: z.object({
          id: id.optional(),
          category: z.string().min(1).max(32),
          description: z.string().min(1).max(200),
          amountCents: z.number().int().positive(),
          method: z.string().max(24).optional(),
          expenseDate: day.nullable().optional()
        }),
        handler: (input: Parameters<typeof saveExpense>[0]) => saveExpense(input)
      }
    },
    { channel: 'finance.expenses.remove', definition: { permission: 'finance.manage', schema: z.object({ id }), handler: (input: { id: number }) => removeExpense(input.id) } },
    { channel: 'finance.payments', definition: { permission: 'finance.view', schema: z.object({ limit: z.number().int().min(1).max(1000).optional() }).passthrough(), handler: (input: { limit?: number }) => listPayments(input.limit ?? 200) } },

    /* ---------------- Reports ---------------- */
    ...REPORT_TYPES.map((type) => ({
      channel: `reports.${type}` as const,
      definition: {
        permission: 'reports.view' as const,
        schema: rangeSchema,
        handler: (input: { from?: string; to?: string; branchId?: number | null }) => report(type, input.from, input.to, input.branchId)
      }
    })),
    {
      channel: 'reports.export',
      definition: {
        permission: 'reports.export',
        schema: z.object({ type: reportType, from: day.optional(), to: day.optional(), format: z.enum(['csv', 'html', 'pdf']), branchId: id.nullable().optional() }),
        handler: async (input: { type: string; from?: string; to?: string; format: 'csv' | 'html' | 'pdf'; branchId?: number | null }) => {
          const result = exportReport(input)
          if (input.format === 'pdf' && result.html) {
            return exportPdf({ html: result.html, fileName: `${input.type}-${input.from ?? ''}_${input.to ?? ''}.pdf` })
          }
          return { filePath: result.filePath }
        }
      }
    },

    /* ---------------- Insight ---------------- */
    { channel: 'insight.overview', definition: { permission: 'insight.view', schema: z.object({ rangeDays: z.number().int().min(7).max(365).optional() }).passthrough(), handler: (input: { rangeDays?: number }) => insightOverview(input.rangeDays ?? 30) } },
    { channel: 'insight.ask', definition: { permission: 'insight.view', schema: z.object({ question: z.string().min(1).max(300) }), handler: (input: { question: string }) => insightAsk(input.question) } }
  ])
