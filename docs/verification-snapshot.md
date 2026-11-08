# AFUS Restaurant — verification snapshot

Machine: macOS 12.7.6 (Darwin) · Node 22.13.1 · npm

| Check | Result |
| --- | --- |
| `npx tsc -p tsconfig.json --noEmit` | exit 0, **0 TS errors** |
| `npm test` (vitest run) | **55 tests, 4 files, all passing** (db · security · services · registry) |
| `npm run build` (typecheck + electron-vite build) | exit 0 — `dist-electron/main/index.js`, `dist-electron/preload/index.js`, `dist/renderer/` |
| Renderer standalone preview | `dist/renderer/` built and valid — see `docs/standalone-renderer-preview.md` |
| Full Electron app (`npm run dev`) | **runs** — Electron 33.4.11 pinned (macOS 11+); window opens, `afus.sqlite` created, `[afus] 35 channels ready, 85 pending` |

## What is runnable right now

- The first-run path: splash → setup (restaurant + owner) → login → live shell (dashboard + side nav by permission).
- Phase-1 pages: Dashboard, Tables, Menu, Employees, Customers, Settings (staff list/roles/activation/password reset; settings form with tax, paper size, payment methods).
- Phase-2 pages that ship a typed API but remain stage-2 UI: POS, Orders, Delivery, Kitchen, Inventory, Recipes, Purchases, Reservations, Finance, Reports, Insight, Print, Backup, Web — flagged `NOT_IMPLEMENTED` at startup and in any IPC call, never throw.

## What is verified in code (not in a live GUI)

- **DB**: SQLite via sql.js with foreign keys on, versioned migrations, parameterised SQL (incl. Arabic/quote strings), CHECK constraints, transaction rollback on failure, single-statement writes flushed atomically to disk. 30 tables, 9 indexes.
- **Security**: scrypt (N=16384, r=8, p=1, 64-byte key, per-hash 16-byte salt, NFKC, timing-safe compare), minimum length on setup/admin-ops/self-change; login hides unknown vs wrong (no enumeration); disabled accounts get `ACCOUNT_DISABLED`; the last active owner/admin can't be disabled; session is in-memory only and never trusted from the renderer; permissions re-read on every IPC call; unexpected errors become `{ code: 'INTERNAL' }` and never leak paths.
- **IPC**: a single dispatch choke point — allowlist → zod → fresh session → permission re-check → handler → envelope — and an empty permission requirement now correctly means "authenticated only".
- **Build/contracts**: env.d.ts ties `Window.afus` to preload; every API method is typed against what pages actually send (arrays for list endpoints, correct arg counts, `ProductInput` includes `hasRecipe`/`modifierGroupIds`, `ListInput` includes `type`/`ingredientId`); all phase-2 page types are consistent so the build only resolves what is routed.

## Known limitation for this run

- The app launches with the pinned Electron 33.4.11 (framework `minos 11.0`). Electron 45 crashed here at load with `dyld: Symbol not found _OBJC_CLASS_$_SMAppService`, because `SMAppService` only exists on macOS 13+; see `docs/standalone-renderer-preview.md`. Bumping Electron past 33 reintroduces that crash on macOS 11/12.
- `main` in `package.json` points at `dist-electron/main/index.js`, which the production build produces; dist targets (`dist:mac` / `dist:win` / `dist:linux`) are wired in scripts but not run yet.
- git is not initialised in this workspace, so there is no commit yet and no safe revert mechanism. Creating the repo and the first commit is optional and needs the user's go-ahead.

## Files changed this session

- Reconstructed build layer: `electron.vite.config.ts`, `electron-builder.yml`, `postcss.config.js`, `tailwind.config.js`, TS configs, `vitest.config.ts`, `package.json` scripts, `.gitignore`.
- Main process: DB client/schema/seed, security (password, session), services (settings, auth, users, audit, setup), IPC registry + registers, preload bridge.
- Shared contracts: `constants.ts` (Unit/Station/OrderType/TableStatus/DeliveryStatus/ReservationStatus/Tone, `labelOf/toneOf`), `types.ts`, `ipc.ts`, `channels.ts`, `permissions.ts`.
- Renderer: env.d.ts, lib/hooks/api/labels/format, i18n, `App.tsx`, layout/atomic UI, `AfusLogo` (boutique mark/brand), `index.css`, and rewritten pages including missing Employees/Settings.
- Tests: `tests/db.test.ts`, `tests/security.test.ts`, `tests/services.test.ts`, `tests/registry.test.ts`.
- Docs: `docs/phase-1-review.md`, `docs/standalone-renderer-preview.md`.

## Phase-2 backlog (already on the shared allowlist, answered as NOT_IMPLEMENTED)

Orders/POS + kitchen (create, items, discounts, payments, cancel with stock policy, tickets, stations, receipts) → inventory/recipes (ingredients, movements, automatic deduction) → purchases (suppliers, invoices, receiving, payments, ledger) → customers/reservations/delivery/attendance/finance/reports/insight/print/backup/web.
