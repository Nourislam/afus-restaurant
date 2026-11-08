import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Truck } from 'lucide-react'
import type { DeliveryRecord, DeliveryStatus } from '@shared/types'
import { DELIVERY_STATUSES } from '@shared/constants'
import { api } from '../lib/api'
import { useApi } from '../lib/hooks'
import { errorText, useT } from '../i18n'
import { addDays, formatDateTime, todayString } from '../lib/format'
import { deliveryStatusLabel, deliveryStatusTone, paymentMethodLabel } from '../lib/labels'
import { useAppStore } from '../store/app'
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Modal,
  Money,
  PageHeader,
  SearchInput,
  Select,
  type Column
} from '../components/ui'

const FLOW: DeliveryStatus[] = ['pending', 'assigned', 'delivered']

export default function DeliveryPage() {
  const { t, language } = useT()
  const can = useAppStore((state) => state.can)
  const manage = can('delivery.manage')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState(addDays(todayString(), -7))
  const [to, setTo] = useState(todayString())
  const [error, setError] = useState<string | null>(null)
  const [courierTarget, setCourierTarget] = useState<DeliveryRecord | null>(null)

  const list = useApi(
    () => api.delivery.list({ status: status || undefined, search: search || undefined, from, to }),
    [status, search, from, to]
  )

  const nextStatus = (row: DeliveryRecord): DeliveryStatus | null => {
    const index = FLOW.indexOf(row.status as DeliveryStatus)
    if (index < 0 || index >= FLOW.length - 1) return null
    return FLOW[index + 1] ?? null
  }

  const columns: Column<DeliveryRecord>[] = [
    {
      key: 'order',
      header: t('orders.number'),
      render: (row) => (
        <div>
          <Link to={`/orders/${row.orderId}`} className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
            {row.orderNumber}
          </Link>
          <p className="text-[10px] text-slate-400">{formatDateTime(row.orderCreatedAt)}</p>
        </div>
      )
    },
    {
      key: 'customer',
      header: t('pos.customer'),
      render: (row) => (
        <div>
          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{row.customerName}</p>
          <p className="text-[10px] text-slate-400">{row.phone}</p>
        </div>
      )
    },
    {
      key: 'address',
      header: t('common.address'),
      render: (row) => (
        <span className="flex items-start gap-1 text-[11px] text-slate-500">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{row.address}{row.area ? ` · ${row.area}` : ''}</span>
        </span>
      )
    },
    { key: 'courier', header: t('delivery.courier'), render: (row) => <span className="text-xs">{row.courier ?? '—'}</span> },
    { key: 'total', header: t('common.total'), align: 'end', render: (row) => <Money cents={row.orderTotalCents} className="text-xs font-semibold" /> },
    {
      key: 'status',
      header: t('delivery.status'),
      render: (row) => <Badge tone={deliveryStatusTone(row.status)}>{deliveryStatusLabel(language, row.status)}</Badge>
    },
    {
      key: 'actions',
      header: t('common.actions'),
      align: 'end',
      render: (row) => {
        const next = nextStatus(row)
        return (
          <div className="flex items-center justify-end gap-1">
            {manage && row.status !== 'delivered' && row.status !== 'cancelled' ? (
              <Button size="sm" variant="secondary" onClick={() => setCourierTarget(row)}>
                <Truck className="h-3.5 w-3.5" />
                {t('delivery.assign')}
              </Button>
            ) : null}
            {manage && next ? (
              <Button
                size="sm"
                disabled={Boolean(row.courier) === false && next === 'assigned'}
                onClick={async () => {
                  try {
                    await api.delivery.setStatus(row.id, next)
                    await list.reload()
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
                  }
                }}
              >
                {deliveryStatusLabel(language, next)}
              </Button>
            ) : null}
            {manage && row.status !== 'delivered' && row.status !== 'cancelled' ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600"
                onClick={async () => {
                  try {
                    await api.delivery.setStatus(row.id, 'cancelled')
                    await list.reload()
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
                  }
                }}
              >
                {t('common.cancel')}
              </Button>
            ) : null}
          </div>
        )
      }
    }
  ]

  return (
    <div>
      <PageHeader title={t('delivery.title')} subtitle={t('delivery.subtitle')} />

      {error ? <div className="mb-3"><ErrorBox code={error} /></div> : null}

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-56"><SearchInput value={search} onChange={setSearch} /></div>
          <Select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 w-40">
            <option value="">{t('common.all')}</option>
            {DELIVERY_STATUSES.map((item) => (
              <option key={item.value} value={item.value}>{item.label[language]}</option>
            ))}
          </Select>
          <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="afus-input h-9" />
          <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="afus-input h-9" />
          <span className="ms-auto text-[11px] text-slate-400">{list.data?.length ?? 0}</span>
        </div>
      </Card>

      <Card>
        {list.error ? (
          <ErrorBox code={list.error} onRetry={() => void list.reload()} />
        ) : (
          <DataTable
            columns={columns}
            rows={list.data ?? []}
            keyField={(row) => row.id}
            loading={list.loading}
            empty={<EmptyState icon={Truck} title={t('delivery.empty')} hint={t('delivery.subtitle')} />}
          />
        )}
      </Card>

      {courierTarget ? (
        <Modal
          open
          title={t('delivery.assign')}
          subtitle={courierTarget.orderNumber}
          onClose={() => setCourierTarget(null)}
          size="sm"
        >
          <CourierForm
            delivery={courierTarget}
            onSaved={async () => {
              setCourierTarget(null)
              await list.reload()
            }}
            onError={(code) => setError(code)}
          />
        </Modal>
      ) : null}

      <p className="mt-3 text-[11px] text-slate-400">
        {t('common.method')}: {paymentMethodLabel(language, 'cash')} · {t('delivery.subtitle')}
      </p>
    </div>
  )
}

function CourierForm({
  delivery,
  onSaved,
  onError
}: {
  delivery: DeliveryRecord
  onSaved: () => Promise<void>
  onError: (code: string) => void
}) {
  const { t, language } = useT()
  const [courier, setCourier] = useState(delivery.courier ?? '')
  const [area, setArea] = useState(delivery.area ?? '')
  const [note, setNote] = useState(delivery.note ?? '')
  const [busy, setBusy] = useState(false)

  return (
    <div className="space-y-3">
      <Field label={t('delivery.courier')}>
        <Input value={courier} onChange={(event) => setCourier(event.target.value)} autoFocus />
      </Field>
      <Field label={t('delivery.area')}>
        <Input value={area} onChange={(event) => setArea(event.target.value)} />
      </Field>
      <Field label={t('common.notes')}>
        <Input value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await api.delivery.save({ id: delivery.id, courier: courier.trim() || null, area: area.trim() || null, note: note.trim() || null })
              await onSaved()
            } catch (caught) {
              onError(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'))
            } finally {
              setBusy(false)
            }
          }}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
