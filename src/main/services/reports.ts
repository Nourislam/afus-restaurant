/** Date-ranged report tables and their export (CSV / HTML / PDF). */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReportTable } from '@shared/types'
import { dbAll, dbGet } from '../db/client'
import { AppError } from '../utils/errors'
import { dayString, monthStart, nowStamp, today } from '../utils/dates'
import { appPaths } from '../paths'
import { getSettings } from './settings'
import { branchClause, isHeadOffice, resolveBranchFilter } from './scope'
import { baseValueCents, fromBase, unitFactor } from './units'
import { settledSale } from './sale'

type Row = Record<string, string | number | null>

export const REPORT_TYPES = ['sales', 'products', 'payments', 'orderTypes', 'expenses', 'waste', 'staff', 'inventory', 'purchases', 'suppliers', 'delivery', 'branches'] as const
export type ReportType = (typeof REPORT_TYPES)[number]

function range(from?: string | null, to?: string | null): { from: string; to: string; fromTs: string; toTs: string } {
  const f = dayString(from, monthStart())
  const t = dayString(to, today())
  return { from: f, to: t, fromTs: `${f} 00:00:00`, toTs: `${t} 23:59:59` }
}

/** The branch every sales figure below is limited to (null = all of them). */
let branchFilter: number | null = null
const branchSql = (alias = 'o') => branchClause(branchFilter, alias)

const sum = (rows: Row[], key: string): number => rows.reduce((acc, row) => acc + Number(row[key] ?? 0), 0)

export function salesReport(from?: string | null, to?: string | null): ReportTable {
  const r = range(from, to)
  const rows = dbAll<Row>(
    `SELECT substr(createdAt, 1, 10) AS date, COUNT(*) AS orders, SUM(subtotalCents) AS grossCents, SUM(discountCents) AS discountCents,
            SUM(taxCents) AS taxCents, SUM(stampCents) AS stampCents, SUM(totalCents) AS totalCents,
            ROUND(AVG(totalCents)) AS averageCents
       FROM orders o WHERE ${settledSale('o')} AND o.createdAt BETWEEN ? AND ?${branchSql().sql} GROUP BY date ORDER BY date`,
    [r.fromTs, r.toTs, ...branchSql().params]
  )
  return {
    title: { ar: 'المبيعات اليومية', fr: 'Ventes par jour' },
    columns: [
      { key: 'date', label: { ar: 'التاريخ', fr: 'Date' }, type: 'date' },
      { key: 'orders', label: { ar: 'الطلبات', fr: 'Commandes' }, type: 'number' },
      { key: 'grossCents', label: { ar: 'الإجمالي', fr: 'Brut' }, type: 'money' },
      { key: 'discountCents', label: { ar: 'التخفيضات', fr: 'Remises' }, type: 'money' },
      { key: 'taxCents', label: { ar: 'الضريبة', fr: 'TVA' }, type: 'money' },
      { key: 'totalCents', label: { ar: 'الصافي', fr: 'Net' }, type: 'money' },
      { key: 'averageCents', label: { ar: 'متوسط الطلب', fr: 'Panier moyen' }, type: 'money' }
    ],
    rows,
    totals: { orders: sum(rows, 'orders'), grossCents: sum(rows, 'grossCents'), discountCents: sum(rows, 'discountCents'), taxCents: sum(rows, 'taxCents'), totalCents: sum(rows, 'totalCents') }
  }
}

