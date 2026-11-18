/** Offline "insights": period comparisons, margins, reorder forecast, anomalies, and a
 *  small bilingual question box. No network, no model — plain arithmetic on the ledger. */
import type { InsightAnswer, InsightOverview, ReportTable } from '@shared/types'
import { dbAll, dbGet } from '../db/client'
import { addDays, nowStamp, today } from '../utils/dates'
import { expensesReport, inventoryReport, productsReport, salesReport, wasteReport } from './reports'
import { baseValueCents, fromBase, unitFactor } from './units'
import { settledSale } from './sale'

const ts = (day: string, end = false) => `${day} ${end ? '23:59:59' : '00:00:00'}`

function salesBetween(from: string, to: string): number {
  return dbGet<{ total: number | null }>(`SELECT SUM(totalCents) AS total FROM orders WHERE ${settledSale('')} AND createdAt BETWEEN ? AND ?`, [ts(from), ts(to, true)])?.total ?? 0
}

export function insightOverview(rangeDays = 30): InsightOverview {
  const to = today()
  const from = addDays(to, -(rangeDays - 1))
  const prevTo = addDays(from, -1)
  const prevFrom = addDays(prevTo, -(rangeDays - 1))
  const highlights: InsightOverview['highlights'] = []

  const current = salesBetween(from, to)
  const previous = salesBetween(prevFrom, prevTo)
  if (previous > 0) {
    const change = Math.round(((current - previous) / previous) * 100)
    highlights.push({
      ar: `المبيعات ${change >= 0 ? 'ارتفعت' : 'انخفضت'} بنسبة ${Math.abs(change)}% مقارنة بالفترة السابقة.`,
      fr: `Les ventes ont ${change >= 0 ? 'augmenté' : 'baissé'} de ${Math.abs(change)} % par rapport à la période précédente.`,
      tone: change >= 0 ? 'positive' : 'warning'
    })
  } else if (current > 0) {
    highlights.push({ ar: 'أول فترة بمبيعات مسجّلة — المقارنات تبدأ من الشهر القادم.', fr: 'Première période avec des ventes — les comparaisons commencent le mois prochain.', tone: 'info' })
  }

  /* Best profit: products by absolute margin in the period. */
  const products = productsReport(from, to)
  const bestProfit = [...products.rows]
    .sort((a, b) => Number(b.marginCents) - Number(a.marginCents))
    .slice(0, 5)
    .map((row) => ({ nameAr: String(row.nameAr), nameFr: String(row.nameFr), marginCents: Number(row.marginCents), marginBp: Number(row.marginPct) }))
  const best = bestProfit[0]
  if (best && best.marginCents > 0) {
    highlights.push({ ar: `أكثر طبق ربحًا: ${best.nameAr}.`, fr: `Plat le plus rentable : ${best.nameFr}.`, tone: 'positive' })
  }

  /* Declining: qty down ≥ 20 % vs previous period. */
  const previousProducts = new Map(productsReport(prevFrom, prevTo).rows.map((row) => [row.productId, Number(row.qty)]))
  const declining = products.rows
    .map((row) => {
      const before = previousProducts.get(row.productId) ?? 0
      const now = Number(row.qty)
      return { nameAr: String(row.nameAr), nameFr: String(row.nameFr), changePct: before > 0 ? Math.round(((now - before) / before) * 100) : 0 }
    })
    .filter((row) => row.changePct <= -20)
    .sort((a, b) => a.changePct - b.changePct)
    .slice(0, 5)
  if (declining.length) {
    highlights.push({ ar: `${declining.length} أطباق تراجعت مبيعاتها بأكثر من 20%.`, fr: `${declining.length} plat(s) en recul de plus de 20 %.`, tone: 'warning' })
  }

  const peakHours = dbAll<{ hour: string; orders: number }>(
    `SELECT substr(createdAt, 12, 2) || ':00' AS hour, COUNT(*) AS orders FROM orders WHERE ${settledSale('')} AND createdAt BETWEEN ? AND ? GROUP BY hour ORDER BY orders DESC LIMIT 4`,
    [ts(from), ts(to, true)]
  )
  const peak = peakHours[0]
  if (peak) highlights.push({ ar: `ساعة الذروة: ${peak.hour}.`, fr: `Heure de pointe : ${peak.hour}.`, tone: 'info' })

  /* Reorder forecast from the last 14 days of usage. */
  const usageFrom = addDays(to, -13)
  const forecast = dbAll<{ ingredientId: number; nameAr: string; nameFr: string; unit: string; baseUnit: string; stockQtyBase: number; usedBase: number }>(
    `SELECT i.id AS ingredientId, i.nameAr, i.nameFr, i.unit, i.baseUnit, i.stockQtyBase,
            COALESCE((SELECT -SUM(m.qtyDeltaBase) FROM ingredient_movements m WHERE m.ingredientId = i.id AND m.type = 'usage' AND m.createdAt BETWEEN ? AND ?), 0) AS usedBase
       FROM ingredients i WHERE i.isArchived = 0`,
    [ts(usageFrom), ts(to, true)]
  )
    .filter((row) => row.usedBase > 0)
    .map((row) => {
      const perDay = row.usedBase / 14
      const factor = unitFactor(row.unit, row.baseUnit)
      const daysLeft = Math.max(0, Math.floor(row.stockQtyBase / perDay))
      const suggestedBase = Math.max(0, Math.round(perDay * 7 - row.stockQtyBase))
      return { ingredientId: row.ingredientId, nameAr: row.nameAr, nameFr: row.nameFr, unit: row.unit as InsightOverview['forecast'][number]['unit'], suggestedQty: fromBase(suggestedBase, factor), daysLeft }
    })
    .filter((row) => row.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 8)
  if (forecast.length) {
    highlights.push({ ar: `${forecast.length} مكوّنات ستنفد خلال أسبوع — راجع المشتريات.`, fr: `${forecast.length} ingrédient(s) épuisé(s) sous une semaine — à commander.`, tone: 'warning' })
  }

  const wasteTop = wasteReport(from, to).rows.slice(0, 5).map((row) => ({ nameAr: String(row.nameAr), nameFr: String(row.nameFr), wasteCents: Number(row.costCents) }))

  /* Anomalies: days that deviate ≥ 40 % from the period's daily average. */
  const daily = salesReport(from, to).rows
  const average = daily.length ? daily.reduce((acc, row) => acc + Number(row.totalCents), 0) / daily.length : 0
  const anomalies = average > 0
    ? daily
        .map((row) => ({ date: String(row.date), salesCents: Number(row.totalCents), expectedCents: Math.round(average), deviationPct: Math.round(((Number(row.totalCents) - average) / average) * 100) }))
        .filter((row) => Math.abs(row.deviationPct) >= 40)
        .slice(-6)
    : []

  return { generatedAt: nowStamp(), rangeDays, highlights, bestProfit, declining, peakHours, forecast, wasteTop, anomalies }
}

