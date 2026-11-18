/**
 * Stamp duty (timbre fiscal) on a cash receipt.
 *
 * It lives here rather than in the main process because the cashier has to see
 * it *before* taking the money. The stamp is part of what the customer owes, so
 * a till that only learns it after the payment leaves every cash sale short by
 * the stamp and the order open — which is what used to happen.
 */
import type { StampBracket } from './types'

export interface StampRules {
  stampEnabled: boolean
  stampBrackets: StampBracket[]
  stampMinCents: number
  /** 0 = no cap. */
  stampMaxCents: number
}

/** Stamp (cents) owed on a cash amount, per the configured brackets; 0 when off. */
export function stampCentsFor(cashCents: number, rules: StampRules): number {
  if (!rules.stampEnabled || cashCents <= 0) return 0
  const brackets = [...rules.stampBrackets].sort((a, b) => (a.uptoCents ?? Infinity) - (b.uptoCents ?? Infinity))
  const bracket = brackets.find((b) => b.uptoCents === null || cashCents <= b.uptoCents) ?? brackets[brackets.length - 1]
  if (!bracket) return 0
  const hundreds = Math.ceil(cashCents / 10_000) // whole (started) 100 DA units
  let stamp = Math.round(hundreds * bracket.ratePerHundred * 100)
  stamp = Math.max(stamp, rules.stampMinCents)
  if (rules.stampMaxCents > 0) stamp = Math.min(stamp, rules.stampMaxCents)
  return stamp
}
