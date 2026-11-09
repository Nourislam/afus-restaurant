/**
 * Renders the restaurant's public ordering page (menu + cart + order form) as
 * one self-contained HTML document — no external requests, works offline. The
 * same markup is served live by the built-in server and written by the static
 * export. Four themes (fast-food, classic, café, grill) via CSS variables.
 */

import type { WebsiteTheme as ThemeId } from '@shared/types'
export type { ThemeId }

export interface StorefrontProduct {
  id: number
  name: string
  description: string | null
  priceCents: number
  image: string | null
  available: boolean
}
export interface StorefrontCategory {
  id: number
  name: string
  products: StorefrontProduct[]
}
export interface StorefrontData {
  restaurant: { name: string; phone: string; address: string; logo: string | null }
  categories: StorefrontCategory[]
  isOpen: boolean
  closedMessage: string
  theme: ThemeId
  lang: 'ar' | 'fr'
  currency: string
  orderTypes: ('delivery' | 'takeaway')[]
}

export const THEMES: Record<ThemeId, { label: { ar: string; fr: string }; vars: Record<string, string>; font: string; radius: string }> = {
  fastfood: {
    label: { ar: 'فاست فود', fr: 'Fast-food' },
    vars: { bg: '#fff8f0', surface: '#ffffff', ink: '#1c1917', mut: '#78716c', accent: '#e11d48', accent2: '#f59e0b', band: '#1c1917', bandInk: '#ffffff' },
    font: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
    radius: '18px'
  },
  classic: {
    label: { ar: 'كلاسيكي', fr: 'Classique' },
    vars: { bg: '#faf7f2', surface: '#ffffff', ink: '#292524', mut: '#79716b', accent: '#7c2d12', accent2: '#a16207', band: '#3c2a1e', bandInk: '#f5efe6' },
    font: "Georgia, 'Times New Roman', serif",
    radius: '10px'
  },
  cafe: {
    label: { ar: 'مقهى', fr: 'Café' },
    vars: { bg: '#f5f1e8', surface: '#fffdf8', ink: '#292524', mut: '#8a7f73', accent: '#166534', accent2: '#92400e', band: '#1f3d2e', bandInk: '#f3f6f1' },
    font: "'Segoe UI', system-ui, sans-serif",
    radius: '14px'
  },
  grill: {
    label: { ar: 'مشاوي داكن', fr: 'Grill sombre' },
    vars: { bg: '#121212', surface: '#1c1c1c', ink: '#f5f5f4', mut: '#a8a29e', accent: '#f59e0b', accent2: '#ef4444', band: '#0a0a0a', bandInk: '#ffffff' },
    font: "'Segoe UI', system-ui, sans-serif",
    radius: '12px'
  }
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const money = (cents: number, currency: string) => `${(cents / 100).toLocaleString('en-US')} ${currency}`

export function renderStorefront(data: StorefrontData): string {
  const t = THEMES[data.theme] ?? THEMES.fastfood
  const rtl = data.lang === 'ar'
  const L = (ar: string, fr: string) => (rtl ? ar : fr)
  const v = t.vars

  const vars = Object.entries(v).map(([k, val]) => `--${k}:${val}`).join(';')

  const categoriesHtml = data.categories
    .filter((c) => c.products.length > 0)
    .map(
      (c) => `
    <section class="cat" id="cat-${c.id}">
      <h2>${esc(c.name)}</h2>
      <div class="grid">
        ${c.products
          .map(
            (p) => `
          <article class="card ${p.available ? '' : 'out'}">
            <div class="thumb">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : `<span class="noimg">🍽️</span>`}</div>
            <div class="body">
              <h3>${esc(p.name)}</h3>
              ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
              <div class="row">
                <span class="price">${money(p.priceCents, data.currency)}</span>
                ${p.available && data.isOpen ? `<button class="add" data-id="${p.id}" data-name="${esc(p.name)}" data-price="${p.priceCents}">+ ${L('أضف', 'Ajouter')}</button>` : `<span class="na">${L('غير متوفر', 'Indisponible')}</span>`}
              </div>
            </div>
          </article>`
          )
          .join('')}
      </div>
    </section>`
    )
    .join('')

  const chips = data.categories
    .filter((c) => c.products.length > 0)
    .map((c) => `<a href="#cat-${c.id}">${esc(c.name)}</a>`)
    .join('')

  return `<!doctype html>
<html lang="${data.lang}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>${esc(data.restaurant.name)}</title>
<style>
  :root{${vars};--radius:${t.radius}}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:${t.font};background:rgb(var(--x));background:var(--bg);color:var(--ink);line-height:1.5;-webkit-font-smoothing:antialiased}
  img{max-width:100%;display:block}
  a{color:inherit;text-decoration:none}
  .band{background:var(--band);color:var(--bandInk)}
  header.hero{background:var(--band);color:var(--bandInk);padding:28px 18px 22px;text-align:center;position:relative}
  header.hero .logo{width:72px;height:72px;border-radius:20px;margin:0 auto 10px;object-fit:cover;background:var(--surface)}
  header.hero h1{font-size:28px;font-weight:800;letter-spacing:-.4px}
  header.hero .meta{opacity:.85;font-size:13px;margin-top:4px}
  .status{display:inline-flex;align-items:center;gap:6px;margin-top:12px;padding:6px 14px;border-radius:999px;font-weight:700;font-size:13px}
  .status.open{background:var(--accent2);color:#1c1917}
  .status.closed{background:#ef4444;color:#fff}
  .dot{width:8px;height:8px;border-radius:50%;background:currentColor}
  .langs{position:absolute;top:14px;inset-inline-end:14px}
  .langs a{background:rgba(255,255,255,.15);padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700}
  .closedBanner{background:#ef4444;color:#fff;text-align:center;padding:14px;font-weight:700}
  .chips{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid rgba(128,128,128,.18);display:flex;gap:8px;overflow-x:auto;padding:12px 16px;scrollbar-width:none}
  .chips::-webkit-scrollbar{display:none}
  .chips a{white-space:nowrap;padding:7px 14px;border-radius:999px;background:var(--surface);border:1px solid rgba(128,128,128,.2);font-size:13px;font-weight:600}
  main{max-width:900px;margin:0 auto;padding:8px 16px 120px}
  .cat{margin-top:26px}
  .cat h2{font-size:20px;font-weight:800;margin-bottom:12px;position:relative;padding-inline-start:12px}
  .cat h2::before{content:"";position:absolute;inset-inline-start:0;top:3px;bottom:3px;width:4px;border-radius:4px;background:var(--accent)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:14px}
  .card{background:var(--surface);border:1px solid rgba(128,128,128,.14);border-radius:var(--radius);overflow:hidden;display:flex;flex-direction:column;transition:transform .15s,box-shadow .15s}
  .card:hover{transform:translateY(-3px);box-shadow:0 12px 30px -14px rgba(0,0,0,.35)}
  .card.out{opacity:.55}
  .thumb{aspect-ratio:16/10;background:linear-gradient(135deg,rgba(128,128,128,.12),rgba(128,128,128,.04));display:flex;align-items:center;justify-content:center;overflow:hidden}
  .thumb img{width:100%;height:100%;object-fit:cover}
  .noimg{font-size:40px;opacity:.5}
  .body{padding:12px 14px;display:flex;flex-direction:column;gap:6px;flex:1}
  .body h3{font-size:16px;font-weight:700}
  .desc{font-size:12.5px;color:var(--mut);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .row{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:8px}
  .price{font-weight:800;color:var(--accent)}
  .add{border:0;background:var(--accent);color:#fff;font-weight:700;padding:8px 14px;border-radius:999px;cursor:pointer;font-size:13px}
  .add:active{transform:scale(.95)}
  .na{font-size:12px;color:var(--mut)}
  .cartbtn{position:fixed;inset-block-end:18px;inset-inline:16px;z-index:20;background:var(--accent);color:#fff;border:0;border-radius:16px;padding:15px 20px;font-size:16px;font-weight:800;display:none;align-items:center;justify-content:space-between;box-shadow:0 14px 30px -10px rgba(0,0,0,.5);cursor:pointer}
  .cartbtn b{background:rgba(255,255,255,.22);padding:3px 10px;border-radius:999px}
  .sheet{position:fixed;inset:0;z-index:30;background:rgba(0,0,0,.5);display:none;align-items:flex-end;justify-content:center}
  .sheet.show{display:flex}
  .panel{background:var(--bg);color:var(--ink);width:100%;max-width:520px;max-height:90vh;overflow-y:auto;border-radius:22px 22px 0 0;padding:18px}
  .panel h2{font-size:19px;font-weight:800;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}
  .close{background:none;border:0;font-size:24px;cursor:pointer;color:var(--mut)}
  .line{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(128,128,128,.14)}
  .line .nm{flex:1;font-size:14px;font-weight:600}
  .qty{display:flex;align-items:center;gap:8px}
  .qty button{width:30px;height:30px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:var(--surface);font-size:16px;font-weight:700;cursor:pointer;color:var(--ink)}
  .total{display:flex;justify-content:space-between;font-size:18px;font-weight:800;margin:14px 0}
  .total .t{color:var(--accent)}
  form label{display:block;font-size:13px;font-weight:600;margin:10px 0 4px}
  form input,form select,form textarea{width:100%;padding:11px 12px;border:1px solid rgba(128,128,128,.3);border-radius:12px;background:var(--surface);color:var(--ink);font-size:14px;font-family:inherit}
  .seg{display:flex;gap:8px;margin-bottom:4px}
  .seg button{flex:1;padding:10px;border:1px solid rgba(128,128,128,.3);background:var(--surface);border-radius:12px;font-weight:700;cursor:pointer;color:var(--ink)}
  .seg button.on{background:var(--accent);color:#fff;border-color:var(--accent)}
  .submit{width:100%;margin-top:14px;padding:15px;background:var(--accent);color:#fff;border:0;border-radius:14px;font-size:16px;font-weight:800;cursor:pointer}
  .submit:disabled{opacity:.5}
  .ok{text-align:center;padding:30px 10px}
  .ok .big{font-size:50px}
  footer{text-align:center;padding:24px 16px;color:var(--mut);font-size:12px}
  .pb{display:inline-flex;gap:5px;align-items:center;opacity:.8;margin-top:6px}
</style>
</head>
<body>
<header class="hero">
  <div class="langs"><a href="?lang=${rtl ? 'fr' : 'ar'}">${rtl ? 'Français' : 'العربية'}</a></div>
  ${data.restaurant.logo ? `<img class="logo" src="${esc(data.restaurant.logo)}" alt="">` : ''}
  <h1>${esc(data.restaurant.name)}</h1>
  ${data.restaurant.address ? `<p class="meta">${esc(data.restaurant.address)}</p>` : ''}
  <div class="status ${data.isOpen ? 'open' : 'closed'}"><span class="dot"></span>${data.isOpen ? L('مفتوح الآن', 'Ouvert') : L('مغلق', 'Fermé')}</div>
</header>
${data.isOpen ? '' : `<div class="closedBanner">${esc(data.closedMessage)}</div>`}
<nav class="chips">${chips}</nav>
<main>${categoriesHtml || `<p style="padding:40px 0;text-align:center;color:var(--mut)">${L('القائمة قيد التحضير', 'Menu bientôt disponible')}</p>`}</main>

<button class="cartbtn" id="cartbtn"><span>${L('عرض الطلب', 'Voir la commande')}</span><b id="cartcount">0</b></button>

<div class="sheet" id="sheet">
  <div class="panel" id="panel"></div>
</div>

<footer>
  ${data.restaurant.phone ? `<p dir="ltr">${esc(data.restaurant.phone)}</p>` : ''}
  <div class="pb">⚡ ${L('مشغّل بواسطة Afus', 'Propulsé par Afus')}</div>
</footer>

<script>
(function(){
  var CUR=${JSON.stringify(data.currency)}, OPEN=${data.isOpen ? 'true' : 'false'}, RTL=${rtl ? 'true' : 'false'};
  var TYPES=${JSON.stringify(data.orderTypes)};
  var T={add:RTL?'أضف':'Ajouter',cart:RTL?'طلبك':'Votre commande',empty:RTL?'السلة فارغة':'Panier vide',total:RTL?'المجموع':'Total',name:RTL?'الاسم':'Nom',phone:RTL?'الهاتف':'Téléphone',address:RTL?'العنوان':'Adresse',note:RTL?'ملاحظة':'Note',send:RTL?'أرسل الطلب':'Envoyer la commande',delivery:RTL?'توصيل':'Livraison',takeaway:RTL?'استلام':'À emporter',sent:RTL?'تم إرسال طلبك!':'Commande envoyée !',sentSub:RTL?'سيتصل بك المطعم لتأكيد الطلب.':'Le restaurant vous contactera pour confirmer.',closed:RTL?'المطعم مغلق حاليًا':'Restaurant fermé',fail:RTL?'تعذّر الإرسال، حاول مجددًا':'Échec, réessayez'};
  var cart={}, type=TYPES[0]||'delivery';
  function count(){return Object.values(cart).reduce(function(s,i){return s+i.qty},0)}
  function total(){return Object.values(cart).reduce(function(s,i){return s+i.qty*i.price},0)}
  function fmt(c){return (c/100).toLocaleString('en-US')+' '+CUR}
  function sync(){var n=count();var b=document.getElementById('cartbtn');b.style.display=n>0?'flex':'none';document.getElementById('cartcount').textContent=n}
  document.querySelectorAll('.add').forEach(function(btn){btn.addEventListener('click',function(){var id=btn.dataset.id;if(!cart[id])cart[id]={id:+id,name:btn.dataset.name,price:+btn.dataset.price,qty:0};cart[id].qty++;sync();btn.textContent='✓';setTimeout(function(){btn.textContent='+ '+T.add},600)})});
  var sheet=document.getElementById('sheet');
  document.getElementById('cartbtn').addEventListener('click',openCart);
  sheet.addEventListener('click',function(e){if(e.target===sheet)sheet.classList.remove('show')});
  function openCart(){renderCart();sheet.classList.add('show')}
  function renderCart(){
    var p=document.getElementById('panel');
    if(count()===0){p.innerHTML='<h2>'+T.cart+'<button class="close">&times;</button></h2><p style="padding:20px 0;text-align:center;color:var(--mut)">'+T.empty+'</p>';bind(p);return}
    var lines=Object.values(cart).map(function(i){return '<div class="line"><span class="nm">'+i.name+'</span><div class="qty"><button data-m="-" data-id="'+i.id+'">−</button><b>'+i.qty+'</b><button data-m="+" data-id="'+i.id+'">+</button></div><span>'+fmt(i.qty*i.price)+'</span></div>'}).join('');
    var typeSeg=TYPES.length>1?'<div class="seg">'+TYPES.map(function(tp){return '<button type="button" data-type="'+tp+'" class="'+(tp===type?'on':'')+'">'+(tp==='delivery'?T.delivery:T.takeaway)+'</button>'}).join('')+'</div>':'';
    p.innerHTML='<h2>'+T.cart+'<button class="close">&times;</button></h2>'+lines+'<div class="total"><span>'+T.total+'</span><span class="t">'+fmt(total())+'</span></div>'+
      '<form id="ord">'+typeSeg+
      '<label>'+T.name+' *</label><input name="name" required>'+
      '<label>'+T.phone+' *</label><input name="phone" required inputmode="tel">'+
      '<div id="addrWrap"><label>'+T.address+'</label><input name="address"></div>'+
      '<label>'+T.note+'</label><textarea name="note" rows="2"></textarea>'+
      '<button class="submit" type="submit">'+T.send+' • '+fmt(total())+'</button></form>';
    bind(p);
    p.querySelectorAll('[data-m]').forEach(function(b){b.addEventListener('click',function(){var i=cart[b.dataset.id];i.qty+=b.dataset.m==='+'?1:-1;if(i.qty<=0)delete cart[b.dataset.id];sync();if(count()===0)sheet.classList.remove('show');else renderCart()})});
    p.querySelectorAll('[data-type]').forEach(function(b){b.addEventListener('click',function(){type=b.dataset.type;renderCart()})});
    toggleAddr();
    p.querySelector('#ord').addEventListener('submit',submit);
  }
  function toggleAddr(){var w=document.getElementById('addrWrap');if(w)w.style.display=type==='delivery'?'block':'none'}
  function bind(p){p.querySelector('.close').addEventListener('click',function(){sheet.classList.remove('show')})}
  function submit(e){
    e.preventDefault();
    if(!OPEN){alert(T.closed);return}
    var f=e.target, btn=f.querySelector('.submit');btn.disabled=true;
    var payload={type:type,customerName:f.name.value.trim(),phone:f.phone.value.trim(),address:(f.address?f.address.value.trim():''),note:f.note.value.trim(),items:Object.values(cart).map(function(i){return {productId:i.id,qty:i.qty}})};
    fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      .then(function(r){if(!r.ok)throw 0;return r.json()})
      .then(function(res){document.getElementById('panel').innerHTML='<div class="ok"><div class="big">✅</div><h2 style="justify-content:center">'+T.sent+'</h2><p style="color:var(--mut);margin-top:6px">'+T.sentSub+'</p><p style="font-weight:800;margin-top:10px">'+(res.orderNumber||'')+'</p></div>';cart={};sync()})
      .catch(function(){btn.disabled=false;alert(T.fail)});
  }
  sync();
})();
</script>
</body>
</html>`
}
