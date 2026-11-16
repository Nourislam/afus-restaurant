/** Pure formatting helpers shared by the screens and by the main process, so a
 *  receipt reads the same wherever it is built. */
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

export function formatMoney(cents: number | null | undefined, currency = 'DZD', digits = 2): string {
  const value = (cents ?? 0) / 100
  try {
    return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
  } catch {
    return `${value.toFixed(digits)} ${currency}`
  }
}
