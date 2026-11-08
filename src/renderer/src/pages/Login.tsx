import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, KeyRound, UserCircle } from 'lucide-react'
import { api } from '../lib/api'
import { errorText, useT } from '../i18n'
import { Button, Field, Input } from '../components/ui'

export default function LoginPage({ onLogin }: { onLogin: () => Promise<void> }) {
  const { t, language, setLanguage } = useT()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api.login({ username: username.trim(), password })
      await onLogin()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'UNKNOWN')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-brand-900 p-10 text-white lg:flex">
        <div className="absolute -end-24 -top-24 h-72 w-72 rounded-full bg-brand-700/40 blur-2xl" />
        <div className="absolute -bottom-32 -start-16 h-80 w-80 rounded-full bg-brand-800/60 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-sm font-black ring-1 ring-white/20">
              AF
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">AFUS Restaurant</p>
              <p className="text-xs text-brand-200">Smart Restaurant Management</p>
            </div>
          </div>
        </div>
        <div className="relative space-y-5">
          <h2 className="max-w-sm text-3xl font-bold leading-snug">
            {language === 'ar' ? 'إدارة مطعمك بالكامل، دون إنترنت.' : 'Gérez tout votre restaurant, sans internet.'}
          </h2>
          <ul className="space-y-2.5 text-sm text-brand-100/90">
            {(language === 'ar'
              ? ['نقطة بيع سريعة وشاشة مطبخ', 'مخزون ووصفات بتكلفة دقيقة', 'صندوق وتقارير مالية', 'نسخ احتياطي محلي آمن']
              : ['Caisse rapide et écran cuisine', 'Stock et recettes au coût réel', 'Caisse et rapports financiers', 'Sauvegarde locale sécurisée']
            ).map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[11px] text-brand-300/70">
          {language === 'ar' ? 'بياناتك تبقى على جهازك.' : 'Vos données restent sur votre machine.'}
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-900 text-xs font-black text-white">
                AF
              </div>
              <span className="text-sm font-bold">AFUS Restaurant</span>
            </div>
            <button
              onClick={() => setLanguage(language === 'ar' ? 'fr' : 'ar')}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-500 dark:border-slate-700"
            >
              {language === 'ar' ? 'FR' : 'ع'}
            </button>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('auth.loginTitle')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('auth.loginSubtitle')}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label={t('auth.username')}>
              <div className="relative">
                <UserCircle className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="ps-9"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoFocus
                  autoComplete="username"
                  required
                />
              </div>
            </Field>
            <Field label={t('auth.password')}>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="ps-9 pe-10"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                {errorText(language, error)}
              </div>
            ) : null}

            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {t('auth.login')}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {t('app.offline')}
            </span>
            <button
              onClick={() => setLanguage(language === 'ar' ? 'fr' : 'ar')}
              className="hidden font-semibold text-slate-500 hover:text-brand-700 lg:block"
            >
              {language === 'ar' ? 'Français' : 'العربية'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
