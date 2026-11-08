const pad = (value: number): string => String(value).padStart(2, '0')

export function parseTs(value: string | null | undefined): Date | null {
  if (!value) return null
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = value instanceof Date ? value : parseTs(value ?? null)
  if (!date) return '—'
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = value instanceof Date ? value : parseTs(value ?? null)
  if (!date) return '—'
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDayName(value: string | Date | null | undefined, language: 'ar' | 'fr' = 'ar'): string {
  const date = value instanceof Date ? value : parseTs(value ?? null)
  if (!date) return '—'
  return date.toLocaleDateString(language === 'ar' ? 'ar-DZ' : 'fr-FR', { weekday: 'long' })
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  return `${formatDate(value)} · ${formatTime(value)}`
}

export function formatMoney(cents: number | null | undefined, currency = 'DZD', digits = 2): string {
  const value = (cents ?? 0) / 100
  try {
    return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
  } catch {
    return `${value.toFixed(digits)} ${currency}`
  }
}

export function formatMoneyShort(cents: number | null | undefined, currency = 'DZD'): string {
  return formatMoney(cents, currency, 0)
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  return new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value ?? 0)
}

export function formatQty(value: number, unitSymbolText: string): string {
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  return `${text} ${unitSymbolText}`
}

export function toCents(input: string | number): number | null {
  const text = String(input ?? '').trim()
  if (!text) return null
  const normalized = text.replace(/\./g, '').replace(',', '.')
  const value = Number(normalized)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}

export function centsToInput(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2).replace(/\.00$/, '')
}

export function todayString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00`)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function monthStart(dateString = todayString()): string {
  return `${dateString.slice(0, 7)}-01`
}

export function weekStart(dateString = todayString()): string {
  const date = new Date(`${dateString}T12:00:00`)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDays(dateString, diff)
}

export function formatMinutes(minutes: number | null | undefined): string {
  const value = Math.max(0, Math.round(minutes ?? 0))
  const hours = Math.floor(value / 60)
  const rest = value % 60
  if (hours === 0) return `${rest}m`
  return `${hours}h ${pad(rest)}m`
}

export function elapsedMinutes(createdAt: string): number {
  const date = parseTs(createdAt)
  if (!date) return 0
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000))
}

export function formatPercent(bp: number): string {
  return `${Math.round(bp / 100)}%`
}
