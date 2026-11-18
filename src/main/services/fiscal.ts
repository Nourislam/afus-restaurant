/**
 * Fiscal compliance pack (Algeria).
 *  - Stamp duty (timbre fiscal) on cash receipts, from editable brackets.
 *  - Sealed sales: every completed order gets the next sequential fiscal number
 *    and a sha256 chained to the previous sealed sale — the record cannot be
 *    altered or re-ordered without breaking the chain.
 *  - Integrity verification of both chains (sales + audit log).
 *  - Period closures (Z reports) and an export for a tax audit.
 *  - The publisher attestation (LF2026 art. 74): inaltérabilité, sécurisation,
 *    conservation, archivage — generated from the live state.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FiscalClosure, IntegrityReport } from '@shared/types'
import { dbAll, dbGet, dbWrite } from '../db/client'
import { nowStamp } from '../utils/dates'
import { AppError } from '../utils/errors'
import { appPaths } from '../paths'
import { getSettings } from './settings'
import { auditHash, sha256, writeAudit } from './audit'
import { stampCentsFor } from '@shared/stamp'

/* ---------------- Stamp duty ---------------- */

/** Stamp (cents) owed on a cash amount, per the configured brackets; 0 when disabled.
 *  The arithmetic is shared with the till, which has to show the stamp on the
 *  bill before the cashier takes the money. */
export function computeStamp(cashCents: number): number {
  return stampCentsFor(cashCents, getSettings())
}

/* ---------------- Sealed sales ---------------- */

interface SealRow {
  id: number
  orderNumber: string
  subtotalCents: number
  discountCents: number
  taxCents: number
  stampCents: number
  totalCents: number
  paidAt: string | null
  completedAt: string | null
  fiscalSeq: number | null
  fiscalHash: string | null
  fiscalPrevHash: string | null
}

const SEAL_SELECT = 'SELECT id, orderNumber, subtotalCents, discountCents, taxCents, stampCents, totalCents, paidAt, completedAt, fiscalSeq, fiscalHash, fiscalPrevHash FROM orders'

/**
 * The moment the sale became final for the tax authority: when the money was
 * all in. In a prepaid order that is before the food is handed over, so the
 * seal must not depend on `completedAt` — that column is still null at the time
 * and would change afterwards, breaking the chain. Sales sealed before this
 * existed have `paidAt` backfilled to `completedAt`, so their hash is unchanged.
 */
function fiscalMoment(r: SealRow): string {
  return r.paidAt ?? r.completedAt ?? ''
}

export function saleHash(prevHash: string, seq: number, r: SealRow): string {
  return sha256([prevHash, seq, r.orderNumber, r.subtotalCents, r.discountCents, r.taxCents, r.stampCents, r.totalCents, fiscalMoment(r)].join('|'))
}

/** Assign the next fiscal number and chain hash to a settled sale (idempotent). */
export function sealOrder(orderId: number): { fiscalSeq: number; fiscalHash: string } {
  const row = dbGet<SealRow>(`${SEAL_SELECT} WHERE id = ?`, [orderId])
  if (!row) throw new AppError('NOT_FOUND', 'Order not found')
  if (row.fiscalSeq !== null && row.fiscalHash) return { fiscalSeq: row.fiscalSeq, fiscalHash: row.fiscalHash }
  if (!fiscalMoment(row)) throw new AppError('CONFLICT', 'Only a settled sale is sealed')
  const prev = dbGet<{ fiscalSeq: number; fiscalHash: string }>(
    'SELECT fiscalSeq, fiscalHash FROM orders WHERE fiscalSeq IS NOT NULL ORDER BY fiscalSeq DESC LIMIT 1'
  )
  const seq = (prev?.fiscalSeq ?? 0) + 1
  const prevHash = prev?.fiscalHash ?? ''
  const hash = saleHash(prevHash, seq, row)
  dbWrite('UPDATE orders SET fiscalSeq = ?, fiscalHash = ?, fiscalPrevHash = ? WHERE id = ?', [seq, hash, prevHash, orderId])
  return { fiscalSeq: seq, fiscalHash: hash }
}

/* ---------------- Integrity ---------------- */

