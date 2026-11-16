import { useMemo, useState } from 'react'
import { Clock, Gift, Percent, Plus, Power, Tag, Trash2 } from 'lucide-react'
import type { Category, Offer, OfferKind, OfferScope, Product } from '@shared/types'
import { api } from '../lib/api'
import { useApi } from '../lib/hooks'
import { centsToInput, formatMoney, toCents } from '../lib/format'
import { useT } from '../i18n'
import { useAppStore } from '../store/app'
import {
  Badge,
  Button,
  Card,
  Column,
  Confirm,
  DataTable,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Tabs,
  Toggle
} from '../components/ui'

type Tab = 'offers' | 'loyalty'
const KINDS: OfferKind[] = ['percent', 'amount', 'combo', 'freeItem']
const SCOPES: OfferScope[] = ['order', 'category', 'product']
/* Sunday first, matching the weekday bits the rule uses. */
const DAY_BITS = [0, 1, 2, 3, 4, 5, 6]

export default function OffersPage() {
  const { t, language } = useT()
  const settings = useAppStore((state) => state.settings)
  const setSettings = useAppStore((state) => state.setSettings)
  const can = useAppStore((state) => state.can)
  const manage = can('menu.manage')
  const currency = settings?.currency ?? 'DZD'

  const [tab, setTab] = useState<Tab>('offers')
  const [editing, setEditing] = useState<Offer | 'new' | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Offer | null>(null)
  const [error, setError] = useState<string | null>(null)

  const offers = useApi(() => api.offers.list(true), [])
  const name = (offer: { nameAr: string; nameFr: string }) => (language === 'ar' ? offer.nameAr : offer.nameFr)

  const describe = (offer: Offer): string => {
    if (offer.kind === 'percent') return `−${(offer.valueBp / 100).toFixed(offer.valueBp % 100 ? 1 : 0)} %`
    if (offer.kind === 'amount') return `−${formatMoney(offer.valueCents, currency, 0)}`
    if (offer.kind === 'combo') return `${offer.items.length} × → ${formatMoney(offer.comboPriceCents, currency, 0)}`
    return `${offer.freeQty} ${t('offers.kind.freeItem')}`
  }

  const windowText = (offer: Offer): string => {
    const parts: string[] = []
    if (offer.daysMask !== 127) parts.push(DAY_BITS.filter((d) => offer.daysMask & (1 << d)).map((d) => t(`days.${d}`)).join('، '))
    if (offer.startTime && offer.endTime) parts.push(`${offer.startTime}–${offer.endTime}`)
    if (offer.startsOn || offer.endsOn) parts.push(`${offer.startsOn ?? '…'} → ${offer.endsOn ?? '…'}`)
    return parts.join(' · ') || t('offers.everyDay')
  }

  const columns: Column<Offer>[] = [
    {
      key: 'name',
      header: t('common.name'),
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-800 dark:text-ink-100">{name(row)}</p>
          <p className="truncate text-[11px] text-ink-400">
            {t(`offers.scope.${row.scope}`)}
            {row.targetNameAr ? ` · ${language === 'ar' ? row.targetNameAr : row.targetNameFr}` : ''}
          </p>
        </div>
      )
    },
    { key: 'kind', header: t('offers.kind'), render: (row) => <Badge tone="brand">{t(`offers.kind.${row.kind}`)}</Badge> },
    { key: 'value', header: t('common.value'), align: 'end', render: (row) => <span className="num font-semibold" dir="ltr">{describe(row)}</span> },
    {
      key: 'window',
      header: t('offers.window'),
      render: (row) => (
        <span className="inline-flex items-center gap-1 text-[11px] text-ink-500">
          <Clock className="h-3 w-3" />
          {windowText(row)}
        </span>
      )
    },
    {
      key: 'used',
      header: t('offers.used'),
      align: 'end',
      render: (row) => (
        <span className="num text-xs text-ink-500" dir="ltr">
          {row.usedCount}
          {row.usageLimit > 0 ? ` / ${row.usageLimit}` : ''}
        </span>
      )
    },
    {
      key: 'state',
      header: '',
      align: 'end',
      render: (row) =>
        manage ? (
          <div className="flex items-center justify-end gap-1">
            <button
              className={`rounded p-1.5 transition-colors ${row.isActive ? 'text-accent-600 hover:bg-accent-50 dark:hover:bg-accent-500/15' : 'text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800'}`}
              title={row.isActive ? t('offers.active') : t('offers.inactive')}
              aria-label={row.isActive ? t('offers.active') : t('offers.inactive')}
              onClick={async () => {
                try {
                  await api.offers.setActive(row.id, !row.isActive)
                  await offers.reload()
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
                }
              }}
            >
              <Power className="h-4 w-4" />
            </button>
            <button
              className="rounded p-1.5 text-ink-500 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800"
              onClick={() => setEditing(row)}
              title={t('common.edit')}
              aria-label={t('common.edit')}
            >
              <Tag className="h-4 w-4" />
            </button>
            <button
              className="rounded p-1.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/15"
              onClick={() => setRemoveTarget(row)}
              title={t('common.delete')}
              aria-label={t('common.delete')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Badge tone={row.isActive ? 'positive' : 'neutral'}>{row.isActive ? t('offers.active') : t('offers.inactive')}</Badge>
        )
    }
  ]

  return (
    <section>
      <PageHeader
        title={t('offers.title')}
        subtitle={t('offers.subtitle')}
        actions={manage && tab === 'offers' ? <Button icon={Plus} onClick={() => setEditing('new')}>{t('offers.add')}</Button> : undefined}
      >
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'offers', label: t('offers.tab'), icon: Percent, count: offers.data?.length },
            { value: 'loyalty', label: t('offers.loyaltyTab'), icon: Gift }
          ]}
        />
      </PageHeader>

      {error ? <div className="mb-3"><ErrorBox code={error} /></div> : null}

      {tab === 'offers' ? (
        <Card className="overflow-hidden">
          <DataTable<Offer>
            columns={columns}
            rows={offers.data ?? []}
            keyField={(row) => row.id}
            loading={offers.loading}
            empty={
              <EmptyState
                icon={Percent}
                title={t('offers.empty')}
                hint={t('offers.emptyHint')}
                action={manage ? <Button icon={Plus} onClick={() => setEditing('new')}>{t('offers.add')}</Button> : undefined}
              />
            }
          />
        </Card>
      ) : (
        <LoyaltyPanel
          onSaved={(updated) => setSettings(updated)}
          onError={(code) => setError(code)}
        />
      )}

      {editing ? (
        <OfferModal
          offer={editing === 'new' ? null : editing}
          currency={currency}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await offers.reload()
          }}
        />
      ) : null}

      <Confirm
        open={Boolean(removeTarget)}
        title={t('common.delete')}
        message={removeTarget ? `${name(removeTarget)} — ${t('common.confirmDelete')}` : ''}
        confirmLabel={t('common.delete')}
        danger
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return
          try {
            await api.offers.remove(removeTarget.id)
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
          } finally {
            setRemoveTarget(null)
            await offers.reload()
          }
        }}
      />
    </section>
  )
}

