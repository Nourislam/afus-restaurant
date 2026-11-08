import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Languages,
  Percent,
  Store,
  User,
  UtensilsCrossed,
  WifiOff
} from 'lucide-react'
import { api } from '../lib/api'
import { errorText, useT } from '../i18n'
import { useAppStore } from '../store/app'
import { AfusMark } from '../components/AfusLogo'
import { TitleBar } from '../components/TitleBar'
import { Button, Field, Input } from '../components/ui'

type StepId = 'language' | 'restaurant' | 'admin' | 'tax' | 'done'
const STEPS: { id: StepId; title: string; icon: typeof Store }[] = [
  { id: 'language', title: 'setup.step.language', icon: Languages },
  { id: 'restaurant', title: 'setup.step.restaurant', icon: Store },
  { id: 'admin', title: 'setup.step.admin', icon: User },
  { id: 'tax', title: 'setup.step.tax', icon: Percent },
  { id: 'done', title: 'setup.step.done', icon: Check }
]

const LANGS: { value: 'ar' | 'fr'; label: string }[] = [
  { value: 'ar', label: 'العربية' },
  { value: 'fr', label: 'Français' }
]

export default function SetupPage({ onComplete }: { onComplete: () => Promise<void> }) {
  const { t, language, setLanguage } = useT()
  const setSettings = useAppStore((state) => state.setSettings)
  const setUser = useAppStore((state) => state.setUser)
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const [restaurantName, setRestaurantName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [ownerFullName, setOwnerFullName] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [taxRate, setTaxRate] = useState('19')

  const onlyDigits = (value: string) => value.replace(/\D/g, '').slice(0, 4)

  const validate = (index: number): boolean => {
    setLocalError(null)
    const id = STEPS[index]?.id
    if (id === 'restaurant' && !restaurantName.trim()) {
      setLocalError(t('setup.nameRequired'))
      return false
    }
    if (id === 'admin') {
      if (!ownerFullName.trim()) {
        setLocalError(t('setup.adminNameRequired'))
        return false
      }
      if (!/^\d{4}$/.test(pin)) {
        setLocalError(t('setup.pinFormat'))
        return false
      }
      if (pin !== confirmPin) {
        setLocalError(t('setup.pinMismatch'))
        return false
      }
    }
    return true
  }

  const saveAll = async () => {
    setBusy(true)
    setError(null)
    try {
      const rateBp = Math.round(Number(taxRate || '0') * 100)
      const session = await api.completeSetup({
        restaurantName: restaurantName.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        currency: 'DZD',
        language,
        taxEnabled,
        taxRateBp: taxEnabled ? Math.max(0, Math.min(10000, rateBp)) : 0,
        ownerFullName: ownerFullName.trim(),
        ownerPin: pin
      })
      setUser(session)
      setSettings(await api.getSettings())
      setStep(STEPS.length - 1)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'UNKNOWN')
    } finally {
      setBusy(false)
    }
  }

  const handleNext = async () => {
    if (!validate(step)) return
    // suggest the owner name from the restaurant? keep it empty — they type it.
    if (step === STEPS.length - 2) await saveAll()
    else setStep((value) => value + 1)
  }

  const isLast = step === STEPS.length - 1
  const currentId = STEPS[step]?.id

  return (
    <div className="flex h-full flex-col bg-ink-100 dark:bg-ink-950" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <TitleBar bare>
        <button
          onClick={() => setLanguage(language === 'ar' ? 'fr' : 'ar')}
          className="rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-bold text-ink-600 transition hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
        >
          {language === 'ar' ? 'FR' : 'ع'}
        </button>
      </TitleBar>

      <div className="flex min-h-0 flex-1 justify-center p-4 lg:p-6">
        <div className="flex min-h-0 w-full max-w-5xl flex-col gap-4 lg:h-[min(44rem,100%)] lg:flex-row lg:gap-6">
          {/* Step rail */}
          <aside className="afus-card flex flex-none flex-col gap-5 p-4 lg:w-60 lg:p-5">
            <div className="flex items-center gap-3">
              <AfusMark className="h-10 w-10 rounded-xl" title={t('app.name')} />
              <div className="hidden min-w-0 sm:block">
                <p className="truncate font-bold leading-tight text-ink-900 dark:text-white">{t('app.name')}</p>
                <p className="text-xs text-ink-500">{t('app.tagline')}</p>
              </div>
            </div>
            <ol className="flex flex-1 items-center justify-center gap-1.5 lg:flex-col lg:items-stretch lg:justify-start lg:gap-1">
              {STEPS.map((s, index) => {
                const StepIcon = s.icon
                const active = index === step
                const done = index < step
                return (
                  <li
                    key={s.id}
                    className={`flex items-center gap-3 rounded-xl lg:px-3 lg:py-2 ${active ? 'lg:bg-brand-600/10' : ''}`}
                  >
                    <span
                      className={`flex h-8 w-8 flex-none items-center justify-center rounded-full transition-all ${
                        done
                          ? 'bg-accent-500 text-white'
                          : active
                            ? 'bg-brand-600 text-white ring-4 ring-brand-600/25'
                            : 'bg-ink-200 text-ink-500 dark:bg-ink-800'
                      }`}
                    >
                      {done ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                    </span>
                    <span
                      className={`hidden truncate text-sm lg:block ${
                        active ? 'font-semibold text-ink-900 dark:text-white' : done ? 'text-ink-600 dark:text-ink-300' : 'text-ink-400'
                      }`}
                    >
                      {t(s.title)}
                    </span>
                  </li>
                )
              })}
            </ol>
            <p className="hidden items-start gap-2 text-xs leading-relaxed text-ink-500 lg:flex">
              <WifiOff className="mt-0.5 h-4 w-4 flex-none" />
              {t('setup.offline')}
            </p>
          </aside>

          {/* Step content */}
          <section className="afus-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden !p-0">
            <div
              key={step}
              className={`flex-1 animate-fade-in overflow-y-auto p-5 xl:p-8 ${
                currentId === 'language' || currentId === 'done' ? 'flex flex-col justify-center' : ''
              }`}
            >
              <p className="mb-2 text-xs font-medium text-brand-600 lg:hidden">
                {t('setup.stepOf', { n: step + 1, total: STEPS.length })}
              </p>

              {currentId === 'language' && (
                <div>
                  <h2 className="mb-2 text-3xl font-bold text-ink-900 dark:text-white">{t('setup.welcome', { app: t('app.name') })}</h2>
                  <p className="mb-8 text-lg text-ink-500">{t('setup.welcomeText')}</p>
                  <p className="afus-label">{t('setup.chooseLanguage')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {LANGS.map((l) => (
                      <button
                        key={l.value}
                        type="button"
                        onClick={() => setLanguage(l.value)}
                        className={`rounded-xl border-2 py-4 text-lg font-semibold transition-all ${
                          language === l.value
                            ? 'border-brand-600 bg-brand-600/10 text-ink-900 dark:text-white'
                            : 'border-ink-200 text-ink-500 hover:border-ink-400 dark:border-ink-700'
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {currentId === 'restaurant' && (
                <div>
                  <h2 className="mb-1 text-2xl font-bold text-ink-900 dark:text-white">{t('setup.restaurantTitle')}</h2>
                  <p className="mb-5 text-sm text-ink-500">{t('setup.restaurantText')}</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('settings.restaurantName')} required className="sm:col-span-2">
                      <Input value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} placeholder={t('setup.restaurantNamePlaceholder')} autoFocus />
                    </Field>
                    <Field label={t('setup.phone')}>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="ltr" />
                    </Field>
                    <Field label={t('setup.address')}>
                      <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                    </Field>
                  </div>
                </div>
              )}

              {currentId === 'admin' && (
                <div>
                  <h2 className="mb-1 text-2xl font-bold text-ink-900 dark:text-white">{t('setup.adminTitle')}</h2>
                  <p className="mb-5 text-sm text-ink-500">{t('setup.adminText')}</p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label={t('setup.ownerName')} required className="sm:col-span-3">
                      <Input value={ownerFullName} onChange={(e) => setOwnerFullName(e.target.value)} placeholder={t('setup.adminNamePlaceholder')} autoFocus />
                    </Field>
                    <Field label={t('setup.pin')} required>
                      <Input type="password" inputMode="numeric" className="ltr tracking-[0.5em]" value={pin} onChange={(e) => setPin(onlyDigits(e.target.value))} />
                    </Field>
                    <Field label={t('setup.confirmPin')} required>
                      <Input type="password" inputMode="numeric" className="ltr tracking-[0.5em]" value={confirmPin} onChange={(e) => setConfirmPin(onlyDigits(e.target.value))} />
                    </Field>
                  </div>
                </div>
              )}

              {currentId === 'tax' && (
                <div>
                  <h2 className="mb-1 text-2xl font-bold text-ink-900 dark:text-white">{t('setup.taxTitle')}</h2>
                  <div className="mb-4 mt-3 rounded-lg bg-ink-100 px-4 py-3 text-sm dark:bg-ink-800">
                    <span className="text-ink-500">{t('settings.currency')} : </span>
                    <span className="font-semibold text-ink-800 dark:text-ink-100">{t('setup.currencyDzd')}</span>
                  </div>
                  <p className="mb-4 text-sm text-ink-500">{t('setup.taxText')}</p>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} className="h-4 w-4 rounded border-ink-300 text-brand-600" />
                    <span className="text-sm font-semibold text-ink-800 dark:text-ink-100">{t('setup.taxEnable')}</span>
                  </label>
                  {taxEnabled && (
                    <div className="mt-3 w-40">
                      <Field label={t('setup.taxRate')}>
                        <Input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="ltr" />
                      </Field>
                    </div>
                  )}
                </div>
              )}

              {currentId === 'done' && (
                <div className="text-center">
                  <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-2xl gradient-primary shadow-lg">
                    <UtensilsCrossed className="h-12 w-12 text-white" />
                  </div>
                  <h2 className="mb-3 text-3xl font-bold text-ink-900 dark:text-white">{t('setup.ready', { shop: restaurantName })}</h2>
                  <p className="mx-auto mb-6 max-w-md text-lg text-ink-500">{t('setup.readyText')}</p>
                  <div className="mx-auto max-w-sm rounded-xl bg-ink-100 p-5 text-start text-sm dark:bg-ink-800/50">
                    <div className="flex justify-between gap-4 py-1"><span className="text-ink-500">{t('setup.step.admin')}</span><span className="font-semibold">{ownerFullName}</span></div>
                    <div className="flex justify-between gap-4 py-1"><span className="text-ink-500">{t('settings.language')}</span><span className="font-semibold">{LANGS.find((l) => l.value === language)?.label}</span></div>
                    <div className="flex justify-between gap-4 py-1"><span className="text-ink-500">{t('settings.currency')}</span><span className="font-semibold">DZD</span></div>
                  </div>
                </div>
              )}

              {localError ? <p className="mt-4 text-sm font-medium text-red-500">{localError}</p> : null}
              {error ? <p className="mt-4 text-sm font-medium text-red-500">{errorText(language, error)}</p> : null}
            </div>

            <div className="flex flex-none items-center justify-between gap-3 border-t border-ink-200 bg-ink-50/50 px-5 py-3.5 dark:border-ink-800 dark:bg-ink-800/30 xl:px-8">
              <div>
                {step > 0 && !isLast && (
                  <Button variant="secondary" size="lg" onClick={() => setStep((v) => v - 1)}>
                    <ChevronLeft className="h-5 w-5 flip-rtl" />
                    {t('common.back')}
                  </Button>
                )}
              </div>
              <span className="hidden text-xs text-ink-400 sm:block">{t('setup.stepOf', { n: step + 1, total: STEPS.length })}</span>
              {!isLast ? (
                <Button size="lg" onClick={handleNext} loading={busy} className="min-w-[10rem] justify-center">
                  {step === STEPS.length - 2 ? t('common.finish') : t('common.next')}
                  <ChevronRight className="h-5 w-5 flip-rtl" />
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="min-w-[10rem] justify-center"
                  onClick={async () => {
                    await onComplete()
                    navigate('/')
                  }}
                >
                  {t('setup.start')}
                  <ChevronRight className="h-5 w-5 flip-rtl" />
                </Button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
