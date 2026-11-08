# AFUS Restaurant — Phase 1 engineering review

Date: 2026-11-07 · Scope: first runnable slice (setup, login, dashboard, tables, menu, employees, settings)
Stack: Electron 33 · React 18 · TypeScript 5.9 · Vite/electron-vite 8 · Tailwind 3 · sql.js (SQLite) · Zod 4 · Zustand 5

## Verdict

Phase 1 is runnable and green: `tsc --noEmit` reports 0 errors, all 55 tests pass, and the production
build (`typecheck + electron-vite build`) succeeds for main, preload and renderer. Everything outside the
phase-1 slice is still deliberately unregistered and answers `NOT_IMPLEMENTED` instead of failing silently
or crashing the window.

## Architecture

| Layer | Location | Notes |
| --- | --- | --- |
| Main / system | `src/main/**` | Database, services, IPC registry, window lifecycle. Owns the session. |
| Preload bridge | `src/preload/index.ts` | Exposes only `invoke` on the channel allowlist plus `onEvent`. No Node API reaches the renderer. |
| Renderer | `src/renderer/src/**` | React Router pages, Zustand UI store, typed `lib/api.ts` surface. |

Design decisions that keep the slice small and safe:

- **One typed API surface.** Pages only ever touch `lib/api.ts`; the payload shapes were derived from what the
  pages actually send, so a page cannot invent a channel or a payload the backend does not understand.
- **Arrays for list endpoints.** Every `*.list` handler returns a plain array because pages call `.filter`,
  `.map` and `.length` on the result; paginated envelopes are reserved for phase 2 where a page needs a total.
- **Single dispatch choke point.** `ipc/registry.ts` runs allowlist → zod parse → session → fresh permission
  re-read → handler → envelope, in that order. There is no second path into the services.
- **The renderer never asserts identity.** The session lives in the main process (`security/session.ts`); the
  user id is never taken from an IPC payload, so a compromised renderer cannot borrow another account.
- **Domain types map 1:1 to rows.** camelCase SQL columns mean services hand rows straight back as
  `@shared/types` objects; no mapper layer, so no drift between schema and UI types.

## Database

- sql.js (SQLite compiled to WASM) with `PRAGMA foreign_keys = ON`; 30 tables, 9 indexes, versioned migrations
  (`SCHEMA_VERSION = 1`, `PRAGMA user_version`).
- Writes go through `transaction()` for multi-statement work, and `dbWrite()` for single statements so the
  in-memory image is flushed atomically (tmp file + rename) after every mutation — an interrupted write cannot
  leave a half-saved database.
- All statements are parameterised (`?`), verified by a test that inserts quotes and Arabic text.
- Money is stored as integer cents, stock as base units, costs as micro-units: no floating point in the ledger.
- Covered by `tests/db.test.ts`: migration version, foreign keys, CHECK constraints, rollback on throw, seed
  idempotency, camelCase row mapping.

## Security

- **Passwords:** scrypt (N=16384, r=8, p=1, 64-byte key) with a 16-byte random salt per hash, compared with
  `timingSafeEqual`; NFKC normalisation; minimum length enforced on setup, admin reset and self-service change.
- **Login:** identical `INVALID_CREDENTIALS` for unknown user and wrong password (no account enumeration);
  a disabled account gets `ACCOUNT_DISABLED` only after the password check succeeds.
- **Sessions:** in-memory only, no token in the renderer and nothing in `localStorage`; a disabled account or a
  role change takes effect on the next call because permissions are re-read per dispatch (tested).
- **Administration guards:** the last active owner/administrator cannot be disabled; usernames are unique
  case-insensitively; unknown roles are rejected before any write.
- **Audit trail:** login, logout, password change, user create/update/reset/activate and setup completion are
  recorded in `audit_log` with the acting user id.
- **Error hygiene:** unexpected exceptions become `{ code: 'INTERNAL' }`; filesystem paths and stack traces
  never cross IPC (tested).
- **Channel allowlist:** anything outside `CHANNELS` is rejected before a handler lookup.

## Fixes applied during this review

| Area | Finding | Fix |
| --- | --- | --- |
| Build layer | `electron.vite.config.ts`, `electron-builder.yml`, Tailwind/PostCSS config and scripts were missing, so nothing could start | Recreated the whole build layer (main/preload/renderer outputs, packaging config, typecheck/test/build scripts) |
| Backend | Main process, database, services, IPC registry were absent | Rebuilt on raw SQL over sql.js (30 tables, migrations, transactions, atomic persistence) |
| Contracts | `shared/constants.ts`, `types.ts` had duplicate exports, a broken import and typo'd labels; `bridge.ts` pulled `electron` into the renderer | Rewrote constants/types, added `shared/ipc.ts`, deleted the duplicate bridge |
| Renderer API | `lib/api.ts` had guessed signatures (envelopes, wrong arg counts) that no page matched | Retyped every method against the pages' real calls (arrays, `areas.*`, `orders.cancel(id, reason, policy)`, print, recipes, supplier ledger) |
| Routing | `App.tsx` imported pages that do not exist and rendered the shell without an outlet | First-run gating (setup → login → app), nested routes, only phase-1 pages routed |
| Navigation | Shell was hardcoded "AF"/"AFUS Restaurant" tiles and linked to unbuilt modules | New shell with the boutique mark/brand block, permission-filtered nav, user menu, change-password modal |
| Missing pages | No Employees or Settings page despite implemented channels | Added both (users/roles CRUD, activation, password reset; settings form with tax, paper, payment methods) |
| Design system | Ad-hoc Tailwind classes, no brand identity | Boutique tokens (AFUS blue `#1239B0`, green `#16B26B`, ink/sand neutrals), `AfusMark`/`AfusBrand`, dark mode, RTL |
| Types | 340 type errors (unions, unused imports, snake/camel order types, status maps) | Reduced to 0; canonicalised order/delivery/reservation statuses and money/unit helpers |
| Behaviour | Empty permission requirement (`[]`) denied instead of allowing | Fixed in `assertPermission`, covered by a test |

## Verification

```
npx tsc -p tsconfig.json --noEmit   # exit 0, 0 errors
npm test                            # 55 tests in 4 files, all passing
npm run build                       # typecheck + electron-vite build: main, preload, renderer
```

Tests: `tests/db.test.ts` (schema, constraints, transactions, seeding), `tests/security.test.ts` (hashing,
session guard, permission semantics), `tests/services.test.ts` (setup, auth, user admin, audit, settings),
`tests/registry.test.ts` (allowlist, validation, auth gating, permission re-read, error hygiene).

Not verified here: the Electron window itself (no GUI session was driven) and printing to a physical
receipt printer. Both still need a manual pass on the target machine.

## Phase 2 backlog

The shared allowlist already declares these channels; the registry reports them at startup through
`missingChannels()` and the UI shows `NOT_IMPLEMENTED` until they land:

- **Orders/POS/Kitchen** — order creation, items, discounts, payments, cancellation with stock policy,
  kitchen tickets and stations, receipts.
- **Inventory** — ingredients, stock adjustments, movements, recipes and automatic deduction.
- **Purchases** — suppliers, purchase invoices, receiving, supplier payments and ledger.
- **Customers, reservations, delivery, attendance, finance, reports, insight, print, backup, web.**

Suggested order: orders/POS + kitchen (the core money path), then inventory/recipes, then purchasing and
finance, with reservations and delivery last.
