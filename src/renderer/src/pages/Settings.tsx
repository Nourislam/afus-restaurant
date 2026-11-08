import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { PAYMENT_METHOD_LABELS } from '@shared/constants'
import { api } from '../lib/api'
import { errorText, useT } from '../i18n'
import { useAppStore } from '../store/app'
import { Button, Card, ErrorBox, Field, Input, PageHeader, Select, Spinner } from '../components/ui'

export default function Settings() {
  const { t, language, setLanguage } = useT()
  const settings = useAppStore((state) => state.settings)
  const setSettings = useAppStore((state) => state.setSettings)
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)

  const [form, setForm] = useState<AppSettings | null>(settings)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!form && settings) setForm(settings)
  }, [form, settings])

  const patch = (values: Partial<AppSettings>) => setForm((current) => (current ? { ...current, ...values } : current))

  const save = async () => {
    if (!form) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await api.updateSettings({
        restaurantName: form.restaurantName,
        restaurantNameFr: form.restaurantNameFr,
        phone: form.phone,
        address: form.address,
        currency: form.currency,
        taxEnabled: form.taxEnabled,
        taxRateBp: form.taxRateBp,
        receiptFooter: form.receiptFooter,
        paperWidth: form.paperWidth,
        printerName: form.printerName,
        language: form.language,
        theme: form.theme
      })
      setSettings(updated)
      setForm(updated)
      setLanguage(updated.language)
      setTheme(updated.theme)
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'INTERNAL')
    } finally {
      setBusy(false)
    }
  }

  if (!form) return <Spinner />

  return (
    <section className="space-y-4">
      <PageHeader
        title={t('nav.settings')}
        subtitle={t('app.tagline')}
        actions={
          <Button icon={Save} loading={busy} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        }
      />

      {error ? <ErrorBox code={error} /> : null}
      {saved ? (
        <p className="rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-xs font-semibold text-accent-700 dark:border-accent-700/40 dark:bg-accent-500/10 dark:text-accent-300">
          {t('settings.saved')}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-bold text-ink-800 dark:text-ink-100">{t('setup.restaurant')}</h2>
          <Field label={t('settings.restaurantName')} required>
            <Input value={form.restaurantName} onChange={(event) => patch({ restaurantName: event.target.value })} />
          </Field>
          <Field label={`${t('settings.restaurantName')} (FR)`}>
            <Input value={form.restaurantNameFr} onChange={(event) => patch({ restaurantNameFr: event.target.value })} dir="ltr" />
          </Field>
          <Field label={t('settings.phone')}>
            <Input value={form.phone} onChange={(event) => patch({ phone: event.target.value })} dir="ltr" />
          </Field>
          <Field label={t('settings.address')}>
            <Input value={form.address} onChange={(event) => patch({ address: event.target.value })} />
          </Field>
          <Field label={t('settings.currency')}>
            <Select value={form.currency} onChange={(event) => patch({ currency: event.target.value })}>
              {['DZD', 'EUR', 'USD', 'MAD', 'TND'].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-bold text-ink-800 dark:text-ink-100">{t('settings.taxEnabled')}</h2>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.taxEnabled}
              onChange={(event) => patch({ taxEnabled: event.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-700"
            />
            <span>
              <span className="block text-sm font-semibold text-ink-800 dark:text-ink-100">{t('settings.taxEnabled')}</span>
              <span className="block text-xs text-ink-500">{t('settings.taxHint')}</span>
            </span>
          </label>
          {form.taxEnabled ? (
            <Field label={`${t('settings.taxRate')} %`}>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.taxRateBp / 100}
                onChange={(event) => patch({ taxRateBp: Math.round(Number(event.target.value || '0') * 100) })}
              />
            </Field>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('setup.language')}>
              <Select
                value={form.language}
                onChange={(event) => patch({ language: event.target.value as AppSettings['language'] })}
              >
                <option value="ar">العربية</option>
                <option value="fr">Français</option>
              </Select>
            </Field>
            <Field label={t('settings.theme')}>
              <Select value={form.theme} onChange={(event) => patch({ theme: event.target.value as AppSettings['theme'] })}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </Select>
            </Field>
            <Field label={t('settings.paperWidth')}>
              <Select
                value={form.paperWidth}
                onChange={(event) => patch({ paperWidth: event.target.value as AppSettings['paperWidth'] })}
              >
                <option value="80">80 mm</option>
                <option value="58">58 mm</option>
                <option value="a4">A4</option>
              </Select>
            </Field>
            <Field label={t('settings.printerName')}>
              <Input value={form.printerName} onChange={(event) => patch({ printerName: event.target.value })} dir="ltr" />
            </Field>
          </div>

          <Field label={t('settings.receiptFooter')}>
            <Input value={form.receiptFooter} onChange={(event) => patch({ receiptFooter: event.target.value })} />
          </Field>

          <div>
            <p className="afus-label">{t('pos.pay')}</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PAYMENT_METHOD_LABELS).map(([method, label]) => {
                const enabled = form.paymentMethods.includes(method)
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() =>
                      patch({
                        paymentMethods: enabled
                          ? form.paymentMethods.filter((entry) => entry !== method)
                          : [...form.paymentMethods, method]
                      })
                    }
                    className={
                      enabled
                        ? 'rounded-full bg-brand-700 px-3 py-1 text-[11px] font-semibold text-white'
                        : 'rounded-full border border-ink-200 px-3 py-1 text-[11px] font-semibold text-ink-500 dark:border-ink-700'
                    }
                  >
                    {label[language]}
                  </button>
                )
              })}
            </div>
          </div>
        </Card>
      </div>

      <p className="text-[11px] text-ink-400">
        {t('setup.localOnly')} · {theme === 'dark' ? 'dark' : 'light'} · {errorText(language, 'INTERNAL') === '' ? '' : ''}
      </p>
    </section>
  )
}