export function productsReport(from?: string | null, to?: string | null): ReportTable {
  const r = range(from, to)
  const rows = dbAll<Row>(
    `SELECT oi.productId, oi.productNameAr AS nameAr, oi.productNameFr AS nameFr, SUM(oi.qty) AS qty,
            SUM(oi.lineTotalCents) AS revenueCents, SUM(oi.qty * p.costCents) AS costCents,
            SUM(oi.lineTotalCents) - SUM(oi.qty * p.costCents) AS marginCents
       FROM order_items oi JOIN orders o ON o.id = oi.orderId LEFT JOIN products p ON p.id = oi.productId
      WHERE ${settledSale('o')} AND o.createdAt BETWEEN ? AND ? AND oi.status != 'removed'${branchSql().sql}
      GROUP BY oi.productId ORDER BY revenueCents DESC`,
    [r.fromTs, r.toTs, ...branchSql().params]
  ).map((row) => ({ ...row, marginPct: Number(row.revenueCents) > 0 ? Math.round((Number(row.marginCents) * 10_000) / Number(row.revenueCents)) : 0 }))
  return {
    title: { ar: 'المبيعات حسب الصنف', fr: 'Ventes par article' },
    columns: [
      { key: 'nameAr', label: { ar: 'الصنف', fr: 'Article (AR)' } },
      { key: 'nameFr', label: { ar: 'الصنف (FR)', fr: 'Article' } },
      { key: 'qty', label: { ar: 'الكمية', fr: 'Qté' }, type: 'number' },
      { key: 'revenueCents', label: { ar: 'الإيراد', fr: 'CA' }, type: 'money' },
      { key: 'costCents', label: { ar: 'التكلفة', fr: 'Coût' }, type: 'money' },
      { key: 'marginCents', label: { ar: 'الهامش', fr: 'Marge' }, type: 'money' },
      { key: 'marginPct', label: { ar: 'الهامش %', fr: 'Marge %' }, type: 'percent' }
    ],
    rows,
    totals: { qty: sum(rows, 'qty'), revenueCents: sum(rows, 'revenueCents'), costCents: sum(rows, 'costCents'), marginCents: sum(rows, 'marginCents') }
  }
}

export function paymentsReport(from?: string | null, to?: string | null): ReportTable {
  const r = range(from, to)
  const rows = dbAll<Row>(
    `SELECT p.method, COUNT(*) AS count, SUM(p.amountCents) AS amountCents
       FROM order_payments p JOIN orders o ON o.id = p.orderId
      WHERE ${settledSale('o')} AND p.createdAt BETWEEN ? AND ?${branchSql().sql} GROUP BY p.method ORDER BY amountCents DESC`,
    [r.fromTs, r.toTs, ...branchSql().params]
  )
  return {
    title: { ar: 'طرق الدفع', fr: 'Moyens de paiement' },
    columns: [
      { key: 'method', label: { ar: 'الطريقة', fr: 'Méthode' } },
      { key: 'count', label: { ar: 'العدد', fr: 'Nombre' }, type: 'number' },
      { key: 'amountCents', label: { ar: 'المبلغ', fr: 'Montant' }, type: 'money' }
    ],
    rows,
    totals: { count: sum(rows, 'count'), amountCents: sum(rows, 'amountCents') }
  }
}

export function orderTypesReport(from?: string | null, to?: string | null): ReportTable {
  const r = range(from, to)
  const rows = dbAll<Row>(
    `SELECT type, COUNT(*) AS orders, SUM(totalCents) AS totalCents, ROUND(AVG(totalCents)) AS averageCents
       FROM orders o WHERE ${settledSale('o')} AND o.createdAt BETWEEN ? AND ?${branchSql().sql} GROUP BY o.type ORDER BY totalCents DESC`,
    [r.fromTs, r.toTs, ...branchSql().params]
  )
  return {
    title: { ar: 'أنواع الطلبات', fr: 'Types de commande' },
    columns: [
      { key: 'type', label: { ar: 'النوع', fr: 'Type' } },
      { key: 'orders', label: { ar: 'الطلبات', fr: 'Commandes' }, type: 'number' },
      { key: 'totalCents', label: { ar: 'المبلغ', fr: 'Montant' }, type: 'money' },
      { key: 'averageCents', label: { ar: 'متوسط', fr: 'Moyenne' }, type: 'money' }
    ],
    rows,
    totals: { orders: sum(rows, 'orders'), totalCents: sum(rows, 'totalCents') }
  }
}

