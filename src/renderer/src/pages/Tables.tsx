import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Pencil, Plus, Settings, Trash2, Users, UtensilsCrossed } from 'lucide-react'
import type { DiningArea, RestaurantTable, TableStatus } from '@shared/types'
import { api } from '../lib/api'
import { useApi, useAppEvent } from '../lib/hooks'
import { useT } from '../i18n'
import { useAppStore } from '../store/app'
import { formatDate, formatTime } from '../lib/format'
import { tableStatusLabel, tableStatusTone } from '../lib/labels'
import {
  Badge,
  Button,
  Card,
  Confirm,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Select
} from '../components/ui'

const STATUS_STYLES: Record<
  TableStatus,
  { card: string; dot: string; ping: boolean; live: boolean }
> = {
  free: {
    card: 'border-slate-200 bg-white hover:border-brand-500 hover:shadow-glow dark:border-slate-800 dark:bg-slate-900',
    dot: 'bg-slate-400',
    ping: false,
    live: false
  },
  occupied: {
    card: 'border-amber-300 bg-amber-50/70 hover:border-amber-400 dark:border-amber-500/40 dark:bg-amber-500/[0.08] dark:hover:border-amber-400/70',
    dot: 'bg-amber-500',
    ping: true,
    live: true
  },
  reserved: {
    card: 'border-brand-300 bg-brand-50/60 hover:border-brand-400 dark:border-brand-500/40 dark:bg-brand-500/[0.08] dark:hover:border-brand-400/70',
    dot: 'bg-brand-500',
    ping: true,
    live: false
  },
  cleaning: {
    card: 'border-purple-300 bg-purple-50/60 hover:border-purple-400 dark:border-purple-500/40 dark:bg-purple-500/[0.08]',
    dot: 'bg-purple-500',
    ping: false,
    live: false
  }
}

