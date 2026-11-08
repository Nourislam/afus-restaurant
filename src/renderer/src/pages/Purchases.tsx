import { useMemo, useState } from 'react'
import { Banknote, PackageOpen, PackageCheck, Pencil, Plus, Trash2, Truck, X } from 'lucide-react'
import type { Ingredient, Purchase, Supplier } from '@shared/types'
import { api } from '../lib/api'
import { useApi } from '../lib/hooks'
import { errorText, useT } from '../i18n'
import { centsToInput, formatDate, formatDateTime, formatMoney, todayString, toCents } from '../lib/format'
import { paymentMethodLabel, purchaseStatusLabel, purchaseStatusTone, unitSymbol } from '../lib/labels'
import { useAppStore } from '../store/app'
import {
  Badge,
  Button,
  Card,
  Confirm,
  DataTable,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Loading,
  Modal,
  Money,
  PageHeader,
  Select,
  Tabs,
  Textarea,
  type Column
} from '../components/ui'

type TabKey = 'invoices' | 'suppliers'

export default function PurchasesPage() {
  const { t, language } = useT()
  const settings = useAppStore((state) => state.settings)
  const can = useAppStore((state) => state.can)
  const manage = can('purchases.manage')
  const [tab, setTab] = useState<TabKey>('invoices')
  const [error, setError] = useState<string | null>(null)
  const [invoiceModal, setInvoiceModal] = useState<Purchase | 'new' | null>(null)
  const [supplierModal, setSupplierModal] = useState<Supplier | 'new' | null>(null)
  const [payTarget, setPayTarget] = useState<Supplier | null>(null)
  const [ledgerTarget, setLedgerTarget] = useState<Supplier | null>(null)
  const [receiveTarget, setReceiveTarget] = useState<Purchase | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Purchase | null>(null)

  const purchases = useApi(() => api.purchases.list({}), [])
  const suppliers = useApi(() => api.suppliers.list(), [])
  const ingredients = useApi(() => api.ingredients.list(false), [])

  const currency = settings?.currency ?? 'DZD'
  const supplierById = useMemo(() => new Map((suppliers.data ?? []).map((row) => [row.id, row])), [suppliers.data])

  const reload = async () => {
    await Promise.all([purchases.reload(), suppliers.reload()])
  }

  const columns: Column<Purchase>[] = [
    {
      key: 'invoice',
      header: t('purchases.invoiceNo'),
      render: (row) => (
        <div>
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{row.invoiceNo || `#${row.id}`}</p>
          <p className="text-[10px] text-slate-400">{formatDate(row.purchaseDate)}</p>
        </div>
      )
    },
    { key: 'supplier', header: t('purchases.supplier'), render: (row) => <span className="text-xs">{row.supplierName ?? '—'}</span> },
    {
      key: 'items',
      header: t('orders.items'),
      align: 'center',
      render: (row) => <span className="num text-xs">{row.items.length}</span>
    },
    { key: 'total', header: t('common.total'), align: 'end', render: (row) => <Money cents={row.totalCents} className="text-xs font-semibold" /> },
    { key: 'paid', header: t('common.paid'), align: 'end', render: (row) => <Money cents={row.paidCents} className="text-xs text-slate-500" /> },
    {
      key: 'status',
      header: t('common.status'),
      align: 'center',
      render: (row) => <Badge tone={purchaseStatusTone(row.status)}>{purchaseStatusLabel(language, row.status)}</Badge>
    },
    {
      key: 'actions',
      header: t('common.actions'),
      align: 'end',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          {row.status === 'draft' && manage ? (
            <>
              <Button size="sm" icon={PackageCheck} onClick={() => setReceiveTarget(row)}>{t('purchases.receive')}</Button>
              <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setInvoiceModal(row)}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button className="rounded p-1.5 text-red-500 hover:bg-red-50" onClick={() => setCancelTarget(row)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : row.status === 'received' && manage ? (
            <Button
              size="sm"
              variant="secondary"
              icon={Banknote}
              disabled={row.paidCents >= row.totalCents}
              onClick={() => {
                const supplier = supplierById.get(row.supplierId)
                if (supplier) setPayTarget(supplier)
              }}
            >
              {t('purchases.paySupplier')}
            </Button>
          ) : null}
        </div>
      )
    }
  ]

  const supplierColumns: Column<Supplier>[] = [
    {
      key: 'name',
      header: t('common.name'),
      render: (row) => (
        <div>
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{row.name}</p>
          <p className="text-[10px] text-slate-400">{row.phone ?? '—'}</p>
        </div>
      )
    },
    { key: 'purchases', header: t('purchases.invoices'), align: 'end', render: (row) => <Money cents={row.totalPurchasesCents} className="text-xs" /> },
    { key: 'paid', header: t('common.paid'), align: 'end', render: (row) => <Money cents={row.totalPaidCents} className="text-xs text-slate-500" /> },
    {
      key: 'balance',
      header: t('purchases.balance'),
      align: 'end',
      render: (row) => <Money cents={row.balanceCents} className={`text-xs font-bold ${row.balanceCents > 0 ? 'text-amber-600' : 'text-brand-700'}`} />
    },
    {
      key: 'actions',
      header: t('common.actions'),
      align: 'end',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="secondary" onClick={() => setLedgerTarget(row)}>{t('purchases.ledger')}</Button>
          {manage ? (
            <>
              <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setSupplierModal(row)}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <Button size="sm" icon={Banknote} onClick={() => setPayTarget(row)}>{t('common.add')}</Button>
            </>
          ) : null}
        </div>
      )
    }
  ]

  return (
    <div>
      <PageHeader
        title={t('purchases.title')}
        subtitle={t('purchases.subtitle')}
        actions={
          manage ? (
            tab === 'invoices' ? (
              <Button icon={Plus} onClick={() => setInvoiceModal('new')}>{t('purchases.newInvoice')}</Button>
            ) : (
              <Button icon={Plus} onClick={() => setSupplierModal('new')}>{t('purchases.addSupplier')}</Button>
            )
          ) : null
        }
      />

      {error ? <div className="mb-3"><ErrorBox code={error} /></div> : null}

      <div className="mb-3">
        <Tabs<TabKey>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'invoices', label: t('purchases.invoices'), count: purchases.data?.length ?? 0 },
            { value: 'suppliers', label: t('purchases.suppliers'), count: suppliers.data?.length ?? 0 }
          ]}
        />
      </div>

      <Card>
        {purchases.error || suppliers.error ? (
          <ErrorBox code={purchases.error ?? suppliers.error ?? ''} onRetry={() => void reload()} />
        ) : tab === 'invoices' ? (
          <DataTable
            columns={columns}
            rows={purchases.data ?? []}
            keyField={(row) => row.id}
            loading={purchases.loading}
            empty={<EmptyState icon={PackageOpen} title={t('purchases.empty')} hint={t('purchases.subtitle')} action={manage ? <Button icon={Plus} onClick={() => setInvoiceModal('new')}>{t('purchases.newInvoice')}</Button> : undefined} />}
          />
        ) : (
          <DataTable
            columns={supplierColumns}
            rows={suppliers.data ?? []}
            keyField={(row) => row.id}
            loading={suppliers.loading}
            empty={<EmptyState icon={Truck} title={t('common.noData')} action={manage ? <Button icon={Plus} onClick={() => setSupplierModal('new')}>{t('purchases.addSupplier')}</Button> : undefined} />}
          />
        )}
      </Card>

      {invoiceModal ? (
        <InvoiceModal
          purchase={invoiceModal === 'new' ? null : invoiceModal}
          suppliers={suppliers.data ?? []}
          ingredients={ingredients.data ?? []}
          currency={currency}
          onClose={() => setInvoiceModal(null)}
          onSaved={async () => {
            setInvoiceModal(null)
            await reload()
          }}
        />
      ) : null}

      {supplierModal ? (
        <SupplierModal
          supplier={supplierModal === 'new' ? null : supplierModal}
          onClose={() => setSupplierModal(null)}
          onSaved={async () => {
            setSupplierModal(null)
            await reload()
          }}
        />
      ) : null}

      {payTarget ? (
        <PaySupplierModal
          supplier={payTarget}
          purchases={purchases.data ?? []}
          methods={settings?.paymentMethods ?? ['cash']}
          currency={currency}
          onClose={() => setPayTarget(null)}
          onSaved={async () => {
            setPayTarget(null)
            await reload()
          }}
        />
      ) : null}

      {ledgerTarget ? <SupplierLedgerModal supplier={ledgerTarget} onClose={() => setLedgerTarget(null)} /> : null}

      <Confirm
        open={Boolean(receiveTarget)}
        title={t('purchases.receive')}
        message={t('purchases.receive') + ' — ' + t('common.confirm')}
        confirmLabel={t('purchases.receive')}
        onClose={() => setReceiveTarget(null)}
        onConfirm={async () => {
          if (!receiveTarget) return
          try {
            await api.purchases.receive(receiveTarget.id)
            setReceiveTarget(null)
            await reload()
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
            setReceiveTarget(null)
          }
        }}
      />

      <Confirm
        open={Boolean(cancelTarget)}
        title={t('common.cancel')}
        message={t('common.confirmDelete')}
        confirmLabel={t('common.cancel')}
        danger
        onClose={() => setCancelTarget(null)}
        onConfirm={async () => {
          if (!cancelTarget) return
          try {
            await api.purchases.cancel(cancelTarget.id)
            setCancelTarget(null)
            await reload()
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
            setCancelTarget(null)
          }
        }}
      />
    </div>
  )
}

