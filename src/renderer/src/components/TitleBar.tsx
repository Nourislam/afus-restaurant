import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { AfusMark } from './AfusLogo'
import { useT } from '../i18n'

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

/**
 * Thin draggable window bar, matching Afus Boutique/Hanout. On macOS (hidden
 * inset) it leaves room on the left for the native traffic-light buttons.
 * `bare` shows only the Afus mark (setup/login); otherwise `children` fills the
 * end with actions.
 */
export function TitleBar({ bare, children }: { bare?: boolean; children?: ReactNode }) {
  const { t } = useT()
  return (
    <header
      className="titlebar-drag flex h-10 flex-none items-center justify-between gap-2 border-b border-ink-200/70 bg-ink-100/80 px-3 backdrop-blur dark:border-ink-800 dark:bg-ink-950/80"
      style={isMac ? { paddingInlineStart: 78 } : undefined}
    >
      <div className={clsx('flex min-w-0 items-center gap-2', bare && 'opacity-90')}>
        <AfusMark className="h-5 w-5 rounded-md" title={t('app.name')} />
        <span className="truncate text-xs font-bold tracking-tight text-ink-700 dark:text-ink-200">
          {t('app.name')}
        </span>
      </div>
      {children ? <div className="titlebar-no-drag flex items-center gap-1.5">{children}</div> : null}
    </header>
  )
}
