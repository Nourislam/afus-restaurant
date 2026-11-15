import { clsx } from 'clsx'
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { AlertTriangle, Inbox, Search, X, type LucideIcon } from 'lucide-react'
import { useAppStore } from '../store/app'
import { errorText, useT } from '../i18n'
import { formatMoney, formatMoneyShort } from '../lib/format'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-ink-200/80 bg-white shadow-card dark:border-ink-800 dark:bg-ink-900',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * The row at the top of every screen (Afus Boutique parity): the page's name,
 * then its own tabs or filters, then its buttons at the end — all on one 40px
 * line that stays pinned while the screen below it scrolls. The negative
 * margins let it bleed to the edges of the padded `.page-body` it lives in.
 * `hero` (the dashboard) keeps the tall header with an icon and a subtitle.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  icon: Icon,
  children,
  hero
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  icon?: LucideIcon
  children?: ReactNode
  hero?: boolean
}) {
  if (hero) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon ? (
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-600/15 text-brand-700 dark:text-brand-300">
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-ink-900 dark:text-white">{title}</h1>
            {subtitle ? <p className="truncate text-sm text-ink-500 dark:text-ink-400">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    )
  }
  return (
    <div className="sticky top-0 z-20 -mx-4 -mt-3.5 mb-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-ink-200 bg-ink-100/95 px-4 py-2 backdrop-blur lg:-mx-5 lg:px-5 dark:border-ink-800 dark:bg-ink-950/95">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <h1 className="flex-none truncate text-sm font-bold text-ink-900 dark:text-white" title={subtitle}>
          {title}
        </h1>
        {subtitle ? (
          <span className="hidden min-w-0 flex-none truncate text-xs text-ink-400 xl:inline dark:text-ink-500">
            {subtitle}
          </span>
        ) : null}
        {children ? <div className="min-w-0 flex-1">{children}</div> : null}
      </div>
      {actions ? <div className="ms-auto flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </div>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-700 text-white hover:bg-brand-800 focus-visible:ring-brand-600 shadow-sm disabled:bg-brand-700/50',
  secondary:
    'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 focus-visible:ring-brand-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200 dark:hover:bg-ink-800',
  ghost: 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
  subtle: 'bg-accent-50 text-accent-700 hover:bg-accent-100 dark:bg-accent-500/15 dark:text-accent-200'
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60',
        BUTTON_STYLES[variant],
        BUTTON_SIZES[size],
        className
      )}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      {children}
    </button>
  )
}

export function Spinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dims = size === 'sm' ? 'h-3.5 w-3.5 border-2' : size === 'lg' ? 'h-8 w-8 border-[3px]' : 'h-5 w-5 border-2'
  return (
    <span
      className={clsx('inline-block animate-spin rounded-full border-current border-t-transparent', dims, className)}
      role="status"
    />
  )
}

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children
}: {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      {label ? (
        <label className="afus-label">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : null}
      {!error && hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx('afus-input', className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx('afus-input appearance-none pe-8', className)} {...props}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx('afus-input min-h-[72px] resize-y', className)} {...props} />
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <label className={clsx('inline-flex cursor-pointer items-center gap-2.5', disabled && 'cursor-not-allowed opacity-60')}>
      <span
        onClick={() => !disabled && onChange(!checked)}
        className={clsx(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition',
          checked ? 'bg-brand-700' : 'bg-slate-300 dark:bg-slate-700'
        )}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={clsx(
            'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition',
            checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
          )}
        />
      </span>
      {label ? <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span> : null}
    </label>
  )
}

const TONES = {
  neutral: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
  positive: 'bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  info: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-200',
  danger: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  blue: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-200',
  purple: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
} as const

export type Tone = keyof typeof TONES

