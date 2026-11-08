export const UNIT_SYMBOLS: Record<string, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'L',
  piece: 'pcs',
  custom: 'u'
}

export function unitSymbol(unit: string | null | undefined): string {
  return UNIT_SYMBOLS[unit ?? ''] ?? ''
}
