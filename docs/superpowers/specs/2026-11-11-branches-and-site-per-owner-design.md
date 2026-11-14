# Afus Restaurant — Phase 4: branches + a professional site per owner

**Date:** 2026-11-11 · **Status:** approved (from the competitive report §6–§8) — implementing

## Why

The competitive research (reports/مقارنة برامج تسيير المطاعم.md) shows no Algerian
competitor gives each restaurant its own professional site **with branches from
inside the program**, and the user requires: when the program is sold to many
restaurants/fast-foods/cafés, **every owner gets their own site, branches
possible, hosted on Claude** (each restaurant = its own Claude Artifact).

## Scope

### 1. Data — migration V4
- `branches`: id, nameAr, nameFr, address, phone, hoursJson (per weekday open/close),
  isOpen (manual toggle), deliveryNote, sortOrder, isActive.
- `branch_product_overrides`: branchId, productId, priceCents (nullable = inherit),
  isAvailable (nullable = inherit). Unique (branchId, productId).
- `settings.restaurantSlug` (url-safe id used in the site URL / artifact name).
- A fresh restaurant gets one default branch ("الفرع الرئيسي") from its own
  name/address/phone so nothing changes for single-site owners.

### 2. Backend
- `services/branches.ts`: list/save/setActive, overrides get/set, effective menu for a
  branch (core menu + overrides), effective open state (manual toggle AND hours).
- `services/website.ts`: `publicData(lang, branchId?)` now returns the tenant
  (slug, brand, theme) + all branches (name, address, phone, hours, open state) +
  the branch-effective menu; closed state is **per branch**; QR per branch
  (`?branch=<id>`); `exportSite()` writes one self-contained `index.html` per
  language (the artifact-ready file) and keeps the LAN server.
- IPC: `branches.list/save/setActive/overrides/setOverride`, `website.*` extended.

### 3. Storefront (the professional design)
- Port the published Djemr design into `storefront.ts`: Aref Ruqaa + Cairo +
  Fraunces, ember hero, 4 moods (ember/noir/sable/nar), printed-menu list,
  featured trio, elegant order drawer, **WhatsApp ordering** (universal), AR/FR.
- Add a **branch picker** (shows each branch's hours + open/closed), per-branch
  prices/availability, per-branch closed banner, and the branch's WhatsApp number.
- Keep the optional `/api/order` intake for the LAN server path.

### 4. Renderer
- Website page: branches section (add/edit, hours, open toggle, per-branch QR),
  theme gallery, slug/brand, "Export site" (artifact-ready HTML), LAN on/off.
- Settings: restaurant slug.
- i18n (ar/fr).

### 5. Publishing on Claude
- The program exports the artifact-ready HTML; publishing each restaurant's site
  as its own Claude Artifact is done through Claude (one call per restaurant),
  giving every owner a private shareable URL. Documented in the Website page.

## Out of scope (next phases per the report)
Fiscal compliance pack + publisher attestation (Phase 5), Yassir + Baridi Pay/TPE
(Phase 6), recipes/food cost (Phase 7), smart reports/loyalty/reservations (Phase 8).

## Tests
Branch CRUD, overrides applied in effective menu, closed-per-branch logic (toggle
and hours), storefront renders branch picker and branch prices, export writes
files. typecheck/test/build green.
