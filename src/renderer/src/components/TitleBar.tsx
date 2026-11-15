import { useEffect, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { WifiOff } from 'lucide-react'
import { AfusMark } from './AfusLogo'
import { useT } from '../i18n'
import { formatDate, formatTime } from '../lib/format'

import { windowControlsInset, type WindowControlsInset } from '../lib/windowControls'

const platform = (): string | undefined => {
  if (typeof window !== 'undefined' && window.afus?.platform) return window.afus.platform
  /* Outside Electron (the renderer opened in a browser for a design check). */
  return typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent) ? 'darwin' : undefined
}

const readInset = (): WindowControlsInset =>
  typeof navigator === 'undefined'
    ? { left: 0, right: 0 }
    : windowControlsInset(platform(), navigator.windowControlsOverlay, window.innerWidth)

function useWindowControlsInset(): WindowControlsInset {
  const [inset, setInset] = useState<WindowControlsInset>(readInset)
  useEffect(() => {
    const overlay = navigator.windowControlsOverlay
    const update = (): void => setInset(readInset())
    /* The free strip changes when the window is resized or maximised. */
    window.addEventListener('resize', update)
    overlay?.addEventListener('geometrychange', update)
    update()
    return () => {
      window.removeEventListener('resize', update)
      overlay?.removeEventListener('geometrychange', update)
    }
  }, [])
  return inset
}

/**
 * Window bar, matching Afus Boutique/Hanout: the program's mark at the start,
 * the date and time centred in the free strip, and the global switches at the
 * end. Nothing of ours is ever placed under a system window button.
 */
export function TitleBar({ bare, children }: { bare?: boolean; children?: ReactNode }) {
  const { t } = useT()
  const inset = useWindowControlsInset()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (bare) return undefined
    const timer = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(timer)
  }, [bare])

  const GUTTER = 12

  return (
    <header
      className="titlebar-drag relative flex h-10 flex-none select-none items-center gap-3 border-b border-ink-200/70 bg-ink-100/80 backdrop-blur dark:border-ink-800 dark:bg-ink-950/80"
      /* Physical sides on purpose — these must not flip with the language. */
      style={{ paddingLeft: inset.left + GUTTER, paddingRight: inset.right + GUTTER }}
      data-testid="titlebar"
    >
      <div className={clsx('flex min-w-0 items-center gap-2', bare && 'opacity-90')} title={t('app.name')}>
        <AfusMark className="h-[18px] w-[18px] rounded-[5px]" title={t('app.name')} />
        <span className="truncate text-xs font-semibold tracking-tight text-ink-600 dark:text-ink-300">{t('app.name')}</span>
      </div>

      <div className="flex-1" />

      {bare ? null : (
        <>
          {/* Centred inside the strip the window buttons leave free, so it can
              never end up underneath one of them on a narrow window. */}
          <div
            className="pointer-events-none absolute inset-y-0 flex items-center justify-center gap-2.5 whitespace-nowrap text-xs text-ink-400 dark:text-ink-500"
            style={{ left: inset.left, right: inset.right }}
            aria-hidden
          >
            <span className="hidden lg:inline">{formatDate(now)}</span>
            <span className="num font-semibold text-ink-600 dark:text-ink-300">{formatTime(now)}</span>
          </div>

          <span
            className="z-10 hidden items-center gap-1.5 rounded-md bg-ink-200/70 px-2 py-0.5 text-[11px] font-medium text-ink-500 sm:inline-flex dark:bg-ink-800/80 dark:text-ink-400"
            title={t('setup.localOnly')}
          >
            <WifiOff className="h-3 w-3" />
            {t('app.offline')}
          </span>
        </>
      )}

      {children ? <div className="titlebar-no-drag z-10 flex items-center gap-1">{children}</div> : null}
    </header>
  )
}
