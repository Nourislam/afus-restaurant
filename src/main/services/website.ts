/**
 * The restaurant's own site, branch-aware. Served live over the LAN by the
 * built-in server (orders land in the program through /api/order, scanning the
 * branch QR works with no internet), and exported as one self-contained HTML
 * file per language — the file an owner publishes as their own Claude Artifact
 * (or on any host). Each branch has its own hours, open/closed state, QR code
 * and price/availability overrides; the owner picks one of four editorial
 * themes (ember / noir / sable / nar).
 */
import http from 'node:http'
import os from 'node:os'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import QRCode from 'qrcode'
import { dbGet, dbAll, dbWrite } from '../db/client'
import { getSettings } from './settings'
import { appPaths } from './../paths'
import { createOrderAs, listOrders } from './orders'
import { ensureDefaultBranch, getBranch, listBranches, overrideMap } from './branches'
import { AppError } from '../utils/errors'
import { authenticate, type ApiScope } from './apiTokens'
import { listOrders as listAllOrders } from './orders'
import { report } from './reports'
import { listProducts } from './catalog'
import { renderStorefront, THEMES, type StorefrontBranch, type StorefrontBundle, type StorefrontCategory, type StorefrontData } from './storefront'
import type { Branch, BranchHours, OrderSummary, WebsiteConfig, WebsiteState, WebsiteTheme as ThemeId } from '@shared/types'

const KEY = 'website'

const DEFAULTS: WebsiteConfig = {
  theme: 'ember',
  isOpen: true,
  port: 4321,
  orderTypes: ['delivery', 'takeaway'],
  running: false,
  closedMessageAr: 'هذا الفرع مغلق حاليًا — الطلب متوقف. عودوا قريبًا!',
  closedMessageFr: 'Cette succursale est fermée — les commandes sont suspendues. À bientôt !'
}

let server: http.Server | null = null

function read(): WebsiteConfig {
  const raw = dbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', [KEY])
  if (!raw) return { ...DEFAULTS }
  try {
    const parsed = { ...DEFAULTS, ...(JSON.parse(raw.value) as Partial<WebsiteConfig>) }
    if (!(parsed.theme in THEMES)) parsed.theme = 'ember'
    return parsed
  } catch {
    return { ...DEFAULTS }
  }
}

function write(config: WebsiteConfig): void {
  dbWrite('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [KEY, JSON.stringify(config)])
}

function lanAddress(): string | null {
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return null
}

function systemUserId(): number {
  const owner = dbGet<{ id: number }>("SELECT id FROM users WHERE roleId = 'owner' AND isActive = 1 ORDER BY id LIMIT 1")
  const any = owner ?? dbGet<{ id: number }>('SELECT id FROM users WHERE isActive = 1 ORDER BY id LIMIT 1')
  if (!any) throw new AppError('CONFLICT', 'No user to attribute the web order to')
  return any.id
}

/** Digits only, for wa.me links; Algerian local numbers get the 213 prefix. */
export function whatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0') && digits.length === 10) digits = '213' + digits.slice(1)
  return digits
}

const DAY_NAMES = {
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  fr: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
}

/**
 * "كل يوم 11:00 → 23:30" when every configured day shares one range, otherwise
 * a compact per-day list. Only configured days count: a day left unset is
 * unrestricted (see isOpenNow), so it is neither listed nor shown as closed;
 * a day set to null is explicitly closed and is listed as such.
 */
export function hoursText(hours: BranchHours, lang: 'ar' | 'fr'): string | null {
  const configured = (['0', '1', '2', '3', '4', '5', '6'] as const)
    .map((k) => ({ day: Number(k), entry: hours[k] }))
    .filter((x) => x.entry !== undefined)
  if (configured.length === 0) return null
  const ranges = configured.map((x) => (x.entry ? `${x.entry.open} → ${x.entry.close}` : null))
  const first = ranges[0]
  if (first && ranges.every((r) => r === first)) {
    return lang === 'ar' ? `كل يوم · ${first}` : `Tous les jours · ${first}`
  }
  const closedLabel = lang === 'ar' ? 'مغلق' : 'fermé'
  return configured.map((x, i) => `${DAY_NAMES[lang][x.day]} ${ranges[i] ?? closedLabel}`).join(' · ')
}

