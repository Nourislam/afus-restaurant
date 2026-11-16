import { useCallback, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell, SplashScreen } from './components/layout'
import { Button } from './components/ui'
import { ApiError, api } from './lib/api'
import { useAppStore } from './store/app'
import { errorText, useT } from './i18n'
import Dashboard from './pages/Dashboard'
import Tables from './pages/Tables'
import Menu from './pages/Menu'
import Employees from './pages/Employees'
import Settings from './pages/Settings'
import LoginPage from './pages/Login'
import SetupPage from './pages/Setup'
import Pos from './pages/Pos'
import Kitchen from './pages/Kitchen'
import Orders from './pages/Orders'
import OrderDetail from './pages/OrderDetail'
import Website from './pages/Website'
import Customers from './pages/Customers'
import Inventory from './pages/Inventory'
import Recipes from './pages/Recipes'
import Purchases from './pages/Purchases'
import Reservations from './pages/Reservations'
import Delivery from './pages/Delivery'
import Finance from './pages/Finance'
import Reports from './pages/Reports'
import Insight from './pages/Insight'
import Offers from './pages/Offers'
import Invoices from './pages/Invoices'
import CustomerDisplay from './pages/CustomerDisplay'
import { HomeRedirect, Protected } from './components/Protected'
import { homePathFor, permissionFor } from './lib/navigation'

type Phase = 'loading' | 'setup' | 'login' | 'ready' | 'error'

export default function App() {
  const { t, language } = useT()
  const theme = useAppStore((state) => state.theme)
  const user = useAppStore((state) => state.user)
  const setUser = useAppStore((state) => state.setUser)
  const setSettings = useAppStore((state) => state.setSettings)
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)

  const bootstrap = useCallback(async () => {
    setPhase('loading')
    setError(null)
    try {
      const status = await api.setupStatus()
      if (!status.initialized) {
        setPhase('setup')
        return
      }
      /* Ask for the session first: settings.get needs authentication, so calling it while
         logged out (app restarted, session is in-memory only) returns UNAUTHENTICATED and
         would strand the app on the error screen instead of showing the login form. */
      const session = await api.me()
      setUser(session)
      if (!session) {
        setPhase('login')
        return
      }
      setSettings(await api.getSettings())
      setPhase('ready')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.code : 'INTERNAL')
      setPhase('error')
    }
  }, [setSettings, setUser])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const refreshSession = useCallback(async () => {
    const session = await api.me()
    setUser(session)
    if (!session) {
      setPhase('login')
      return
    }
    setSettings(await api.getSettings())
    /* A cook has no dashboard: send them where they can actually work, rather
       than to a screen that answers them with a refusal. The router keeps its
       own location, so it has to be told the address changed. */
    window.history.replaceState({}, '', homePathFor(session.permissions))
    window.dispatchEvent(new PopStateEvent('popstate'))
    setPhase('ready')
  }, [setSettings, setUser])

  /* The session can end from anywhere — the menu's Logout, or an account that
     was disabled while it was open. Whatever ends it, the program must come
     back to the login screen instead of staying in a shell with nobody in it. */
  useEffect(() => {
    if (phase === 'ready' && !user) setPhase('login')
  }, [phase, user])

  if (phase === 'loading') return <SplashScreen message={t('common.loading')} />

  if (phase === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-ink-100 p-8 text-center text-ink-800 dark:bg-ink-950 dark:text-white">
        <p className="text-sm font-semibold">{errorText(language, error ?? 'INTERNAL')}</p>
        <Button onClick={() => void bootstrap()}>{t('common.retry')}</Button>
      </div>
    )
  }

  if (phase === 'setup') return <SetupPage onComplete={refreshSession} />
  if (phase === 'login') return <LoginPage onLogin={refreshSession} />

  return (
    <div className="h-full" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <Routes>
        {/* Its own window, with no menu and no title bar. */}
        <Route path="/customer-display" element={<CustomerDisplay />} />
        <Route element={<AppShell />}>
          {/* Generated from the one navigation list, so a screen can never be
              offered in the menu and left unguarded, or the reverse. */}
          <Route path="/" element={<Protected permission={permissionFor('/')}><Dashboard /></Protected>} />
          <Route path="/pos" element={<Protected permission={permissionFor('/pos')}><Pos /></Protected>} />
          <Route path="/tables" element={<Protected permission={permissionFor('/tables')}><Tables /></Protected>} />
          <Route path="/kitchen" element={<Protected permission={permissionFor('/kitchen')}><Kitchen /></Protected>} />
          <Route path="/orders" element={<Protected permission={permissionFor('/orders')}><Orders /></Protected>} />
          <Route path="/orders/:id" element={<Protected permission={permissionFor('/orders/:id')}><OrderDetail /></Protected>} />
          <Route path="/reservations" element={<Protected permission={permissionFor('/reservations')}><Reservations /></Protected>} />
          <Route path="/delivery" element={<Protected permission={permissionFor('/delivery')}><Delivery /></Protected>} />
          <Route path="/menu" element={<Protected permission={permissionFor('/menu')}><Menu /></Protected>} />
          <Route path="/recipes" element={<Protected permission={permissionFor('/recipes')}><Recipes /></Protected>} />
          <Route path="/inventory" element={<Protected permission={permissionFor('/inventory')}><Inventory /></Protected>} />
          <Route path="/purchases" element={<Protected permission={permissionFor('/purchases')}><Purchases /></Protected>} />
          <Route path="/customers" element={<Protected permission={permissionFor('/customers')}><Customers /></Protected>} />
          <Route path="/offers" element={<Protected permission={permissionFor('/offers')}><Offers /></Protected>} />
          <Route path="/invoices" element={<Protected permission={permissionFor('/invoices')}><Invoices /></Protected>} />
          <Route path="/finance" element={<Protected permission={permissionFor('/finance')}><Finance /></Protected>} />
          <Route path="/reports" element={<Protected permission={permissionFor('/reports')}><Reports /></Protected>} />
          <Route path="/insight" element={<Protected permission={permissionFor('/insight')}><Insight /></Protected>} />
          <Route path="/website" element={<Protected permission={permissionFor('/website')}><Website /></Protected>} />
          <Route path="/employees" element={<Protected permission={permissionFor('/employees')}><Employees /></Protected>} />
          <Route path="/settings" element={<Protected permission={permissionFor('/settings')}><Settings /></Protected>} />
          {/* Anywhere else sends the person to a screen they can actually open. */}
          <Route path="*" element={<HomeRedirect />} />
        </Route>
      </Routes>
    </div>
  )
}
