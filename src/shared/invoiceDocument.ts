/** The A4 invoice itself: both identities, the VAT broken out, and the total in words. */
import type { AppSettings, Invoice, Order } from './types'
import { amountToWords } from './amountWords'
import { formatDate, formatMoney } from './format'

const escape = (value: string | null | undefined): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const LABELS = {
  ar: {
    title: 'فاتورة',
    number: 'رقم الفاتورة',
    date: 'التاريخ',
    order: 'رقم الطلب',
    seller: 'البائع',
    buyer: 'الزبون',
    address: 'العنوان',
    phone: 'الهاتف',
    item: 'البيان',
    qty: 'الكمية',
    unitHt: 'السعر خارج الرسم',
    totalHt: 'المبلغ خارج الرسم',
    subtotal: 'المجموع خارج الرسم',
    discount: 'تخفيض',
    taxable: 'الوعاء الخاضع',
    vat: 'الرسم على القيمة المضافة',
    stamp: 'الطابع الجبائي',
    total: 'المجموع الواجب الدفع',
    inWords: 'المبلغ بالحروف',
    signature: 'توقيع وختم البائع',
    footer: 'فاتورة صادرة آليًا — صالحة بدون توقيع يدوي',
    rate: 'النسبة'
  },
  fr: {
    title: 'FACTURE',
    number: 'N° de facture',
    date: 'Date',
    order: 'N° de commande',
    seller: 'Vendeur',
    buyer: 'Client',
    address: 'Adresse',
    phone: 'Téléphone',
    item: 'Désignation',
    qty: 'Qté',
    unitHt: 'P.U. HT',
    totalHt: 'Montant HT',
    subtotal: 'Total HT',
    discount: 'Remise',
    taxable: 'Base imposable',
    vat: 'TVA',
    stamp: 'Timbre fiscal',
    total: 'Net à payer',
    inWords: 'Arrêtée la présente facture à la somme de',
    signature: 'Cachet et signature',
    footer: 'Facture éditée automatiquement — valable sans signature manuscrite',
    rate: 'Taux'
  }
} as const