function coreMenu(lang: 'ar' | 'fr'): StorefrontCategory[] {
  return dbAll<{ id: number; nameAr: string; nameFr: string }>(
    'SELECT id, nameAr, nameFr FROM categories WHERE isArchived = 0 ORDER BY sortOrder, id'
  ).map((c) => ({
    id: c.id,
    name: lang === 'ar' ? c.nameAr : c.nameFr,
    products: dbAll<{ id: number; nameAr: string; nameFr: string; descriptionAr: string | null; descriptionFr: string | null; priceCents: number; image: string | null; isAvailable: number }>(
      'SELECT id, nameAr, nameFr, descriptionAr, descriptionFr, priceCents, image, isAvailable FROM products WHERE categoryId = ? AND isArchived = 0 ORDER BY sortOrder, id',
      [c.id]
    ).map((p) => ({
      id: p.id,
      name: lang === 'ar' ? p.nameAr : p.nameFr,
      description: lang === 'ar' ? p.descriptionAr : p.descriptionFr,
      priceCents: p.priceCents,
      image: p.image,
      available: p.isAvailable === 1
    }))
  }))
}

function applyOverrides(menu: StorefrontCategory[], branchId: number): StorefrontCategory[] {
  const map = overrideMap(branchId)
  if (map.size === 0) return menu
  return menu.map((c) => ({
    ...c,
    products: c.products.map((p) => {
      const o = map.get(p.id)
      if (!o) return p
      return {
        ...p,
        priceCents: o.priceCents ?? p.priceCents,
        available: o.isAvailable === null ? p.available : o.isAvailable
      }
    })
  }))
}

function ensureBranches(): Branch[] {
  const settings = getSettings()
  ensureDefaultBranch({ nameAr: 'الفرع الرئيسي', nameFr: 'Succursale principale', address: settings.address, phone: settings.phone })
  return listBranches()
}

/** One language's view: restaurant + every branch with its effective menu. */
export function publicData(lang: 'ar' | 'fr'): StorefrontData {
  const config = read()
  const settings = getSettings()
  const name = lang === 'ar' ? settings.restaurantName : settings.restaurantNameFr || settings.restaurantName
  const menu = coreMenu(lang)
  const branches: StorefrontBranch[] = ensureBranches().map((b) => ({
    id: b.id,
    name: lang === 'ar' ? b.nameAr : b.nameFr,
    address: b.address,
    phone: b.phone || settings.phone || null,
    whatsapp: whatsappDigits(b.phone || settings.phone),
    hoursText: hoursText(b.hours, lang),
    openNow: b.openNow && config.isOpen,
    deliveryNote: b.deliveryNote,
    categories: applyOverrides(menu, b.id)
  }))
  return {
    restaurant: {
      name,
      tagline: lang === 'ar' ? 'اطلب من طاولتك أو للتوصيل — بضغطة.' : 'Commandez à table ou en livraison — en un geste.',
      logo: settings.logo || null,
      slug: settings.restaurantSlug
    },
    branches,
    closedMessage: lang === 'ar' ? config.closedMessageAr : config.closedMessageFr,
    currency: settings.currency,
    lang
  }
}

export function bundle(initialLang: 'ar' | 'fr', apiOrder: boolean, defaultBranchId: number | null = null): StorefrontBundle {
  const config = read()
  const ar = publicData('ar')
  const fr = publicData('fr')
  return {
    data: { ar, fr },
    initialLang,
    theme: config.theme,
    orderTypes: config.orderTypes,
    apiOrder,
    defaultBranchId: defaultBranchId ?? ar.branches[0]?.id ?? null
  }
}

interface WebOrderPayload {
  branchId?: number
  type?: string
  customerName?: string
  phone?: string
  address?: string
  note?: string
  items?: { productId: number; qty: number }[]
}

