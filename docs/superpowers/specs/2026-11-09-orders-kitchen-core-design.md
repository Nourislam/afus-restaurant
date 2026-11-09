# Afus Restaurant — Phase 2: orders + kitchen core

**Date:** 2026-11-09
**Status:** approved — implementing

## Problem

The schema (33 tables) and the UI (`Pos.tsx` 1600 lines, `Kitchen.tsx`,
`Orders.tsx`, `OrderDetail.tsx`) are built, but the **orders/kitchen backend is
missing** — the `orders.*` (17) and `kitchen.*` (2) IPC channels, plus
`customers.*` and `print.*`, are declared but unimplemented, so those pages are
unrouted. "Send the order to the kitchen" — the user's core ask — does not work.

## Decision

Implement the orders + kitchen backend against the existing schema and types,
wire the pages, and add the requested touches. Table occupancy (people count +
sitting duration) comes from the system (order open time + covers), **no camera**.
Online website/themes/closed-state is Phase 3.

## Scope

### Backend services
- **`services/orders.ts`** — the lifecycle, each op returns the full `Order`:
  create (writes order + items + modifiers + delivery; occupies the table;
  stores `covers`), addItem, updateItem, removeItem, setDiscount, setNote,
  setStatus, sendToKitchen (creates kitchen tickets, marks items preparing),
  hold, resume, pay (records payments, completes + frees the table when settled),
  cancel (frees the table), moveTable, merge. Central `buildOrder(id)` assembles
  items/modifiers/payments/history/delivery and computed totals.
  Totals: line = (unit + modifiers) × qty; tax from settings
  (exclusive adds, inclusive embedded); total = subtotal − discount + tax + fee.
  Order number: `A-<n>` (global sequence).
- **`services/kitchen.ts`** — board (sent orders grouped into tickets by station,
  elapsed minutes, late past `kitchenAlertMinutes`) + itemStatus (bump).
- **`services/customers.ts`** — list/get/save/toggleFavorite/adjustLoyalty.
- **`services/print.ts`** — print.html (hidden Electron window → printer or PDF),
  print.printers, print.exportPdf.

### Database — migration V3
- Add `orders.covers INTEGER NOT NULL DEFAULT 1` (party size for occupancy).

### IPC
- New `ipc/register/orders.ts`: all `orders.*`, `kitchen.*`, `customers.*`,
  `print.*` handlers with Zod schemas and the right permissions.

### Renderer
- Route + nav `Pos`, `Kitchen`, `Orders`, `OrderDetail` (operations section;
  simple mode shows POS + Kitchen + Tables).
- **Image menu**: show `product.image` in the POS product grid (graceful initials
  fallback), with a subtle zoom on hover.
- **Table occupancy**: on the Tables page, occupied tables show covers + a live
  "sitting for N min" timer (from the open order), with the pulse already added.
- **Animations**: cart line add/remove, send-to-kitchen pulse, KDS ticket mount.

## Out of scope (later phases)
- Inventory/recipe stock deduction on payment (Phase 4) — `stockDeducted` stays 0.
- Delivery/reservations pages (their write paths exist via orders).
- Online website + themes + closed-state (Phase 3).
- Camera feed / CV occupancy.

## Testing
- Unit: create→addItem→sendToKitchen→pay happy path; totals with tax/discount;
  table occupied on open and freed on pay/cancel; kitchen board groups + late;
  order number uniqueness; covers stored.
- `npm run typecheck`, `npm run test`, `npm run build` green.
