// The web demo: the real Afus Restaurant — its main process, its window bridge
// and its screens — running in one browser page, on a demo restaurant built at
// start. Nothing is sent anywhere and nothing is kept: reloading the page gives
// the same restaurant, new.
import './shims/globals.js'
import { loadAssets } from './assets.js'
import { whenWindow } from './shims/electron.js'

const asked = new URLSearchParams(location.search).get('lang')
const lang = asked === 'fr' ? 'fr' : 'ar'

/* The program reads this to know it is the demo: it navigates by hash, and the
   demo bar offers the tour and the way back to the website to order it. */
window.__AFUS_WEB_DEMO__ = {
  siteUrl: lang === 'ar' ? '../' : '../fr/',
  orderUrl: lang === 'ar' ? '../restaurant/#order' : '../fr/restaurant/#order'
}
document.documentElement.lang = lang
document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'

/* The program remembers the language per browser; the demo is opened at a
   chosen one, so it is set before the screens read it. The visitor can still
   switch with the program's own AR/FR button. */
try {
  localStorage.setItem('afus.language', lang)
} catch {
  /* a browser that refuses storage still gets the program, in Arabic */
}

const bar = document.getElementById('demo-loading-bar')
const progress = (value) => {
  if (bar) bar.style.width = `${Math.round(value)}%`
}

await loadAssets((p) => progress(8 + p * 22))

/* The main process, exactly as on a computer: it opens its database, runs its
   migrations, registers its channels and asks for a window. */
await import('../src/main/index.ts')
await whenWindow
progress(45)

/* A restaurant in the middle of a service, made by the program's own services. */
const { seedDemoRestaurant } = await import('../src/main/services/demo.ts')
seedDemoRestaurant({ lang })
progress(70)

/* The window side: the preload puts the bridge on `window.afus`, then the
   screens mount against it. */
await import('../src/preload/index.ts')
progress(80)
await import('../src/renderer/src/main.tsx')
progress(95)

await import('./tour.js')
document.getElementById('demo-loading')?.remove()
progress(100)
