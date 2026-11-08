import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChefHat, CreditCard, Printer, Receipt, X } from 'lucide-react'
import type { Order } from '@shared/types'
import { ORDER_STATUSES } from '@shared/constants'
import { api } from '../lib/api'
import { useApi } from '../lib/hooks'
import { errorText, useT } from '../i18n'
import { centsToInput, formatDateTime, formatMoney, toCents } from '../lib/format'
import {
  deliveryStatusLabel,
  deliveryStatusTone,
  orderStatusLabel,
  orderStatusTone,
  orderTypeLabel,
  paymentMethodLabel
} from '../lib/labels'
import { useAppStore } from '../store/app'
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Field,
  Input,
  Loading,
  Modal,
  Money,
  PageHeader,
  Select
} from '../components/ui'
import { kitchenTicketHtml, receiptHtml } from '../lib/receipts'

const NEXT_STATUSES: Record<string, string[]> = {
  new: ['accepted'],
  accepted: ['preparing', 'ready'],
  preparing: ['ready', 'accepted'],
  ready: ['out_for_delivery', 'completed', 'preparing'],
  out_for_delivery: ['completed']
}

export default function OrderDetailPage() {
  const { orderId } = useParams()
  const { t, language } = useT()
  const navigate = useNavigate()
  const settings = useAppStore((state) => state.settings)
  const can = useAppStore((state) => state.can)
  const order = useApi(() => api.orders.get(Number(orderId)), [orderId])
  const [payOpen, setPayOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [policy, setPolicy] = useState<'waste' | 'return'>('waste')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    document.title = order.data ? `${order.data.orderNumber} · AFUS` : 'AFUS Restaurant'
  }, [order.data])

  if (order.loading && !order.data) return <Loading />
  if (order.error) return <ErrorBox code={order.error} onRetry={() => void order.reload()} />
  if (!order.data) return null

  const data = order.data
  const closed = data.status === 'completed' || data.status === 'cancelled'
  const currency = settings?.currency ?? 'DZD'

  const printReceipt = async () => {
    if (!settings) return
    try {
      await api.print.html(receiptHtml(data, settings, language, settings.paperWidth), settings.printerName || undefined, false)
    } catch (caught) {
      setNotice(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'))
    }
  }

  const printKitchen = async () => {
    if (!settings) return
    try {
      await api.print.html(kitchenTicketHtml(data, settings, language), settings.printerName || undefined, false)
    } catch (caught) {
      setNotice(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'))
    }
  }

  const changeStatus = async (status: string) => {
    setBusy(status)
    setError(null)
    try {
      await api.orders.setStatus(data.id, status as Order['status'])
      await order.reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
        {t('common.back')}
      </button>

      <PageHeader
        title={`${t('orders.detail')} · ${data.orderNumber}`}
        subtitle={`${orderTypeLabel(language, data.type)} · ${formatDateTime(data.createdAt)}`}
        actions={
          <>
            <Badge tone={orderStatusTone(data.status)}>{orderStatusLabel(language, data.status)}</Badge>
            {data.isHeld ? <Badge tone="amber">{t('orders.held')}</Badge> : null}
            <Button variant="secondary" icon={Printer} onClick={() => void printReceipt()}>
              {t('pos.printReceipt')}
            </Button>
            <Button variant="secondary" icon={ChefHat} onClick={() => void printKitchen()}>
              {t('pos.printKitchen')}
            </Button>
            {!closed && can('pos.use') ? (
              <Link to={`/pos?order=${data.id}`}>
                <Button variant="secondary" icon={Receipt}>
                  {t('nav.pos')}
                </Button>
              </Link>
            ) : null}
            {data.dueCents > 0 && can('orders.close') && !closed ? (
              <Button icon={CreditCard} onClick={() => setPayOpen(true)}>
                {t('pos.pay')}
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <div className="mb-3"><ErrorBox code={error} /></div> : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-bold text-slate-800 dark:border-slate-800 dark:text-slate-100">
              {t('orders.items')}
            </div>
            <table className="afus-table w-full">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th className="text-center">{t('common.quantity')}</th>
                  <th className="text-end">{t('common.price')}</th>
                  <th className="text-end">{t('common.total')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {language === 'ar' ? item.productNameAr : item.productNameFr}
                        {item.variantNameAr || item.variantNameFr ? (
                          <span className="ms-1 text-[10px] font-normal text-slate-400">
                            ({language === 'ar' ? item.variantNameAr : item.variantNameFr})
                          </span>
                        ) : null}
                      </p>
                      {item.modifiers.length > 0 ? (
                        <p className="text-[10px] text-slate-400">
                          + {item.modifiers.map((modifier) => (language === 'ar' ? modifier.nameAr : modifier.nameFr)).join(', ')}
                        </p>
                      ) : null}
                      {item.note ? <p className="text-[10px] text-amber-600">✎ {item.note}</p> : null}
                    </td>
                    <td className="num text-center text-xs">{item.qty}</td>
                    <td className="num text-end text-xs">
                      <Money cents={item.unitPriceCents + item.modifiersCents} />
                    </td>
                    <td className="num text-end text-xs font-semibold">
                      <Money cents={item.lineTotalCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('orders.payments')}</h3>
              {data.payments.length === 0 ? (
                <p className="py-4 text-xs text-slate-400">{t('common.noData')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.payments.map((payment) => (
                    <li key={payment.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300">
                        {paymentMethodLabel(language, payment.method)} · {formatDateTime(payment.createdAt)}
                      </span>
                      <Money cents={payment.amountCents} className="font-semibold" />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('orders.history')}</h3>
              <ol className="space-y-2 border-s border-slate-200 ps-3 dark:border-slate-700">
                {data.history.map((event) => (
                  <li key={event.id} className="relative text-xs">
                    <span className="absolute -start-[17px] top-1 h-2 w-2 rounded-full bg-brand-600" />
                    <p className="font-medium text-slate-700 dark:text-slate-200">{orderStatusLabel(language, event.toStatus)}</p>
                    <p className="text-[10px] text-slate-400">
                      {formatDateTime(event.createdAt)} {event.userName ? `· ${event.userName}` : ''} {event.note ? `· ${event.note}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          {data.delivery ? (
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('nav.delivery')}</h3>
                <Badge tone={deliveryStatusTone(data.delivery.status)}>{deliveryStatusLabel(language, data.delivery.status)}</Badge>
              </div>
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <p><span className="text-slate-400">{t('common.name')}: </span>{data.delivery.customerName}</p>
                <p><span className="text-slate-400">{t('common.phone')}: </span>{data.delivery.phone}</p>
                <p className="sm:col-span-2"><span className="text-slate-400">{t('common.address')}: </span>{data.delivery.address}</p>
                <p><span className="text-slate-400">{t('delivery.courier')}: </span>{data.delivery.courier ?? '—'}</p>
                <p><span className="text-slate-400">{t('delivery.fee')}: </span>{formatMoney(data.delivery.feeCents, currency, 0)}</p>
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">{t('common.subtotal')}</span><Money cents={data.subtotalCents} /></div>
              {data.discountCents > 0 ? (
                <div className="flex justify-between text-red-600">
                  <span>{t('common.discount')}{data.discountReason ? ` · ${data.discountReason}` : ''}</span>
                  <Money cents={-data.discountCents} />
                </div>
              ) : null}
              {data.deliveryFeeCents > 0 ? (
                <div className="flex justify-between"><span className="text-slate-500">{t('delivery.fee')}</span><Money cents={data.deliveryFeeCents} /></div>
              ) : null}
              {data.taxCents > 0 ? (
                <div className="flex justify-between"><span className="text-slate-500">{t('common.tax')}</span><Money cents={data.taxCents} /></div>
              ) : null}
              <div className="flex justify-between border-t border-dashed border-slate-200 pt-2 text-sm font-bold dark:border-slate-700">
                <span>{t('common.total')}</span>
                <Money cents={data.totalCents} />
              </div>
              <div className="flex justify-between text-brand-700"><span>{t('common.paid')}</span><Money cents={data.paidCents} /></div>
              <div className={`flex justify-between font-semibold ${data.dueCents > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                <span>{t('common.due')}</span>
                <Money cents={data.dueCents} />
              </div>
            </div>

            {data.tableName ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500 dark:bg-slate-800">
                {t('pos.table')}: <strong>{data.tableName}</strong>
                {data.waiterName ? ` · ${t('tables.waiter')}: ${data.waiterName}` : ''}
              </p>
            ) : null}
            {data.customerName ? (
              <p className="mt-1 text-[11px] text-slate-500">{t('pos.customer')}: {data.customerName}</p>
            ) : null}
            {data.note ? <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 dark:bg-amber-500/10">✎ {data.note}</p> : null}
          </Card>

          {!closed ? (
            <Card className="p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('common.status')}</h3>
              <div className="flex flex-wrap gap-1.5">
                {(NEXT_STATUSES[data.status] ?? []).map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={status === 'completed' ? 'primary' : 'secondary'}
                    loading={busy === status}
                    disabled={Boolean(busy) || (status === 'completed' && data.paidCents < data.totalCents)}
                    onClick={() => void changeStatus(status)}
                  >
                    {orderStatusLabel(language, status)}
                  </Button>
                ))}
              </div>
              {data.paidCents < data.totalCents ? (
                <p className="mt-2 text-[10px] text-amber-600">{t('errors.ORDER_NOT_PAID')}</p>
              ) : null}
              {can('orders.cancel') ? (
                <Button variant="ghost" size="sm" className="mt-3 text-red-600" icon={X} onClick={() => setCancelOpen(true)}>
                  {t('pos.cancelOrder')}
                </Button>
              ) : null}
            </Card>
          ) : (
            <Card className="p-4 text-xs text-slate-500">
              {data.cancelReason ? <p>{t('pos.cancelReason')}: {data.cancelReason}</p> : <p>{orderStatusLabel(language, data.status)}</p>}
            </Card>
          )}
        </div>
      </div>

      {notice ? (
        <div className="fixed bottom-5 start-1/2 z-50 -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          {notice}
        </div>
      ) : null}

      {payOpen ? (
        <QuickPayModal
          order={data}
          methods={settings?.paymentMethods ?? ['cash']}
          currency={currency}
          onClose={() => setPayOpen(false)}
          onPaid={async (updated) => {
            setPayOpen(false)
            order.setData(updated)
            if (settings) {
              try {
                await api.print.html(receiptHtml(updated, settings, language, settings.paperWidth), settings.printerName || undefined, false)
              } catch {
                /* printing is optional here */
              }
            }
          }}
        />
      ) : null}

      <Modal
        open={cancelOpen}
        title={t('pos.cancelOrder')}
        onClose={() => setCancelOpen(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={!reason.trim()}
              onClick={async () => {
                try {
                  await api.orders.cancel(data.id, reason.trim(), policy)
                  setCancelOpen(false)
                  await order.reload()
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
                  setCancelOpen(false)
                }
              }}
            >
              {t('pos.cancelOrder')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('pos.cancelReason')} required>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <Field label={t('pos.stockPolicy')}>
            <Select value={policy} onChange={(event) => setPolicy(event.target.value as 'waste' | 'return')}>
              <option value="waste">{t('pos.waste')}</option>
              <option value="return">{t('pos.returnStock')}</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  )
}

function QuickPayModal({
  order,
  methods,
  currency,
  onClose,
  onPaid
}: {
  order: Order
  methods: string[]
  currency: string
  onClose: () => void
  onPaid: (order: Order) => void
}) {
  const { t, language } = useT()
  const [method, setMethod] = useState(methods[0] ?? 'cash')
  const [amount, setAmount] = useState(centsToInput(order.dueCents))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cents = toCents(amount) ?? 0

  return (
    <Modal
      open
      title={t('pos.pay')}
      subtitle={`${order.orderNumber} · ${t('common.due')}: ${formatMoney(order.dueCents, currency, 0)}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={busy}
            disabled={cents <= 0 || cents > order.dueCents}
            onClick={async () => {
              setBusy(true)
              try {
                onPaid(await api.orders.pay(order.id, [{ method, amountCents: cents }]))
              } catch (caught) {
                setError(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'))
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('pos.pay')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('common.method')}>
          <Select value={method} onChange={(event) => setMethod(event.target.value)}>
            {methods.map((item) => (
              <option key={item} value={item}>{paymentMethodLabel(language, item)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.amount')}>
          <Input type="number" min={0} value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus />
        </Field>
        <div className="flex flex-wrap gap-1">
          {[order.dueCents, Math.round(order.dueCents / 2), order.totalCents].map((value, index) => (
            <Button key={index} size="sm" variant="secondary" onClick={() => setAmount(centsToInput(value))}>
              {formatMoney(value, currency, 0)}
            </Button>
          ))}
        </div>
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
        <p className="text-[10px] text-slate-400">{ORDER_STATUSES.find((status) => status.value === order.status)?.label[language]}</p>
      </div>
    </Modal>
  )
}
