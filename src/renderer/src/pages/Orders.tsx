import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Receipt } from 'lucide-react'
import { ORDER_STATUSES, ORDER_TYPES } from '@shared/constants'
import { api } from '../lib/api'
import { useApi, useDebounced } from '../lib/hooks'
import { useT } from '../i18n'
import { addDays, formatDateTime, todayString } from '../lib/format'
import { orderStatusLabel, orderStatusTone, orderTypeLabel } from '../lib/labels'
import { Badge, Card, DataTable, EmptyState, ErrorBox, Money, PageHeader, SearchInput, Select, type Column } from '../components/ui'
import type { OrderSummary } from '@shared/types'

export default function OrdersPage() {
  const { t, language } = useT()
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [from, setFrom] = useState(addDays(todayString(), -7))
  const [to, setTo] = useState(todayString())
  const [search, setSearch] = useState('')
  const term = useDebounced(search)

  const list = useApi(
    () =>
      api.orders.list({
        status: status || undefined,
        type: type || undefined,
        from,
        to,
        search: term || undefined,
        limit: 300
      }),
    [status, type, from, to, term]
  )

  const columns: Column<OrderSummary>[] = [
    {
      key: 'number',
      header: t('orders.number'),
      render: (row) => (
        <div>
          <Link to={`/orders/${row.id}`} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
            {row.orderNumber}
          </Link>
          <p className="text-[10px] text-slate-400">{formatDateTime(row.createdAt)}</p>
        </div>
      )
    },
    {
      key: 'type',
      header: t('common.type'),
      render: (row) => (
        <div>
          <p className="text-xs text-slate-600 dark:text-slate-300">{orderTypeLabel(language, row.type)}</p>
          <p className="text-[10px] text-slate-400">{row.tableName ?? row.customerName ?? '—'}</p>
        </div>
      )
    },
    { key: 'items', header: t('orders.items'), align: 'center', render: (row) => <span className="num text-xs">{row.itemCount}</span> },
    {
      key: 'waiter',
      header: t('tables.waiter'),
      render: (row) => <span className="text-xs text-slate-500">{row.waiterName ?? '—'}</span>
    },
    { key: 'total', header: t('common.total'), align: 'end', render: (row) => <Money cents={row.totalCents} className="text-xs font-semibold" /> },
    {
      key: 'due',
      header: t('common.due'),
      align: 'end',
      render: (row) => <Money cents={row.dueCents} className={`text-xs ${row.dueCents > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={orderStatusTone(row.status)}>{orderStatusLabel(language, row.status)}</Badge>
          {row.isHeld ? <Badge tone="amber">{t('orders.held')}</Badge> : null}
        </div>
      )
    }
  ]

  return (
    <div>
      <PageHeader title={t('orders.title')} subtitle={t('orders.subtitle')} />

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-44">
            <SearchInput value={search} onChange={setSearch} />
          </div>
          <label className="text-[11px] text-slate-500">
            <span className="mb-1 block">{t('common.status')}</span>
            <Select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 w-36">
              <option value="">{t('common.all')}</option>
              {ORDER_STATUSES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label[language]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[11px] text-slate-500">
            <span className="mb-1 block">{t('common.type')}</span>
            <Select value={type} onChange={(event) => setType(event.target.value)} className="h-9 w-36">
              <option value="">{t('common.all')}</option>
              {ORDER_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label[language]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[11px] text-slate-500">
            <span className="mb-1 block">{t('common.from')}</span>
            <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="afus-input h-9" />
          </label>
          <label className="text-[11px] text-slate-500">
            <span className="mb-1 block">{t('common.to')}</span>
            <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="afus-input h-9" />
          </label>
          <div className="ms-auto flex items-center gap-2 text-[11px] text-slate-400">
            {list.data ? `${list.data.length} ${t('common.total')}` : null}
          </div>
        </div>
      </Card>

      {list.error ? <div className="mb-3"><ErrorBox code={list.error} onRetry={() => void list.reload()} /></div> : null}

      <Card>
        <DataTable
          columns={columns}
          rows={list.data ?? []}
          keyField={(row) => row.id}
          loading={list.loading}
          empty={<EmptyState icon={Receipt} title={t('orders.none')} hint={t('orders.subtitle')} />}
          onRowClick={(row) => {
            window.location.hash = `#/orders/${row.id}`
          }}
        />
      </Card>
    </div>
  )
}
