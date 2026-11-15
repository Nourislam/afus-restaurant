import { useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Lock, Plus, Trash2, Unlock, Wallet } from 'lucide-react'
import type { CashSession, Expense } from '@shared/types'
import { EXPENSE_CATEGORIES, PAYMENT_METHOD_LABELS } from '@shared/constants'
import { api } from '../lib/api'
import { useApi } from '../lib/hooks'
import { formatDateTime, formatMoney, toCents, todayString } from '../lib/format'
import { expenseCategoryLabel, paymentMethodLabel } from '../lib/labels'
import { errorText, useT } from '../i18n'
import { useAppStore } from '../store/app'
import { Badge, Button, Card, Column, Confirm, DataTable, EmptyState, ErrorBox, Field, Input, Modal, Money, PageHeader, Select, StatCard, Tabs } from '../components/ui'

type Tab = 'expenses' | 'payments' | 'sessions'

export default function Finance() {
  const { t, language } = useT()
  const settings = useAppStore((state) => state.settings)
  const can = useAppStore((state) => state.can)
  const manage = can('finance.manage')
  const currency = settings?.currency ?? 'DZD'

  const session = useApi(() => api.finance.currentSession(), [])
  const expenses = useApi(() => api.finance.expenses.list(), [])
  const payments = useApi(() => api.finance.payments(), [])
  const sessions = useApi(() => api.finance.sessions(), [])

  const [tab, setTab] = useState<Tab>('expenses')
  const [modal, setModal] = useState<'open' | 'close' | 'deposit' | 'withdrawal' | 'expense' | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Expense | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reloadAll = async () => {
    await Promise.all([session.reload(), expenses.reload(), payments.reload(), sessions.reload()])
  }

  const open = session.data
  const expected = open ? open.openingFloatCents + open.cashSalesCents + open.depositsCents - open.expensesCents - open.supplierPaymentsCents - open.withdrawalsCents : 0

  const expenseColumns: Column<Expense>[] = [
    { key: 'date', header: t('common.date'), render: (row) => <span className="text-xs text-ink-500">{row.expenseDate}</span> },
    { key: 'category', header: t('common.category'), render: (row) => <Badge tone="neutral">{expenseCategoryLabel(language, row.category)}</Badge> },
    { key: 'description', header: t('common.description'), render: (row) => <span className="font-medium text-ink-800 dark:text-ink-100">{row.description}</span> },
    { key: 'method', header: t('common.method'), render: (row) => <span className="text-xs">{paymentMethodLabel(language, row.method)}</span> },
    { key: 'amount', header: t('common.amount'), align: 'end', render: (row) => <Money cents={row.amountCents} /> },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (row) =>
        manage ? (
          <button className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10" onClick={() => setRemoveTarget(row)} aria-label={t('common.delete')}>
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null
    }
  ]

  type PaymentRow = { id: number; orderNumber: string; method: string; amountCents: number; userName: string | null; createdAt: string }
  const paymentColumns: Column<PaymentRow>[] = [
    { key: 'when', header: t('common.date'), render: (row) => <span className="text-xs text-ink-500">{formatDateTime(row.createdAt)}</span> },
    { key: 'order', header: t('nav.orders'), render: (row) => <span className="font-semibold" dir="ltr">{row.orderNumber}</span> },
    { key: 'method', header: t('common.method'), render: (row) => paymentMethodLabel(language, row.method) },
    { key: 'user', header: t('common.by'), render: (row) => <span className="text-xs text-ink-500">{row.userName ?? '—'}</span> },
    { key: 'amount', header: t('common.amount'), align: 'end', render: (row) => <Money cents={row.amountCents} /> }
  ]

  const sessionColumns: Column<CashSession>[] = [
    { key: 'opened', header: t('common.date'), render: (row) => <span className="text-xs">{formatDateTime(row.openedAt)}</span> },
    { key: 'by', header: t('finance.openedBy'), render: (row) => row.openedByName ?? '—' },
    { key: 'float', header: t('finance.openingFloat'), align: 'end', render: (row) => <Money cents={row.openingFloatCents} /> },
    { key: 'sales', header: t('finance.cashSales'), align: 'end', render: (row) => <Money cents={row.cashSalesCents} /> },
    { key: 'expected', header: t('finance.expected'), align: 'end', render: (row) => <Money cents={row.expectedCents} /> },
    { key: 'counted', header: t('finance.counted'), align: 'end', render: (row) => <Money cents={row.countedCents} /> },
    {
      key: 'diff',
      header: t('finance.difference'),
      align: 'end',
      render: (row) =>
        row.differenceCents === null ? <Badge tone="info">{t('common.open')}</Badge> : <Badge tone={row.differenceCents === 0 ? 'positive' : row.differenceCents < 0 ? 'danger' : 'warning'}>{formatMoney(row.differenceCents, currency, 0)}</Badge>
    }
  ]

  return (
    <section className="space-y-4">
      <PageHeader
        title={t('finance.title')}
        subtitle={t('finance.subtitle')}
        actions={
          manage ? (
            open ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={ArrowDownToLine} onClick={() => setModal('deposit')}>{t('finance.deposit')}</Button>
                <Button variant="secondary" icon={ArrowUpFromLine} onClick={() => setModal('withdrawal')}>{t('finance.withdrawal')}</Button>
                <Button icon={Lock} onClick={() => setModal('close')}>{t('finance.closeSession')}</Button>
              </div>
            ) : (
              <Button icon={Unlock} onClick={() => setModal('open')}>{t('finance.openSession')}</Button>
            )
          ) : undefined
        }
      />
      {error ? <ErrorBox code={error} /> : null}

      {session.error ? (
        <ErrorBox code={session.error} onRetry={() => void session.reload()} />
      ) : open ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t('finance.openingFloat')} value={formatMoney(open.openingFloatCents, currency, 0)} hint={`${t('finance.openedBy')} ${open.openedByName ?? ''} · ${formatDateTime(open.openedAt)}`} icon={Unlock} tone="info" />
          <StatCard label={t('finance.cashSales')} value={formatMoney(open.cashSalesCents, currency, 0)} icon={Wallet} tone="positive" />
          <StatCard label={t('finance.expenses')} value={formatMoney(open.expensesCents + open.supplierPaymentsCents, currency, 0)} hint={`${t('finance.supplierPayments')}: ${formatMoney(open.supplierPaymentsCents, currency, 0)}`} icon={ArrowUpFromLine} tone="warning" />
          <StatCard label={t('finance.expected')} value={formatMoney(expected, currency, 0)} hint={`${t('finance.deposits')} ${formatMoney(open.depositsCents, currency, 0)} · ${t('finance.withdrawals')} ${formatMoney(open.withdrawalsCents, currency, 0)}`} icon={Lock} tone="brand" />
        </div>
      ) : (
        <Card className="flex items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-ink-100 p-3 text-ink-500 dark:bg-ink-800"><Lock className="h-5 w-5" /></span>
            <p className="text-sm text-ink-600 dark:text-ink-300">{t('finance.noSession')}</p>
          </div>
          {manage ? <Button icon={Unlock} onClick={() => setModal('open')}>{t('finance.openSession')}</Button> : null}
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'expenses', label: t('finance.expenses'), count: expenses.data?.length },
            { value: 'payments', label: t('finance.payments'), count: payments.data?.length },
            { value: 'sessions', label: t('finance.sessions'), count: sessions.data?.length }
          ]}
        />
        {tab === 'expenses' && manage ? <Button icon={Plus} onClick={() => setModal('expense')}>{t('finance.addExpense')}</Button> : null}
      </div>

      <Card className="overflow-hidden">
        {tab === 'expenses' ? (
          <DataTable<Expense> columns={expenseColumns} rows={expenses.data ?? []} keyField={(row) => row.id} loading={expenses.loading} empty={<EmptyState icon={Wallet} title={t('common.noData')} />} />
        ) : tab === 'payments' ? (
          <DataTable<PaymentRow> columns={paymentColumns} rows={(payments.data ?? []) as PaymentRow[]} keyField={(row) => row.id} loading={payments.loading} empty={<EmptyState icon={Wallet} title={t('common.noData')} />} />
        ) : (
          <DataTable<CashSession> columns={sessionColumns} rows={sessions.data ?? []} keyField={(row) => row.id} loading={sessions.loading} empty={<EmptyState icon={Wallet} title={t('common.noData')} />} />
        )}
      </Card>

      {modal === 'open' || modal === 'close' || modal === 'deposit' || modal === 'withdrawal' ? (
        <AmountModal
          kind={modal}
          expected={expected}
          currency={currency}
          onClose={() => setModal(null)}
          onSubmit={async (amountCents, note) => {
            setError(null)
            try {
              if (modal === 'open') await api.finance.openSession({ openingFloatCents: amountCents, note })
              else if (modal === 'close') await api.finance.closeSession({ countedCents: amountCents, note })
              else await api.finance.cashMovement({ type: modal, amountCents, note })
              setModal(null)
              await reloadAll()
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
              setModal(null)
            }
          }}
        />
      ) : null}

      {modal === 'expense' ? (
        <ExpenseModal
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null)
            await reloadAll()
          }}
        />
      ) : null}

      <Confirm
        open={Boolean(removeTarget)}
        title={t('common.delete')}
        message={removeTarget ? `${removeTarget.description} · ${formatMoney(removeTarget.amountCents, currency, 0)}` : ''}
        confirmLabel={t('common.delete')}
        danger
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return
          try {
            await api.finance.expenses.remove(removeTarget.id)
            setRemoveTarget(null)
            await reloadAll()
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
            setRemoveTarget(null)
          }
        }}
      />
    </section>
  )
}

