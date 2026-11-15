/** Unit helpers shared by stock, recipes and purchases. Quantities are stored in the
 *  base unit (g / ml / piece) as integers; the UI works in the display unit. */

export function baseUnitFor(unit: string): string {
  if (unit === 'kg') return 'g'
  if (unit === 'l') return 'ml'
  return unit
}

/** How many base units make one display unit. */
export function unitFactor(unit: string, baseUnit: string): number {
  if (unit === 'kg' && baseUnit === 'g') return 1000
  if (unit === 'l' && baseUnit === 'ml') return 1000
  return 1
}

export const toBase = (qty: number, factor: number): number => Math.round(qty * factor)
export const fromBase = (qtyBase: number, factor: number): number => Math.round((qtyBase / factor) * 1000) / 1000

/** Cost per display unit (cents) → cost per base unit (micro-currency). */
export const costToMicros = (unitCostCents: number, factor: number): number => Math.round((unitCostCents * 10_000) / factor)
/** Cost per base unit (micro-currency) → cost per display unit (cents). */
export const microsToUnitCents = (costMicrosPerBase: number, factor: number): number => Math.round((costMicrosPerBase * factor) / 10_000)
/** Value of a base quantity in cents. */
export const baseValueCents = (qtyBase: number, costMicrosPerBase: number): number => Math.round((qtyBase * costMicrosPerBase) / 10_000)
