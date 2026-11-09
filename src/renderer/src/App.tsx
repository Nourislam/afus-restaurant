import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
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

type Phase = 'loading' | 'setup' | 'login' | 'ready' | 'error'

export default function App() {
  const { t, language } = useT()
  const theme = useAppStore((state) => state.theme)
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
    setPhase('ready')
  }, [setSettings, setUser])

  if (phase === 'loading') return <SplashScreen message={t('common.loading')} />

  if (phase === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-ink-950 p-8 text-center text-white">
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
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tables" element={<Tables />} />
          <Route path="/pos" element={<Pos />} />
          <Route path="/kitchen" element={<Kitchen />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/website" element={<Website />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </div>
  )
}