function LoyaltyPanel({ onSaved, onError }: { onSaved: (settings: any) => void; onError: (code: string) => void }) {
  const { t } = useT()
  const settings = useAppStore((state) => state.settings)
  const currency = settings?.currency ?? 'DZD'
  const [form, setForm] = useState({
    loyaltyEnabled: settings?.loyaltyEnabled ?? false,
    loyaltyEarnPer100: settings?.loyaltyEarnPer100 ?? 1,
    loyaltyPointValueCents: settings?.loyaltyPointValueCents ?? 100,
    loyaltyMinRedeem: settings?.loyaltyMinRedeem ?? 50
  })
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const example = Math.round((100_000 / 10_000) * form.loyaltyEarnPer100)

  return (
    <Card className="max-w-2xl space-y-4 p-5">
      <div>
        <h2 className="text-sm font-bold text-ink-800 dark:text-ink-100">{t('loyalty.title')}</h2>
        <p className="mt-1 text-xs text-ink-500">{t('loyalty.subtitle')}</p>
      </div>
      <Toggle
        checked={form.loyaltyEnabled}
        onChange={(value) => setForm({ ...form, loyaltyEnabled: value })}
        label={t('loyalty.enabled')}
      />
      {form.loyaltyEnabled ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('loyalty.earnPer100')}>
              <Input type="number" min="0" step="0.5" dir="ltr" value={String(form.loyaltyEarnPer100)} onChange={(event) => setForm({ ...form, loyaltyEarnPer100: Math.max(0, Number(event.target.value || '0')) })} />
            </Field>
            <Field label={t('loyalty.pointValue')}>
              <Input type="number" min="0" dir="ltr" value={centsToInput(form.loyaltyPointValueCents)} onChange={(event) => setForm({ ...form, loyaltyPointValueCents: toCents(event.target.value) ?? 0 })} />
            </Field>
            <Field label={t('loyalty.minRedeem')}>
              <Input type="number" min="0" dir="ltr" value={String(form.loyaltyMinRedeem)} onChange={(event) => setForm({ ...form, loyaltyMinRedeem: Math.max(0, Math.floor(Number(event.target.value || '0'))) })} />
            </Field>
          </div>
          {/* What the three numbers mean, in one sentence the owner can check. */}
          <p className="rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600 dark:bg-ink-800/70 dark:text-ink-300">
            {formatMoney(100_000, currency, 0)} → <strong className="num">{example}</strong> {t('loyalty.points')} ·{' '}
            {example} {t('loyalty.worth')} <strong className="num">{formatMoney(example * form.loyaltyPointValueCents, currency, 0)}</strong>
          </p>
        </>
      ) : null}
      <div className="flex items-center gap-3">
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true)
            setSaved(false)
            try {
              onSaved(await api.updateSettings(form))
              setSaved(true)
            } catch (caught) {
              onError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
            } finally {
              setBusy(false)
            }
          }}
        >
          {t('common.save')}
        </Button>
        {saved ? <span className="text-xs font-semibold text-accent-700 dark:text-accent-300">{t('settings.saved')}</span> : null}
      </div>
    </Card>
  )
}