export function expensesReport(from?: string | null, to?: string | null): ReportTable {
  const r = range(from, to)
  const rows = dbAll<Row>('SELECT category, COUNT(*) AS count, SUM(amountCents) AS amountCents FROM expenses WHERE expenseDate BETWEEN ? AND ? GROUP BY category ORDER BY amountCents DESC', [r.from, r.to])
  return {
    title: { ar: 'المصاريف حسب الفئة', fr: 'Dépenses par catégorie' },
    columns: [
      { key: 'category', label: { ar: 'الفئة', fr: 'Catégorie' } },
      { key: 'count', label: { ar: 'العدد', fr: 'Nombre' }, type: 'number' },
      { key: 'amountCents', label: { ar: 'المبلغ', fr: 'Montant' }, type: 'money' }
    ],
    rows,
    totals: { count: sum(rows, 'count'), amountCents: sum(rows, 'amountCents') }
  }
}

export function wasteReport(from?: string | null, to?: string | null): ReportTable {
  const r = range(from, to)
  const rows: Row[] = dbAll<{ nameAr: string; nameFr: string; unit: string; baseUnit: string; qtyBase: number; count: number; costMicros: number }>(
    `SELECT i.id, i.nameAr, i.nameFr, i.unit, i.baseUnit, -SUM(m.qtyDeltaBase) AS qtyBase, COUNT(*) AS count,
            i.costMicrosPerBase AS costMicros
       FROM ingredient_movements m JOIN ingredients i ON i.id = m.ingredientId
      WHERE m.type = 'waste' AND m.createdAt BETWEEN ? AND ? GROUP BY i.id ORDER BY qtyBase DESC`,
    [r.fromTs, r.toTs]
  ).map((row) => ({
    nameAr: row.nameAr,
    nameFr: row.nameFr,
    unit: row.unit,
    count: row.count,
    qty: fromBase(row.qtyBase, unitFactor(row.unit, row.baseUnit)),
    costCents: baseValueCents(row.qtyBase, row.costMicros)
  }))
  return {
    title: { ar: 'الهدر', fr: 'Pertes' },
    columns: [
      { key: 'nameAr', label: { ar: 'المكوّن', fr: 'Ingrédient (AR)' } },
      { key: 'nameFr', label: { ar: 'المكوّن (FR)', fr: 'Ingrédient' } },
      { key: 'qty', label: { ar: 'الكمية', fr: 'Qté' }, type: 'number' },
      { key: 'unit', label: { ar: 'الوحدة', fr: 'Unité' } },
      { key: 'count', label: { ar: 'المرات', fr: 'Fois' }, type: 'number' },
      { key: 'costCents', label: { ar: 'التكلفة', fr: 'Coût' }, type: 'money' }
    ],
    rows,
    totals: { costCents: sum(rows, 'costCents'), count: sum(rows, 'count') }
  }
}

export function staffReport(from?: string | null, to?: string | null): ReportTable {
  const r = range(from, to)
  const rows = dbAll<Row>(
    `SELECT u.fullName AS name, COUNT(o.id) AS orders, SUM(o.totalCents) AS totalCents, ROUND(AVG(o.totalCents)) AS averageCents,
            (SELECT COALESCE(SUM(a.minutes), 0) FROM attendance a WHERE a.userId = u.id AND a.clockIn BETWEEN ? AND ?) AS minutes
       FROM users u JOIN orders o ON o.userId = u.id
      WHERE ${settledSale('o')} AND o.createdAt BETWEEN ? AND ?${branchSql().sql} GROUP BY u.id ORDER BY totalCents DESC`,
    [r.fromTs, r.toTs, r.fromTs, r.toTs, ...branchSql().params]
  )
  return {
    title: { ar: 'أداء الموظفين', fr: 'Performance du personnel' },
    columns: [
      { key: 'name', label: { ar: 'الموظف', fr: 'Employé' } },
      { key: 'orders', label: { ar: 'الطلبات', fr: 'Commandes' }, type: 'number' },
      { key: 'totalCents', label: { ar: 'المبيعات', fr: 'Ventes' }, type: 'money' },
      { key: 'averageCents', label: { ar: 'متوسط', fr: 'Moyenne' }, type: 'money' },
      { key: 'minutes', label: { ar: 'دقائق الحضور', fr: 'Minutes de présence' }, type: 'number' }
    ],
    rows,
    totals: { orders: sum(rows, 'orders'), totalCents: sum(rows, 'totalCents'), minutes: sum(rows, 'minutes') }
  }
}

