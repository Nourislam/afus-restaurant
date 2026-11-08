import { clsx } from 'clsx'

/**
 * The AFUS mark from the boutique icon: `#1239B0` tile, white "A" counter-form
 * and the `#16B26B` green arc. Kept as inline SVG so it scales cleanly and
 * inherits the surrounding layout.
 */
export function AfusMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 890 890" className={clsx('shrink-0', className)} role="img" aria-label={title ?? 'AFUS'}>
      {title ? <title>{title}</title> : null}
      <rect width="890" height="890" rx="210" fill="#1239B0" />
      <path
        fill="#FFFFFF"
        fillRule="evenodd"
        d="M270.577 657.607L324.731 598.493L325.030 598.728A195.0000 195.0000 0 0 0 599.461 564.025A195.0000 195.0000 0 0 0 563.075 289.812A195.0000 195.0000 0 0 0 460.538 250.620L460.000 250.579L460.000 170.410L460.179 170.419A275.0000 275.0000 0 0 1 639.454 250.546L640.000 251.095L640.000 170.000L720.000 170.000L720.000 720.000L640.000 720.000L640.000 638.905L639.454 639.454A275.0000 275.0000 0 0 1 270.577 657.607Z"
      />
      <path
        fill="#16B26B"
        fillRule="evenodd"
        d="M429.821 170.419L430.000 170.410L430.000 250.579L429.462 250.620A195.0000 195.0000 0 0 0 250.719 461.730A195.0000 195.0000 0 0 0 302.132 577.717L302.610 578.228L248.457 637.342L248.174 637.053A275.0000 275.0000 0 0 1 252.947 248.174A275.0000 275.0000 0 0 1 429.821 170.419Z"
      />
    </svg>
  )
}

export function AfusBrand({
  name,
  subtitle,
  tone = 'light',
  size = 'md',
  className
}: {
  name: string
  subtitle?: string
  tone?: 'light' | 'dark'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const tile = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  const title = size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-sm' : 'text-base'
  return (
    <div className={clsx('flex min-w-0 items-center gap-3', className)}>
      <AfusMark className={clsx(tile, 'rounded-xl shadow-sm ring-1 ring-black/5')} title={name} />
      <div className="min-w-0">
        <p className={clsx('truncate font-bold leading-tight', title, tone === 'dark' ? 'text-white' : 'text-ink-900')}>
          {name}
        </p>
        {subtitle ? (
          <p
            className={clsx(
              'truncate text-[10px] uppercase tracking-[0.14em]',
              tone === 'dark' ? 'text-white/55' : 'text-ink-400'
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  )
}
