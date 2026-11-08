import { useMemo, useState } from 'react'
import { AlertTriangle, Pencil, Plus, Trash2, Warehouse } from 'lucide-react'
import type { Ingredient } from '@shared/types'
import { UNITS, type Unit } from '@shared/constants'
import { api } from '../lib/api'
import { useApi } from '../lib/hooks'
import { errorText, useT } from '../i18n'
import { centsToInput, formatDateTime, formatNumber, todayString, toCents, addDays } from '../lib/format'
import { movementTypeLabel, movementTypeTone, unitLabel, unitSymbol } from '../lib/labels'
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
  Modal,
  Money,
  PageHeader,
  Select,
  StatCard,
  Tabs,
  Textarea,
  type Column
} from '../components/ui'

type TabKey = 'stock' | 'movements'

export default function InventoryPage() {
  const { t, language } = useT()
  const can = useAppStore((state) => state.can)
  const settings = useAppStore((state) => state.settings)
  const manage = can('inventory.manage')
  const [tab, setTab] = useState<TabKey>('stock')
  const [error, setError] = useState<string | null>(null)
  const [formTarget, setFormTarget] = useState<Ingredient | 'new' | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<Ingredient | null>(null)
  const [wasteTarget, setWasteTarget] = useState<Ingredient | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Ingredient | null>(null)
  const [movementIngredient, setMovementIngredient] = useState('')
  const [from, setFrom] = useState(addDays(todayString(), -30))
  const [to, setTo] = useState(todayString())

  const ingredients = useApi(() => api.ingredients.list(true), [])
  const movements = useApi(
    () =>
      api.ingredients.movements({
        ingredientId: movementIngredient ? Number(movementIngredient) : undefined,
        from,
        to,
        limit: 500
      }),
    [movementIngredient, from, to],
    { enabled: tab === 'movements' }
  )

  const list = ingredients.data ?? []
  const stockValue = useMemo(() => list.reduce((sum, item) => sum + item.stockValueCents, 0), [list])
  const lowCount = list.filter((item) => item.isLow && !item.isArchived).length
  const currency = settings?.currency ?? 'DZD'

  const columns: Column<Ingredient>[] = [
    {
      key: 'name',
      header: t('common.name'),
      render: (row) => (
        <div>
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            {language === 'ar' ? row.nameAr : row.nameFr}
            {row.isArchived ? <span className="ms-1 text-[10px] text-slate-400">({t('menu.archive')})</span> : null}
          </p>
          <p className="text-[10px] text-slate-400">{unitLabel(language, row.unit)}</p>
        </div>
      )
    },
    {
      key: 'stock',
      header: t('common.stock'),
      align: 'end',
      render: (row) => (
        <div className="text-end">
          <p className={`num text-xs font-bold ${row.isLow ? 'text-amber-600' : 'text-slate-700 dark:text-slate-200'}`}>
            {formatNumber(row.stockQty, 2)} {unitSymbol(row.unit)}
          </p>
          <p className="num text-[10px] text-slate-400">{t('common.min')}: {formatNumber(row.minQty, 2)}</p>
        </div>
      )
    },
    { key: 'cost', header: t('inventory.unitCost'), align: 'end', render: (row) => <Money cents={row.unitCostCents} className="text-xs" /> },
    { key: 'value', header: t('inventory.stockValue'), align: 'end', render: (row) => <Money cents={row.stockValueCents} className="text-xs font-semibold" /> },
    {
      key: 'status',
      header: t('common.status'),
      align: 'center',
      render: (row) => (row.isLow ? <Badge tone="amber">{t('inventory.low')}</Badge> : <Badge tone="brand">OK</Badge>)
    },
    {
      key: 'actions',
      header: t('common.actions'),
      align: 'end',
      render: (row) =>
        !manage || row.isArchived ? null : (
          <div className="flex items-center justify-end gap-1">
            <Button size="sm" variant="secondary" onClick={() => setAdjustTarget(row)}>{t('inventory.adjust')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setWasteTarget(row)}>{t('inventory.waste')}</Button>
            <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setFormTarget(row)}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button className="rounded p-1.5 text-red-500 hover:bg-red-50" onClick={() => setRemoveTarget(row)}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )
    }
  ]

  const movementColumns: Column<{ id: number; ingredientNameAr: string; ingredientNameFr: string; type: string; qtyDelta: number; unit: Unit; balanceAfter?: number; note: string | null; userName: string | null; createdAt: string }>[] = [
    {
      key: 'date',
      header: t('common.date'),
      render: (row) => <span className="text-[11px] text-slate-500">{formatDateTime(row.createdAt)}</span>
    },
    {
      key: 'ingredient',
      header: t('common.name'),
      render: (row) => <span className="text-xs">{language === 'ar' ? row.ingredientNameAr : row.ingredientNameFr}</span>
    },
    { key: 'type', header: t('inventory.movementType'), render: (row) => <Badge tone={movementTypeTone(row.type)}>{movementTypeLabel(language, row.type)}</Badge> },
    {
      key: 'qty',
      header: t('common.quantity'),
      align: 'end',
      render: (row) => (
        <span className={`num text-xs font-bold ${row.qtyDelta < 0 ? 'text-red-600' : 'text-brand-700'}`} dir="ltr">
          {row.qtyDelta > 0 ? '+' : ''}{formatNumber(row.qtyDelta, 2)} {unitSymbol(row.unit)}
        </span>
      )
    },
    { key: 'balance', header: t('inventory.balance'), align: 'end', render: (row) => <span className="num text-xs text-slate-500">{row.balanceAfter === undefined ? '—' : `${formatNumber(row.balanceAfter, 2)}`}</span> },
    { key: 'note', header: t('common.notes'), render: (row) => <span className="text-[11px] text-slate-500">{row.note ?? '—'}{row.userName ? ` · ${row.userName}` : ''}</span> }
  ]

  return (
    <div>
      <PageHeader
        title={t('inventory.title')}
        subtitle={t('inventory.subtitle')}
        actions={
          manage ? (
            <>
              <Button variant="secondary" icon={Plus} onClick={() => setFormTarget('new')}>{t('inventory.addIngredient')}</Button>
            </>
          ) : null
        }
      />

      {error ? <div className="mb-3"><ErrorBox code={error} /></div> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label={t('inventory.stockValue')} value={<Money cents={stockValue} />} icon={Warehouse} tone="brand" loading={ingredients.loading} />
        <StatCard label={t('inventory.low')} value={lowCount} icon={AlertTriangle} tone={lowCount > 0 ? 'amber' : 'neutral'} loading={ingredients.loading} />
        <StatCard label={t('inventory.movements')} value={movements.data?.length ?? 0} icon={Warehouse} tone="neutral" loading={movements.loading} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Tabs<TabKey>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'stock', label: t('common.stock'), count: list.length },
            { value: 'movements', label: t('inventory.movements') }
          ]}
        />
        {tab === 'movements' ? (
          <div className="flex flex-wrap items-end gap-2 text-[11px] text-slate-500">
            <Select value={movementIngredient} onChange={(event) => setMovementIngredient(event.target.value)} className="h-8 w-44">
              <option value="">{t('common.all')}</option>
              {list.map((item) => (
                <option key={item.id} value={item.id}>{language === 'ar' ? item.nameAr : item.nameFr}</option>
              ))}
            </Select>
            <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="afus-input h-8" />
            <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="afus-input h-8" />
          </div>
        ) : null}
      </div>

      <Card>
        {ingredients.error ? (
          <ErrorBox code={ingredients.error} onRetry={() => void ingredients.reload()} />
        ) : tab === 'stock' ? (
          <DataTable
            columns={columns}
            rows={list}
            keyField={(row) => row.id}
            loading={ingredients.loading}
            empty={<EmptyState icon={Warehouse} title={t('common.noData')} hint={t('inventory.subtitle')} action={manage ? <Button icon={Plus} onClick={() => setFormTarget('new')}>{t('inventory.addIngredient')}</Button> : undefined} />}
          />
        ) : movements.error ? (
          <ErrorBox code={movements.error} onRetry={() => void movements.reload()} />
        ) : (
          <DataTable
            columns={movementColumns}
            rows={movements.data ?? []}
            keyField={(row) => row.id}
            loading={movements.loading}
            empty={<EmptyState title={t('common.noData')} />}
          />
        )}
      </Card>

      {formTarget ? (
        <IngredientModal
          ingredient={formTarget === 'new' ? null : formTarget}
          currency={currency}
          onClose={() => setFormTarget(null)}
          onSaved={async () => {
            setFormTarget(null)
            await ingredients.reload()
          }}
        />
      ) : null}

      {adjustTarget ? (
        <QuantityModal
          title={t('inventory.adjust')}
          ingredient={adjustTarget}
          initial={String(adjustTarget.stockQty)}
          onClose={() => setAdjustTarget(null)}
          onSubmit={async (qty, reason) => {
            await api.ingredients.adjust(adjustTarget.id, Number(qty), reason)
            setAdjustTarget(null)
            await ingredients.reload()
          }}
        />
      ) : null}

      {wasteTarget ? (
        <QuantityModal
          title={t('inventory.waste')}
          ingredient={wasteTarget}
          initial="0"
          onClose={() => setWasteTarget(null)}
          onSubmit={async (qty, reason) => {
            await api.ingredients.waste(wasteTarget.id, Number(qty), reason)
            setWasteTarget(null)
            await ingredients.reload()
          }}
        />
      ) : null}

      <Confirm
        open={Boolean(removeTarget)}
        title={t('menu.archive')}
        message={`${removeTarget?.nameAr ?? ''} — ${t('common.confirmDelete')}`}
        confirmLabel={t('menu.archive')}
        danger
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return
          try {
            await api.ingredients.remove(removeTarget.id)
            setRemoveTarget(null)
            await ingredients.reload()
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
            setRemoveTarget(null)
          }
        }}
      />
    </div>
  )
}