function placeWebOrder(payload: WebOrderPayload): { orderNumber: string } {
  const config = read()
  if (!config.isOpen) throw new AppError('CONFLICT', 'Restaurant is closed')
  const branch = payload.branchId ? getBranch(payload.branchId) : listBranches()[0]
  if (!branch || !branch.openNow) throw new AppError('CONFLICT', 'Branch is closed')
  const items = (payload.items ?? []).filter((i) => i && i.productId > 0 && i.qty > 0)
  if (items.length === 0) throw new AppError('VALIDATION', 'Empty order')
  const name = (payload.customerName ?? '').trim()
  const phone = (payload.phone ?? '').trim()
  if (!name || !phone) throw new AppError('VALIDATION', 'Name and phone required')
  const type = payload.type === 'takeaway' ? 'takeaway' : 'delivery'
  const note = `🌐 ${branch.nameAr} · ${name} · ${phone}${payload.note ? ' · ' + payload.note : ''}`
  const order = createOrderAs(systemUserId(), {
    /* The sale belongs to the branch the customer chose on the site. */
    branchId: branch.id,
    type,
    note,
    items: items.map((i) => ({ productId: Number(i.productId), qty: Number(i.qty) })),
    delivery: type === 'delivery' ? { customerName: name, phone, address: (payload.address ?? '').trim() || '—', feeCents: 0 } : null
  })
  return { orderNumber: order.orderNumber }
}

function handle(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const send = (status: number, type: string, body: string | Buffer) => {
    res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' })
    res.end(body)
  }
  if (req.method === 'OPTIONS') return send(204, 'text/plain', '')
  const lang = url.searchParams.get('lang') === 'fr' ? 'fr' : 'ar'
  const branchParam = Number(url.searchParams.get('branch') ?? 0) || null
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return send(200, 'text/html; charset=utf-8', renderStorefront(bundle(lang, true, branchParam)))
  }
  if (req.method === 'GET' && url.pathname === '/api/menu') {
    return send(200, 'application/json', JSON.stringify(publicData(lang)))
  }
  if (req.method === 'POST' && url.pathname === '/api/order') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 100_000) req.destroy()
    })
    req.on('end', () => {
      try {
        send(200, 'application/json', JSON.stringify(placeWebOrder(JSON.parse(body || '{}'))))
      } catch (error) {
        const code = error instanceof AppError ? error.code : 'ERROR'
        send(code === 'CONFLICT' ? 403 : 400, 'application/json', JSON.stringify({ error: code }))
      }
    })
    return
  }
  /* ---------------- The open API ---------------- */
  /* Everything under /api/v1 needs a key. It is a separate surface from the
     storefront above: that one is public by design, this one never is. */
  if (url.pathname.startsWith('/api/v1/')) return handleApi(req, url, send)

  send(404, 'text/plain', 'Not found')
}

/**
 * The documented surface another system may use: an accounting package pulling
 * yesterday's sales, a delivery platform pushing an order in. Read is the
 * default; writing needs a key that was created with it.
 */