/* ---------------- Question box ---------------- */

const has = (text: string, words: string[]) => words.some((w) => text.includes(w))

function periodFrom(text: string): { from: string; to: string; labelAr: string; labelFr: string } {
  const to = today()
  if (has(text, ['اليوم', "aujourd", 'today'])) return { from: to, to, labelAr: 'اليوم', labelFr: "aujourd'hui" }
  if (has(text, ['أمس', 'امس', 'hier', 'yesterday'])) {
    const y = addDays(to, -1)
    return { from: y, to: y, labelAr: 'أمس', labelFr: 'hier' }
  }
  if (has(text, ['أسبوع', 'اسبوع', 'semaine', 'week'])) return { from: addDays(to, -6), to, labelAr: 'آخر 7 أيام', labelFr: '7 derniers jours' }
  if (has(text, ['سنة', 'année', 'annee', 'year'])) return { from: `${to.slice(0, 4)}-01-01`, to, labelAr: 'هذه السنة', labelFr: 'cette année' }
  return { from: addDays(to, -29), to, labelAr: 'آخر 30 يومًا', labelFr: '30 derniers jours' }
}

export function insightAsk(question: string): InsightAnswer {
  const text = question.toLowerCase()
  const period = periodFrom(text)
  const wrap = (answerAr: string, answerFr: string, data?: ReportTable): InsightAnswer => ({ question, understood: true, answerAr, answerFr, data })

  if (has(text, ['هدر', 'perte', 'waste', 'gaspillage'])) {
    const table = wasteReport(period.from, period.to)
    const cost = Number(table.totals?.costCents ?? 0) / 100
    return wrap(`تكلفة الهدر ${period.labelAr}: ${cost.toLocaleString('ar-DZ')} دج.`, `Coût des pertes ${period.labelFr} : ${cost.toLocaleString('fr-DZ')} DA.`, table)
  }
  if (has(text, ['مخزون', 'stock', 'ينقص', 'manque', 'نفد'])) {
    const table = inventoryReport()
    const low = table.rows.filter((row) => row.low).length
    return wrap(`${low} مكوّنات تحت الحد الأدنى. قيمة المخزون ${(Number(table.totals?.valueCents ?? 0) / 100).toLocaleString('ar-DZ')} دج.`, `${low} ingrédient(s) sous le minimum. Valeur du stock : ${(Number(table.totals?.valueCents ?? 0) / 100).toLocaleString('fr-DZ')} DA.`, table)
  }
  if (has(text, ['مصاريف', 'مصروف', 'dépense', 'depense', 'expense', 'charges'])) {
    const table = expensesReport(period.from, period.to)
    const total = Number(table.totals?.amountCents ?? 0) / 100
    return wrap(`مجموع المصاريف ${period.labelAr}: ${total.toLocaleString('ar-DZ')} دج.`, `Total des dépenses ${period.labelFr} : ${total.toLocaleString('fr-DZ')} DA.`, table)
  }
  if (has(text, ['أفضل', 'افضل', 'الأكثر', 'الاكثر', 'meilleur', 'top', 'best', 'plus vendu', 'ربح', 'marge', 'هامش', 'طبق', 'plat', 'produit'])) {
    const table = productsReport(period.from, period.to)
    const first = table.rows[0]
    const byMargin = [...table.rows].sort((a, b) => Number(b.marginCents) - Number(a.marginCents))[0]
    if (!first) return wrap(`لا توجد مبيعات ${period.labelAr}.`, `Aucune vente ${period.labelFr}.`, table)
    const wantsMargin = has(text, ['ربح', 'marge', 'هامش', 'rentable'])
    const pick = wantsMargin && byMargin ? byMargin : first
    return wrap(
      `${wantsMargin ? 'الأكثر ربحًا' : 'الأكثر مبيعًا'} ${period.labelAr}: ${pick.nameAr} (${pick.qty} وحدة، ${(Number(pick.revenueCents) / 100).toLocaleString('ar-DZ')} دج).`,
      `${wantsMargin ? 'Le plus rentable' : 'Le plus vendu'} ${period.labelFr} : ${pick.nameFr} (${pick.qty} unités, ${(Number(pick.revenueCents) / 100).toLocaleString('fr-DZ')} DA).`,
      table
    )
  }
  if (has(text, ['مبيعات', 'بيع', 'vente', 'chiffre', 'sales', 'revenue', 'كم', 'combien', 'دخل', 'recette'])) {
    const table = salesReport(period.from, period.to)
    const total = Number(table.totals?.totalCents ?? 0) / 100
    const orders = Number(table.totals?.orders ?? 0)
    return wrap(`مبيعات ${period.labelAr}: ${total.toLocaleString('ar-DZ')} دج من ${orders} طلب.`, `Ventes ${period.labelFr} : ${total.toLocaleString('fr-DZ')} DA sur ${orders} commandes.`, table)
  }
  return {
    question,
    understood: false,
    answerAr: 'لم أفهم السؤال. جرّب: «مبيعات اليوم»، «أفضل طبق هذا الأسبوع»، «المصاريف هذا الشهر»، «المخزون»، «الهدر».',
    answerFr: "Question non comprise. Essayez : « ventes aujourd'hui », « meilleur plat cette semaine », « dépenses ce mois », « stock », « pertes »."
  }
}

/** Kept for parity with the dashboard's low-stock widget: value of what is on hand. */
export function stockValueCents(): number {
  return dbAll<{ stockQtyBase: number; costMicrosPerBase: number }>('SELECT stockQtyBase, costMicrosPerBase FROM ingredients WHERE isArchived = 0').reduce(
    (acc, row) => acc + baseValueCents(Math.max(0, row.stockQtyBase), row.costMicrosPerBase),
    0
  )
}
