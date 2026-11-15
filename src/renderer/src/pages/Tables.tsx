import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Clock, Pencil, Plus, Settings, Sparkles, Timer, Trash2, Users, UtensilsCrossed } from 'lucide-react'
import type { DiningArea, RestaurantTable, TableStatus } from '@shared/types'
import { api } from '../lib/api'
import { useApi, useAppEvent, useInterval } from '../lib/hooks'
import { useT } from '../i18n'
import { useAppStore } from '../store/app'
import { formatMoney } from '../lib/format'
import { tableStatusLabel } from '../lib/labels'
import {
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
  Select,
  Tabs
} from '../components/ui'

/* A party is "settled" after about an hour and a half; past that the ring is full
   and the table asks for attention, which is the one thing motion is used for here. */
const SITTING_FULL_MINUTES = 90

const STATUS_STYLES: Record<TableStatus, { card: string; dot: string; ring: string; chip: string }> = {
  free: {
    card: 'border-ink-200 bg-white hover:border-brand-500/70 dark:border-ink-800 dark:bg-ink-900',
    dot: 'bg-ink-400',
    ring: 'text-ink-300 dark:text-ink-700',
    chip: 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'
  },
  occupied: {
    card: 'border-amber-300 bg-amber-50/70 hover:border-amber-400 dark:border-amber-500/40 dark:bg-amber-500/[0.08]',
    dot: 'bg-amber-500',
    ring: 'text-amber-500',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
  },
  reserved: {
    card: 'border-brand-300 bg-brand-50/60 hover:border-brand-400 dark:border-brand-500/40 dark:bg-brand-500/[0.08]',
    dot: 'bg-brand-500',
    ring: 'text-brand-500',
    chip: 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
  },
  cleaning: {
    card: 'border-purple-300 bg-purple-50/60 hover:border-purple-400 dark:border-purple-500/40 dark:bg-purple-500/[0.08]',
    dot: 'bg-purple-500',
    ring: 'text-purple-500',
    chip: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'
  }
}

function sittingMinutes(openedAt: string | null | undefined): number {
  if (!openedAt) return 0
  const then = new Date(openedAt.replace(' ', 'T')).getTime()
  if (Number.isNaN(then)) return 0
  return Math.max(0, Math.floor((Date.now() - then) / 60000))
}

