# Phase 8 — Offers and loyalty

**Why.** Every Algerian restaurant already runs offers on paper: a lunch price, a
Thursday family pack, a free coffee on the tenth visit. The program could not
express any of it, so the cashier typed a manual discount and the owner lost both
the reason and the figure. This gives the offer a name, a rule, and a trace.

## The rules an owner can set

| Kind | What it does | Typical use |
|---|---|---|
| `percent` | a share off the matching lines | −20 % on pizzas |
| `amount` | a fixed sum off the order | −200 DA over 2 000 DA |
| `combo` | a fixed price for a named set of dishes | burger + fries + drink = 900 DA |
| `freeItem` | the cheapest of N matching lines is free | 3 for the price of 2 |

Every offer carries: a bilingual name, a scope (`order`, `category`, `product`),
an optional minimum subtotal, a date window, a weekday mask and an hour window
(so "happy hour, Sunday to Thursday, 14:00–17:00" is one row), an optional usage
cap, and an active flag.

**Picking one.** An order gets **at most one offer**, never a stack: cashiers
cannot reason about stacked rules under pressure and owners cannot audit them.
`bestOffer()` evaluates every eligible rule and returns the one that saves the
customer the most; the cashier may also pick a specific one. The chosen offer is
stored on the order with the money it took off, so a receipt and a report can
always say *why* the price was lower.

**Where it lands.** The offer writes into the order's existing `discountCents`
with `discountReason` set to the offer's name, so tax, stamp duty and the fiscal
seal keep working unchanged. The new `offerId` and `offerDiscountCents` columns
record which rule produced it, and a manual discount by the cashier still wins
over any offer (it is set deliberately).

## Loyalty

Three numbers in settings, nothing more: **earn** (points per 100 DA spent),
**value** (what one point is worth in centimes), **minimum** (points before a
customer may redeem). Earning happens once, when the sale completes, and only
for an order attached to a customer. Redeeming is a cashier action before
payment: it converts points into an order discount, capped at the order total.

`loyalty_movements` is the ledger — earn, redeem, manual adjustment — so a
balance is always explainable and `customers.loyaltyPoints` is only a cache of it.
Cancelling a completed sale gives back what it earned.

## Schema (V6)

```
offers(id, nameAr, nameFr, kind, scope, targetId, valueBp, valueCents,
       minSubtotalCents, comboPriceCents, freeQty, startsOn, endsOn, daysMask,
       startTime, endTime, usageLimit, usedCount, isActive, createdAt)
offer_items(offerId, productId, qty)          -- the set a combo needs
loyalty_movements(id, customerId, orderId, kind, points, note, userId, createdAt)
orders += offerId, offerDiscountCents, loyaltyPointsEarned,
          loyaltyPointsRedeemed, loyaltyDiscountCents
settings += loyaltyEnabled, loyaltyEarnPer100, loyaltyPointValueCents,
            loyaltyMinRedeem
```

## Tests

Each rule kind computes the right money; the day and hour window is respected;
the best offer wins; a usage cap stops a spent offer; a manual discount keeps
priority; points are earned once on completion and returned on cancel; redeeming
is refused below the minimum and capped at the total.
