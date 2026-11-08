const pad = (value: number): string => String(value).padStart(2, '0')

/** Local ISO-like timestamp `YYYY-MM-DD HH:MM:SS` (SQLite-friendly, sortable). */
export function nowStamp(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function today(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function monthStart(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`
}

export function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00`)
  date.setDate(date.getDate() + days)
  return today(date)
}

/** Normalise any accepted date input to a `YYYY-MM-DD` day string. */
export function dayString(value: string | null | undefined, fallback = today()): string {
  if (!value) return fallback
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : fallback
}

export function minutesBetween(from: string, to = nowStamp()): number {
  const start = new Date(from.replace(' ', 'T')).getTime()
  const end = new Date(to.replace(' ', 'T')).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.round((end - start) / 60000))
}