export default function TablesPage() {
  const { t, language } = useT()
  const navigate = useNavigate()
  const can = useAppStore((state) => state.can)
  const map = useApi(() => api.tables.map(), [])
  useAppEvent((event) => {
    if (event.type.startsWith('order') || event.type.startsWith('table')) void map.reload()
  })

  const [areaFilter, setAreaFilter] = useState<number | 'all'>('all')
  const [error, setError] = useState<string | null>(null)
  const [tableModal, setTableModal] = useState<{ open: boolean; table: RestaurantTable | null }>({ open: false, table: null })
  const [areaModal, setAreaModal] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<RestaurantTable | null>(null)

  const areas = map.data?.areas ?? []
  const tables = useMemo(
    () => (map.data?.tables ?? []).filter((table) => areaFilter === 'all' || table.areaId === areaFilter),
    [map.data, areaFilter]
  )
  const grouped = useMemo(() => {
    return areas
      .map((area) => ({ area, tables: tables.filter((table) => table.areaId === area.id) }))
      .filter((group) => group.tables.length > 0)
  }, [areas, tables])

  const manage = can('tables.manage')
  const pos = can('pos.use')

  const openTable = (table: RestaurantTable) => {
    if (table.openOrderId) {
      navigate(pos ? `/pos?order=${table.openOrderId}` : `/orders/${table.openOrderId}`)
      return
    }
    if (pos && manage) navigate(`/pos?table=${table.id}`)
  }

  const setStatus = async (table: RestaurantTable, status: TableStatus) => {
    setError(null)
    try {
      await api.tables.setStatus(table.id, status)
      await map.reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
    }
  }

  return (
    <div>
      <PageHeader
        title={t('tables.title')}
        subtitle={t('tables.subtitle')}
        actions={
          manage ? (
            <>
              <Button variant="secondary" icon={Settings} onClick={() => setAreaModal(true)}>
                {t('tables.addArea')}
              </Button>
              <Button icon={Plus} onClick={() => setTableModal({ open: true, table: null })}>
                {t('tables.addTable')}
              </Button>
            </>
          ) : null
        }
      />

      {error ? <div className="mb-4"><ErrorBox code={error} /></div> : null}
      {map.error ? <div className="mb-4"><ErrorBox code={map.error} onRetry={() => void map.reload()} /></div> : null}

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setAreaFilter('all')}
          className={
            areaFilter === 'all'
              ? 'rounded-full bg-brand-800 px-3 py-1 text-xs font-semibold text-white'
              : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900'
          }
        >
          {t('common.all')}
        </button>
        {areas.map((area) => (
          <button
            key={area.id}
            onClick={() => setAreaFilter(area.id)}
            className={
              areaFilter === area.id
                ? 'rounded-full bg-brand-800 px-3 py-1 text-xs font-semibold text-white'
                : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900'
            }
          >
            <span className="me-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: area.color }} />
            {language === 'ar' ? area.nameAr : area.nameFr}
          </button>
        ))}
        <div className="ms-auto flex items-center gap-3 text-[11px] text-slate-400">
          {(['free', 'occupied', 'reserved', 'cleaning'] as TableStatus[]).map((status) => (
            <span key={status} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${STATUS_STYLES[status].dot}`} />
              {tableStatusLabel(language, status)}
            </span>
          ))}
        </div>
      </div>

      {map.loading && !map.data ? (
        <Loading />
      ) : grouped.length === 0 ? (
        <Card>
          <EmptyState
            icon={UtensilsCrossed}
            title={language === 'ar' ? 'لا توجد طاولات بعد' : 'Aucune table pour le moment'}
            hint={language === 'ar' ? 'أضف منطقة ثم طاولات لبدء استقبال الطلبات.' : 'Ajoutez une zone puis des tables pour démarrer.'}
            action={
              manage ? (
                <Button icon={Plus} onClick={() => setAreaModal(true)}>
                  {t('tables.addArea')}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ area, tables: areaTables }) => (
            <section key={area.id}>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: area.color }} />
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {language === 'ar' ? area.nameAr : area.nameFr}
                </h2>
                <span className="text-[11px] text-slate-400">{areaTables.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                {areaTables.map((table, index) => {
                  const style = STATUS_STYLES[table.status as TableStatus]
                  return (
                  <div
                    key={table.id}
                    style={{ animationDelay: `${Math.min(index * 45, 400)}ms` }}
                    className={`group relative animate-table-pop rounded-xl border p-3 transition-all duration-200 will-change-transform hover:-translate-y-0.5 ${style.card} ${table.openOrderId || (pos && manage) ? 'cursor-pointer' : ''}`}
                    onClick={() => openTable(table)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        <span className="relative mt-1.5 flex h-2 w-2 shrink-0">
                          {style.ping ? (
                            <span className={`absolute inline-flex h-full w-full animate-status-ping rounded-full ${style.dot}`} />
                          ) : null}
                          <span className={`relative inline-flex h-2 w-2 rounded-full ${style.dot}`} />
                        </span>
                        <div>
                          <p className="text-base font-bold text-slate-800 dark:text-slate-100">{table.name}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                            <Users className="h-3 w-3" />
                            {table.seats} {t('tables.seats')}
                          </p>
                        </div>
                      </div>
                      <Badge tone={tableStatusTone(table.status)}>{tableStatusLabel(language, table.status)}</Badge>
                    </div>

                    {table.openOrderId ? (
                      <div className="mt-3 rounded-lg bg-white/70 px-2 py-1.5 text-[11px] dark:bg-slate-950/40">
                        <p className="font-semibold text-slate-700 dark:text-slate-200">{table.openOrderNumber}</p>
                        <p className="text-slate-500">{table.openOrderTotalCents / 100} · {table.waiterName ?? '—'}</p>
                      </div>
                    ) : (
                      <p className="mt-3 text-[11px] text-slate-400">
                        {table.status === 'cleaning' ? t('tables.markCleaning') : table.status === 'reserved' ? t('tables.reserved') : t('tables.free')}
                      </p>
                    )}

                    <div className="mt-2 flex items-center gap-1">
                      {table.openOrderId ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-700 dark:text-brand-300">
                          {t('tables.openOnIt')}
                          <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                        </span>
                      ) : pos && manage ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                          <Plus className="h-3 w-3" />
                          {t('tables.openOrder')}
                        </span>
                      ) : null}
                    </div>

                    {manage ? (
                      <div className="absolute -top-2 end-1 hidden items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm group-hover:flex dark:border-slate-700 dark:bg-slate-800">
                        <button
                          className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                          onClick={(event) => {
                            event.stopPropagation()
                            setTableModal({ open: true, table })
                          }}
                          title={t('common.edit')}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        {!table.openOrderId && table.status !== 'free' ? (
                          <button
                            className="rounded p-1 text-brand-600 hover:bg-brand-50"
                            onClick={(event) => {
                              event.stopPropagation()
                              void setStatus(table, 'free')
                            }}
                            title={t('tables.markFree')}
                          >
                            <UtensilsCrossed className="h-3 w-3" />
                          </button>
                        ) : null}
                        {!table.openOrderId && table.status === 'occupied' ? (
                          <button
                            className="rounded p-1 text-purple-600 hover:bg-purple-50"
                            onClick={(event) => {
                              event.stopPropagation()
                              void setStatus(table, 'cleaning')
                            }}
                            title={t('tables.markCleaning')}
                          >
                            <Settings className="h-3 w-3" />
                          </button>
                        ) : null}
                        {!table.openOrderId ? (
                          <button
                            className="rounded p-1 text-red-500 hover:bg-red-50"
                            onClick={(event) => {
                              event.stopPropagation()
                              setRemoveTarget(table)
                            }}
                            title={t('common.delete')}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] text-slate-400">{formatDate(new Date())} · {formatTime(new Date())}</p>

      <TableModal
        open={tableModal.open}
        table={tableModal.table}
        areas={areas}
        onClose={() => setTableModal({ open: false, table: null })}
        onSaved={() => {
          setTableModal({ open: false, table: null })
          void map.reload()
        }}
      />
      <AreaModal
        open={areaModal}
        areas={areas}
        onClose={() => setAreaModal(false)}
        onChanged={() => void map.reload()}
      />
      <Confirm
        open={Boolean(removeTarget)}
        title={t('common.delete')}
        message={`${removeTarget?.name ?? ''} — ${t('common.confirmDelete')}`}
        confirmLabel={t('common.delete')}
        danger
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return
          try {
            await api.tables.remove(removeTarget.id)
            setRemoveTarget(null)
            await map.reload()
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
            setRemoveTarget(null)
          }
        }}
      />
    </div>
  )
}

function TableModal({
  open,
  table,
  areas,
  onClose,
  onSaved
}: {
  open: boolean
  table: RestaurantTable | null
  areas: DiningArea[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t, language } = useT()
  const [name, setName] = useState(table?.name ?? '')
  const [seats, setSeats] = useState(String(table?.seats ?? 4))
  const [areaId, setAreaId] = useState(String(table?.areaId ?? areas[0]?.id ?? ''))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Reset when target changes
  const [lastKey, setLastKey] = useState<string>('')
  const key = `${open}-${table?.id ?? 'new'}-${areas.length}`
  if (key !== lastKey) {
    setLastKey(key)
    setName(table?.name ?? '')
    setSeats(String(table?.seats ?? 4))
    setAreaId(String(table?.areaId ?? areas[0]?.id ?? ''))
    setError(null)
  }

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      await api.tables.save({
        id: table?.id,
        areaId: Number(areaId),
        name: name.trim(),
        seats: Number(seats)
      })
      onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={table ? t('common.edit') : t('tables.addTable')}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={busy} disabled={!name.trim() || !areaId}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {areas.length === 0 ? (
          <p className="text-xs text-amber-600">{language === 'ar' ? 'أنشئ منطقة أولاً.' : "Créez d'abord une zone."}</p>
        ) : null}
        <Field label={t('tables.area')} required>
          <Select value={areaId} onChange={(event) => setAreaId(event.target.value)}>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {language === 'ar' ? area.nameAr : area.nameFr}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.name')} required>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="T1 / طاولة 1" />
        </Field>
        <Field label={t('tables.seats')}>
          <Input type="number" min={1} max={50} value={seats} onChange={(event) => setSeats(event.target.value)} />
        </Field>
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
      </div>
    </Modal>
  )
}

function AreaModal({
  open,
  areas,
  onClose,
  onChanged
}: {
  open: boolean
  areas: DiningArea[]
  onClose: () => void
  onChanged: () => void
}) {
  const { t, language } = useT()
  const [nameAr, setNameAr] = useState('')
  const [nameFr, setNameFr] = useState('')
  const [color, setColor] = useState('#166534')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [remove, setRemove] = useState<DiningArea | null>(null)

  const add = async () => {
    setError(null)
    if (!nameAr.trim() || !nameFr.trim()) return
    setBusy(true)
    try {
      await api.areas.save({ nameAr: nameAr.trim(), nameFr: nameFr.trim(), color, sortOrder: areas.length })
      setNameAr('')
      setNameFr('')
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title={t('tables.addArea')} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('menu.nameAr')}>
            <Input value={nameAr} onChange={(event) => setNameAr(event.target.value)} placeholder="الصالة الداخلية" />
          </Field>
          <Field label={t('menu.nameFr')}>
            <Input value={nameFr} onChange={(event) => setNameFr(event.target.value)} placeholder="Salle intérieure" />
          </Field>
        </div>
        <Field label={t('common.value')}>
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-9 w-16 cursor-pointer rounded border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
          />
        </Field>
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
        <Button onClick={add} loading={busy} disabled={!nameAr.trim() || !nameFr.trim()} icon={Plus}>
          {t('common.add')}
        </Button>

        <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {areas.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-400">{t('common.noData')}</p>
          ) : (
            areas.map((area) => (
              <div key={area.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: area.color }} />
                  {language === 'ar' ? area.nameAr : area.nameFr}
                  <span className="text-[10px] text-slate-400">{area.tableCount ?? 0}</span>
                </span>
                <button className="rounded p-1 text-red-500 hover:bg-red-50" onClick={() => setRemove(area)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <Confirm
        open={Boolean(remove)}
        title={t('common.delete')}
        message={`${remove?.nameAr ?? ''} — ${t('common.confirmDelete')}`}
        confirmLabel={t('common.delete')}
        danger
        onClose={() => setRemove(null)}
        onConfirm={async () => {
          if (!remove) return
          try {
            await api.areas.archive(remove.id)
            setRemove(null)
            onChanged()
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
            setRemove(null)
          }
        }}
      />
    </Modal>
  )
}
