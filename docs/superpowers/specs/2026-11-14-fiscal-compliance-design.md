# Afus Restaurant — Phase 5: fiscal compliance pack + publisher attestation

**Date:** 2026-11-14 · **Status:** approved (report §6 P0 items 2–3) — implementing

## Why

Algerian rules the program must satisfy to be sellable (report §4):
- A **cash-register ticket** for every consumer sale, invoice on request; the ticket
  carries the seller's fiscal identity (NIF, NIS, RC, AI), TVA at 9% (classified
  tourist restaurants, until 31/12/2027) or 19%, and **sequential numbering**.
- **Timbre fiscal** (stamp duty) on cash-paid receipts (progressive per 100 DA bracket).
- **LF2026 art. 74 → art. 20 ter CPF**: on audit, anyone recording sales with
  software must present the **editor's attestation / accredited certificate** that it
  ensures **inaltérabilité, sécurisation, conservation, archivage** of the data.
  Third-party summaries cite a 500,000 DA fine per software from 1 Jan 2027.

No Algerian competitor advertises a ready attestation pack; shipping one is a
first-mover advantage and removes a sales objection.

## Scope

### 1. Settings — fiscal identity (new keys, all optional until the owner fills them)
`legalName`, `nif`, `nis`, `rc`, `ai`, `fiscalAddress`, `touristClassified`
(boolean → suggests 9% TVA), `stampEnabled` (default **false**), `stampBrackets`
(JSON list of `{uptoCents|null, ratePerHundred}` defaults 1 / 1.5 / 2 DA per 100 DA
for ≤30 000 / ≤100 000 / above — **editable, flagged "verify with your accountant"**),
`stampMinCents` (500 = 5 DA), `stampMaxCents` (0 = no cap).

### 2. Database — migration V5 (non-destructive)
- `orders`: `stampCents INTEGER NOT NULL DEFAULT 0`, `fiscalSeq INTEGER` (sequential
  number of the sealed sale), `fiscalHash TEXT`, `fiscalPrevHash TEXT`.
- `audit_log`: `prevHash TEXT`, `hash TEXT` — every row chained to the previous one.
- `fiscal_closures`: id, kind ('day'|'year'), periodKey, fromAt, toAt, salesCount,
  grossCents, taxCents, stampCents, netCents, firstSeq, lastSeq, chainHash, createdAt.

### 3. Backend — `services/fiscal.ts`
- `computeStamp(cashCents)` from the configured brackets/min/max; 0 when disabled.
- `sealOrder(orderId)` — called when an order completes: assigns the next `fiscalSeq`
  and `fiscalHash = sha256(prevHash | seq | orderNumber | totals | completedAt)`.
  Sealed rows are never updated afterwards (the services already refuse edits on
  completed orders).
- Audit hash chain: `writeAudit` computes `prevHash`/`hash` per row.
- `verifyIntegrity()` — walks both chains; returns `{ok, orders:{checked,brokenAt},
  audit:{checked,brokenAt}}`.
- `closePeriod('day'|'year', key)` — Z-report: totals + TVA + stamp + seq range +
  chain hash, stored in `fiscal_closures` (idempotent per period).
- `fiscalExport(from,to)` — writes `fiscal-<from>-<to>.json` and `.csv` (sales with
  seq/hash, TVA breakdown, stamps, closures) into the reports folder for an audit.
- `attestationHtml(lang)` — the bilingual "Attestation de l'éditeur / التزام الناشر"
  document: restaurant fiscal identity, software name/version/build, the four
  guarantees and how each is implemented, current chain hash + date, Afus signature
  block. Printable via the existing print service.
- Stamp in `payOrder`: when enabled and a cash payment is recorded, compute the stamp
  on the cash amount, store `stampCents`, add it to `totalCents`/`dueCents` before the
  completion check (customer owes the stamp; receipt shows it as its own line).

### 4. IPC
`fiscal.verify`, `fiscal.closePeriod`, `fiscal.export`, `fiscal.attestation`,
`fiscal.previewStamp`, `fiscal.closures` (list); settings keys via `settings.update`.

### 5. Renderer
- **Settings → الامتثال الجبائي / Conformité**: identity fields, TVA classification,
  stamp toggle + brackets, buttons: verify integrity (shows result), close day (Z),
  export for audit, open/print attestation, closures list.
- **Receipt** (`lib/receipts.ts`): fiscal header (legal name, NIF/NIS/RC/AI, address),
  `N° fiscal` (seq), TVA breakdown (rate, base, tax), `Timbre` line when > 0,
  short integrity code (first 8 hex of the hash), legal footer.

## Out of scope
E-invoicing API (DGI phases not published), accredited third-party certification
(the pack prepares the dossier; certification is a business step), TPE/Baridi Pay
(Phase 6).

## Tests
Stamp brackets (0 when disabled, min, bracket boundaries, cap); sealing assigns
sequential seq and chains hashes; verifyIntegrity detects a tampered order/audit row;
day closure totals; export writes files; audit rows chained from the first write.
typecheck / test / build green.