export function inventoryReport(): ReportTable {
  const rows: Row[] = dbAll<{ nameAr: string; nameFr: string; unit: string; baseUnit: string; stockQtyBase: number; minQtyBase: number; costMicrosPerBase: number }>(
    'SELECT nameAr, nameFr, unit, baseUnit, stockQtyBase, minQtyBase, costMicrosPerBase FROM ingredients WHERE isArchived = 0 ORDER BY nameAr COLLATE NOCASE'
  ).map((row) => {
    const factor = unitFactor(row.unit, row.baseUnit)
    return {
      nameAr: row.nameAr,
      nameFr: row.nameFr,
      unit: row.unit,
      stockQty: fromBase(row.stockQtyBase, factor),
      minQty: fromBase(row.minQtyBase, factor),
      low: row.minQtyBase > 0 && row.stockQtyBase <= row.minQtyBase ? '⚠' : '',
      valueCents: baseValueCents(Math.max(0, row.stockQtyBase), row.costMicrosPerBase)
    }
  })
  return {
    title: { ar: 'حالة المخزون', fr: 'État du stock' },
    columns: [
      { key: 'nameAr', label: { ar: 'المكوّن', fr: 'Ingrédient (AR)' } },
      { key: 'nameFr', label: { ar: 'المكوّن (FR)', fr: 'Ingrédient' } },
      { key: 'stockQty', label: { ar: 'الكمية', fr: 'Qté' }, type: 'number' },
      { key: 'unit', label: { ar: 'الوحدة', fr: 'Unité' } },
      { key: 'minQty', label: { ar: 'الحد الأدنى', fr: 'Minimum' }, type: 'number' },
      { key: 'low', label: { ar: 'منخفض', fr: 'Bas' } },
      { key: 'valueCents', label: { ar: 'القيمة', fr: 'Valeur' }, type: 'money' }
    ],
    rows,
    totals: { valueCents: sum(rows, 'valueCents') }
  }
}

export function purchasesReport(from?: string | null, to?: string | null): ReportTable {
  const r = range(from, to)
  const rows = dbAll<Row>(
    `SELECT p.purchaseDate AS date, s.name AS supplier, p.invoiceNo, p.status, p.totalCents, p.paidCents, p.totalCents - p.paidCents AS dueCents
       FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplierId
      WHERE p.status != 'cancelled' AND p.purchaseDate BETWEEN ? AND ? ORDER BY p.purchaseDate DESC, p.id DESC`,
    [r.from, r.to]
  )
  return {
    title: { ar: 'المشتريات', fr: 'Achats' },
    columns: [
      { key: 'date', label: { ar: 'التاريخ', fr: 'Date' }, type: 'date' },
      { key: 'supplier', label: { ar: 'المورد', fr: 'Fournisseur' } },
      { key: 'invoiceNo', label: { ar: 'رقم الفاتورة', fr: 'N° facture' } },
      { key: 'status', label: { ar: 'الحالة', fr: 'Statut' } },
      { key: 'totalCents', label: { ar: 'المبلغ', fr: 'Montant' }, type: 'money' },
      { key: 'paidCents', label: { ar: 'المدفوع', fr: 'Payé' }, type: 'money' },
      { key: 'dueCents', label: { ar: 'المتبقي', fr: 'Reste' }, type: 'money' }
    ],
    rows,
    totals: { totalCents: sum(rows, 'totalCents'), paidCents: sum(rows, 'paidCents'), dueCents: sum(rows, 'dueCents') }
  }
}