function AmountModal({
  kind,
  expected,
  currency,
  onClose,
  onSubmit
}: {
  kind: 'open' | 'close' | 'deposit' | 'withdrawal'
  expected: number
  currency: string
  onClose: () => void
  onSubmit: (amountCents: number, note: string | null) => Promise<void>
}) {
  const { t } = useT()
  const [amount, setAmount] = useState(kind === 'close' ? String(expected / 100) : '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const titles = { open: t('finance.openSession'), close: t('finance.closeSession'), deposit: t('finance.deposit'), withdrawal: t('finance.withdrawal') }
  const labels = { open: t('finance.openingFloat'), close: t('finance.counted'), deposit: t('common.amount'), withdrawal: t('common.amount') }
  const cents = toCents(amount) ?? 0
  return (
    <Modal
      open
      title={titles[kind]}
      subtitle={kind === 'close' ? `${t('finance.expected')}: ${formatMoney(expected, currency, 0)}` : undefined}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={busy}
            disabled={kind === 'open' || kind === 'close' ? cents < 0 : cents <= 0}
            onClick={async () => {
              setBusy(true)
              try {
                await onSubmit(cents, note.trim() || null)
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={`${labels[kind]} (${currency})`} required>
          <Input type="number" min="0" step="1" dir="ltr" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus />
        </Field>
        {kind === 'close' && amount ? (
          <p className="text-xs text-ink-500">
            {t('finance.difference')}: <strong dir="ltr">{formatMoney(cents - expected, currency, 0)}</strong>
          </p>
        ) : null}
        <Field label={t('common.notes')}>
          <Input value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function ExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const { t, language } = useT()
  const settings = useAppStore((state) => state.settings)
  const [category, setCategory] = useState<string>('supplies')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [date, setDate] = useState(todayString())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const methods = settings?.paymentMethods ?? ['cash']
  return (
    <Modal
      open
      title={t('finance.addExpense')}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={busy}
            disabled={!description.trim() || !(toCents(amount) ?? 0)}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await api.finance.expenses.save({ category, description: description.trim(), amountCents: toCents(amount) ?? 0, method, expenseDate: date })
                await onSaved()
              } catch (caught) {
                setError(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'))
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
        <Field label={t('common.description')} required>
          <Input value={description} onChange={(event) => setDescription(event.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.category')}>
            <Select value={category} onChange={(event) => setCategory(event.target.value)}>
              {EXPENSE_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>{item.label[language]}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.method')}>
            <Select value={method} onChange={(event) => setMethod(event.target.value)}>
              {methods.map((item) => (
                <option key={item} value={item}>{PAYMENT_METHOD_LABELS[item]?.[language] ?? item}</option>
              ))}
            </Select>
          </Field>
          <Field label={`${t('common.amount')} (${settings?.currency ?? 'DZD'})`} required>
            <Input type="number" min="0" dir="ltr" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field label={t('common.date')}>
            <Input type="date" dir="ltr" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
