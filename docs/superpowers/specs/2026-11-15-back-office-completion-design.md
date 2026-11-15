# Phase 6 — Back-office completion (stock, recipes, purchases, cash, reports)

**Goal.** Every channel in `src/shared/channels.ts` has a handler, and every page already
written for the back office is routed and translated. After this phase the program is
feature-complete for a single restaurant: sales → stock → purchases → cash → reports.

## Modules

| Service | Channels | Notes |
|---|---|---|
| `inventory.ts` | `ingredients.*` | Units: display unit (kg/l/piece) ↔ base unit (g/ml/piece). `costMicrosPerBase` = cost per base unit in micro-currency. Adjust = set new quantity; waste = subtract. Removing an ingredient with history archives it instead. |
| `recipes.ts` | `recipes.*` | One recipe per product; saving syncs `products.costCents` so margins on the menu are real. |
| `inventory.ts` (hooks) | — | When an order completes, recipe ingredients are consumed (`usage`, ref `order`). Cancelling with `stockPolicy: 'restore'` returns them. Stock may go negative (a sale is never blocked); low stock is flagged. |
| `purchases.ts` | `suppliers.*`, `purchases.*` | Draft → received (stock in, weighted-average cost) → paid. Supplier balance = purchases − payments. Cash payments are posted to the open cash session. |
| `delivery.ts` | `delivery.*` | Delivery sheet over `delivery_info` joined with the order; `assigned` needs a courier; `cancelled` also cancels the order if still open. |
| `reservations.ts` | `reservations.*` | Table is marked `reserved` on confirmation and freed on arrival / no-show / cancel. |
| `attendance.ts` | `attendance.*` | Clock in/out per user; minutes computed on clock-out. |
| `finance.ts` | `finance.*` | One open cash session at a time. `cash_movements` is the ledger: `sale`, `expense`, `supplierPayment`, `deposit`, `withdrawal`. Expected cash = float + sales + deposits − expenses − supplier payments − withdrawals. |
| `reports.ts` | `reports.*` | Eleven `ReportTable`s over a date range; export to CSV / HTML / PDF in the reports folder. |
| `insight.ts` | `insight.*` | Offline heuristics: period-over-period highlights, best margins, declining products, peak hours, reorder forecast from 14-day usage, waste top, daily anomalies. `ask` understands a small bilingual vocabulary and returns a report table. |
| `backup.ts` | `backup.*` | SQLite image copies in the backups folder; restore writes a `pre-restore` copy first. |
| `website.ts` | `web.*` | Thin aliases of the website service kept for the legacy channel names. |

## Renderer
Routes + sidebar entries for Customers, Inventory, Recipes, Purchases, Reservations,
Delivery, Finance, Reports, Insight; backup card on Settings. All missing i18n keys added.

## Tests
`tests/backoffice.test.ts`: unit conversions, stock consumption on sale, restore on
cancel, purchase receive → stock + cost, supplier balance, cash session expected amount,
reservation table lifecycle, reports totals, backup round trip.