export function suppliersReport(): ReportTable {
  const rows = dbAll<Row>(
    `SELECT s.name, s.phone,
            COALESCE((SELECT SUM(p.totalCents) FROM purchases p WHERE p.supplierId = s.id AND p.status IN ('received','paid')), 0) AS purchasesCents,
            COALESCE((SELECT SUM(sp.amountCents) FROM supplier_payments sp WHERE sp.supplierId = s.id), 0) AS paidCents
       FROM suppliers s WHERE s.isArchived = 0 ORDER BY s.name COLLATE NOCASE`
  ).map((row) => ({ ...row, balanceCents: Number(row.purchasesCents) - Number(row.paidCents) }))
  return {
    title: { ar: 'أرصدة الموردين', fr: 'Soldes fournisseurs' },
    columns: [
      { key: 'name', label: { ar: 'المورد', fr: 'Fournisseur' } },
      { key: 'phone', label: { ar: 'الهاتف', fr: 'Téléphone' } },
      { key: 'purchasesCents', label: { ar: 'المشتريات', fr: 'Achats' }, type: 'money' },
      { key: 'paidCents', label: { ar: 'المدفوع', fr: 'Payé' }, type: 'money' },
      { key: 'balanceCents', label: { ar: 'الرصيد', fr: 'Solde' }, type: 'money' }
    ],
    rows,
    totals: { purchasesCents: sum(rows, 'purchasesCents'), paidCents: sum(rows, 'paidCents'), balanceCents: sum(rows, 'balanceCents') }
  }
}

export function deliveryReport(from?: string | null, to?: string | null): ReportTable {
  const r = range(from, to)
  const rows = dbAll<Row>(
    `SELECT COALESCE(d.courier, '—') AS courier, COUNT(*) AS deliveries,
            SUM(CASE WHEN d.status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
            SUM(CASE WHEN d.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
            SUM(d.feeCents) AS feesCents, SUM(o.totalCents) AS totalCents,
            ROUND(AVG(CASE WHEN d.deliveredAt IS NOT NULL THEN (julianday(d.deliveredAt) - julianday(o.createdAt)) * 1440 END)) AS avgMinutes
       FROM delivery_info d JOIN orders o ON o.id = d.orderId
      WHERE o.createdAt BETWEEN ? AND ?${branchSql().sql} GROUP BY d.courier ORDER BY deliveries DESC`,
    [r.fromTs, r.toTs, ...branchSql().params]
  )
  return {
    title: { ar: 'التوصيل حسب الموصّل', fr: 'Livraisons par livreur' },
    columns: [
      { key: 'courier', label: { ar: 'الموصّل', fr: 'Livreur' } },
      { key: 'deliveries', label: { ar: 'الطلبات', fr: 'Commandes' }, type: 'number' },
      { key: 'delivered', label: { ar: 'مسلّمة', fr: 'Livrées' }, type: 'number' },
      { key: 'cancelled', label: { ar: 'ملغاة', fr: 'Annulées' }, type: 'number' },
      { key: 'feesCents', label: { ar: 'رسوم التوصيل', fr: 'Frais' }, type: 'money' },
      { key: 'totalCents', label: { ar: 'المبلغ', fr: 'Montant' }, type: 'money' },
      { key: 'avgMinutes', label: { ar: 'متوسط الدقائق', fr: 'Minutes moy.' }, type: 'number' }
    ],
    rows,
    totals: { deliveries: sum(rows, 'deliveries'), delivered: sum(rows, 'delivered'), feesCents: sum(rows, 'feesCents'), totalCents: sum(rows, 'totalCents') }
  }
}

