import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  BookOpen,
  ChevronDown,
  Flame,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Moon,
  ReceiptText,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingCart,
  Sun,
  UtensilsCrossed,
  X,
  type LucideIcon
} from 'lucide-react'
import type { Permission } from '@shared/permissions'
import { api } from '../lib/api'
import { useAppStore } from '../store/app'
import { localized, useT } from '../i18n'
import { formatDate, todayString } from '../lib/format'
import { AfusBrand, AfusMark } from './AfusLogo'
import { Button, Field, Input, Modal, Spinner } from './ui'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  permission?: Permission | Permission[]
  exact?: boolean
}

function canSee(permissions: readonly string[], required?: Permission | Permission[]): boolean {
  if (!required) return true
  const list = Array.isArray(required) ? required : [required]
  return list.some((permission) => permissions.includes(permission))
}

export function AppShell() {
  const { t, language } = useT()
  const user = useAppStore((state) => state.user)
  const settings = useAppStore((state) => state.settings)
  const reset = useAppStore((state) => state.reset)
  const languageStore = useAppStore((state) => state.language)
  const setLanguage = useAppStore((state) => state.setLanguage)
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const setSettings = useAppStore((state) => state.setSettings)
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const permissions = user?.permissions ?? []
  const canManage = permissions.includes('settings.manage')
  /* Simple mode (Afus parity): floor staff see only the operational screens, not
     the management/settings sections. Managers always see everything. */
  const simpleMode = settings?.uiMode === 'simple' && !canManage

  const toggleUiMode = async () => {
    const next = settings?.uiMode === 'simple' ? 'full' : 'simple'
    try {
      const updated = await api.updateSettings({ uiMode: next })
      setSettings(updated)
    } catch {
      /* ignore */
    }
  }
  const operations: NavItem[] = [
    { to: '/', label: t('nav.dashboard'), icon: LayoutDashboard, permission: 'dashboard.view', exact: true },
    { to: '/pos', label: t('nav.pos'), icon: ShoppingCart, permission: 'pos.use' },
    { to: '/tables', label: t('nav.tables'), icon: UtensilsCrossed, permission: ['tables.manage', 'pos.use'] },
    { to: '/kitchen', label: t('nav.kitchen'), icon: Flame, permission: 'kitchen.view' },
    { to: '/orders', label: t('nav.orders'), icon: ReceiptText, permission: 'orders.view' }
  ]
  const management: NavItem[] = [
    { to: '/menu', label: t('nav.menu'), icon: BookOpen, permission: 'menu.view' },
    { to: '/employees', label: t('nav.employees'), icon: ShieldCheck, permission: 'employees.manage' }
  ]
  const system: NavItem[] = [
    { to: '/settings', label: t('nav.settings'), icon: SettingsIcon, permission: 'settings.manage' }
  ]

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [language, theme])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const handleLogout = async () => {
    try {
      await api.logout()
    } finally {
      reset()
      navigate('/')
    }
  }

  const renderSection = (title: string, items: NavItem[]) => {
    const visible = items.filter((item) => canSee(permissions, item.permission))
    if (visible.length === 0) return null
    return (
      <div className="mb-5">
        <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">{title}</p>
        <nav className="space-y-0.5">
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'group/nav relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150',
                  isActive
                    ? 'bg-brand-700/18 font-semibold text-white'
                    : 'text-white/60 hover:bg-white/[0.07] hover:text-white'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={clsx(
                      'absolute inset-y-1.5 start-0 w-1 rounded-full bg-brand-600 transition-all duration-200',
                      isActive ? 'opacity-100' : 'opacity-0 group-hover/nav:opacity-40'
                    )}
                  />
                  <item.icon
                    className={clsx(
                      'h-4 w-4 shrink-0 transition-colors',
                      isActive ? 'text-brand-300' : 'opacity-80 group-hover/nav:opacity-100'
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <aside
        className={clsx(
          'fixed inset-y-0 z-40 flex w-64 flex-col border-e border-white/5 bg-ink-950 text-white transition-transform lg:static lg:translate-x-0',
          'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-40 before:bg-[radial-gradient(120%_80%_at_50%_0%,rgba(99,102,241,0.14),transparent)]',
          language === 'ar' ? 'right-0' : 'left-0',
          mobileOpen ? 'translate-x-0' : language === 'ar' ? 'translate-x-full' : '-translate-x-full'
        )}
      >
        <div className="relative flex items-center gap-3 px-4 py-5 titlebar-drag">
          <AfusBrand name={settings?.restaurantName || t('app.name')} subtitle={t('app.tagline')} tone="dark" size="sm" className="flex-1 titlebar-no-drag" />
          <button className="rounded p-1 text-white/60 titlebar-no-drag lg:hidden" onClick={() => setMobileOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 px-2 pb-4">
          {renderSection(t('nav.operations'), operations)}
          {simpleMode ? null : renderSection(t('nav.management'), management)}
          {simpleMode ? null : renderSection(t('nav.settings'), system)}
        </div>

        <div className="border-t border-white/10 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11px] text-white/60">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
            {t('app.offline')}
          </p>
          <p className="mt-1 text-[10px] text-white/35">v1.0 · AFUS</p>
        </div>
      </aside>

      {mobileOpen ? <div className="fixed inset-0 z-30 bg-ink-950/50 lg:hidden" onClick={() => setMobileOpen(false)} /> : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="titlebar-drag flex h-14 shrink-0 items-center gap-2 border-b border-ink-200 bg-white/90 px-4 backdrop-blur dark:border-ink-800 dark:bg-ink-900/80">
          <button
            className="titlebar-no-drag rounded-lg p-2 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <MenuIcon className="h-5 w-5" />
          </button>

          <div className="hidden items-center gap-2 text-xs text-ink-400 sm:flex">
            <span className="font-medium text-ink-600 dark:text-ink-300">{formatDate(todayString())}</span>
            <span>·</span>
            <span>{new Date().toLocaleTimeString(language === 'ar' ? 'ar-DZ' : 'fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          <div className="titlebar-no-drag ms-auto flex items-center gap-1.5">
            {canManage ? (
              <button
                onClick={() => void toggleUiMode()}
                className={clsx(
                  'rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition',
                  settings?.uiMode === 'simple'
                    ? 'border-brand-600/40 bg-brand-600/10 text-brand-700 dark:text-brand-300'
                    : 'border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800'
                )}
                title={settings?.uiMode === 'simple' ? t('mode.full') : t('mode.simple')}
              >
                {settings?.uiMode === 'simple' ? t('mode.simple') : t('mode.full')}
              </button>
            ) : null}
            <button
              onClick={() => setLanguage(languageStore === 'ar' ? 'fr' : 'ar')}
              className="rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-bold text-ink-600 transition hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
              title={t('setup.language')}
            >
              {languageStore === 'ar' ? 'FR' : 'ع'}
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="rounded-lg p-2 text-ink-500 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
              title={t('settings.theme')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((value) => !value)}
                className="flex items-center gap-2 rounded-lg border border-ink-200 px-2 py-1.5 transition hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-700 text-[10px] font-bold text-white">
                  {user?.fullName?.slice(0, 2).toUpperCase()}
                </span>
                <span className="hidden text-start sm:block">
                  <span className="block max-w-[120px] truncate text-xs font-semibold text-ink-700 dark:text-ink-200">
                    {user?.fullName}
                  </span>
                  <span className="block text-[10px] text-ink-400">{user ? localized(language, user.roleLabel) : ''}</span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
              </button>
              {menuOpen ? (
                <div className="absolute end-0 z-40 mt-1 w-52 rounded-lg border border-ink-200 bg-white p-1 shadow-lg dark:border-ink-700 dark:bg-ink-900">
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800"
                    onClick={() => {
                      setPasswordOpen(true)
                      setMenuOpen(false)
                    }}
                  >
                    <SettingsIcon className="h-3.5 w-3.5" />
                    {t('auth.changePin')}
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    {t('auth.logout')}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <div key={location.pathname} className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  )
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
          <Button onClick={submit} loading={busy}>
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
    <div className="flex h-full items-center justify-center bg-ink-950 text-white">
      <div className="flex flex-col items-center gap-4">
        <AfusMark className="h-14 w-14 rounded-2xl shadow-lg" />
        <p className="text-sm font-semibold tracking-wide">AFUS Restaurant</p>
        <div className="flex items-center gap-2 text-xs text-white/60">
          <Spinner size="sm" />
          {message ?? '…'}
        </div>
      </div>
    </div>
  )
}