function durationText(minutes: number): string {
  if (minutes < 60) return `${minutes}′`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

const RING_RADIUS = 21
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

/**
 * The table's number inside a ring that fills with the time the party has been
 * seated. It is the only moving part of a card, and it moves because it means
 * something: a full, pulsing ring is a table that has waited too long.
 */
function TableDial({
  name,
  status,
  minutes,
  seated
}: {
  name: string
  status: TableStatus
  minutes: number
  seated: boolean
}) {
  const style = STATUS_STYLES[status]
  const progress = seated ? Math.min(1, minutes / SITTING_FULL_MINUTES) : 0
  const overdue = seated && minutes >= SITTING_FULL_MINUTES
  return (
    <span className={clsx('relative flex h-12 w-12 flex-none items-center justify-center', overdue && 'animate-attention')}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={RING_RADIUS} fill="none" strokeWidth="3" className="stroke-ink-200 dark:stroke-ink-800" />
        {seated ? (
          <circle
            cx="24"
            cy="24"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            stroke="currentColor"
            /* The arc grows by redrawing its dash, so nothing in the card reflows. */
            style={{
              strokeDasharray: RING_LENGTH,
              strokeDashoffset: RING_LENGTH * (1 - progress),
              transition: 'stroke-dashoffset 600ms ease-out'
            }}
            className={overdue ? 'text-red-500' : style.ring}
          />
        ) : null}
      </svg>
      <span className="num text-base font-extrabold text-ink-800 dark:text-ink-100" dir="ltr">
        {name}
      </span>
    </span>
  )
}

export default function TablesPage() {
  const { t, language } = useT()
  const navigate = useNavigate()
  const can = useAppStore((state) => state.can)
  const map = useApi(() => api.tables.map(), [])
  const [tick, setTick] = useState(0)
  /* Keeps the sitting timers and the rings moving without re-fetching. */
  useInterval(() => setTick((value) => value + 1), 30000)
  useAppEvent((event) => {
    if (event.type.startsWith('order') || event.type.startsWith('table')) void map.reload()
  })

  const [areaFilter, setAreaFilter] = useState<number | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<TableStatus | 'all'>('all')
  const [error, setError] = useState<string | null>(null)
  const [tableModal, setTableModal] = useState<{ open: boolean; table: RestaurantTable | null }>({ open: false, table: null })
  const [areaModal, setAreaModal] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<RestaurantTable | null>(null)

  const areas = map.data?.areas ?? []
  const allTables = map.data?.tables ?? []
  const tables = useMemo(
    () =>
      allTables.filter(
        (table) =>
          (areaFilter === 'all' || table.areaId === areaFilter) &&
          (statusFilter === 'all' || table.status === statusFilter)
      ),
    [allTables, areaFilter, statusFilter]
  )
  const grouped = useMemo(
    () =>
      areas
        .map((area) => ({ area, tables: tables.filter((table) => table.areaId === area.id) }))
        .filter((group) => group.tables.length > 0),
    [areas, tables]
  )

  /* What the floor looks like right now, read once for the strip at the top. */
  const floor = useMemo(() => {
    const counts: Record<TableStatus, number> = { free: 0, occupied: 0, reserved: 0, cleaning: 0 }
    let seatedCovers = 0
    let sittingTotal = 0
    let sittingCount = 0
    for (const table of allTables) {
      const status = table.status as TableStatus
      if (status in counts) counts[status] += 1
      if (table.openOrderId) {
        seatedCovers += table.openOrderCovers ?? table.seats
        const minutes = sittingMinutes(table.openOrderOpenedAt)
        if (minutes > 0) {
          sittingTotal += minutes
          sittingCount += 1
        }
      }
    }
    return { counts, seatedCovers, averageSitting: sittingCount ? Math.round(sittingTotal / sittingCount) : 0 }
  }, [allTables, tick])

  const currency = useAppStore((state) => state.settings?.currency) ?? 'DZD'
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
      >
        {areas.length > 1 ? (
          <Tabs<string>
            value={String(areaFilter)}
            onChange={(value) => setAreaFilter(value === 'all' ? 'all' : Number(value))}
            items={[
              { value: 'all', label: t('common.all'), count: allTables.length },
              ...areas.map((area) => ({
                value: String(area.id),
                label: language === 'ar' ? area.nameAr : area.nameFr,
                count: allTables.filter((table) => table.areaId === area.id).length
              }))
            ]}
          />
        ) : null}
      </PageHeader>

      {error ? <div className="mb-3"><ErrorBox code={error} /></div> : null}
      {map.error ? <div className="mb-3"><ErrorBox code={map.error} onRetry={() => void map.reload()} /></div> : null}

      {/* The floor at a glance. Each state is also the filter for it, so the
          legend and the filter are the same control instead of two. */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {(['free', 'occupied', 'reserved', 'cleaning'] as TableStatus[]).map((status) => {
          const active = statusFilter === status
          const style = STATUS_STYLES[status]
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() => setStatusFilter(active ? 'all' : status)}
              className={clsx(
                'flex items-center gap-2.5 rounded-xl border px-3 py-2 text-start transition-all duration-200 active:scale-[0.97]',
                active
                  ? 'border-brand-500 bg-brand-50 dark:border-brand-500/60 dark:bg-brand-500/10'
                  : 'border-ink-200 bg-white hover:border-ink-300 dark:border-ink-800 dark:bg-ink-900 dark:hover:border-ink-700'
              )}
            >
              <span className={clsx('h-2.5 w-2.5 flex-none rounded-full', style.dot)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] text-ink-500">{tableStatusLabel(language, status)}</span>
                <span className="num block text-lg font-bold leading-tight text-ink-800 dark:text-ink-100">
                  {floor.counts[status]}
                </span>
              </span>
            </button>
          )
        })}
        <div className="flex items-center gap-2.5 rounded-xl border border-ink-200 bg-white px-3 py-2 dark:border-ink-800 dark:bg-ink-900">
          <Users className="h-4 w-4 flex-none text-ink-400" />
          <span className="min-w-0">
            <span className="block truncate text-[11px] text-ink-500">{t('tables.seated')}</span>
            <span className="num block text-lg font-bold leading-tight text-ink-800 dark:text-ink-100">{floor.seatedCovers}</span>
          </span>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-ink-200 bg-white px-3 py-2 dark:border-ink-800 dark:bg-ink-900">
          <Timer className="h-4 w-4 flex-none text-ink-400" />
          <span className="min-w-0">
            <span className="block truncate text-[11px] text-ink-500">{t('tables.avgSitting')}</span>
            <span className="num block text-lg font-bold leading-tight text-ink-800 dark:text-ink-100" dir="ltr">
              {floor.averageSitting ? durationText(floor.averageSitting) : '—'}
            </span>
          </span>
        </div>
      </div>

      {map.loading && !map.data ? (
        <Loading />
      ) : allTables.length === 0 ? (
        <Card>
          <EmptyState
            icon={UtensilsCrossed}
            title={t('tables.empty')}
            hint={t('tables.emptyHint')}
            action={
              manage ? (
                <Button icon={Plus} onClick={() => setAreaModal(true)}>
                  {t('tables.addArea')}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : grouped.length === 0 ? (
        <Card>
          <EmptyState icon={Sparkles} title={t('tables.noneWithStatus')} />
        </Card>
      ) : (
        /* Keyed on the filter so the cards re-enter in sequence when it changes:
           the new selection reads as a fresh set, not a silent swap. */
        <div key={`${areaFilter}-${statusFilter}`} className="space-y-5">
          {grouped.map(({ area, tables: areaTables }) => (
            <section key={area.id}>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: area.color }} />
                <h2 className="text-sm font-bold text-ink-800 dark:text-ink-100">
                  {language === 'ar' ? area.nameAr : area.nameFr}
                </h2>
                <span className="num text-[11px] text-ink-400">{areaTables.length}</span>
              </div>
              <div className="fit-grid grid gap-3">
                {areaTables.map((table, index) => {
                  const status = table.status as TableStatus
                  const style = STATUS_STYLES[status]
                  const seated = Boolean(table.openOrderId)
                  const minutes = seated ? sittingMinutes(table.openOrderOpenedAt) : 0
                  const overdue = seated && minutes >= SITTING_FULL_MINUTES
                  const clickable = seated || (pos && manage)
                  return (
                    <div
                      key={table.id}
                      /* 35 ms apart: the room fills in rather than snapping into place. */
                      style={{ animationDelay: `${Math.min(index * 35, 350)}ms` }}
                      className={clsx(
                        'group relative animate-seat-in rounded-xl border p-3 transition-[border-color,background-color,transform,box-shadow] duration-200',
                        style.card,
                        clickable && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.98]'
                      )}
                      onClick={() => openTable(table)}
                      title={overdue ? t('tables.longSittingHint') : undefined}
                    >
                      <div className="flex items-start gap-3">
                        <TableDial name={table.name} status={status} minutes={minutes} seated={seated} />
                        <div className="min-w-0 flex-1">
                          <span className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold', style.chip)}>
                            {tableStatusLabel(language, status)}
                          </span>
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-400">
                            <Users className="h-3 w-3" />
                            {seated ? (table.openOrderCovers ?? table.seats) : table.seats} / {table.seats}
                          </p>
                        </div>
                      </div>

                      {seated ? (
                        <div className="mt-2.5 rounded-lg bg-white/70 px-2 py-1.5 text-[11px] dark:bg-ink-950/40">
                          <div className="flex items-center justify-between font-semibold text-ink-700 dark:text-ink-200">
                            <span className="num" dir="ltr">{table.openOrderNumber}</span>
                            <span className="num" dir="ltr">{formatMoney(table.openOrderTotalCents, currency, 0)}</span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-ink-500">
                            <span className={clsx('inline-flex items-center gap-0.5 font-semibold', overdue && 'text-red-600 dark:text-red-400')}>
                              <Clock className="h-3 w-3" />
                              <span className="num" dir="ltr">{durationText(minutes)}</span>
                            </span>
                            {overdue ? <span className="text-[10px] font-bold text-red-600 dark:text-red-400">{t('tables.longSitting')}</span> : null}
                            <span className="ms-auto truncate">{table.waiterName ?? '—'}</span>
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-2 flex items-center gap-1">
                        {seated ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-700 transition-transform duration-200 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 dark:text-brand-300">
                            {t('tables.openOnIt')}
                            <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                          </span>
                        ) : pos && manage ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-500">
                            <Plus className="h-3 w-3" />
                            {t('tables.openOrder')}
                          </span>
                        ) : null}
                      </div>

                      {manage ? (
                        <div className="absolute -top-2 end-1 hidden items-center gap-1 rounded-lg border border-ink-200 bg-white p-0.5 shadow-sm group-hover:flex dark:border-ink-700 dark:bg-ink-800">
                          <button
                            className="rounded p-1 text-ink-500 transition-colors hover:bg-ink-100 dark:hover:bg-ink-700"
                            onClick={(event) => {
                              event.stopPropagation()
                              setTableModal({ open: true, table })
                            }}
                            title={t('common.edit')}
                            aria-label={t('common.edit')}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          {!seated && status !== 'free' ? (
                            <button
                              className="rounded p-1 text-brand-600 transition-colors hover:bg-brand-50 dark:hover:bg-brand-500/15"
                              onClick={(event) => {
                                event.stopPropagation()
                                void setStatus(table, 'free')
                              }}
                              title={t('tables.markFree')}
                              aria-label={t('tables.markFree')}
                            >
                              <UtensilsCrossed className="h-3 w-3" />
                            </button>
                          ) : null}
                          {!seated && status === 'occupied' ? (
                            <button
                              className="rounded p-1 text-purple-600 transition-colors hover:bg-purple-50 dark:hover:bg-purple-500/15"
                              onClick={(event) => {
                                event.stopPropagation()
                                void setStatus(table, 'cleaning')
                              }}
                              title={t('tables.markCleaning')}
                              aria-label={t('tables.markCleaning')}
                            >
                              <Settings className="h-3 w-3" />
                            </button>
                          ) : null}
                          {!seated ? (
                            <button
                              className="rounded p-1 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/15"
                              onClick={(event) => {
                                event.stopPropagation()
                                setRemoveTarget(table)
                              }}
                              title={t('common.delete')}
                              aria-label={t('common.delete')}
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