function handleApi(
  req: http.IncomingMessage,
  url: URL,
  send: (status: number, type: string, body: string | Buffer) => void
): void {
  const json = (status: number, body: unknown) => send(status, 'application/json; charset=utf-8', JSON.stringify(body))
  const header = req.headers.authorization ?? ''
  const presented = header.toLowerCase().startsWith('bearer ') ? header.slice(7) : null
  const auth = authenticate(presented)
  if (!auth) return json(401, { error: 'UNAUTHORIZED', hint: 'Authorization: Bearer <key>' })
  const may = (scope: ApiScope) => auth.scopes.includes(scope)

  const path = url.pathname.replace('/api/v1/', '')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  try {
    if (req.method === 'GET' && path === 'ping') return json(200, { ok: true, program: 'afus-restaurant', scopes: auth.scopes })
    if (req.method === 'GET' && path === 'menu') {
      return json(200, publicData(url.searchParams.get('lang') === 'fr' ? 'fr' : 'ar'))
    }
    if (req.method === 'GET' && path === 'products') {
      return json(200, listProducts({ includeArchived: false }))
    }
    if (req.method === 'GET' && path === 'branches') {
      return json(200, ensureBranches())
    }
    if (req.method === 'GET' && path === 'orders') {
      const limit = Math.min(200, Number(url.searchParams.get('limit') ?? 50) || 50)
      return json(200, listAllOrders({ limit, status: url.searchParams.get('status') }))
    }
    if (req.method === 'GET' && path.startsWith('reports/')) {
      return json(200, report(path.slice('reports/'.length), from, to))
    }
    if (req.method === 'POST' && path === 'orders') {
      if (!may('write')) return json(403, { error: 'FORBIDDEN', hint: 'This key may only read' })
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > 100_000) req.destroy()
      })
      req.on('end', () => {
        try {
          json(201, placeWebOrder(JSON.parse(body || '{}')))
        } catch (error) {
          json(400, { error: error instanceof AppError ? error.code : 'ERROR' })
        }
      })
      return
    }
    return json(404, { error: 'NOT_FOUND', hint: 'GET ping, menu, products, branches, orders, reports/<name>; POST orders' })
  } catch (error) {
    return json(error instanceof AppError && error.code === 'FORBIDDEN' ? 403 : 400, {
      error: error instanceof AppError ? error.code : 'ERROR'
    })
  }
}

export function startSite(): Promise<WebsiteConfig> {
  const config = read()
  return new Promise((resolve, reject) => {
    if (server) {
      write({ ...config, running: true })
      return resolve(read())
    }
    const srv = http.createServer(handle)
    srv.on('error', (error) => {
      server = null
      reject(error)
    })
    srv.listen(config.port, () => {
      server = srv
      write({ ...config, running: true })
      resolve(read())
    })
  })
}

export function stopSite(): WebsiteConfig {
  if (server) {
    server.close()
    server = null
  }
  write({ ...read(), running: false })
  return read()
}

export async function getWebsiteState(): Promise<WebsiteState> {
  const config = read()
  const settings = getSettings()
  const branches = ensureBranches()
  const lan = lanAddress()
  const lanUrl = lan ? `http://${lan}:${config.port}` : null
  const url = config.running ? lanUrl ?? `http://localhost:${config.port}` : null
  let qrDataUrl: string | null = null
  const branchQr: Record<number, string> = {}
  if (url) {
    try {
      qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 })
      for (const b of branches) branchQr[b.id] = await QRCode.toDataURL(`${url}/?branch=${b.id}`, { margin: 1, width: 200 })
    } catch {
      qrDataUrl = null
    }
  }
  return {
    ...config,
    url,
    lanUrl,
    qrDataUrl,
    themes: (Object.keys(THEMES) as ThemeId[]).map((id) => ({ id, label: THEMES[id].label })),
    slug: settings.restaurantSlug,
    branches,
    branchQr
  }
}

export function setWebsiteConfig(patch: Partial<WebsiteConfig>): WebsiteConfig {
  if (patch.theme && !(patch.theme in THEMES)) throw new AppError('VALIDATION', 'Unknown theme')
  write({ ...read(), ...patch })
  return read()
}

/** Static export: one self-contained page per language (artifact-ready). */
export function exportSite(): { dir: string; files: string[] } {
  const dir = appPaths().webMenu
  const files: string[] = []
  for (const lang of ['ar', 'fr'] as const) {
    const file = lang === 'ar' ? 'index.html' : 'fr.html'
    writeFileSync(join(dir, file), renderStorefront(bundle(lang, false)))
    files.push(file)
  }
  return { dir, files }
}

/** Recent online (delivery/takeaway) orders, for the website screen. */
export function webOrders(): OrderSummary[] {
  return listOrders({ limit: 50 }).filter((o) => o.type === 'delivery' || o.type === 'takeaway')
}

/** Called once at startup: bring the server back up if it was left running. */
export async function autostartWebsite(): Promise<void> {
  try {
    if (read().running) await startSite()
  } catch {
    write({ ...read(), running: false })
  }
}