export function verifyIntegrity(): IntegrityReport {
  // Sales chain
  const sales = dbAll<SealRow>(`${SEAL_SELECT} WHERE fiscalSeq IS NOT NULL ORDER BY fiscalSeq ASC`)
  let prevHash = ''
  let expectedSeq = 1
  let brokenSale: number | null = null
  for (const r of sales) {
    if (r.fiscalSeq !== expectedSeq || (r.fiscalPrevHash ?? '') !== prevHash || saleHash(prevHash, expectedSeq, r) !== r.fiscalHash) {
      brokenSale = r.fiscalSeq
      break
    }
    prevHash = r.fiscalHash ?? ''
    expectedSeq += 1
  }
  // Audit chain (rows written before V5 have no hash: counted as legacy, chain starts after them)
  const audit = dbAll<{ id: number; userId: number | null; action: string; entity: string; entityId: string | null; details: string | null; createdAt: string; prevHash: string | null; hash: string | null }>(
    'SELECT id, userId, action, entity, entityId, details, createdAt, prevHash, hash FROM audit_log ORDER BY id ASC'
  )
  let legacy = 0
  let aPrev = ''
  let brokenAudit: number | null = null
  let aChecked = 0
  let started = false
  for (const a of audit) {
    if (!a.hash) {
      if (started) {
        brokenAudit = a.id
        break
      }
      legacy += 1
      continue
    }
    started = true
    if ((a.prevHash ?? '') !== aPrev || auditHash(aPrev, a.userId, a.action, a.entity, a.entityId, a.details, a.createdAt) !== a.hash) {
      brokenAudit = a.id
      break
    }
    aPrev = a.hash
    aChecked += 1
  }
  return {
    ok: brokenSale === null && brokenAudit === null,
    checkedAt: nowStamp(),
    orders: { checked: brokenSale === null ? sales.length : expectedSeq - 1, brokenAt: brokenSale, headHash: prevHash || null },
    audit: { checked: aChecked, legacyRows: legacy, brokenAt: brokenAudit, headHash: aPrev || null }
  }
}

/* ---------------- Closures (Z reports) ---------------- */

function periodRange(kind: 'day' | 'year', key: string): { fromAt: string; toAt: string } {
  if (kind === 'day') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new AppError('VALIDATION', 'Day key must be YYYY-MM-DD')
    return { fromAt: `${key} 00:00:00`, toAt: `${key} 23:59:59` }
  }
  if (!/^\d{4}$/.test(key)) throw new AppError('VALIDATION', 'Year key must be YYYY')
  return { fromAt: `${key}-01-01 00:00:00`, toAt: `${key}-12-31 23:59:59` }
}

function mapClosure(r: Record<string, unknown>): FiscalClosure {
  return r as unknown as FiscalClosure
}

export function closePeriod(kind: 'day' | 'year', key: string): FiscalClosure {
  const { fromAt, toAt } = periodRange(kind, key)
  const sales = dbAll<SealRow>(
    /* A sealed sale counts on the day its money came in. Requiring 'completed'
       would drop a prepaid order still waiting at the counter, and dating it by
       `completedAt` would push it into tomorrow if it is handed over after
       midnight — while the cash is in tonight's drawer. */
    `${SEAL_SELECT} WHERE status != 'cancelled' AND fiscalSeq IS NOT NULL AND COALESCE(paidAt, completedAt) BETWEEN ? AND ? ORDER BY fiscalSeq ASC`,
    [fromAt, toAt]
  )
  const sum = (f: (r: SealRow) => number) => sales.reduce((acc, r) => acc + f(r), 0)
  const grossCents = sum((r) => r.totalCents)
  const taxCents = sum((r) => r.taxCents)
  const stampCents = sum((r) => r.stampCents)
  const chainHash = sha256(sales.map((r) => r.fiscalHash ?? '').join('|') || `${kind}:${key}:empty`)
  dbWrite(
    `INSERT INTO fiscal_closures (kind, periodKey, fromAt, toAt, salesCount, grossCents, taxCents, stampCents, netCents, firstSeq, lastSeq, chainHash, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, periodKey) DO UPDATE SET salesCount = excluded.salesCount, grossCents = excluded.grossCents, taxCents = excluded.taxCents,
       stampCents = excluded.stampCents, netCents = excluded.netCents, firstSeq = excluded.firstSeq, lastSeq = excluded.lastSeq,
       chainHash = excluded.chainHash, createdAt = excluded.createdAt`,
    [kind, key, fromAt, toAt, sales.length, grossCents, taxCents, stampCents, grossCents - taxCents - stampCents,
      sales[0]?.fiscalSeq ?? null, sales[sales.length - 1]?.fiscalSeq ?? null, chainHash, nowStamp()]
  )
  writeAudit('fiscal.close', 'closure', `${kind}:${key}`, { salesCount: sales.length, grossCents })
  return mapClosure(dbGet<Record<string, unknown>>('SELECT * FROM fiscal_closures WHERE kind = ? AND periodKey = ?', [kind, key])!)
}

export function listClosures(limit = 60): FiscalClosure[] {
  return dbAll<Record<string, unknown>>('SELECT * FROM fiscal_closures ORDER BY id DESC LIMIT ?', [limit]).map(mapClosure)
}

/* ---------------- Export for a tax audit ---------------- */