export function Badge({
  children,
  tone = 'neutral',
  className
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'md'
}: {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  const width =
    size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : size === 'xl' ? 'max-w-5xl' : 'max-w-xl'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-[2px] fade-in sm:items-center">
      <div className={clsx('w-full rounded-xl bg-white shadow-2xl dark:bg-slate-900', width)}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            aria-label="close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3.5 dark:border-slate-800">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function Confirm({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  danger,
  loading
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  danger?: boolean
  loading?: boolean
}) {
  const { t } = useT()
  return (
    <Modal open={open} title={title} onClose={onClose} size="sm">
      <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

export function EmptyState({
  title,
  hint,
  action,
  icon: Icon = Inbox
}: {
  title: string
  hint?: string
  action?: ReactNode
  icon?: LucideIcon
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="rounded-full bg-slate-100 p-3 text-slate-400 dark:bg-slate-800">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function Loading({ label }: { label?: string }) {
  const { t } = useT()
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-slate-500">
      <Spinner />
      <span className="text-sm">{label ?? t('common.loading')}</span>
    </div>
  )
}

export function ErrorBox({ code, onRetry }: { code: string; onRetry?: () => void }) {
  const { t, language } = useT()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        {errorText(language, code)}
      </span>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  )
}

export function Tabs<T extends string>({
  items,
  value,
  onChange
}: {
  items: { value: T; label: string; count?: number; icon?: LucideIcon }[]
  value: T
  onChange: (value: T) => void
}) {
  /* Always one line: the rail scrolls sideways without a visible bar rather than
     wrapping onto a second line and pushing the screen down. */
  return (
    <div className="segmented no-scrollbar overflow-x-auto" role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={clsx('flex flex-none items-center gap-1.5', value === item.value && 'active')}
        >
          {item.icon ? <item.icon className="h-4 w-4 flex-none" /> : null}
          {item.label}
          {item.count !== undefined ? <span className="num text-xs text-ink-400">{item.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  className?: string
  align?: 'start' | 'end' | 'center'
}

export function DataTable<T>({
  columns,
  rows,
  keyField,
  loading,
  empty,
  onRowClick,
  footer,
  dense
}: {
  columns: Column<T>[]
  rows: T[]
  keyField: (row: T) => string | number
  loading?: boolean
  empty?: ReactNode
  onRowClick?: (row: T) => void
  footer?: ReactNode
  dense?: boolean
}) {
  if (loading) return <Loading />
  if (rows.length === 0) return <>{empty ?? <EmptyState title="—" />}</>
  /* The table scrolls inside its own box with a pinned header, so the screen's
     toolbar and totals never scroll away with it. */
  return (
    <div className="max-h-full overflow-auto">
      <table className="afus-table w-full">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={clsx(
                  column.align === 'end' && 'text-end',
                  column.align === 'center' && 'text-center',
                  column.className
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={keyField(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={clsx(
                'transition',
                onRowClick && 'cursor-pointer hover:bg-brand-50/50 dark:hover:bg-brand-900/20',
                dense ? '[&>td]:py-1.5' : ''
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={clsx(
                    column.align === 'end' && 'text-end',
                    column.align === 'center' && 'text-center',
                    column.className
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? (
          <tfoot className="sticky bottom-0 bg-ink-50 font-semibold dark:bg-ink-900">{footer}</tfoot>
        ) : null}
      </table>
    </div>
  )
}

export function Money({ cents, short, className }: { cents: number | null | undefined; short?: boolean; className?: string }) {
  const currency = useAppStore((state) => state.settings?.currency ?? 'DZD')
  return (
    <span className={clsx('num whitespace-nowrap', className)} dir="ltr">
      {short ? formatMoneyShort(cents, currency) : formatMoney(cents, currency)}
    </span>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
  loading
}: {
  label: string
  value: ReactNode
  hint?: string
  icon: LucideIcon
  tone?: Tone
  loading?: boolean
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <div className="mt-1.5 text-xl font-bold text-slate-900 dark:text-white">
            {loading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /> : value}
          </div>
          {hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
        </div>
        <span className={clsx('rounded-lg p-2', TONES[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </Card>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const { t } = useT()
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? t('common.search')}
        className="afus-input ps-9"
      />
    </div>
  )
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-2">{children}</div>
}
