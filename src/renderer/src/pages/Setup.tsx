import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { errorText, useT } from '../i18n'
import { useAppStore } from '../store/app'
import { Button, Field, Input, Select } from '../components/ui'
import { centsToInput, toCents } from '../lib/format'

export default function SetupPage({ onComplete }: { onComplete: () => Promise<void> }) {
  const { t, language, setLanguage } = useT()
  const setSettings = useAppStore((state) => state.setSettings)
  const setUser = useAppStore((state) => state.setUser)
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [restaurantName, setRestaurantName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [currency, setCurrency] = useState('DZD')
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [taxRate, setTaxRate] = useState('19')
  const [ownerFullName, setOwnerFullName] = useState('')
  const [ownerUsername, setOwnerUsername] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const next = () => {
    setLocalError(null)
    if (!restaurantName.trim()) {
      setLocalError(language === 'ar' ? 'اسم المطعم مطلوب' : 'Le nom du restaurant est requis')
      return
    }
    setStep(2)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLocalError(null)
    setError(null)
    if (!ownerFullName.trim() || !ownerUsername.trim()) {
      setLocalError(language === 'ar' ? 'اسم المالك واسم المستخدم مطلوبان' : 'Nom et identifiant requis')
      return
    }
    if (ownerPassword.length < 6) {
      setLocalError(language === 'ar' ? 'كلمة المرور 6 أحرف على الأقل' : 'Mot de passe: 6 caractères minimum')
      return
    }
    if (ownerPassword !== confirmPassword) {
      setLocalError(language === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Les mots de passe ne correspondent pas')
      return
    }
    const rateBp = Math.round(Number(taxRate || '0') * 100)
    if (taxEnabled && (!Number.isFinite(rateBp) || rateBp < 0 || rateBp > 10000)) {
      setLocalError(language === 'ar' ? 'نسبة ضريبة غير صالحة' : 'Taux de TVA invalide')
      return
    }
    setBusy(true)
    try {
      const session = await api.completeSetup({
        restaurantName: restaurantName.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        currency: currency.trim().toUpperCase() || 'DZD',
        language,
        taxEnabled,
        taxRateBp: taxEnabled ? rateBp : 0,
        ownerFullName: ownerFullName.trim(),
        ownerUsername: ownerUsername.trim(),
        ownerPassword
      })
      setUser(session)
      const settings = await api.getSettings()
      setSettings(settings)
      await onComplete()
      navigate('/')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'UNKNOWN')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-brand-950 p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-xs font-black ring-1 ring-white/20">
              AF
            </div>
            <div>
              <p className="text-sm font-bold">AFUS Restaurant</p>
              <p className="text-[10px] uppercase tracking-wider text-brand-300">First-run setup</p>
            </div>
          </div>
          <button
            onClick={() => setLanguage(language === 'ar' ? 'fr' : 'ar')}
            className="rounded-lg border border-white/20 px-2.5 py-1 text-xs font-bold text-white/80 hover:bg-white/10"
          >
            {language === 'ar' ? 'FR' : 'ع'}
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
          <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
              <span className={step === 1 ? 'text-brand-700' : ''}>1. {t('setup.restaurant')}</span>
              <span>/</span>
              <span className={step === 2 ? 'text-brand-700' : ''}>2. {t('setup.owner')}</span>
            </div>
            <h1 className="mt-1.5 text-xl font-bold text-slate-900 dark:text-white">
              {step === 1 ? t('setup.title') : t('setup.ownerTitle')}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('setup.subtitle')}</p>
          </div>

          {step === 1 ? (
            <div className="space-y-4 px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('settings.restaurantName')} required className="sm:col-span-2">
                  <Input value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} autoFocus />
                </Field>
                <Field label={t('settings.phone')}>
                  <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
                </Field>
                <Field label={t('settings.currency')}>
                  <Select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                    <option value="DZD">DZD — Dinar Algérien</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="USD">USD — Dollar</option>
                    <option value="MAD">MAD — Dirham</option>
                    <option value="TND">TND — Dinar Tunisien</option>
                  </Select>
                </Field>
                <Field label={t('settings.address')} className="sm:col-span-2">
                  <Input value={address} onChange={(event) => setAddress(event.target.value)} />
                </Field>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={taxEnabled}
                    onChange={(event) => setTaxEnabled(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {t('settings.taxEnabled')}
                    </span>
                    <span className="block text-xs text-slate-500">{t('settings.taxHint')}</span>
                  </span>
                </label>
                {taxEnabled ? (
                  <div className="mt-3 flex items-center gap-2 ps-7">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={taxRate}
                      onChange={(event) => setTaxRate(event.target.value)}
                      className="w-28"
                    />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                ) : null}
              </div>

              {localError ? <p className="text-xs font-medium text-red-600">{localError}</p> : null}
              <div className="flex justify-end gap-2 pt-1">
                <Button onClick={next}>{t('common.next')}</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4 px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('setup.ownerName')} required>
                  <Input value={ownerFullName} onChange={(event) => setOwnerFullName(event.target.value)} autoFocus />
                </Field>
                <Field label={t('setup.ownerUsername')} required>
                  <Input
                    value={ownerUsername}
                    onChange={(event) => setOwnerUsername(event.target.value)}
                    autoComplete="username"
                  />
                </Field>
                <Field label={t('setup.ownerPassword')} required hint={t('auth.passwordHint')}>
                  <Input
                    type="password"
                    value={ownerPassword}
                    onChange={(event) => setOwnerPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label={t('common.confirm')} required>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-brand-50 px-4 py-3 text-xs text-brand-800 dark:bg-brand-900/30 dark:text-brand-200">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{t('setup.securityNote')}</p>
              </div>

              {localError ? <p className="text-xs font-medium text-red-600">{localError}</p> : null}
              {error ? <p className="text-xs font-medium text-red-600">{errorText(language, error)}</p> : null}

              <div className="flex justify-between gap-2 pt-1">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  {t('common.back')}
                </Button>
                <Button type="submit" loading={busy}>
                  {t('setup.finish')}
                </Button>
              </div>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-brand-300/70">
          {centsToInput(0) && toCents('0') === 0 ? t('setup.localOnly') : ''}
        </p>
      </div>
    </div>
  )
}