export function invoiceHtml(invoice: Invoice, order: Order, settings: AppSettings, language: 'ar' | 'fr'): string {
  const t = LABELS[language]
  const currency = invoice.currency
  const rtl = language === 'ar'
  const rate = invoice.taxRateBp

  /* Each line is shown excluding tax, because that is what an invoice states. */
  const divisor = settings.taxInclusive && rate > 0 ? 1 + rate / 10_000 : 1
  const rows = order.items
    .map((item) => {
      const name = language === 'ar' ? item.productNameAr : item.productNameFr
      const variant = language === 'ar' ? item.variantNameAr : item.variantNameFr
      const lineHt = Math.round(item.lineTotalCents / divisor)
      const unitHt = Math.round(lineHt / Math.max(1, item.qty))
      return `<tr>
        <td>${escape(name)}${variant ? ` <small>(${escape(variant)})</small>` : ''}</td>
        <td class="num">${item.qty}</td>
        <td class="num">${formatMoney(unitHt, currency, 2)}</td>
        <td class="num">${formatMoney(lineHt, currency, 2)}</td>
      </tr>`
    })
    .join('')

  const subtotalHt = Math.round(invoice.subtotalCents / divisor)
  const discountHt = Math.round(invoice.discountCents / divisor)
  const taxableHt = Math.max(0, subtotalHt - discountHt)

  const sellerIds = [
    settings.nif ? `NIF ${settings.nif}` : '',
    settings.nis ? `NIS ${settings.nis}` : '',
    settings.rc ? `RC ${settings.rc}` : '',
    settings.ai ? `AI ${settings.ai}` : ''
  ].filter(Boolean)
  const buyerIds = [invoice.buyerNif ? `NIF ${invoice.buyerNif}` : '', invoice.buyerRc ? `RC ${invoice.buyerRc}` : ''].filter(Boolean)

  return `<!doctype html><html lang="${language}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8" />
<title>${escape(invoice.number)}</title>
<style>
  @page{size:A4;margin:14mm}
  *{box-sizing:border-box}
  body{font-family:Tahoma,Arial,sans-serif;color:#111;margin:0;font-size:12px;line-height:1.5}
  .head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #111;padding-bottom:12px}
  .party{max-width:48%}
  .party h2{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#666;margin:0 0 4px}
  .party .name{font-size:15px;font-weight:bold}
  .party p{margin:1px 0;font-size:11px;color:#333}
  .ids{font-size:10px;color:#444;direction:ltr;unicode-bidi:isolate}
  .doc{text-align:center;margin:18px 0 14px}
  .doc h1{font-size:24px;letter-spacing:.18em;margin:0}
  .meta{display:flex;justify-content:center;gap:22px;font-size:11px;color:#444;margin-top:4px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#f1f1f3;border:1px solid #cfcfd4;padding:7px 8px;text-align:start;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}
  td{border:1px solid #dcdce1;padding:7px 8px;vertical-align:top}
  .num{text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap}
  .totals{margin-top:14px;margin-inline-start:auto;width:min(340px,60%)}
  .totals div{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dotted #d4d4d8}
  .totals .grand{border-top:2px solid #111;border-bottom:0;margin-top:4px;padding-top:7px;font-size:15px;font-weight:bold}
  .words{margin-top:14px;border:1px solid #cfcfd4;background:#fafafa;padding:9px 11px;font-size:11.5px}
  .words b{display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.1em;color:#666;margin-bottom:3px}
  .sign{margin-top:36px;display:flex;justify-content:flex-end}
  .sign div{width:200px;border-top:1px solid #999;padding-top:5px;text-align:center;font-size:10.5px;color:#555}
  footer{margin-top:22px;border-top:1px solid #dcdce1;padding-top:7px;text-align:center;font-size:9.5px;color:#777}
</style></head><body>

<div class="head">
  <div class="party">
    <h2>${t.seller}</h2>
    <p class="name">${escape(settings.legalName || settings.restaurantName)}</p>
    ${settings.fiscalAddress || settings.address ? `<p>${escape(settings.fiscalAddress || settings.address)}</p>` : ''}
    ${settings.phone ? `<p>${t.phone}: <span class="ids">${escape(settings.phone)}</span></p>` : ''}
    ${sellerIds.length ? `<p class="ids">${sellerIds.map(escape).join(' · ')}</p>` : ''}
  </div>
  <div class="party" style="text-align:end">
    <h2>${t.buyer}</h2>
    <p class="name">${escape(invoice.buyerName)}</p>
    ${invoice.buyerAddress ? `<p>${escape(invoice.buyerAddress)}</p>` : ''}
    ${invoice.buyerPhone ? `<p>${t.phone}: <span class="ids">${escape(invoice.buyerPhone)}</span></p>` : ''}
    ${buyerIds.length ? `<p class="ids">${buyerIds.map(escape).join(' · ')}</p>` : ''}
  </div>
</div>

<div class="doc">
  <h1>${t.title}</h1>
  <div class="meta">
    <span>${t.number}: <strong class="ids">${escape(invoice.number)}</strong></span>
    <span>${t.date}: ${formatDate(invoice.issuedAt)}</span>
    <span>${t.order}: <span class="ids">${escape(invoice.orderNumber)}</span></span>
  </div>
</div>

<table>
  <thead><tr>
    <th>${t.item}</th><th class="num">${t.qty}</th><th class="num">${t.unitHt}</th><th class="num">${t.totalHt}</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>

<div class="totals">
  <div><span>${t.subtotal}</span><span class="num">${formatMoney(subtotalHt, currency, 2)}</span></div>
  ${invoice.discountCents > 0 ? `<div><span>${t.discount}</span><span class="num">-${formatMoney(discountHt, currency, 2)}</span></div>` : ''}
  ${rate > 0 ? `<div><span>${t.taxable}</span><span class="num">${formatMoney(taxableHt, currency, 2)}</span></div>` : ''}
  ${rate > 0 ? `<div><span>${t.vat} (${t.rate} ${(rate / 100).toFixed(rate % 100 ? 1 : 0)} %)</span><span class="num">${formatMoney(invoice.taxCents, currency, 2)}</span></div>` : ''}
  ${invoice.stampCents > 0 ? `<div><span>${t.stamp}</span><span class="num">${formatMoney(invoice.stampCents, currency, 2)}</span></div>` : ''}
  <div class="grand"><span>${t.total}</span><span class="num">${formatMoney(invoice.totalCents, currency, 2)}</span></div>
</div>

<div class="words"><b>${t.inWords}</b>${escape(amountToWords(invoice.totalCents, language, currency))}</div>

<div class="sign"><div>${t.signature}</div></div>
<footer>${t.footer} · ${escape(settings.restaurantName)}</footer>
</body></html>`
}