function OfferModal({
  offer,
  currency,
  onClose,
  onSaved
}: {
  offer: Offer | null
  currency: string
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { t, language } = useT()
  const categories = useApi<Category[]>(() => api.categories.list(), [])
  const products = useApi<Product[]>(() => api.products.list({ includeArchived: false }), [])

  const [form, setForm] = useState({
    nameAr: offer?.nameAr ?? '',
    nameFr: offer?.nameFr ?? '',
    kind: (offer?.kind ?? 'percent') as OfferKind,
    scope: (offer?.scope ?? 'order') as OfferScope,
    targetId: offer?.targetId ? String(offer.targetId) : '',
    percent: offer ? String(offer.valueBp / 100) : '10',
    amount: centsToInput(offer?.valueCents ?? 0),
    comboPrice: centsToInput(offer?.comboPriceCents ?? 0),
    freeQty: String(offer?.freeQty ?? 1),
    minSubtotal: centsToInput(offer?.minSubtotalCents ?? 0),
    startsOn: offer?.startsOn ?? '',
    endsOn: offer?.endsOn ?? '',
    daysMask: offer?.daysMask ?? 127,
    startTime: offer?.startTime ?? '',
    endTime: offer?.endTime ?? '',
    usageLimit: String(offer?.usageLimit ?? 0),
    isActive: offer?.isActive ?? true
  })
  const [items, setItems] = useState(offer?.items.map((item) => ({ productId: String(item.productId), qty: String(item.qty) })) ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const productName = (product: Product) => (language === 'ar' ? product.nameAr : product.nameFr)
  const targets = useMemo(
    () => (form.scope === 'category' ? (categories.data ?? []) : form.scope === 'product' ? (products.data ?? []) : []),
    [form.scope, categories.data, products.data]
  )

  const toggleDay = (day: number) => setForm({ ...form, daysMask: form.daysMask ^ (1 << day) })

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.offers.save({
        id: offer?.id,
        nameAr: form.nameAr.trim(),
        nameFr: form.nameFr.trim() || form.nameAr.trim(),
        kind: form.kind,
        scope: form.scope,
        targetId: form.scope === 'order' ? null : Number(form.targetId) || null,
        valueBp: form.kind === 'percent' ? Math.round(Number(form.percent || '0') * 100) : 0,
        valueCents: form.kind === 'amount' ? (toCents(form.amount) ?? 0) : 0,
        comboPriceCents: form.kind === 'combo' ? (toCents(form.comboPrice) ?? 0) : 0,
        freeQty: form.kind === 'freeItem' ? Math.max(1, Number(form.freeQty || '1')) : 0,
        minSubtotalCents: toCents(form.minSubtotal) ?? 0,
        startsOn: form.startsOn || null,
        endsOn: form.endsOn || null,
        daysMask: form.daysMask,
        startTime: form.startTime || null,
        endTime: form.endTime || null,
        usageLimit: Math.max(0, Number(form.usageLimit || '0')),
        isActive: form.isActive,
        items:
          form.kind === 'combo'
            ? items.filter((item) => item.productId).map((item) => ({ productId: Number(item.productId), qty: Math.max(1, Number(item.qty || '1')) }))
            : undefined
      })
      await onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={offer ? t('common.edit') : t('offers.add')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button loading={busy} disabled={!form.nameAr.trim()} onClick={() => void save()}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <ErrorBox code={error} /> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('menu.nameAr')} required>
            <Input value={form.nameAr} onChange={(event) => setForm({ ...form, nameAr: event.target.value })} autoFocus />
          </Field>
          <Field label={t('menu.nameFr')}>
            <Input value={form.nameFr} onChange={(event) => setForm({ ...form, nameFr: event.target.value })} dir="ltr" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('offers.kind')}>
            <Select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as OfferKind })}>
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>{t(`offers.kind.${kind}`)}</option>
              ))}
            </Select>
          </Field>
          {form.kind === 'combo' ? null : (
            <Field label={t('offers.scope')}>
              <Select value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value as OfferScope, targetId: '' })}>
                {SCOPES.map((scope) => (
                  <option key={scope} value={scope}>{t(`offers.scope.${scope}`)}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {form.scope !== 'order' && form.kind !== 'combo' ? (
          <Field label={t(`offers.scope.${form.scope}`)} required>
            <Select value={form.targetId} onChange={(event) => setForm({ ...form, targetId: event.target.value })}>
              <option value="">—</option>
              {targets.map((target: any) => (
                <option key={target.id} value={target.id}>{language === 'ar' ? target.nameAr : target.nameFr}</option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {form.kind === 'percent' ? (
            <Field label={t('offers.percent')} required>
              <Input type="number" min="1" max="100" step="0.5" dir="ltr" value={form.percent} onChange={(event) => setForm({ ...form, percent: event.target.value })} />
            </Field>
          ) : null}
          {form.kind === 'amount' ? (
            <Field label={`${t('offers.amount')} (${currency})`} required>
              <Input type="number" min="0" dir="ltr" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
            </Field>
          ) : null}
          {form.kind === 'combo' ? (
            <Field label={`${t('offers.comboPrice')} (${currency})`} required>
              <Input type="number" min="0" dir="ltr" value={form.comboPrice} onChange={(event) => setForm({ ...form, comboPrice: event.target.value })} />
            </Field>
          ) : null}
          {form.kind === 'freeItem' ? (
            <Field label={t('offers.freeQty')} required>
              <Input type="number" min="1" max="99" dir="ltr" value={form.freeQty} onChange={(event) => setForm({ ...form, freeQty: event.target.value })} />
            </Field>
          ) : null}
          <Field label={`${t('offers.minSubtotal')} (${currency})`}>
            <Input type="number" min="0" dir="ltr" value={form.minSubtotal} onChange={(event) => setForm({ ...form, minSubtotal: event.target.value })} />
          </Field>
        </div>

        {form.kind === 'combo' ? (
          <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
            <p className="afus-label">{t('offers.dishes')}</p>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Select
                    className="flex-1"
                    value={item.productId}
                    onChange={(event) => setItems(items.map((row, i) => (i === index ? { ...row, productId: event.target.value } : row)))}
                  >
                    <option value="">—</option>
                    {(products.data ?? []).map((product) => (
                      <option key={product.id} value={product.id}>{productName(product)}</option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    max="99"
                    dir="ltr"
                    className="w-20"
                    value={item.qty}
                    onChange={(event) => setItems(items.map((row, i) => (i === index ? { ...row, qty: event.target.value } : row)))}
                  />
                  <button
                    className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/15"
                    onClick={() => setItems(items.filter((_, i) => i !== index))}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button variant="secondary" size="sm" icon={Plus} className="mt-2" onClick={() => setItems([...items, { productId: '', qty: '1' }])}>
              {t('offers.addDish')}
            </Button>
          </div>
        ) : null}

        <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
          <p className="afus-label">{t('offers.window')}</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {DAY_BITS.map((day) => {
              const on = (form.daysMask & (1 << day)) !== 0
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${on ? 'bg-brand-700 text-white' : 'border border-ink-200 text-ink-500 dark:border-ink-700'}`}
                >
                  {t(`days.${day}`)}
                </button>
              )
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('fiscal.from')}>
              <Input type="date" dir="ltr" value={form.startsOn} onChange={(event) => setForm({ ...form, startsOn: event.target.value })} />
            </Field>
            <Field label={t('fiscal.to')}>
              <Input type="date" dir="ltr" value={form.endsOn} onChange={(event) => setForm({ ...form, endsOn: event.target.value })} />
            </Field>
            <Field label={t('offers.hours')}>
              <Input type="time" dir="ltr" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
            </Field>
            <Field label="&nbsp;">
              <Input type="time" dir="ltr" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} />
            </Field>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('offers.usageLimit')}>
            <Input type="number" min="0" dir="ltr" value={form.usageLimit} onChange={(event) => setForm({ ...form, usageLimit: event.target.value })} />
          </Field>
          <div className="flex items-end pb-2">
            <Toggle checked={form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} label={t('offers.active')} />
          </div>
        </div>
      </div>
    </Modal>
  )
}

