import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { ArrowLeft } from 'lucide-react'
import type { LoginProfile } from '@shared/types'
import { api } from '../lib/api'
import { localized, useT } from '../i18n'
import { AfusMark } from '../components/AfusLogo'
import { TitleBar } from '../components/TitleBar'
import { PinPad } from '../components/NumPad'
import { Spinner } from '../components/ui'

export default function LoginPage({ onLogin }: { onLogin: () => Promise<void> }) {
  const { t, language, setLanguage } = useT()
  const [profiles, setProfiles] = useState<LoginProfile[]>([])
  const [restaurantName, setRestaurantName] = useState('')
  const [selected, setSelected] = useState<LoginProfile | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [list, status] = await Promise.all([api.listForLogin(), api.setupStatus()])
        setProfiles(list)
        setRestaurantName(status.restaurantName || t('app.name'))
      } catch {
        /* leave empty; the screen still renders */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (entered: string) => {
    if (!selected || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.verifyPin({ id: selected.id, pin: entered })
      await onLogin()
    } catch {
      setError(t('login.invalidPin'))
      setPin('')
      setBusy(false)
    }
  }

  const poweredBy = (
    <div className="flex flex-none items-center justify-center gap-2 py-4 text-xs text-ink-500">
      <AfusMark className="h-4 w-4 rounded" />
      <span>{t('login.poweredBy', { app: t('app.name') })}</span>
    </div>
  )

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

      {selected ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
          <div className="w-full max-w-md animate-scale-in">
            <button
              onClick={() => {
                setSelected(null)
                setPin('')
                setError(null)
              }}
              className="mb-4 flex items-center gap-2 text-sm text-ink-400 transition hover:text-ink-700 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 flip-rtl" /> {t('login.back')}
            </button>
            <div className="afus-card overflow-hidden">
              <div className="flex flex-col items-center gap-2 border-b border-ink-100 bg-ink-50/60 p-6 text-center dark:border-ink-800 dark:bg-ink-800/30">
                <div className="flex h-20 w-20 items-center justify-center rounded-full gradient-primary text-3xl font-bold text-white shadow-lg">
                  {selected.fullName.charAt(0)}
                </div>
                <h2 className="max-w-full truncate text-xl font-bold text-ink-900 dark:text-white">{selected.fullName}</h2>
                <p className="text-sm text-ink-500">{localized(language, selected.roleLabel)}</p>
              </div>
              <div className="p-6">
                <p className="mb-5 text-center text-sm text-ink-500">{t('login.enterPin')}</p>
                <PinPad value={pin} onChange={setPin} onEnter={submit} disabled={busy} />
                <div className="mt-4 h-5 text-center text-sm font-medium text-red-500">
                  {busy ? <Spinner size="sm" /> : error}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 w-fit">
              <AfusMark className="h-20 w-20 rounded-2xl shadow-lg ring-1 ring-black/5" title={restaurantName} />
            </div>
            <h1 className="mb-1 break-words text-3xl font-bold text-ink-900 dark:text-white">{restaurantName || t('app.name')}</h1>
            <p className="text-ink-500">{t('login.selectProfile')}</p>
          </div>

          {profiles.length === 0 ? (
            <div className="py-10 text-center">
              <p className="mb-1 text-ink-500">{t('login.noEmployees')}</p>
              <p className="text-sm text-ink-400">{t('login.noEmployeesHint')}</p>
            </div>
          ) : (
            <div className="flex max-w-4xl flex-wrap justify-center gap-4">
              {profiles.map((profile, index) => (
                <button
                  key={profile.id}
                  onClick={() => {
                    setSelected(profile)
                    setPin('')
                    setError(null)
                  }}
                  style={{ animationDelay: `${Math.min(index * 40, 320)}ms` }}
                  className="group afus-card w-[11.5rem] animate-table-pop p-6 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-glow"
                >
                  <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-ink-100 text-2xl font-semibold text-ink-500 transition-colors group-hover:bg-brand-600 group-hover:text-white dark:bg-ink-800">
                    {profile.fullName.charAt(0)}
                  </div>
                  <p className="truncate font-semibold text-ink-800 dark:text-ink-100" title={profile.fullName}>
                    {profile.fullName}
                  </p>
                  <p className="text-xs text-ink-500">{localized(language, profile.roleLabel)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <p className={clsx('flex items-center justify-center gap-1.5 text-[11px] text-ink-400', 'pb-1')}>
        <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
        {t('app.offline')}
      </p>
      {poweredBy}
    </div>
  )
}
