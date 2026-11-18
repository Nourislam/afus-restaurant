import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { KeyRound, Moon, Sun } from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore } from '../store/app'
import { useT } from '../i18n'
import { AfusMark } from './AfusLogo'
import { TitleBar } from './TitleBar'
import { DemoBar } from './DemoBar'
import { Sidebar, type NavItem } from './Sidebar'
import { NAV, type NavEntry } from '../lib/navigation'
import { ErrorBoundary } from './ErrorBoundary'
import { Button, Field, Input, Modal, Spinner } from './ui'

/** One 28px icon button in the window bar. */
function BarButton({
  label,
  onClick,
  active,
  children
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx(
        'inline-flex h-7 min-w-[1.75rem] items-center justify-center gap-1 rounded-md px-1.5 text-[11px] font-bold transition-colors',
        active
          ? 'bg-brand-600/15 text-brand-700 dark:text-brand-300'
          : 'text-ink-500 hover:bg-ink-200/70 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100'
      )}
    >
      {children}
    </button>
  )
}

export function AppShell() {
  const { t, language } = useT()
  const user = useAppStore((state) => state.user)
  const settings = useAppStore((state) => state.settings)
  const reset = useAppStore((state) => state.reset)
  const setLanguage = useAppStore((state) => state.setLanguage)
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const setSettings = useAppStore((state) => state.setSettings)
  const navigate = useNavigate()
  const location = useLocation()
  const [pinOpen, setPinOpen] = useState(false)

  const permissions = user?.permissions ?? []
  const canManage = permissions.includes('settings.manage')
  /* Simple mode (Afus parity): floor staff see only the operational screens. */
  const simpleMode = settings?.uiMode === 'simple' && !canManage

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [language, theme])

  const toggleUiMode = async () => {
    const next = settings?.uiMode === 'simple' ? 'full' : 'simple'
    try {
      setSettings(await api.updateSettings({ uiMode: next }))
    } catch {
      /* the switch stays as it was */
    }
  }

  const handleLogout = async () => {
    try {
      await api.logout()
    } finally {
      reset()
      navigate('/')
    }
  }

  /* One list for the menu and for the route guards, so a screen can never be
     offered here and refused there. In simple mode the floor staff see only
     the service block. */
  const groups = useMemo(() => {
    const of = (group: NavEntry['group']): NavItem[] =>
      NAV.filter((entry) => entry.group === group).map((entry) => ({
        to: entry.to,
        label: t(entry.labelKey),
        icon: entry.icon,
        permission: entry.permission,
        exact: entry.exact
      }))
    return simpleMode ? [of('service')] : [of('service'), of('backOffice'), of('figures')]
  }, [simpleMode, t])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-ink-100 dark:bg-ink-950">
      <DemoBar />
      <TitleBar>
        {canManage ? (
          <BarButton
            label={settings?.uiMode === 'simple' ? t('mode.full') : t('mode.simple')}
            onClick={() => void toggleUiMode()}
            active={settings?.uiMode === 'simple'}
          >
            {settings?.uiMode === 'simple' ? t('mode.simple') : t('mode.full')}
          </BarButton>
        ) : null}
        <BarButton label={t('setup.language')} onClick={() => setLanguage(language === 'ar' ? 'fr' : 'ar')}>
          {language === 'ar' ? 'FR' : 'ع'}
        </BarButton>
        <BarButton label={t('settings.theme')} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </BarButton>
        <BarButton label={t('auth.changePin')} onClick={() => setPinOpen(true)}>
          <KeyRound className="h-3.5 w-3.5" />
        </BarButton>
      </TitleBar>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          groups={groups}
          onLogout={() => void handleLogout()}
          footer={<p className="px-2.5 pt-1 text-[10px] text-ink-400 dark:text-white/30">v1.0 · AFUS</p>}
        />
        {/* The screen owns its own scrolling: the window never scrolls. */}
        <main className="page relative min-w-0 flex-1">
          <div key={location.pathname} className="page-body fade-in">
            {/* A fault on one screen must not blank the whole program. */}
            <ErrorBoundary
              resetKey={location.pathname}
              labels={{ title: t('errors.screenTitle'), hint: t('errors.screenHint'), retry: t('common.retry') }}
            >
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>

      <ChangePinModal open={pinOpen} onClose={() => setPinOpen(false)} />
    </div>
  )
}

function ChangePinModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const onlyPin = (value: string) => value.replace(/\D/g, '').slice(0, 4)

  useEffect(() => {
    if (!open) {
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
      setError(null)
      setDone(false)
    }
  }, [open])

  const submit = async () => {
    setError(null)
    if (!/^\d{4}$/.test(newPin)) {
      setError(t('setup.pinFormat'))
      return
    }
    if (newPin !== confirmPin) {
      setError(t('auth.pinMismatch'))
      return
    }
    setBusy(true)
    try {
      await api.changePin({ currentPin, newPin })
      setDone(true)
      setTimeout(onClose, 900)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ERROR')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('auth.changePin')}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('auth.currentPin')}>
          <Input type="password" inputMode="numeric" className="ltr tracking-[0.5em]" value={currentPin} onChange={(event) => setCurrentPin(onlyPin(event.target.value))} />
        </Field>
        <Field label={t('auth.newPin')} hint={t('auth.pinHint')}>
          <Input type="password" inputMode="numeric" className="ltr tracking-[0.5em]" value={newPin} onChange={(event) => setNewPin(onlyPin(event.target.value))} />
        </Field>
        <Field label={t('auth.confirmPin')}>
          <Input type="password" inputMode="numeric" className="ltr tracking-[0.5em]" value={confirmPin} onChange={(event) => setConfirmPin(onlyPin(event.target.value))} />
        </Field>
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
        {done ? <p className="text-xs font-medium text-accent-700">{t('auth.pinChanged')}</p> : null}
      </div>
    </Modal>
  )
}

export function SplashScreen({ message }: { message?: string }) {
  return (
    <div className="flex h-full flex-col bg-ink-100 dark:bg-ink-950">
      <TitleBar bare />
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <AfusMark className="h-14 w-14 rounded-2xl shadow-lg" />
          <p className="text-sm font-semibold tracking-wide text-ink-700 dark:text-ink-200">AFUS Restaurant</p>
          <div className="flex items-center gap-2 text-xs text-ink-400">
            <Spinner size="sm" />
            {message ?? '…'}
          </div>
        </div>
      </div>
    </div>
  )
}