export function fiscalExport(from: string, to: string): { dir: string; files: string[]; count: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new AppError('VALIDATION', 'Dates must be YYYY-MM-DD')
  const s = getSettings()
  const sales = dbAll<SealRow & { type: string; paidCents: number }>(
    `SELECT id, orderNumber, type, subtotalCents, discountCents, taxCents, stampCents, totalCents, paidCents,
            COALESCE(paidAt, completedAt) AS soldAt, paidAt, completedAt, fiscalSeq, fiscalHash, fiscalPrevHash
       FROM orders WHERE status != 'cancelled' AND fiscalSeq IS NOT NULL AND COALESCE(paidAt, completedAt) BETWEEN ? AND ? ORDER BY fiscalSeq ASC`,
    [`${from} 00:00:00`, `${to} 23:59:59`]
  )
  const closures = dbAll<Record<string, unknown>>('SELECT * FROM fiscal_closures WHERE fromAt >= ? AND toAt <= ? ORDER BY id', [`${from} 00:00:00`, `${to} 23:59:59`])
  const integrity = verifyIntegrity()
  const dir = appPaths().reports
  const base = `fiscal-${from}-${to}`
  const json = {
    exportedAt: nowStamp(),
    restaurant: { legalName: s.legalName || s.restaurantName, nif: s.nif, nis: s.nis, rc: s.rc, ai: s.ai, address: s.fiscalAddress || s.address },
    period: { from, to },
    integrity,
    totals: {
      salesCount: sales.length,
      grossCents: sales.reduce((a, r) => a + r.totalCents, 0),
      taxCents: sales.reduce((a, r) => a + r.taxCents, 0),
      stampCents: sales.reduce((a, r) => a + r.stampCents, 0)
    },
    sales,
    closures
  }
  writeFileSync(join(dir, `${base}.json`), JSON.stringify(json, null, 2))
  const csvEsc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const header = ['fiscalSeq', 'orderNumber', 'type', 'soldAt', 'completedAt', 'subtotalCents', 'discountCents', 'taxCents', 'stampCents', 'totalCents', 'paidCents', 'fiscalHash', 'fiscalPrevHash']
  const csv = [header.join(','), ...sales.map((r) => header.map((h) => csvEsc((r as unknown as Record<string, unknown>)[h])).join(','))].join('\n')
  writeFileSync(join(dir, `${base}.csv`), '﻿' + csv)
  writeAudit('fiscal.export', 'export', base, { count: sales.length })
  return { dir, files: [`${base}.json`, `${base}.csv`], count: sales.length }
}

/* ---------------- Publisher attestation ---------------- */

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function attestationHtml(lang: 'ar' | 'fr', appVersion: string): string {
  const s = getSettings()
  const integrity = verifyIntegrity()
  const rtl = lang === 'ar'
  const L = (ar: string, fr: string) => (rtl ? ar : fr)
  const name = s.legalName || s.restaurantName
  const row = (k: string, v: string) => (v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : '')
  const guarantees: [string, string][] = rtl
    ? [
        ['عدم قابلية التعديل', 'كل عملية بيع مكتملة تُختم برقم جبائي متسلسل وبصمة SHA-256 مرتبطة بالعملية السابقة؛ لا يسمح البرنامج بتعديل أو حذف بيع مكتمل، وأي تلاعب مباشر بالقاعدة يكسر السلسلة ويُكتشف عند التحقق.'],
        ['التأمين', 'الدخول بحساب ورمز سري لكل عامل مع صلاحيات، وسجل تدقيق مسلسل البصمات لكل عملية حساسة (بيع، إلغاء، تخفيض، إعدادات).'],
        ['الحفظ', 'تُحفظ كل العمليات في قاعدة بيانات محلية مع نسخ احتياطي تلقائي؛ لا تُمحى بيانات البيع.'],
        ['الأرشفة', 'إغلاقات يومية وسنوية (تقارير Z) ببصمة سلسلة، وتصدير كامل للمبيعات بصيغتي JSON وCSV لعرضه على إدارة الضرائب.']
      ]
    : [
        ['Inaltérabilité', "Chaque vente clôturée reçoit un numéro fiscal séquentiel et une empreinte SHA-256 chaînée à la vente précédente ; le logiciel refuse toute modification ou suppression d'une vente clôturée, et toute altération directe de la base rompt la chaîne, détectée à la vérification."],
        ['Sécurisation', "Accès par compte et code personnel avec droits par rôle ; journal d'audit à empreintes chaînées pour chaque opération sensible (vente, annulation, remise, paramètres)."],
        ['Conservation', 'Toutes les opérations sont conservées dans une base locale avec sauvegarde automatique ; aucune donnée de vente n’est effacée.'],
        ['Archivage', "Clôtures journalières et annuelles (rapports Z) avec empreinte de chaîne, et export complet des ventes en JSON et CSV pour présentation à l'administration fiscale."]
      ]
  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(L('التزام الناشر', "Attestation de l'éditeur"))} — Afus Restaurant</title>
