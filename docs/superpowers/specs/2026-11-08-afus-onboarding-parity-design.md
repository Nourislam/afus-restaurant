# Afus Restaurant — onboarding parity with Afus Boutique/Hanout

**Date:** 2026-11-08
**Status:** approved (design) — Phase 1 implementing

## Problem

Afus Boutique and Afus Hanout share one onboarding identity. The restaurant
diverges, which breaks the Afus look and is harder for staff:

- **Login** (Afus): pick your profile card (avatar initial + name + role), then a
  **4-digit PIN** on an on-screen number pad. Shop logo + name on top,
  "powered by Afus" footer. `LoginScreen.jsx` is byte-identical between Boutique
  and Hanout — a fixed Afus component.
- **Setup** (Afus): 5-step wizard with a left step rail + `AfusLogo` — language →
  shop info → **admin (name + 4-digit PIN)** → tax/currency (DZD) → done.
- The restaurant instead uses a typed **username + password** login and a flat
  setup form, with no `TitleBar`, no `NumPad`, no "powered by Afus".

Separately, the app is a partial shell: **35 of 116** IPC channels are
implemented. The working slice is catalog + tables + users + dashboard. The
core restaurant workflow (orders, POS, kitchen, delivery, reservations,
inventory, recipes, purchases, customers) has **UI pages but no backend**, so
those pages are intentionally unrouted.

## Decision

Adopt **full Afus parity**: replace username/password with **name + 4-digit PIN
profile login**, and a 5-step setup wizard, matching Boutique/Hanout. This is the
identity the user asked to preserve. (Rejected: visual-only restyle keeping
passwords — fails the "resemble Afus" requirement; hybrid password-for-admin —
needless divergence.)

## Phase 1 scope (this cycle)

### 1. Database — migration V2 (non-destructive)
- Add `pinHash TEXT` to `users`.
- `username` becomes optional (auto-generated from name when absent); keep the
  column and `passwordHash` for backward compatibility, unused by the new login.
- Existing rows keep working; new installs use PIN only.

### 2. Backend (main/services/auth.ts + setup.ts + users.ts)
- `employees.listForLogin` — **pre-auth**, returns only `{id, fullName, roleLabel,
  initial}` for active users (no hashes, no sensitive fields).
- `auth.verifyPin({ id, pin })` — verifies the 4-digit PIN, opens the session.
- `auth.changePin({ currentPin, newPin })`, `users.resetPin({ id, newPin })` (admin).
- `setup.complete` — creates the owner with `name` + `pinHash` (PIN validated as
  exactly 4 digits), writes `ui_mode = 'simple'`.
- PIN hashing reuses the existing password hashing (scrypt/bcrypt as present).

### 3. Renderer components (new, Afus-styled)
- `NumPad` / `PinPad` — 4-cell PIN entry with an on-screen number pad, dark theme,
  `active:scale-95` keys, Enter/Backspace.
- `TitleBar` — top window-chrome bar: `AfusMark` + app name, draggable region,
  leaves space for native window buttons (macOS hidden-inset).

### 4. Renderer pages (rewrite)
- `Login.tsx` → profile grid + `PinPad` + restaurant logo/name + "powered by
  Afus" footer. Back button, invalid-PIN toast, offline note.
- `Setup.tsx` → 5-step wizard (language, restaurant info, admin name+PIN, tax +
  DZD, done) with left step rail (`AfusMark`, step icons, offline note) and a
  footer (back / next / finish), matching `SetupWizard.jsx`.
- Reuse existing `AfusLogo` (`AfusMark`, `AfusBrand`).

### 5. Ease of use (not cluttered)
- **Simple mode** (`ui_mode: 'simple'` like Afus): non-managers see only the
  essentials in the sidebar; managers can switch to full mode in Settings.

### 6. Employees page
- Manage **PIN** (set / reset) instead of password; add / activate / deactivate,
  matching the Afus admin flow.

### 7. Fixes to land
- Commit the `app.disableHardwareAcceleration()` fix (EGL log flood) to GitHub.
- Confirm the Afus dark restyle, table animations, and clean reset (already done).

## Out of scope (future phases — roadmap)
- **Phase 2:** orders + POS + kitchen display (the core workflow) — backend
  services + IPC + routing the `Pos`/`Kitchen`/`Orders` pages.
- **Phase 3:** delivery + reservations.
- **Phase 4:** inventory + recipes (auto stock deduction, real plate cost).
- **Phase 5:** QR menu + advanced reports (profit, best-sellers, rush hours).
Each phase is its own spec → plan → implementation cycle.

## Testing
- Unit: PIN hashing/verify, setup creates owner with PIN, `listForLogin` leaks no
  hashes, migration adds `pinHash` idempotently.
- Manual: fresh DB → wizard → create admin PIN → login by profile+PIN → simple
  vs full mode → admin resets a worker PIN.
- `npm run typecheck` and `npm run build` green.

## Risks
- Pre-auth `listForLogin` must expose no secrets — keep the projection minimal.
- Migration must be idempotent (guard the `ALTER TABLE`).
- Keep `passwordHash` columns to avoid a destructive migration.
