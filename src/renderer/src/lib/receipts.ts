import type { AppSettings, Order } from '@shared/types'
import type { Lang } from '@shared/constants'
import { formatMoney, formatDate, formatTime } from './format'

const escape = (value: string | null | undefined): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function header(settings: AppSettings, title: string): string {
  return `<header>
    ${settings.logo ? `<img src="${escape(settings.logo)}" alt="logo" />` : ''}
    <h1>${escape(settings.restaurantName)}</h1>
    ${settings.address ? `<p>${escape(settings.address)}</p>` : ''}
    ${settings.phone ? `<p>${escape(settings.phone)}</p>` : ''}
    <div class="doc">${escape(title)}</div>
  </header>`
}

const BASE_CSS = `
  *{box-sizing:border-box}
  body{font-family:Tahoma,Arial,sans-serif;margin:0;color:#111;background:#fff}
  header{text-align:center;padding-bottom:8px;margin-bottom:10px;border-bottom:1px dashed #999}
  header img{max-height:60px;display:block;margin:0 auto 6px}
  header h1{font-size:16px;margin:0 0 2px;letter-spacing:.3px}
  header p{font-size:10px;margin:1px 0;color:#444}
  .doc{font-size:12px;font-weight:bold;margin-top:6px}
  .meta{display:flex;justify-content:space-between;font-size:10px;margin-bottom:8px}
  table{width:100%;border-collapse:collapse;font-size:10.5px}
  th{text-align:start;border-bottom:1px solid #333;padding:3px 0}
  td{padding:3px 0;vertical-align:top;border-bottom:1px dotted #ddd}
  .num{text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap}
  .item-name{font-weight:bold}
  .mods{font-size:9px;color:#555}
  .note{font-size:9px;color:#7a4b00}
  .totals{margin-top:8px;border-top:1px solid #333;padding-top:6px}
  .totals div{display:flex;justify-content:space-between;font-size:11px;padding:2px 0}
  .totals .grand{font-size:14px;font-weight:bold;border-top:1px dashed #999;margin-top:4px;padding-top:5px}
  footer{text-align:center;font-size:9px;color:#555;margin-top:12px;border-top:1px dashed #999;padding-top:6px}
  .badge{display:inline-block;border:1px solid #333;border-radius:3px;padding:1px 4px;font-size:9px;margin:0 2px}
`

export function receiptHtml(order: Order, settings: AppSettings, language: Lang, paper: '80' | '58' | 'a4' = '80'): string {
  const pageCss =
    paper === 'a4'
      ? '@page{size:A4;margin:12mm}'
      : `@page{size:${paper === '58' ? '58mm' : '80mm'} auto;margin:2mm}`
  const currency = settings.currency
  const rows = order.items
    .map((item) => {
      const name = language === 'ar' ? item.productNameAr : item.productNameFr
      const variant = language === 'ar' ? item.variantNameAr : item.variantNameFr
      const modifiers = item.modifiers.map((modifier) => (language === 'ar' ? modifier.nameAr : modifier.nameFr))
      return `<tr>
        <td>
          <div class="item-name">${escape(name)}${variant ? ` <small>(${escape(variant)})</small>` : ''}</div>
          ${modifiers.length ? `<div class="mods">+ ${modifiers.map(escape).join(', ')}</div>` : ''}
          ${item.note ? `<div class="note">✎ ${escape(item.note)}</div>` : ''}
        </td>
        <td class="num">${item.qty}</td>
        <td class="num">${formatMoney(item.lineTotalCents, currency, 0)}</td>
      </tr>`
    })
    .join('')

  const paymentRows = order.payments
    .map(
      (payment) =>
        `<div><span>${escape(payment.method)}</span><span class="num">${formatMoney(payment.amountCents, currency, 0)}</span></div>`
    )
    .join('')

  const labels =
    language === 'ar'
      ? { title: 'وصل الزبون', order: 'طلب', table: 'طاولة', waiter: 'نادل', subtotal: 'المجموع', discount: 'تخفيض', tax: 'ضريبة (معلومة)', delivery: 'توصيل', total: 'الإجمالي', paid: 'المدفوع', due: 'المتبقي', thanks: 'شكراً لزيارتكم', item: 'الصنف', qty: 'كمية', amount: 'المبلغ', type: 'النوع', date: 'التاريخ' }
      : { title: 'Ticket client', order: 'Commande', table: 'Table', waiter: 'Serveur', subtotal: 'Sous-total', discount: 'Remise', tax: 'TVA (info)', delivery: 'Livraison', total: 'Total', paid: 'Payé', due: 'Reste', thanks: 'Merci de votre visite', item: 'Article', qty: 'Qté', amount: 'Montant', type: 'Type', date: 'Date' }

  return `<!doctype html><html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8" />
  <style>${BASE_CSS}${pageCss}</style></head><body>
  ${header(settings, labels.title)}
  <div class="meta"><span>${labels.order}: <strong>${escape(order.orderNumber)}</strong></span><span>${labels.date}: ${formatDate(order.createdAt)} ${formatTime(order.createdAt)}</span></div>
  <div class="meta"><span>${labels.type}: ${escape(order.type)}</span><span>${order.tableName ? `${labels.table}: ${escape(order.tableName)}` : ''}</span></div>
  ${order.waiterName ? `<div class="meta"><span>${labels.waiter}: ${escape(order.waiterName)}</span></div>` : ''}
  <table><thead><tr><th>${labels.item}</th><th class="num">${labels.qty}</th><th class="num">${labels.amount}</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="totals">
    <div><span>${labels.subtotal}</span><span class="num">${formatMoney(order.subtotalCents, currency, 0)}</span></div>
    ${order.discountCents > 0 ? `<div><span>${labels.discount}</span><span class="num">-${formatMoney(order.discountCents, currency, 0)}</span></div>` : ''}
    ${order.deliveryFeeCents > 0 ? `<div><span>${labels.delivery}</span><span class="num">${formatMoney(order.deliveryFeeCents, currency, 0)}</span></div>` : ''}
    ${order.taxCents > 0 ? `<div><span>${labels.tax}</span><span class="num">${formatMoney(order.taxCents, currency, 0)}</span></div>` : ''}
    <div class="grand"><span>${labels.total}</span><span class="num">${formatMoney(order.totalCents, currency, 0)}</span></div>
    ${paymentRows}
    <div><span>${labels.paid}</span><span class="num">${formatMoney(order.paidCents, currency, 0)}</span></div>
    ${order.dueCents > 0 ? `<div><span>${labels.due}</span><span class="num">${formatMoney(order.dueCents, currency, 0)}</span></div>` : ''}
  </div>
  ${order.note ? `<p class="note">${escape(order.note)}</p>` : ''}
  <footer>${escape(settings.receiptFooter || labels.thanks)}<br/>${escape(settings.restaurantName)}</footer>
  </body></html>`
}