<style>body{font-family:Cairo,"Segoe UI",system-ui,sans-serif;max-width:800px;margin:32px auto;padding:0 24px;color:#111;line-height:1.6}h1{font-size:24px;margin:0 0 4px}h2{font-size:16px;margin:26px 0 8px;color:#333}.sub{color:#555;margin:0 0 18px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:start;padding:7px 10px;border-bottom:1px solid #e5e5e5;vertical-align:top}th{width:34%;color:#555;font-weight:600}.g{margin:10px 0 0;padding:12px 14px;border:1px solid #e5e5e5;border-radius:8px}.g b{display:block;margin-bottom:4px}.ok{color:#15803d;font-weight:700}.bad{color:#b91c1c;font-weight:700}.sig{margin-top:36px;display:flex;justify-content:space-between;gap:24px;font-size:14px}.sig div{flex:1;border-top:1px solid #999;padding-top:8px}.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px;word-break:break-all}.note{font-size:12px;color:#666;margin-top:20px}@media print{body{margin:0}}</style></head><body>
<h1>${esc(L('التزام الناشر بشأن برنامج الكاشير', "Attestation de l'éditeur relative au logiciel de caisse"))}</h1>
<p class="sub">${esc(L('وفق المادة 74 من قانون المالية 2026 (المادة 20 مكرر ثالثًا من قانون الإجراءات الجبائية)', "Conformément à l'article 74 de la loi de finances 2026 (article 20 ter du code des procédures fiscales)"))}</p>
<h2>${esc(L('المكلّف بالضريبة', 'Le contribuable'))}</h2>
<table>${row(L('الاسم القانوني', 'Raison sociale'), name)}${row('NIF', s.nif)}${row('NIS', s.nis)}${row('RC', s.rc)}${row('AI', s.ai)}${row(L('العنوان', 'Adresse'), s.fiscalAddress || s.address)}</table>
<h2>${esc(L('البرنامج', 'Le logiciel'))}</h2>
<table>${row(L('الاسم', 'Nom'), 'Afus Restaurant')}${row(L('الناشر', 'Éditeur'), 'Afus')}${row(L('الإصدار', 'Version'), appVersion)}${row(L('نوع التخزين', 'Stockage'), L('قاعدة بيانات محلية مشفّرة البصمات', 'Base de données locale, empreintes chaînées'))}</table>
<h2>${esc(L('الضمانات', 'Les garanties'))}</h2>
${guarantees.map(([k, v]) => `<div class="g"><b>${esc(k)}</b>${esc(v)}</div>`).join('')}
<h2>${esc(L('حالة السلامة عند الإصدار', "État d'intégrité à la date d'édition"))}</h2>
<table>
<tr><th>${esc(L('النتيجة', 'Résultat'))}</th><td class="${integrity.ok ? 'ok' : 'bad'}">${esc(integrity.ok ? L('سليم — لم يُكتشف أي تلاعب', 'Intègre — aucune altération détectée') : L('مكسور — راجع سجل التحقق', 'Rompu — consulter la vérification'))}</td></tr>
<tr><th>${esc(L('مبيعات مختومة', 'Ventes scellées'))}</th><td>${integrity.orders.checked}</td></tr>
<tr><th>${esc(L('بصمة رأس سلسلة المبيعات', 'Empreinte de tête (ventes)'))}</th><td class="mono">${esc(integrity.orders.headHash ?? '—')}</td></tr>
<tr><th>${esc(L('سجلات التدقيق المتحقَّق منها', "Entrées d'audit vérifiées"))}</th><td>${integrity.audit.checked}</td></tr>
<tr><th>${esc(L('بصمة رأس سلسلة التدقيق', "Empreinte de tête (audit)"))}</th><td class="mono">${esc(integrity.audit.headHash ?? '—')}</td></tr>
<tr><th>${esc(L('التاريخ', 'Date'))}</th><td>${esc(integrity.checkedAt)}</td></tr>
</table>
<div class="sig"><div>${esc(L('الناشر: Afus', "L'éditeur : Afus"))}<br>${esc(L('التوقيع والختم', 'Signature et cachet'))}</div><div>${esc(L('المكلّف', 'Le contribuable'))}: ${esc(name)}<br>${esc(L('التوقيع والختم', 'Signature et cachet'))}</div></div>
<p class="note">${esc(L('تُقدَّم هذه الوثيقة عند الرقابة الجبائية مع تصدير المبيعات للفترة المطلوبة. يُتحقّق من السلامة في أي وقت من داخل البرنامج (الإعدادات ← الامتثال الجبائي).', "Ce document est présenté lors d'un contrôle fiscal avec l'export des ventes de la période demandée. L'intégrité peut être vérifiée à tout moment depuis le logiciel (Paramètres → Conformité fiscale)."))}</p>
</body></html>`
}
