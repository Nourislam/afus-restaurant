export function toMicros(valueCents: number): number {
  return Math.round(valueCents) * 1000000
}

export function fromMicros(micros: number): number {
  return Math.round(micros) / 1000000
}

export function addMicros(a: number, b: number): number {
  return Math.round(a + b)
}

export function subtractMicros(a: number, b: number): number {
  return Math.round(a - b)
}

export function multiplyMicros(a: number, factor: number): number {
  return Math.round(a * factor)
}

export function divideMicros(a: number, divisor: number): number {
  if (divisor === 0) return 0
  return Math.round(a / divisor)
}

export function centsToMicros(cents: number): number {
  return cents * 100
}

export function microsToCents(micros: number): number {
  return Math.round(micros / 100)
}

export function formatMicros(micros: number, currency = 'DZD', digits = 2): string {
  const value = fromMicros(micros) / 100
  try {
    return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
  } catch {
    return `${value.toFixed(digits)} ${currency}`
  }
}
