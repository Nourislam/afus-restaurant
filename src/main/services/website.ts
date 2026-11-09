/**
 * Online ordering: the built-in site the restaurant can switch on. It serves a
 * themed menu + ordering page (storefront.ts) over the local network, so a
 * customer can scan the table QR and order from their phone with no internet —
 * and the order lands straight in the program (orders.create). The owner opens
 * or closes it; when closed the page shows a "closed" banner and refuses orders.
 * The same page can be exported as static files to publish online.
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
import { AppError } from '../utils/errors'
import { renderStorefront, THEMES, type StorefrontData } from './storefront'
import type { OrderSummary, WebsiteConfig, WebsiteState, WebsiteTheme as ThemeId } from '@shared/types'

const KEY = 'website'

const DEFAULTS: WebsiteConfig = {
  theme: 'fastfood',
  isOpen: true,
  port: 4321,
  orderTypes: ['delivery', 'takeaway'],
  running: false,
  closedMessageAr: 'المطعم مغلق حاليًا — الطلب متوقف. عودوا قريبًا!',
  closedMessageFr: 'Restaurant fermé — les commandes sont suspendues. À bientôt !'
}

let server: http.Server | null = null

function read(): WebsiteConfig {
  const raw = dbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', [KEY])
  if (!raw) return { ...DEFAULTS }
  try {
    return { ...DEFAULTS, ...(JSON.parse(raw.value) as Partial<WebsiteConfig>) }
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

/** Build the storefront data from the live menu + settings. */
export function publicData(lang: 'ar' | 'fr'): StorefrontData {
  const config = read()
  const settings = getSettings()
  const name = lang === 'ar' ? settings.restaurantName : settings.restaurantNameFr || settings.restaurantName
  const categories = dbAll<{ id: number; nameAr: string; nameFr: string }>(
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
  return {
    restaurant: { name, phone: settings.phone, address: settings.address, logo: settings.logo || null },
    categories,
    isOpen: config.isOpen,
    closedMessage: lang === 'ar' ? config.closedMessageAr : config.closedMessageFr,
    theme: config.theme,
    lang,
    currency: settings.currency,
    orderTypes: config.orderTypes
  }
}

interface WebOrderPayload {
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
  const items = (payload.items ?? []).filter((i) => i && i.productId > 0 && i.qty > 0)
  if (items.length === 0) throw new AppError('VALIDATION', 'Empty order')
  const name = (payload.customerName ?? '').trim()
  const phone = (payload.phone ?? '').trim()
  if (!name || !phone) throw new AppError('VALIDATION', 'Name and phone required')
  const type = payload.type === 'takeaway' ? 'takeaway' : 'delivery'
  const note = `🌐 ${name} · ${phone}${payload.note ? ' · ' + payload.note : ''}`
  const order = createOrderAs(systemUserId(), {
    type,
    note,
    items: items.map((i) => ({ productId: Number(i.productId), qty: Number(i.qty) })),
    delivery:
      type === 'delivery'
        ? { customerName: name, phone, address: (payload.address ?? '').trim() || '—', feeCents: 0 }
        : null
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

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const lang = url.searchParams.get('lang') === 'fr' ? 'fr' : 'ar'
    return send(200, 'text/html; charset=utf-8', renderStorefront(publicData(lang)))
  }
  if (req.method === 'GET' && url.pathname === '/api/menu') {
    const lang = url.searchParams.get('lang') === 'fr' ? 'fr' : 'ar'
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
        const result = placeWebOrder(JSON.parse(body || '{}'))
        send(200, 'application/json', JSON.stringify(result))
      } catch (error) {
        const code = error instanceof AppError ? error.code : 'ERROR'
        send(code === 'CONFLICT' ? 403 : 400, 'application/json', JSON.stringify({ error: code }))
      }
    })
    return
  }
  send(404, 'text/plain', 'Not found')
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
  const config = read()
  write({ ...config, running: false })
  return read()
}

export async function getWebsiteState(): Promise<WebsiteState> {
  const config = read()
  const lan = lanAddress()
  const lanUrl = lan ? `http://${lan}:${config.port}` : null
  const url = config.running ? lanUrl ?? `http://localhost:${config.port}` : null
  let qrDataUrl: string | null = null
  if (url) {
    try {
      qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 })
    } catch {
      qrDataUrl = null
    }
  }
  return {
    ...config,
    url,
    lanUrl,
    qrDataUrl,
    themes: (Object.keys(THEMES) as ThemeId[]).map((id) => ({ id, label: THEMES[id].label }))
  }
}

export function setWebsiteConfig(patch: Partial<WebsiteConfig>): WebsiteConfig {
  const next = { ...read(), ...patch }
  if (patch.theme && !(patch.theme in THEMES)) throw new AppError('VALIDATION', 'Unknown theme')
  write(next)
  return read()
}

/** Static export (menu-only) for publishing online, e.g. GitHub Pages. */
export function exportSite(): { dir: string; files: string[] } {
  const dir = appPaths().webMenu
  const files: string[] = []
  for (const lang of ['ar', 'fr'] as const) {
    const file = lang === 'ar' ? 'index.html' : 'fr.html'
    writeFileSync(join(dir, file), renderStorefront(publicData(lang)))
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
    const config = read()
    write({ ...config, running: false })
  }
}