/** Every branch side by side: head office only. */
export function branchesReport(from?: string | null, to?: string | null): ReportTable {
  const r = range(from, to)
  const rows = dbAll<Row>(
    `SELECT COALESCE(b.nameAr, '—') AS nameAr, COALESCE(b.nameFr, '—') AS nameFr,
            COUNT(o.id) AS orders, SUM(o.totalCents) AS totalCents,
            ROUND(AVG(o.totalCents)) AS averageCents, SUM(o.taxCents) AS taxCents,
            SUM(o.discountCents) AS discountCents
       FROM orders o LEFT JOIN branches b ON b.id = o.branchId
      WHERE ${settledSale('o')} AND o.createdAt BETWEEN ? AND ?
      GROUP BY o.branchId ORDER BY totalCents DESC`,
    [r.fromTs, r.toTs]
  )
  return {
    title: { ar: 'المقارنة بين الفروع', fr: 'Comparaison des succursales' },
    columns: [
      { key: 'nameAr', label: { ar: 'الفرع', fr: 'Succursale (AR)' } },
      { key: 'nameFr', label: { ar: 'الفرع (FR)', fr: 'Succursale' } },
      { key: 'orders', label: { ar: 'الطلبات', fr: 'Commandes' }, type: 'number' },
      { key: 'totalCents', label: { ar: 'المبيعات', fr: 'Ventes' }, type: 'money' },
      { key: 'averageCents', label: { ar: 'متوسط الطلب', fr: 'Panier moyen' }, type: 'money' },
      { key: 'discountCents', label: { ar: 'التخفيضات', fr: 'Remises' }, type: 'money' },
      { key: 'taxCents', label: { ar: 'الضريبة', fr: 'TVA' }, type: 'money' }
    ],
    rows,
    totals: {
      orders: sum(rows, 'orders'),
      totalCents: sum(rows, 'totalCents'),
      discountCents: sum(rows, 'discountCents'),
      taxCents: sum(rows, 'taxCents')
    }
  }
}

export function report(type: string, from?: string | null, to?: string | null, branchId?: number | null): ReportTable {
  /* Set once here: a branch user's choice is overridden with their own branch,
     so no screen and no direct call can reach another branch's figures. */
  branchFilter = resolveBranchFilter(branchId)
  try {
    return runReport(type, from, to)
  } finally {
    branchFilter = null
  }
}

function runReport(type: string, from?: string | null, to?: string | null): ReportTable {
  switch (type as ReportType) {
    case 'sales':
      return salesReport(from, to)
    case 'products':
      return productsReport(from, to)
    case 'payments':
      return paymentsReport(from, to)
    case 'orderTypes':
      return orderTypesReport(from, to)
    case 'expenses':
      return expensesReport(from, to)
    case 'waste':
      return wasteReport(from, to)
    case 'staff':
      return staffReport(from, to)
    case 'inventory':
      return inventoryReport()
    case 'purchases':
      return purchasesReport(from, to)
    case 'suppliers':
      return suppliersReport()
    case 'delivery':
      return deliveryReport(from, to)
    case 'branches':
      /* Comparing branches is a head-office question by definition. */
      if (!isHeadOffice()) throw new AppError('FORBIDDEN')
      return branchesReport(from, to)
    default:
      throw new AppError('VALIDATION', `Unknown report: ${type}`)
  }
}

/* ---------------- Export ---------------- */

const money = (cents: number, currency: string, lang: 'ar' | 'fr'): string =>
  `${new Intl.NumberFormat(lang === 'ar' ? 'ar-DZ' : 'fr-DZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cents / 100)} ${currency}`

function cell(table: ReportTable, key: string, value: string | number | null, currency: string, lang: 'ar' | 'fr'): string {
  const column = table.columns.find((c) => c.key === key)
  if (value === null || value === undefined) return ''
  if (column?.type === 'money') return money(Number(value), currency, lang)
  if (column?.type === 'percent') return `${(Number(value) / 100).toFixed(1)} %`
  return String(value)
}

