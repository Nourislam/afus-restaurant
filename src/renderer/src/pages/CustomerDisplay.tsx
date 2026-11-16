import { useEffect, useState } from 'react'
import { ShoppingBag, Sparkles } from 'lucide-react'
import type { Order } from '@shared/types'
import { useAppEvent } from '../lib/hooks'
import { formatMoney } from '../lib/format'
import { useT } from '../i18n'
import { useAppStore } from '../store/app'
import { AfusMark } from '../components/AfusLogo'

interface Pushed {
  order: Order | null
  /** Set the moment the sale is paid, so the screen can thank the customer. */
  done?: boolean
}

/**
 * What the customer sees while the cashier works. Nothing here is interactive:
 * it is a window the customer reads, so everything is large, still, and only
 * moves when the order does.
 */
export default function CustomerDisplay() {
  const { t, language } = useT()
  const settings = useAppStore((state) => state.settings)
  const [state, setState] = useState<Pushed>({ order: null })
  const currency = settings?.currency ?? 'DZD'

  useAppEvent((event) => {
    if (event.channel === 'display.order') setState((event.data as Pushed) ?? { order: null })
  })

  /* A finished sale thanks the customer, then goes back to waiting. */
  useEffect(() => {
    if (!state.done) return undefined
    const timer = setTimeout(() => setState({ order: null }), 8000)
    return () => clearTimeout(timer)
  }, [state.done])

  const order = state.order
  const lines = order?.items.filter((item) => item.status !== 'removed') ?? []
  const name = settings?.restaurantName || t('app.name')

  return (
    <div className="flex h-full w-full flex-col bg-ink-950 text-white" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <header className="flex flex-none items-center gap-4 border-b border-white/10 px-10 py-6">
        <AfusMark className="h-12 w-12 rounded-xl ring-1 ring-white/10" />
        <div className="min-w-0">
          <p className="truncate text-2xl font-bold">{name}</p>
          {settings?.phone ? <p className="num text-sm text-white/50" dir="ltr">{settings.phone}</p> : null}
        </div>
      </header>

      {state.done ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <span className="flex h-28 w-28 items-center justify-center rounded-full bg-accent-500/20 text-accent-300">
            <Sparkles className="h-14 w-14" />
          </span>
          <p className="text-5xl font-bold">{t('display.thanks')}</p>
        </div>
      ) : lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <span className="flex h-28 w-28 items-center justify-center rounded-full bg-white/5 text-white/40">
            <ShoppingBag className="h-14 w-14" />
          </span>
          <p className="text-5xl font-bold">{t('display.welcome')}</p>
          <p className="max-w-lg text-xl text-white/50">{t('display.welcomeHint')}</p>
        </div>
      ) : (
        <>
          <ul className="thin-scroll min-h-0 flex-1 overflow-y-auto px-10 py-4">
            {lines.map((item) => {
              const label = language === 'ar' ? item.productNameAr : item.productNameFr
              const variant = language === 'ar' ? item.variantNameAr : item.variantNameFr
              return (
                <li key={item.id} className="flex animate-seat-in items-baseline justify-between gap-6 border-b border-white/5 py-4">
                  <span className="min-w-0 flex-1">
                    <span className="num me-3 inline-block min-w-[2.5rem] rounded-lg bg-white/10 px-2 py-0.5 text-center text-xl font-bold">
                      {item.qty}
                    </span>
                    <span className="text-2xl">{label}</span>
                    {variant ? <span className="ms-2 text-lg text-white/40">{variant}</span> : null}
                  </span>
                  <span className="num shrink-0 text-2xl font-semibold" dir="ltr">
                    {formatMoney(item.lineTotalCents, currency, 0)}
                  </span>
                </li>
              )
            })}
          </ul>

          <footer className="flex-none border-t border-white/10 bg-black/30 px-10 py-7">
            {order && order.discountCents > 0 ? (
              <div className="mb-2 flex items-baseline justify-between text-xl text-accent-300">
                <span>{order.offerName ?? t('common.discount')}</span>
                <span className="num" dir="ltr">−{formatMoney(order.discountCents, currency, 0)}</span>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-semibold text-white/60">
                {t('display.toPay')}
                <span className="num ms-3 text-xl text-white/35">
                  {lines.length} {t('display.items')}
                </span>
              </span>
              <span className="num text-6xl font-extrabold tracking-tight text-brand-300" dir="ltr">
                {formatMoney(order?.totalCents ?? 0, currency, 0)}
              </span>
            </div>
          </footer>
        </>
      )}
    </div>
  )
}