function InvoiceModal({
  purchase,
  suppliers,
  ingredients,
  currency,
  onClose,
  onSaved
}: {
  purchase: Purchase | null
  suppliers: Supplier[]
  ingredients: Ingredient[]
  currency: string
  onClose: () => void
  onSaved: () => void
}) {
  const { t, language } = useT()
  const [supplierId, setSupplierId] = useState(String(purchase?.supplierId ?? suppliers[0]?.id ?? ''))
  const [invoiceNo, setInvoiceNo] = useState(purchase?.invoiceNo ?? '')
  const [date, setDate] = useState(purchase?.purchaseDate?.slice(0, 10) ?? todayString())
  const [discount, setDiscount] = useState(centsToInput(purchase?.discountCents ?? 0))
  const [extra, setExtra] = useState(centsToInput(purchase?.extraCents ?? 0))
  const [note, setNote] = useState(purchase?.note ?? '')
  const [items, setItems] = useState<{ ingredientId: string; qty: string; unitCost: string }[]>(
    purchase?.items.map((item) => ({
      ingredientId: String(item.ingredientId),
      qty: String(item.qty),
      unitCost: centsToInput(item.unitCostCents)
    })) ?? [{ ingredientId: '', qty: '1', unitCost: '0' }]
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const subtotal = items.reduce((sum, item) => sum + Math.round(Number(item.qty || '0') * (toCents(item.unitCost) ?? 0)), 0)
  const total = subtotal - (toCents(discount) ?? 0) + (toCents(extra) ?? 0)
  const ingredientById = useMemo(() => new Map(ingredients.map((item) => [item.id, item])), [ingredients])

  return (
    <Modal
      open
      title={purchase ? t('common.edit') : t('purchases.newInvoice')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={busy}
            disabled={!supplierId || items.every((item) => !item.ingredientId)}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await api.purchases.save({
                  id: purchase?.id,
                  supplierId: Number(supplierId),
                  invoiceNo: invoiceNo.trim() || null,
                  purchaseDate: date,
                  discountCents: toCents(discount) ?? 0,
                  extraCents: toCents(extra) ?? 0,
                  note: note.trim() || null,
                  items: items
                    .filter((item) => item.ingredientId && Number(item.qty) > 0)
                    .map((item) => ({
                      ingredientId: Number(item.ingredientId),
                      qty: Number(item.qty),
                      unitCostCents: toCents(item.unitCost) ?? 0
                    }))
                })
                onSaved()
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
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
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('purchases.supplier')} required>
            <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('purchases.invoiceNo')}>
            <Input value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} />
          </Field>
          <Field label={t('common.date')}>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
        </div>

        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{t('orders.items')}</p>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setItems([...items, { ingredientId: '', qty: '1', unitCost: '0' }])}>
              {t('common.add')}
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((item, index) => {
              const ingredient = ingredientById.get(Number(item.ingredientId))
              return (
                <div key={index} className="grid grid-cols-[1fr_80px_70px_90px_24px] items-center gap-2">
                  <Select
                    value={item.ingredientId}
                    onChange={(event) => {
                      const next = ingredients.find((row) => row.id === Number(event.target.value))
                      setItems(
                        items.map((row, i) =>
                          i === index
                            ? { ...row, ingredientId: event.target.value, unitCost: next ? centsToInput(next.unitCostCents) : row.unitCost }
                            : row
                        )
                      )
                    }}
                  >
                    <option value="">—</option>
                    {ingredients.map((row) => (
                      <option key={row.id} value={row.id}>{language === 'ar' ? row.nameAr : row.nameFr}</option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    step="0.001"
                    value={item.qty}
                    onChange={(event) => setItems(items.map((row, i) => (i === index ? { ...row, qty: event.target.value } : row)))}
                  />
                  <span className="text-[10px] text-slate-400">{ingredient ? unitSymbol(ingredient.unit) : '—'}</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unitCost}
                    onChange={(event) => setItems(items.map((row, i) => (i === index ? { ...row, unitCost: event.target.value } : row)))}
                  />
                  <button className="rounded p-1 text-red-500" onClick={() => setItems(items.filter((_, i) => i !== index))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('common.discount')}>
            <Input type="number" min={0} step="1" value={discount} onChange={(event) => setDiscount(event.target.value)} />
          </Field>
          <Field label={t('purchases.extra')}>
            <Input type="number" min={0} step="1" value={extra} onChange={(event) => setExtra(event.target.value)} />
          </Field>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800">
            <div className="flex justify-between text-slate-500"><span>{t('common.subtotal')}</span><Money cents={subtotal} /></div>
            <div className="mt-1 flex justify-between font-bold"><span>{t('common.total')}</span><Money cents={total} /></div>
            <p className="mt-1 text-[10px] text-slate-400">{currency}</p>
          </div>
        </div>

        <Field label={t('common.notes')}>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-[52px]" />
        </Field>
        {error ? <p className="text-xs font-medium text-red-600">{errorText(language, error)}</p> : null}
        <p className="text-[11px] text-slate-400">{language === 'ar' ? 'تُحدَّث كمية المخزون عند استلام الفاتورة، وليس عند حفظها كمسودة.' : 'Le stock est mis à jour à la réception, pas à l’enregistrement du brouillon.'}</p>
      </div>
    </Modal>
  )
}

function SupplierModal({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const { t, language } = useT()
  const [name, setName] = useState(supplier?.name ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [address, setAddress] = useState(supplier?.address ?? '')
  const [notes, setNotes] = useState(supplier?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      open
      title={supplier ? t('common.edit') : t('purchases.addSupplier')}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={busy}
            disabled={!name.trim()}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await api.suppliers.save({
                  id: supplier?.id,
                  name: name.trim(),
                  phone: phone.trim() || null,
                  address: address.trim() || null,
                  notes: notes.trim() || null
                })
                onSaved()
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
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
        <Field label={t('common.name')} required>
          <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </Field>
        <Field label={t('common.phone')}>
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </Field>
        <Field label={t('common.address')}>
          <Input value={address} onChange={(event) => setAddress(event.target.value)} />
        </Field>
        <Field label={t('common.notes')}>
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-[52px]" />
        </Field>
        {error ? <p className="text-xs font-medium text-red-600">{errorText(language, error)}</p> : null}
      </div>
    </Modal>
  )
}

function PaySupplierModal({
  supplier,
  purchases,
  methods,
  currency,
  onClose,
  onSaved
}: {
  supplier: Supplier
  purchases: Purchase[]
  methods: string[]
  currency: string
  onClose: () => void
  onSaved: () => void
}) {
  const { t, language } = useT()
  const unpaid = purchases.filter((row) => row.supplierId === supplier.id && row.status === 'received' && row.paidCents < row.totalCents)
  const [purchaseId, setPurchaseId] = useState(unpaid[0] ? String(unpaid[0].id) : '')
  const [amount, setAmount] = useState(centsToInput(supplier.balanceCents))
  const [method, setMethod] = useState(methods[0] ?? 'cash')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      open
      title={t('purchases.paySupplier')}
      subtitle={`${supplier.name} · ${t('purchases.balance')}: ${formatMoney(supplier.balanceCents, currency, 0)}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={busy}
            disabled={!amount || Number(amount) <= 0}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await api.purchases.pay({
                  supplierId: supplier.id,
                  purchaseId: purchaseId ? Number(purchaseId) : null,
                  amountCents: toCents(amount) ?? 0,
                  method,
                  note: note.trim() || undefined
                })
                onSaved()
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
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
        <Field label={t('purchases.invoices')}>
          <Select value={purchaseId} onChange={(event) => setPurchaseId(event.target.value)}>
            <option value="">{t('common.all')}</option>
            {unpaid.map((row) => (
              <option key={row.id} value={row.id}>
                {row.invoiceNo || `#${row.id}`} · {formatMoney(row.totalCents - row.paidCents, currency, 0)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.amount')} required>
          <Input type="number" min={0} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus />
        </Field>
        <Field label={t('common.method')}>
          <Select value={method} onChange={(event) => setMethod(event.target.value)}>
            {methods.map((item) => (
              <option key={item} value={item}>{paymentMethodLabel(language, item)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.notes')}>
          <Input value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        {error ? <p className="text-xs font-medium text-red-600">{errorText(language, error)}</p> : null}
      </div>
    </Modal>
  )
}

function SupplierLedgerModal({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const { t, language } = useT()
  const ledger = useApi(() => api.suppliers.get(supplier.id), [supplier.id])
  return (
    <Modal open title={`${t('purchases.ledger')} · ${supplier.name}`} onClose={onClose} size="lg">
      {ledger.loading && !ledger.data ? (
        <Loading />
      ) : ledger.error ? (
        <ErrorBox code={ledger.error} onRetry={() => void ledger.reload()} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
              <p className="text-[10px] text-slate-400">{t('purchases.invoices')}</p>
              <Money cents={supplier.totalPurchasesCents} className="text-xs font-bold" />
            </div>
            <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
              <p className="text-[10px] text-slate-400">{t('common.paid')}</p>
              <Money cents={supplier.totalPaidCents} className="text-xs font-bold" />
            </div>
            <div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-500/10">
              <p className="text-[10px] text-amber-600">{t('purchases.balance')}</p>
              <Money cents={supplier.balanceCents} className="text-xs font-bold text-amber-700" />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">{t('purchases.invoices')}</p>
            <ul className="space-y-1">
              {(ledger.data?.purchases ?? []).map((row) => (
                <li key={row.id} className="flex items-center justify-between rounded border border-slate-100 px-2.5 py-1.5 text-[11px] dark:border-slate-800">
                  <span>{row.invoiceNo || `#${row.id}`} · {formatDate(row.purchaseDate)} · {purchaseStatusLabel(language, row.status)}</span>
                  <Money cents={row.totalCents} />
                </li>
              ))}
              {(ledger.data?.purchases ?? []).length === 0 ? <li className="text-[11px] text-slate-400">{t('common.noData')}</li> : null}
            </ul>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">{t('finance.payments')}</p>
            <ul className="space-y-1">
              {(ledger.data?.payments ?? []).map((payment) => (
                <li key={payment.id} className="flex items-center justify-between rounded border border-slate-100 px-2.5 py-1.5 text-[11px] dark:border-slate-800">
                  <span>{paymentMethodLabel(language, payment.method)} · {formatDateTime(payment.createdAt)}</span>
                  <Money cents={payment.amountCents} />
                </li>
              ))}
              {(ledger.data?.payments ?? []).length === 0 ? <li className="text-[11px] text-slate-400">{t('common.noData')}</li> : null}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  )
}