export function reportCsv(table: ReportTable, lang: 'ar' | 'fr'): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const head = table.columns.map((c) => esc(c.label[lang])).join(';')
  const body = table.rows.map((row) => table.columns.map((c) => esc(row[c.key] === null || row[c.key] === undefined ? '' : String(c.type === 'money' ? Number(row[c.key]) / 100 : row[c.key]))).join(';'))
  const totals = table.totals ? table.columns.map((c) => esc(table.totals && c.key in table.totals ? String(Number(table.totals[c.key]) / (c.type === 'money' ? 100 : 1)) : '')).join(';') : null
  return '﻿' + [head, ...body, ...(totals ? [totals] : [])].join('\r\n')
}

export function reportHtml(table: ReportTable, lang: 'ar' | 'fr', from: string, to: string): string {
  const settings = getSettings()
  const currency = settings.currency
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const head = table.columns.map((c) => `<th class="${c.type === 'money' || c.type === 'number' || c.type === 'percent' ? 'num' : ''}">${esc(c.label[lang])}</th>`).join('')
  const body = table.rows
    .map((row) => `<tr>${table.columns.map((c) => `<td class="${c.type === 'money' || c.type === 'number' || c.type === 'percent' ? 'num' : ''}">${esc(cell(table, c.key, row[c.key] ?? null, currency, lang))}</td>`).join('')}</tr>`)
    .join('')
  const totals = table.totals
    ? `<tr class="total">${table.columns.map((c) => `<td class="num">${table.totals && c.key in table.totals ? esc(cell(table, c.key, table.totals[c.key] ?? null, currency, lang)) : ''}</td>`).join('')}</tr>`
    : ''
  return `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(table.title[lang])}</title>
<style>body{font-family:Tahoma,Arial,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0}h2{font-size:14px;font-weight:normal;color:#555;margin:4px 0 16px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:start}th{background:#f3f4f6}.num{text-align:end;font-variant-numeric:tabular-nums}
.total td{font-weight:bold;border-top:2px solid #333}footer{margin-top:16px;font-size:10px;color:#777}@page{size:A4;margin:12mm}</style></head><body>
<h1>${esc(settings.restaurantName)} — ${esc(table.title[lang])}</h1><h2>${esc(from)} → ${esc(to)}</h2>
<table><thead><tr>${head}</tr></thead><tbody>${body}${totals}</tbody></table>
<footer>AFUS Restaurant · ${esc(nowStamp())}</footer></body></html>`
}

export function exportReport(input: { type: string; from?: string | null; to?: string | null; format: string; branchId?: number | null }): { filePath: string | null; html?: string } {
  const r = range(input.from, input.to)
  const table = report(input.type, r.from, r.to, input.branchId)
  const lang = getSettings().language
  const base = join(appPaths().reports, `${input.type}-${r.from}_${r.to}`)
  if (input.format === 'csv') {
    const filePath = `${base}.csv`
    writeFileSync(filePath, reportCsv(table, lang), 'utf8')
    return { filePath }
  }
  const html = reportHtml(table, lang, r.from, r.to)
  if (input.format === 'html') {
    const filePath = `${base}.html`
    writeFileSync(filePath, html, 'utf8')
    return { filePath }
  }
  /* PDF: the IPC layer renders the HTML through Electron (needs a BrowserWindow). */
  return { filePath: null, html }
}

export function reportTotals(from: string, to: string): { salesCents: number; orders: number } {
  const r = range(from, to)
  const row = dbGet<{ total: number | null; count: number }>(`SELECT SUM(totalCents) AS total, COUNT(*) AS count FROM orders WHERE ${settledSale('')} AND createdAt BETWEEN ? AND ?`, [r.fromTs, r.toTs])
  return { salesCents: row?.total ?? 0, orders: row?.count ?? 0 }
}
