import { useState } from 'react'
import { Download, ExternalLink, Globe, Power, QrCode, Store } from 'lucide-react'
import type { WebsiteTheme } from '@shared/types'
import { api } from '../lib/api'
import { useApi, useAppEvent } from '../lib/hooks'
import { useT } from '../i18n'
import { Badge, Button, Card, ErrorBox, PageHeader, Toggle } from '../components/ui'

const THEME_SWATCH: Record<WebsiteTheme, string> = {
  fastfood: 'linear-gradient(135deg,#e11d48,#f59e0b)',
  classic: 'linear-gradient(135deg,#7c2d12,#a16207)',
  cafe: 'linear-gradient(135deg,#166534,#92400e)',
  grill: 'linear-gradient(135deg,#1c1c1c,#f59e0b)'
}

export default function WebsitePage() {
  const { t, language } = useT()
  const state = useApi(() => api.website.state(), [])
  const orders = useApi(() => api.website.orders(), [])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exported, setExported] = useState<string | null>(null)
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
        {/* Server + open/closed */}
        <Card className="space-y-4 p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-brand-600" />
              <h2 className="font-bold text-ink-800 dark:text-ink-100">{t('web.server')}</h2>
            </div>
            <Button
              icon={Power}
              variant={data?.running ? 'secondary' : 'primary'}
              loading={busy === 'toggle'}
              onClick={() => act('toggle', () => (data?.running ? api.website.stop() : api.website.start()))}
            >
              {data?.running ? t('web.turnOff') : t('web.turnOn')}
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-ink-200 p-4 dark:border-ink-800">
            <div>
              <p className="font-semibold text-ink-800 dark:text-ink-100">{t('web.openState')}</p>
              <p className="text-xs text-ink-500">{data?.isOpen ? t('web.openHint') : t('web.closedHint')}</p>
            </div>
            <Toggle
              checked={Boolean(data?.isOpen)}
              onChange={(value) => void act('open', () => api.website.config({ isOpen: value }))}
              label={data?.isOpen ? t('web.open') : t('web.closed')}
            />
          </div>

          {data?.running && data.url ? (
            <div className="flex flex-wrap items-center gap-4 rounded-xl bg-ink-50 p-4 dark:bg-ink-800/40">
              {data.qrDataUrl ? (
                <img src={data.qrDataUrl} alt="QR" className="h-28 w-28 rounded-lg bg-white p-1.5" />
              ) : (
                <QrCode className="h-28 w-28 text-ink-300" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink-500">{t('web.scanHint')}</p>
                <p className="mt-1 break-all font-mono text-sm font-bold text-brand-700 dark:text-brand-300" dir="ltr">
                  {data.url}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={ExternalLink}
                  className="mt-2"
                  onClick={() => window.open(data.url ?? '', '_blank')}
                >
                  {t('web.preview')}
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-ink-200 p-4 text-center text-sm text-ink-500 dark:border-ink-700">
              {t('web.startToGetLink')}
            </p>
          )}
        </Card>

        {/* Export */}
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-brand-600" />
            <h2 className="font-bold text-ink-800 dark:text-ink-100">{t('web.publish')}</h2>
          </div>
          <p className="text-sm text-ink-500">{t('web.publishHint')}</p>
          <Button
            icon={Download}
            variant="secondary"
            className="w-full"
            loading={busy === 'export'}
            onClick={() =>
              act('export', async () => {
                const result = await api.website.export()
                setExported(result.dir)
              })
            }
          >
            {t('web.exportSite')}
          </Button>
          {exported ? <p className="break-all text-[11px] text-accent-700 dark:text-accent-300" dir="ltr">{exported}</p> : null}
        </Card>
      </div>

      {/* Themes */}
      <Card className="space-y-3 p-5">
        <h2 className="font-bold text-ink-800 dark:text-ink-100">{t('web.theme')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(data?.themes ?? []).map((theme) => {
            const active = data?.theme === theme.id
            return (
              <button
                key={theme.id}
                onClick={() => void act('theme', () => api.website.config({ theme: theme.id }))}
                className={`group overflow-hidden rounded-xl border-2 text-start transition ${
                  active ? 'border-brand-600 shadow-glow' : 'border-ink-200 hover:border-ink-400 dark:border-ink-700'
                }`}
              >
                <div className="h-16 w-full transition group-hover:scale-105" style={{ background: THEME_SWATCH[theme.id] }} />
                <div className="flex items-center justify-between p-2.5">
                  <span className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                    {language === 'ar' ? theme.label.ar : theme.label.fr}
                  </span>
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
                  <Badge tone={order.type === 'delivery' ? 'info' : 'neutral'}>
                    {order.type === 'delivery' ? t('delivery.fee') : t('common.type')}
                  </Badge>
                  <span className="truncate text-xs text-ink-500">{order.customerName ?? '—'}</span>
                </div>
                <span className="num font-semibold text-accent-700 dark:text-accent-300" dir="ltr">
                  {order.totalCents / 100} DZD
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  )
}