export function kitchenTicketHtml(order: Order, settings: AppSettings, language: Lang): string {
  const labels =
    language === 'ar'
      ? { title: 'تذكرة المطبخ', order: 'طلب', table: 'طاولة', waiter: 'نادل', time: 'الوقت', item: 'الصنف', qty: 'الكمية', note: 'ملاحظة' }
      : { title: 'Bon de cuisine', order: 'Commande', table: 'Table', waiter: 'Serveur', time: 'Heure', item: 'Article', qty: 'Qté', note: 'Note' }
  const rows = order.items
    .map((item) => {
      const name = language === 'ar' ? item.productNameAr : item.productNameFr
      const variant = language === 'ar' ? item.variantNameAr : item.variantNameFr
      const modifiers = item.modifiers.map((modifier) => (language === 'ar' ? modifier.nameAr : modifier.nameFr))
      return `<tr>
        <td><div class="item-name">${item.qty}× ${escape(name)}${variant ? ` (${escape(variant)})` : ''}</div>
        ${modifiers.length ? `<div class="mods">+ ${modifiers.map(escape).join(', ')}</div>` : ''}
        ${item.note ? `<div class="note">✎ ${escape(item.note)}</div>` : ''}</td>
      </tr>`
    })
    .join('')
  return `<!doctype html><html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8" />
  <style>${BASE_CSS} @page{size:80mm auto;margin:2mm} body{width:76mm}
    h1{font-size:22px!important} .big{font-size:16px;font-weight:bold}
    td{border-bottom:1px solid #bbb;padding:6px 0;font-size:13px}
  </style></head><body>
  ${header(settings, labels.title)}
  <div class="big">${labels.order}: ${escape(order.orderNumber)}</div>
  <div class="meta"><span>${order.tableName ? `${labels.table}: ${escape(order.tableName)}` : escape(order.type)}</span><span>${formatTime(new Date())}</span></div>
  ${order.waiterName ? `<div class="meta"><span>${labels.waiter}: ${escape(order.waiterName)}</span></div>` : ''}
  <table><tbody>${rows}</tbody></table>
  ${order.note ? `<p class="note">${escape(order.note)}</p>` : ''}
  <footer>${escape(settings.restaurantName)} · ${escape(order.orderNumber)}</footer>
  </body></html>`
}

export function testPageHtml(settings: AppSettings): string {
  return `<!doctype html><html><head><meta charset="utf-8" /><style>${BASE_CSS} @page{size:80mm auto;margin:2mm} body{width:76mm}</style></head>
  <body>${header(settings, 'TEST')}<p style="text-align:center;font-size:12px">AFUS Restaurant<br/>Test d'impression / اختبار الطباعة<br/>${formatDate(new Date())}</p>
  <footer>${escape(settings.restaurantName)}</footer></body></html>`
}
