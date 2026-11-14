import { useState } from 'react'
import { Download, ExternalLink, Globe, MapPin, Pencil, Plus, Power, QrCode, Store } from 'lucide-react'
import type { Branch, BranchHours, WebsiteTheme } from '@shared/types'
import { api } from '../lib/api'
import { useApi, useAppEvent } from '../lib/hooks'
import { useT } from '../i18n'
import { useAppStore } from '../store/app'
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Toggle } from '../components/ui'

const THEME_SWATCH: Record<WebsiteTheme, string> = {
  ember: 'linear-gradient(135deg,#2a1c12,#e8893a)',
  noir: 'linear-gradient(135deg,#17171a,#caa469)',
  sable: 'linear-gradient(135deg,#e7d9c2,#9a5a2b)',
  nar: 'linear-gradient(135deg,#ffd37a,#e5402b)'
}
const DAYS = ['0', '1', '2', '3', '4', '5', '6'] as const

export default function WebsitePage() {
  const { t, language } = useT()
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const state = useApi(() => api.website.state(), [])
  const orders = useApi(() => api.website.orders(), [])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exported, setExported] = useState<string | null>(null)
  const [slug, setSlug] = useState<string | null>(null)
  const [branchForm, setBranchForm] = useState<Partial<Branch> | null>(null)
  useAppEvent((event) => {
    if (event.channel.startsWith('orders.')) void orders.reload()
  })

  const data = state.data
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
      await state.reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ERROR')
    } finally {
      setBusy(null)
    }
  }

  const saveSlug = async () => {
    const value = (slug ?? settings?.restaurantSlug ?? '').trim().toLowerCase()
    await act('slug', async () => setSettings(await api.updateSettings({ restaurantSlug: value })))
    setSlug(null)
  }

  const bname = (b: Branch) => (language === 'ar' ? b.nameAr : b.nameFr)

  return (
    <section className="space-y-4">
      <PageHeader
        title={t('web.title')}
        subtitle={t('web.subtitle')}
        actions={
          data?.running ? (
            <Badge tone="positive">
              <span className="me-1 inline-block h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent-500" />
              {t('web.live')}
            </Badge>
          ) : (
            <Badge tone="neutral">{t('web.stopped')}</Badge>
          )
        }
      />
      {error ? <ErrorBox code={error} onRetry={() => void state.reload()} /> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-4 p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-brand-600" />
              <h2 className="font-bold text-ink-800 dark:text-ink-100">{t('web.server')}</h2>
            </div>
            <Button icon={Power} variant={data?.running ? 'secondary' : 'primary'} loading={busy === 'toggle'} onClick={() => act('toggle', () => (data?.running ? api.website.stop() : api.website.start()))}>
              {data?.running ? t('web.turnOff') : t('web.turnOn')}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-ink-200 p-4 dark:border-ink-800">
            <div>
              <p className="font-semibold text-ink-800 dark:text-ink-100">{t('web.openState')}</p>
              <p className="text-xs text-ink-500">{data?.isOpen ? t('web.openHint') : t('web.closedHint')}</p>
            </div>
            <Toggle checked={Boolean(data?.isOpen)} onChange={(value) => void act('open', () => api.website.config({ isOpen: value }))} label={data?.isOpen ? t('web.open') : t('web.closed')} />
          </div>
          {data?.running && data.url ? (
            <div className="flex flex-wrap items-center gap-4 rounded-xl bg-ink-50 p-4 dark:bg-ink-800/40">
              {data.qrDataUrl ? <img src={data.qrDataUrl} alt="QR" className="h-28 w-28 rounded-lg bg-white p-1.5" /> : <QrCode className="h-28 w-28 text-ink-300" />}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink-500">{t('web.scanHint')}</p>
                <p className="mt-1 break-all font-mono text-sm font-bold text-brand-700 dark:text-brand-300" dir="ltr">{data.url}</p>
                <Button size="sm" variant="secondary" icon={ExternalLink} className="mt-2" onClick={() => window.open(data.url ?? '', '_blank')}>{t('web.preview')}</Button>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-ink-200 p-4 text-center text-sm text-ink-500 dark:border-ink-700">{t('web.startToGetLink')}</p>
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-brand-600" />
            <h2 className="font-bold text-ink-800 dark:text-ink-100">{t('web.publishClaude')}</h2>
          </div>
          <p className="text-sm text-ink-500">{t('web.publishClaudeHint')}</p>
          <Field label={t('web.slug')} hint={t('web.slugHint')}>
            <div className="flex gap-2">
              <Input value={slug ?? settings?.restaurantSlug ?? ''} onChange={(e) => setSlug(e.target.value)} className="ltr" placeholder="djemr-alger" />
              <Button size="md" variant="secondary" disabled={slug === null} loading={busy === 'slug'} onClick={() => void saveSlug()}>{t('common.save')}</Button>
            </div>
          </Field>
          <Button icon={Download} className="w-full" loading={busy === 'export'} onClick={() => act('export', async () => setExported((await api.website.export()).dir))}>
            {t('web.exportSite')}
          </Button>
          {exported ? <p className="break-all text-[11px] text-accent-700 dark:text-accent-300" dir="ltr">{exported}</p> : null}
        </Card>
      </div>

      {/* Branches */}
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-ink-800 dark:text-ink-100">{t('web.branches')}</h2>
            <p className="text-xs text-ink-500">{t('web.branchesHint')}</p>
          </div>
          <Button icon={Plus} variant="secondary" onClick={() => setBranchForm({ nameAr: '', nameFr: '', address: '', phone: '', hours: {}, deliveryNote: '' })}>{t('web.addBranch')}</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(data?.branches ?? []).map((b) => (
            <div key={b.id} className="flex gap-3 rounded-xl border border-ink-200 p-4 dark:border-ink-800">
              {data?.branchQr[b.id] ? <img src={data.branchQr[b.id]} alt="QR" className="h-20 w-20 flex-none rounded-lg bg-white p-1" title={t('web.branchQr')} /> : <div className="flex h-20 w-20 flex-none items-center justify-center rounded-lg bg-ink-100 text-ink-300 dark:bg-ink-800"><QrCode className="h-8 w-8" /></div>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-bold text-ink-800 dark:text-ink-100">{bname(b)}</p>
                  <Badge tone={b.openNow ? 'positive' : 'danger'}>{b.openNow ? t('web.openNow') : t('web.closedNow')}</Badge>
                </div>
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500"><MapPin className="h-3 w-3" />{b.address || '—'}{b.phone ? ` · ${b.phone}` : ''}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Toggle checked={b.isOpen} onChange={(v) => void act('b' + b.id, () => api.branches.setOpen(b.id, v))} label={b.isOpen ? t('web.open') : t('web.closed')} />
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setBranchForm(b)}>{t('common.edit')}</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Theme */}
      <Card className="space-y-3 p-5">
        <h2 className="font-bold text-ink-800 dark:text-ink-100">{t('web.theme')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(data?.themes ?? []).map((theme) => {
            const active = data?.theme === theme.id
            return (
              <button key={theme.id} onClick={() => void act('theme', () => api.website.config({ theme: theme.id }))} className={`group overflow-hidden rounded-xl border-2 text-start transition ${active ? 'border-brand-600 shadow-glow' : 'border-ink-200 hover:border-ink-400 dark:border-ink-700'}`}>
                <div className="h-16 w-full transition group-hover:scale-105" style={{ background: THEME_SWATCH[theme.id] }} />
                <div className="flex items-center justify-between p-2.5">
                  <span className="text-sm font-semibold text-ink-800 dark:text-ink-100">{language === 'ar' ? theme.label.ar : theme.label.fr}</span>
                  {active ? <Badge tone="brand">✓</Badge> : null}
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      {/* Web orders */}
      <Card className="p-5">
        <h2 className="mb-3 font-bold text-ink-800 dark:text-ink-100">{t('web.orders')}</h2>
        {(orders.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-500">{t('web.noOrders')}</p>
        ) : (
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {(orders.data ?? []).map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="num font-bold text-ink-800 dark:text-ink-100" dir="ltr">{order.orderNumber}</span>
                  <Badge tone={order.type === 'delivery' ? 'info' : 'neutral'}>{order.type === 'delivery' ? t('pos.delivery') : t('pos.pickup')}</Badge>
                  <span className="truncate text-xs text-ink-500">{order.customerName ?? '—'}</span>
                </div>
                <span className="num font-semibold text-accent-700 dark:text-accent-300" dir="ltr">{order.totalCents / 100} DZD</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <BranchModal
        value={branchForm}
        onClose={() => setBranchForm(null)}
        onSaved={() => {
          setBranchForm(null)
          void state.reload()
        }}
      />
    </section>
  )
}

function BranchModal({ value, onClose, onSaved }: { value: Partial<Branch> | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT()
  const [form, setForm] = useState<Partial<Branch>>({})
  const [lastId, setLastId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = value ? String(value.id ?? 'new') : 'closed'
  if (key !== lastId) {
    setLastId(key)
    setForm(value ? { hours: {}, ...value } : {})
    setError(null)
  }
  const hours: BranchHours = form.hours ?? {}
  const setDay = (d: (typeof DAYS)[number], v: { open: string; close: string } | null | undefined) => {
    const next: BranchHours = { ...hours }
    if (v === undefined) delete next[d]
    else next[d] = v
    setForm({ ...form, hours: next })
  }
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.branches.save({
        id: form.id,
        nameAr: (form.nameAr ?? '').trim(),
        nameFr: (form.nameFr ?? '').trim(),
        address: form.address?.trim() || null,
        phone: form.phone?.trim() || null,
        hours,
        deliveryNote: form.deliveryNote?.trim() || null,
        sortOrder: form.sortOrder
      })
      onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ERROR')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={value !== null}
      title={form.id ? t('web.editBranch') : t('web.addBranch')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button loading={busy} disabled={!(form.nameAr ?? '').trim()} onClick={() => void submit()}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('web.branchNameAr')} required><Input value={form.nameAr ?? ''} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></Field>
          <Field label={t('web.branchNameFr')}><Input value={form.nameFr ?? ''} onChange={(e) => setForm({ ...form, nameFr: e.target.value })} /></Field>
          <Field label={t('setup.address')}><Input value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label={t('setup.phone')} hint="WhatsApp"><Input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="ltr" /></Field>
          <Field label={t('web.deliveryNote')} className="sm:col-span-2"><Input value={form.deliveryNote ?? ''} onChange={(e) => setForm({ ...form, deliveryNote: e.target.value })} /></Field>
        </div>
        <div>
          <p className="afus-label">{t('web.hours')}</p>
          <p className="mb-2 text-xs text-ink-500">{t('web.hoursHint')}</p>
          <div className="space-y-1.5">
            {DAYS.map((d) => {
              const v = hours[d]
              const set = v !== undefined
              return (
                <div key={d} className="grid grid-cols-[72px_auto_1fr_1fr] items-center gap-2 text-sm">
                  <span className="font-semibold text-ink-700 dark:text-ink-200">{t(`days.${d}`)}</span>
                  <label className="flex items-center gap-1 text-xs text-ink-500">
                    <input type="checkbox" checked={set && v === null} onChange={(e) => setDay(d, e.target.checked ? null : { open: '11:00', close: '23:00' })} />
                    {t('web.closedDay')}
                  </label>
                  <Input type="time" className="ltr" value={v?.open ?? ''} disabled={v === null} onChange={(e) => setDay(d, { open: e.target.value, close: v?.close ?? '23:00' })} />
                  <Input type="time" className="ltr" value={v?.close ?? ''} disabled={v === null} onChange={(e) => setDay(d, { open: v?.open ?? '11:00', close: e.target.value })} />
                </div>
              )
            })}
          </div>
        </div>
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
      </div>
    </Modal>
  )
}
