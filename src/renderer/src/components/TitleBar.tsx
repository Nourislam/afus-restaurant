import { useEffect, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { WifiOff } from 'lucide-react'
import { AfusMark } from './AfusLogo'
import { useT } from '../i18n'
import { formatDate, formatTime } from '../lib/format'

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

/**
 * Window bar, matching Afus Boutique/Hanout: the program's own mark at the
 * start, the date and time centred in the window whatever the language, and the
 * global switches at the end. The window buttons are the system's own, drawn
 * over this bar, so their space is kept free with a physical padding that does
 * not flip in Arabic.
 */
export function TitleBar({ bare, children }: { bare?: boolean; children?: ReactNode }) {
  const { t } = useT()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (bare) return undefined
    const timer = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(timer)
  }, [bare])

  /* macOS traffic lights take ~78px on the left; Windows/Linux buttons ~140px on the right. */
  return (
    <header
      className="titlebar-drag relative flex h-10 flex-none select-none items-center gap-3 border-b border-ink-200/70 bg-ink-100/80 backdrop-blur dark:border-ink-800 dark:bg-ink-950/80"
      style={{ paddingInlineStart: isMac ? 78 : 12, paddingInlineEnd: 10 }}
    >
      <div className={clsx('flex min-w-0 items-center gap-2', bare && 'opacity-90')} title={t('app.name')}>
        <AfusMark className="h-[18px] w-[18px] rounded-[5px]" title={t('app.name')} />
        <span className="truncate text-xs font-semibold tracking-tight text-ink-600 dark:text-ink-300">{t('app.name')}</span>
      </div>

      <div className="flex-1" />

      {bare ? null : (
        <>
          {/* Centred in the window, so the language and the window buttons never move it. */}
          <div
            className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap text-xs text-ink-400 dark:text-ink-500"
            aria-hidden
          >
            <span className="hidden md:inline">{formatDate(now)}</span>
            <span className="num font-semibold text-ink-600 dark:text-ink-300">{formatTime(now)}</span>
          </div>

          <span
            className="hidden items-center gap-1.5 rounded-md bg-ink-200/70 px-2 py-0.5 text-[11px] font-medium text-ink-500 sm:inline-flex dark:bg-ink-800/80 dark:text-ink-400"
            title={t('setup.localOnly')}
          >
            <WifiOff className="h-3 w-3" />
            {t('app.offline')}
          </span>
        </>
      )}

      {children ? <div className="titlebar-no-drag flex items-center gap-1">{children}</div> : null}
    </header>
  )
}
