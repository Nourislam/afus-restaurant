/**
 * What counts as a sale.
 *
 * Paying and finishing used to be the same act, so every figure in the program
 * was built on `status = 'completed'`. They are no longer the same: a guest can
 * pay at the counter and wait for the food, and that order is settled money
 * sitting in the drawer while its status is still `sent` or `preparing`.
 *
 * A sale is therefore an order that is not cancelled and owes nothing — which
 * is exactly `paidAt IS NOT NULL`. Sales recorded before this distinction
 * existed had `paidAt` backfilled from `completedAt`, so they still count.
 */

/** SQL predicate for "this order is a sale", for a table aliased `alias`. */
export function settledSale(alias = 'o'): string {
  const a = alias ? `${alias}.` : ''
  /* `completed` is kept as a second way of qualifying rather than relying on the
     backfill alone: an order that was closed is a sale by definition, and that
     stays true for every row ever written, whichever version wrote it. */
  return `${a}status != 'cancelled' AND (${a}paidAt IS NOT NULL OR ${a}status = 'completed')`
}
