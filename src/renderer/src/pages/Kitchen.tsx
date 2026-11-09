import { useMemo, useState } from 'react'
import { ChefHat, Clock, Flame, Printer, RefreshCw, Timer, UtensilsCrossed } from 'lucide-react'
import type { KitchenTicket, OrderItem, Station } from '@shared/types'
import { STATIONS } from '@shared/constants'
import { api } from '../lib/api'
import { useApi, useAppEvent, useInterval } from '../lib/hooks'
import { useT } from '../i18n'
import { useAppStore } from '../store/app'
import { elapsedMinutes } from '../lib/format'
import { orderTypeLabel, stationLabel } from '../lib/labels'
import { kitchenTicketHtml } from '../lib/receipts'
import { Badge, Button, Card, EmptyState, ErrorBox, Loading, PageHeader, Spinner } from '../components/ui'

type ColumnKey = 'new' | 'preparing' | 'ready'

export default function KitchenPage() {
  const { t, language } = useT()
  const settings = useAppStore((state) => state.settings)
  const [station, setStation] = useState<'all' | Station>('all')
  const board = useApi(() => api.kitchen.board(station === 'all' ? undefined : station), [station])
  const [busy, setBusy] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useInterval(() => void board.reload(), 15000)
  useAppEvent((event) => {
    if (event.channel.startsWith('orders.') || event.channel.startsWith('kitchen.')) void board.reload()
  })

  const tickets = board.data?.tickets ?? []
  const columns = useMemo(() => {
    const result: Record<ColumnKey, KitchenTicket[]> = { new: [], preparing: [], ready: [] }
    for (const ticket of tickets) {
      if (ticket.items.every((item) => item.status === 'ready')) result.ready.push(ticket)
      else if (ticket.items.some((item) => item.status === 'preparing')) result.preparing.push(ticket)
      else result.new.push(ticket)
    }
    return result
  }, [tickets])

  const setItemStatus = async (item: OrderItem, status: OrderItem['status']) => {
    setBusy(item.id)
    try {
      const updated = await api.kitchen.itemStatus(item.id, status)
      board.setData(updated)
    } catch {
      setNotice(t('common.error'))
    } finally {
      setBusy(null)
    }
  }

  const printTicket = async (ticket: KitchenTicket) => {
    if (!settings) return
    try {
      const order = await api.orders.get(ticket.orderId)
      await api.print.html(kitchenTicketHtml(order, settings, language), settings.printerName || undefined, false)
    } catch {
      setNotice(t('common.error'))
    }
  }

  const markAll = async (ticket: KitchenTicket, status: OrderItem['status']) => {
    for (const item of ticket.items) {
      if (item.status !== 'ready' && item.status !== 'served') {
        try {
          const updated = await api.kitchen.itemStatus(item.id, status)
          board.setData(updated)
        } catch {
          setNotice(t('common.error'))
        }
      }
    }
  }

  const columnMeta: { key: ColumnKey; label: string; tone: string }[] = [
    { key: 'new', label: t('kitchen.newOrders'), tone: 'border-t-blue-500' },
    { key: 'preparing', label: t('kitchen.inProgress'), tone: 'border-t-amber-500' },
    { key: 'ready', label: t('kitchen.readyOrders'), tone: 'border-t-brand-600' }
  ]

  return (
    <div>
      <PageHeader
        title={t('kitchen.title')}
        subtitle={t('kitchen.subtitle')}
        actions={
          <>
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <RefreshCw className="h-3 w-3" />
              {t('kitchen.autoRefresh')}
            </span>
            <Button variant="secondary" icon={RefreshCw} onClick={() => void board.reload()} loading={board.loading}>
              {t('common.refresh')}
            </Button>
          </>
        }
      />

      {board.error ? <div className="mb-3"><ErrorBox code={board.error} onRetry={() => void board.reload()} /></div> : null}

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setStation('all')}
          className={
            station === 'all'
              ? 'rounded-full bg-brand-800 px-3 py-1 text-xs font-semibold text-white'
              : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900'
          }
        >
          {t('kitchen.allStations')}
        </button>
        {(board.data?.stations ?? STATIONS.map((item) => ({ value: item.value, pending: 0 }))).map((item) => (
          <button
            key={item.value}
            onClick={() => setStation(item.value as 'all' | Station)}
            className={
              station === item.value
                ? 'rounded-full bg-brand-800 px-3 py-1 text-xs font-semibold text-white'
                : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900'
            }
          >
            {stationLabel(language, item.value)}
            {item.pending > 0 ? <span className="ms-1.5 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{item.pending}</span> : null}
          </button>
        ))}
        <div className="ms-auto flex items-center gap-2 text-[11px] text-slate-400">
          <Badge tone="blue">{board.data?.counts.new ?? 0} {t('kitchen.newOrders')}</Badge>
          <Badge tone="amber">{board.data?.counts.preparing ?? 0} {t('kitchen.inProgress')}</Badge>
          <Badge tone="brand">{board.data?.counts.ready ?? 0} {t('kitchen.readyOrders')}</Badge>
          {board.data && board.data.counts.late > 0 ? <Badge tone="red">{board.data.counts.late} {t('kitchen.late')}</Badge> : null}
          {board.loading ? <Spinner size="sm" /> : null}
        </div>
      </div>

      {board.loading && !board.data ? (
        <Loading />
      ) : tickets.length === 0 ? (
        <Card>
          <EmptyState icon={ChefHat} title={t('kitchen.empty')} hint={t('kitchen.subtitle')} />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {columnMeta.map((column) => (
            <div key={column.key} className="space-y-3">
              <div className={`flex items-center justify-between rounded-lg border-t-4 bg-white px-3 py-2 shadow-sm dark:bg-slate-900 ${column.tone}`}>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{column.label}</span>
                <span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500 dark:bg-slate-800">{columns[column.key].length}</span>
              </div>
              {columns[column.key].length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-[11px] text-slate-300 dark:border-slate-800">
                  {t('common.noData')}
                </p>
              ) : (
                columns[column.key].map((ticket) => {
                  const minutes = Math.max(ticket.elapsedMinutes, elapsedMinutes(ticket.createdAt))
                  const late = minutes >= (settings?.kitchenAlertMinutes ?? 15)
                  return (
                    <Card key={ticket.orderId} className={`animate-scale-in overflow-hidden transition-shadow ${late ? 'ring-1 ring-red-400 shadow-glow' : ''}`}>
                      <div className={`flex items-start justify-between gap-2 px-3 py-2 ${late ? 'bg-red-50 dark:bg-red-950/30' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{ticket.orderNumber}</p>
                          <p className="text-[10px] text-slate-500">
                            {ticket.tableName ?? orderTypeLabel(language, ticket.type)}
                            {ticket.waiterName ? ` · ${ticket.waiterName}` : ''}
                          </p>
                        </div>
                        <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${late ? 'bg-red-100 text-red-700' : 'bg-white text-slate-500 dark:bg-slate-900'}`}>
                          {late ? <Flame className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {minutes}′
                        </span>
                      </div>

                      {ticket.note ? <p className="border-b border-amber-100 bg-amber-50 px-3 py-1 text-[10px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-500/10">✎ {ticket.note}</p> : null}

                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {ticket.items.map((item) => (
                          <li key={item.id} className="px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                                  <span className="num me-1 text-brand-700 dark:text-brand-300">{item.qty}×</span>
                                  {language === 'ar' ? item.productNameAr : item.productNameFr}
                                </p>
                                {item.variantNameAr || item.variantNameFr ? (
                                  <p className="text-[10px] text-slate-400">{language === 'ar' ? item.variantNameAr : item.variantNameFr}</p>
                                ) : null}
                                {item.modifiers.length > 0 ? (
                                  <p className="text-[10px] text-slate-500">
                                    + {item.modifiers.map((modifier) => (language === 'ar' ? modifier.nameAr : modifier.nameFr)).join(', ')}
                                  </p>
                                ) : null}
                                {item.note ? <p className="text-[10px] text-amber-600">✎ {item.note}</p> : null}
                                <p className="mt-0.5 flex items-center gap-1 text-[9px] text-slate-400">
                                  <UtensilsCrossed className="h-2.5 w-2.5" />
                                  {stationLabel(language, item.station)}
                                </p>
                              </div>
                              <ItemAction item={item} busy={busy === item.id} onSet={(status) => void setItemStatus(item, status)} />
                            </div>
                          </li>
                        ))}
                      </ul>

                      <div className="flex items-center justify-between gap-1 border-t border-slate-100 px-2 py-1.5 dark:border-slate-800">
                        <button className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void printTicket(ticket)}>
                          <Printer className="h-3 w-3" /> {t('common.print')}
                        </button>
                        <div className="flex items-center gap-1">
                          {ticket.items.some((item) => item.status !== 'ready') ? (
                            <Button size="sm" variant="subtle" onClick={() => void markAll(ticket, 'ready')}>
                              {t('kitchen.ready')}
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => void markAll(ticket, 'served')}>
                              {t('kitchen.serve')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })
              )}
            </div>
          ))}
        </div>
      )}

      {notice ? (
        <div className="fixed bottom-5 start-1/2 z-50 -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          {notice}
        </div>
      ) : null}
    </div>
  )
}

function ItemAction({
  item,
  busy,
  onSet
}: {
  item: OrderItem
  busy: boolean
  onSet: (status: OrderItem['status']) => void
}) {
  const { t } = useT()
  if (item.status === 'pending') {
    return (
      <Button size="sm" variant="secondary" loading={busy} onClick={() => onSet('preparing')} icon={Timer}>
        {t('kitchen.start')}
      </Button>
    )
  }
  if (item.status === 'preparing') {
    return (
      <Button size="sm" loading={busy} onClick={() => onSet('ready')}>
        {t('kitchen.ready')}
      </Button>
    )
  }
  if (item.status === 'ready') {
    return (
      <Button size="sm" variant="subtle" loading={busy} onClick={() => onSet('served')}>
        {t('kitchen.serve')}
      </Button>
    )
  }
  return <Badge tone="neutral">{t('kitchen.serve')}</Badge>
}