function IngredientModal({
  ingredient,
  currency,
  onClose,
  onSaved
}: {
  ingredient: Ingredient | null
  currency: string
  onClose: () => void
  onSaved: () => void
}) {
  const { t, language } = useT()
  const [nameAr, setNameAr] = useState(ingredient?.nameAr ?? '')
  const [nameFr, setNameFr] = useState(ingredient?.nameFr ?? '')
  const [unit, setUnit] = useState<Unit>(ingredient?.unit ?? 'g')
  const [cost, setCost] = useState(centsToInput(ingredient?.unitCostCents ?? 0))
  const [minQty, setMinQty] = useState(String(ingredient?.minQty ?? 0))
  const [openingQty, setOpeningQty] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      open
      title={ingredient ? t('common.edit') : t('inventory.addIngredient')}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={busy}
            disabled={!nameAr.trim() || !nameFr.trim()}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await api.ingredients.save({
                  id: ingredient?.id,
                  nameAr: nameAr.trim(),
                  nameFr: nameFr.trim(),
                  unit,
                  costPerUnitCents: toCents(cost) ?? 0,
                  minQty: Number(minQty || '0'),
                  openingQty: ingredient ? undefined : Number(openingQty || '0')
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
          <Field label={t('menu.nameAr')} required>
            <Input value={nameAr} onChange={(event) => setNameAr(event.target.value)} autoFocus />
          </Field>
          <Field label={t('menu.nameFr')} required>
            <Input value={nameFr} onChange={(event) => setNameFr(event.target.value)} />
          </Field>
          <Field label={t('common.unit')}>
            <Select value={unit} onChange={(event) => setUnit(event.target.value as Unit)}>
              {UNITS.map((item) => (
                <option key={item.value} value={item.value}>{item.label[language]}</option>
              ))}
            </Select>
          </Field>
          <Field label={`${t('inventory.unitCost')} (${currency})`}>
            <Input type="number" min={0} step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} />
          </Field>
          <Field label={t('common.min')}>
            <Input type="number" min={0} step="0.001" value={minQty} onChange={(event) => setMinQty(event.target.value)} />
          </Field>
          {!ingredient ? (
            <Field label={t('inventory.openingQty')}>
              <Input type="number" min={0} step="0.001" value={openingQty} onChange={(event) => setOpeningQty(event.target.value)} />
            </Field>
          ) : null}
        </div>
        {error ? <p className="text-xs font-medium text-red-600">{errorText(language, error)}</p> : null}
      </div>
    </Modal>
  )
}

function QuantityModal({
  title,
  ingredient,
  initial,
  onClose,
  onSubmit
}: {
  title: string
  ingredient: Ingredient
  initial: string
  onClose: () => void
  onSubmit: (qty: string, reason: string) => Promise<void>
}) {
  const { t } = useT()
  const [qty, setQty] = useState(initial)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      open
      title={title}
      subtitle={`${ingredient.nameAr} · ${formatNumber(ingredient.stockQty, 2)} ${unitSymbol(ingredient.unit)}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={busy}
            disabled={!reason.trim() || Number(qty) < 0}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await onSubmit(qty, reason.trim())
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
        <Field label={title === t('inventory.waste') ? t('common.quantity') : t('inventory.newQty')} required>
          <Input type="number" min={0} step="0.001" value={qty} onChange={(event) => setQty(event.target.value)} autoFocus />
        </Field>
        <Field label={t('inventory.reason')} required>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-[52px]" />
        </Field>
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
      </div>
    </Modal>
  )
}
