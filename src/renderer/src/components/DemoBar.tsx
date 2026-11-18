import { Compass, Home, RotateCcw, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import { useT } from '../i18n'

/**
 * The bar across the top of the web demo on the Afus website, the same one the
 * other Afus programs show: it says plainly that this is a demo and nothing is
 * kept, and gives the three ways out — start it again, open the guided tour, or
 * go and order the program.
 *
 * It renders only when the program is running as that demo. In an installed
 * restaurant there is no such global and nothing appears.
 */
export function DemoBar() {
  const { t } = useT()
  const demo = typeof window !== 'undefined' ? window.__AFUS_WEB_DEMO__ : undefined
  if (!demo) return null

  const button = 'flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1 font-semibold hover:bg-white/25'
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 bg-brand-700 px-4 py-2 text-sm text-white"
    >
      <span className="flex min-w-0 items-center gap-2 font-bold">
        <UtensilsCrossed className="h-5 w-5 shrink-0" />
        <span>{t('demo.banner')}</span>
      </span>
      <span className="ms-auto flex items-center gap-2">
        {/* A reload is the restart: the demo restaurant is built fresh every
            time the page opens, and nothing of it was ever written anywhere. */}
        <button type="button" className={button} onClick={() => window.location.reload()}>
          <RotateCcw className="h-4 w-4" /> {t('demo.reset')}
        </button>
        <button type="button" className={button} onClick={() => demo.tour?.()}>
          <Compass className="h-4 w-4" /> {t('demo.tour')}
        </button>
        {demo.siteUrl ? (
          <a href={demo.siteUrl} target="_top" className={button}>
            <Home className="h-4 w-4" /> {t('demo.backSite')}
          </a>
        ) : null}
        {demo.orderUrl ? (
          <a href={demo.orderUrl} target="_top" className={button}>
            <ShoppingBag className="h-4 w-4" /> {t('demo.order')}
          </a>
        ) : null}
      </span>
    </div>
  )
}
