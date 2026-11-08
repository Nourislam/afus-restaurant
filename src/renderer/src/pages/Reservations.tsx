import { useMemo, useState } from 'react'
import { CalendarClock, ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react'
import type { Reservation, ReservationStatus } from '@shared/types'
import { RESERVATION_STATUSES } from '@shared/constants'
import { api } from '../lib/api'
import { useApi } from '../lib/hooks'
import { errorText, useT } from '../i18n'
import { addDays, formatDate, formatDayName, todayString } from '../lib/format'
import { reservationStatusLabel, reservationStatusTone } from '../lib/labels'
import { useAppStore } from '../store/app'
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
  Select,
  Textarea
} from '../components/ui'

const ACTIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['arrived', 'noShow', 'cancelled'],
  arrived: ['cancelled'],
  noShow: [],
  cancelled: []
}

export default function ReservationsPage() {
  const { t, language } = useT()
  const can = useAppStore((state) => state.can)
  const manage = can('reservations.manage')
  const [date, setDate] = useState(todayString())
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [formTarget, setFormTarget] = useState<Reservation | 'new' | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)

  const list = useApi(() => api.reservations.list({ from: date, to: date, status: statusFilter || undefined }), [date, statusFilter])
  const tables = useApi(() => api.tables.list(), [])

  const week = useMemo(() => {
    const days: string[] = []
    let cursor = date
    for (let i = 0; i < 7; i += 1) {
      days.push(cursor)
      cursor = addDays(cursor, 1)
    }
    return days
  }, [date])

  const weekReservations = useApi(() => api.reservations.list({ from: week[0], to: week[6] }), [week[0], week[6]])

  const countFor = (day: string) => (weekReservations.data ?? []).filter((row) => row.date === day && row.status !== 'cancelled').length

  const active = (list.data ?? []).filter((row) => row.status !== 'cancelled')

  return (
    <div>
      <PageHeader
        title={t('reservations.title')}
        subtitle={t('reservations.subtitle')}
        actions={manage ? <Button icon={Plus} onClick={() => setFormTarget('new')}>{t('reservations.add')}</Button> : null}
      />

      {error ? <div className="mb-3"><ErrorBox code={error} /></div> : null}

      <Card className="mb-4 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setDate(addDays(date, -1))}>
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </button>
            <button className="rounded px-2 text-xs font-semibold text-brand-700 hover:underline" onClick={() => setDate(todayString())}>
              {t('common.today')}
            </button>
            <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setDate(addDays(date, 1))}>
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </button>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="afus-input ms-2 h-8 w-36" />
          </div>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-8 w-36">
            <option value="">{t('common.all')}</option>
            {RESERVATION_STATUSES.map((item) => (
              <option key={item.value} value={item.value}>{item.label[language]}</option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {week.map((day) => (
            <button
              key={day}
              onClick={() => setDate(day)}
              className={`rounded-lg border px-1 py-1.5 text-center transition ${
                day === date
                  ? 'border-brand-700 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/30'
                  : 'border-slate-200 hover:border-brand-300 dark:border-slate-700'
              }`}
            >
              <span className="block text-[10px] text-slate-400">{formatDayName(day, language)}</span>
              <span className="num block text-xs font-bold text-slate-700 dark:text-slate-200">{day.slice(8)}</span>
              {countFor(day) > 0 ? (
                <span className="mx-auto mt-0.5 block w-fit rounded-full bg-brand-700 px-1.5 text-[9px] font-bold text-white">{countFor(day)}</span>
              ) : (
                <span className="mt-0.5 block text-[9px] text-transparent">0</span>
              )}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
          <h2 className="text-xs font-bold text-slate-700 dark:text-slate-200">{t('reservations.today')} · {formatDate(date)}</h2>
          <Badge tone="brand">{active.length}</Badge>
        </div>
        {list.loading && !list.data ? (
          <Loading />
        ) : active.length === 0 ? (
          <EmptyState icon={CalendarClock} title={t('reservations.empty')} hint={t('reservations.subtitle')} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {active
              .slice()
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="w-14 text-center">
                    <p className="num text-sm font-bold text-brand-800 dark:text-brand-300">{row.time}</p>
                    <p className="text-[10px] text-slate-400">{row.partySize} {t('reservations.party')}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{row.customerName}</p>
                    <p className="text-[10px] text-slate-400">
                      {row.phone} · {row.tableName ?? t('reservations.noTable')}
                      {row.note ? ` · ${row.note}` : ''}
                    </p>
                  </div>
                  <Badge tone={reservationStatusTone(row.status)}>{reservationStatusLabel(language, row.status)}</Badge>
                  {manage ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {ACTIONS[row.status as ReservationStatus].filter((status) => status !== 'cancelled').map((status) => (
                        <Button
                          key={status}
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            try {
                              await api.reservations.setStatus(row.id, status)
                              await Promise.all([list.reload(), weekReservations.reload()])
                            } catch (caught) {
                              setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
                            }
                          }}
                        >
                          {reservationStatusLabel(language, status)}
                        </Button>
                      ))}
                      {ACTIONS[row.status as ReservationStatus].includes('cancelled') ? (
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setCancelTarget(row)}>
                          {t('common.cancel')}
                        </Button>
                      ) : null}
                      <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setFormTarget(row)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </Card>

      {formTarget ? (
        <ReservationModal
          reservation={formTarget === 'new' ? null : formTarget}
          defaultDate={date}
          tables={tables.data ?? []}
          onClose={() => setFormTarget(null)}
          onSaved={async () => {
            setFormTarget(null)
            await Promise.all([list.reload(), weekReservations.reload()])
          }}
        />
      ) : null}

      <Confirm
        open={Boolean(cancelTarget)}
        title={t('common.cancel')}
        message={`${cancelTarget?.customerName ?? ''} — ${t('common.confirm')}`}
        confirmLabel={t('common.cancel')}
        danger
        onClose={() => setCancelTarget(null)}
        onConfirm={async () => {
          if (!cancelTarget) return
          try {
            await api.reservations.setStatus(cancelTarget.id, 'cancelled')
            setCancelTarget(null)
            await Promise.all([list.reload(), weekReservations.reload()])
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
            setCancelTarget(null)
          }
        }}
      />
    </div>
  )
}

function ReservationModal({
  reservation,
  defaultDate,
  tables,
  onClose,
  onSaved
}: {
  reservation: Reservation | null
  defaultDate: string
  tables: { id: number; name: string; seats: number; status: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t, language } = useT()
  const [customerName, setCustomerName] = useState(reservation?.customerName ?? '')
  const [phone, setPhone] = useState(reservation?.phone ?? '')
  const [date, setDate] = useState(reservation?.date ?? defaultDate)
  const [time, setTime] = useState(reservation?.time ?? '20:00')
  const [partySize, setPartySize] = useState(String(reservation?.partySize ?? 2))
  const [tableId, setTableId] = useState(reservation?.tableId ? String(reservation.tableId) : '')
  const [note, setNote] = useState(reservation?.note ?? '')
  const [status, setStatus] = useState<ReservationStatus>((reservation?.status as ReservationStatus) ?? 'pending')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      open
      title={reservation ? t('common.edit') : t('reservations.add')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={busy}
            disabled={!customerName.trim() || !phone.trim() || Number(partySize) <= 0}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await api.reservations.save({
                  id: reservation?.id,
                  customerName: customerName.trim(),
                  phone: phone.trim(),
                  date,
                  time,
                  partySize: Number(partySize),
                  tableId: tableId ? Number(tableId) : null,
                  note: note.trim() || null,
                  status
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('common.name')} required>
            <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} autoFocus />
          </Field>
          <Field label={t('common.phone')} required>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <Field label={t('common.date')}>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label={t('common.time')}>
            <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </Field>
          <Field label={t('reservations.party')}>
            <Input type="number" min={1} max={100} value={partySize} onChange={(event) => setPartySize(event.target.value)} />
          </Field>
          <Field label={t('pos.table')}>
            <Select value={tableId} onChange={(event) => setTableId(event.target.value)}>
              <option value="">{t('reservations.noTable')}</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>{table.name} · {table.seats}</option>
              ))}
            </Select>
          </Field>
          {reservation ? (
            <Field label={t('common.status')}>
              <Select value={status} onChange={(event) => setStatus(event.target.value as ReservationStatus)}>
                {RESERVATION_STATUSES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label[language]}</option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
        <Field label={t('common.notes')}>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-[52px]" />
        </Field>
        {error ? <p className="text-xs font-medium text-red-600">{errorText(language, error)}</p> : null}
      </div>
    </Modal>
  )
}
