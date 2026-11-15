/**
 * The restaurant's own public site: a self-contained, bilingual (AR/FR),
 * branch-aware ordering page — the editorial design published as the "Djemr"
 * artifact, now rendered from the program's real data. No external requests
 * except Google Fonts; works as a static file (Claude Artifact / any host) and
 * when served live by the built-in LAN server (then orders POST to /api/order).
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
export interface StorefrontBranch {
  id: number
  name: string
  address: string | null
  phone: string | null
  /** digits only, for wa.me */
  whatsapp: string | null
  hoursText: string | null
  openNow: boolean
  deliveryNote: string | null
  /** The core menu with this branch's price/availability overrides applied. */
  categories: StorefrontCategory[]
}
/** One language's view of the site. */
export interface StorefrontData {
  restaurant: { name: string; tagline: string; logo: string | null; slug: string }
  branches: StorefrontBranch[]
  closedMessage: string
  currency: string
  lang: 'ar' | 'fr'
}
export interface StorefrontBundle {
  data: Record<'ar' | 'fr', StorefrontData>
  initialLang: 'ar' | 'fr'
  theme: ThemeId
  orderTypes: ('delivery' | 'takeaway')[]
  /** true when served by the program (orders go to /api/order); false for a static export (WhatsApp). */
  apiOrder: boolean
  defaultBranchId: number | null
}

export const THEMES: Record<ThemeId, { label: { ar: string; fr: string }; accent: string; swatch: string }> = {
  ember: { label: { ar: 'جمر', fr: 'Braise' }, accent: '#e8893a', swatch: 'linear-gradient(135deg,#2a1c12,#e8893a)' },
  noir: { label: { ar: 'نوار', fr: 'Noir' }, accent: '#caa469', swatch: 'linear-gradient(135deg,#17171a,#caa469)' },
  sable: { label: { ar: 'رمل', fr: 'Sable' }, accent: '#9a5a2b', swatch: 'linear-gradient(135deg,#e7d9c2,#9a5a2b)' },
  nar: { label: { ar: 'نار', fr: 'Nâr' }, accent: '#e5402b', swatch: 'linear-gradient(135deg,#ffd37a,#e5402b)' }
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** JSON safe to embed inside a <script> block. */
const embed = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

export function renderStorefront(bundle: StorefrontBundle): string {
  const theme = THEMES[bundle.theme] ? bundle.theme : 'ember'
  const d = bundle.data[bundle.initialLang]
  const rtl = bundle.initialLang === 'ar'
  return `<!doctype html>
<html lang="${bundle.initialLang}" dir="${rtl ? 'rtl' : 'ltr'}" data-mood="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.restaurant.name)}</title>
<meta name="description" content="${esc(d.restaurant.tagline)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=Cairo:wght@300;400;500;600;700;800;900&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&display=swap">
<style>
  :root{--bg:#17110c;--bg2:#1f160f;--surface:#241a12;--ink:#f5ecdf;--ink-soft:#c6b49e;--ink-faint:#8c7c68;--line:rgba(245,236,223,.12);--accent:#e8893a;--accent-2:#f3ab63;--gold:#dcac55;--glow:rgba(232,137,58,.35);--shadow:rgba(0,0,0,.5);--display:"Aref Ruqaa",serif;--latin:"Fraunces",Georgia,serif;--body:"Cairo",system-ui,sans-serif;--maxw:1080px}
  [data-mood="noir"]{--bg:#0e0e10;--bg2:#141417;--surface:#18181c;--ink:#edeae3;--ink-soft:#b6b1a6;--ink-faint:#787468;--line:rgba(237,234,227,.10);--accent:#caa469;--accent-2:#e0c38c;--gold:#caa469;--glow:rgba(202,164,105,.22);--shadow:rgba(0,0,0,.55)}
  [data-mood="sable"]{--bg:#efe6d6;--bg2:#f6efe3;--surface:#fbf6ec;--ink:#2b2117;--ink-soft:#6c5f4f;--ink-faint:#9a8b76;--line:rgba(43,33,23,.14);--accent:#9a5a2b;--accent-2:#b06f3c;--gold:#9a7636;--glow:rgba(154,90,43,.14);--shadow:rgba(80,60,35,.18)}
  [data-mood="nar"]{--bg:#fff6e9;--bg2:#fffaf1;--surface:#ffffff;--ink:#201a16;--ink-soft:#5f564e;--ink-faint:#9a8f84;--line:rgba(32,26,22,.12);--accent:#e5402b;--accent-2:#f2b705;--gold:#d98e12;--glow:rgba(229,64,43,.14);--shadow:rgba(120,40,20,.16)}
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{background:var(--bg);color:var(--ink);font-family:var(--body);line-height:1.6;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden}
  body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.4;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E")}
  img{max-width:100%;display:block} a{color:inherit;text-decoration:none}
  .wrap{max-width:var(--maxw);margin:0 auto;padding:0 22px}
  :focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px}
  .topbar{position:fixed;inset-block-start:0;inset-inline:0;z-index:40;display:flex;align-items:center;justify-content:space-between;padding:14px 22px;transition:background .3s}
  .topbar.solid{background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
  .brandmark{font-family:var(--display);font-size:26px;font-weight:700;line-height:1;opacity:0;transition:opacity .4s}
  .topbar.solid .brandmark{opacity:1}
  .pill{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px;border-radius:999px;background:color-mix(in srgb,var(--surface) 70%,transparent);border:1px solid var(--line);color:var(--ink);font-family:var(--body);font-size:13px;font-weight:600;cursor:pointer;transition:border-color .2s,transform .1s}
  .pill:hover{border-color:var(--accent)} .pill:active{transform:scale(.96)}
  .hero{position:relative;z-index:1;min-height:88vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:120px 22px 60px;overflow:hidden}
  .hero .ember{position:absolute;inset:0;z-index:-1;background:radial-gradient(60% 50% at 50% 118%,var(--glow),transparent 70%),radial-gradient(40% 30% at 18% 8%,color-mix(in srgb,var(--accent) 18%,transparent),transparent 70%),linear-gradient(180deg,var(--bg2),var(--bg))}
  .hero .ember::after{content:"";position:absolute;inset-inline:0;inset-block-end:0;height:42%;background:radial-gradient(50% 100% at 50% 100%,var(--glow),transparent 75%);animation:flick 5s ease-in-out infinite;opacity:.8}
  @keyframes flick{0%,100%{opacity:.6;transform:translateY(0)}50%{opacity:1;transform:translateY(-6px)}}
  .logo{width:84px;height:84px;border-radius:24px;object-fit:cover;margin-bottom:14px;animation:rise .7s both}
  .eyebrow{font-weight:700;font-size:12.5px;letter-spacing:.32em;text-transform:uppercase;color:var(--accent-2);display:flex;align-items:center;gap:12px;animation:rise .7s .05s both}
  .eyebrow::before,.eyebrow::after{content:"";width:34px;height:1px;background:currentColor;opacity:.6}
  .title{font-family:var(--display);font-weight:700;line-height:.95;margin:18px 0 6px;font-size:clamp(56px,13vw,150px);text-wrap:balance;animation:rise .9s .12s both}
  .sub{font-size:clamp(16px,2.4vw,21px);color:var(--ink-soft);max-width:40ch;text-wrap:balance;animation:rise .9s .22s both}
  .hero-meta{display:flex;flex-wrap:wrap;gap:10px 22px;justify-content:center;margin-top:24px;font-size:13.5px;color:var(--ink-soft);animation:rise .9s .3s both}
  .hero-meta b{color:var(--ink);font-weight:700}
  .status{display:inline-flex;align-items:center;gap:8px;font-weight:700}
  .dot{width:9px;height:9px;border-radius:50%;background:#35c46b;box-shadow:0 0 0 0 rgba(53,196,107,.5);animation:ping 2s infinite}
  .status.closed .dot{background:#e5544a;animation:none}
  @keyframes ping{0%{box-shadow:0 0 0 0 rgba(53,196,107,.5)}70%{box-shadow:0 0 0 8px rgba(53,196,107,0)}100%{box-shadow:0 0 0 0 rgba(53,196,107,0)}}
  .branches{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:18px;animation:rise .9s .34s both}
  .branches button{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;border:1px solid var(--line);background:color-mix(in srgb,var(--surface) 60%,transparent);color:var(--ink-soft);font-family:var(--body);font-weight:700;font-size:13.5px;cursor:pointer;transition:.2s}
  .branches button.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
  .branches .bd{width:7px;height:7px;border-radius:50%;background:#35c46b} .branches .bd.off{background:#e5544a}
  .cta{margin-top:30px;display:flex;gap:12px;flex-wrap:wrap;justify-content:center;animation:rise .9s .38s both}
  .btn{display:inline-flex;align-items:center;gap:9px;height:54px;padding:0 30px;border-radius:999px;border:1px solid transparent;font-family:var(--body);font-weight:700;font-size:16px;cursor:pointer;transition:transform .12s,box-shadow .2s}
  .btn-primary{background:var(--accent);color:#1a120b;box-shadow:0 14px 34px -12px var(--glow)} [data-mood="nar"] .btn-primary{color:#fff}
  .btn-primary:hover{transform:translateY(-2px)} .btn-ghost{background:transparent;border-color:var(--line);color:var(--ink)} .btn-ghost:hover{border-color:var(--accent)}
  @keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
  .closedBanner{position:relative;z-index:1;background:#e5544a;color:#fff;text-align:center;padding:14px 18px;font-weight:700}
  section.band{position:relative;z-index:1;padding:76px 0}
  .shead{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:36px;flex-wrap:wrap}
  .shead .k{font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:10px}
  .shead h2{font-family:var(--display);font-weight:700;font-size:clamp(36px,6vw,60px);line-height:1;text-wrap:balance}
  .shead p{color:var(--ink-soft);max-width:42ch;font-size:15px}
  .feat{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
  .fcard{position:relative;border:1px solid var(--line);border-radius:20px;overflow:hidden;background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 70%,transparent),transparent);transition:transform .25s,border-color .25s}
  .fcard:hover{transform:translateY(-5px);border-color:color-mix(in srgb,var(--accent) 50%,var(--line))}
  .fcard .fimg{aspect-ratio:16/10;background:radial-gradient(circle at 50% 40%,var(--glow),transparent 65%);display:flex;align-items:center;justify-content:center;color:var(--accent)}
  .fcard .fimg img{width:100%;height:100%;object-fit:cover} .fcard .fimg svg{width:48px;height:48px}
  .fcard .fb{padding:18px 20px 20px}
  .fcard h3{font-size:20px;font-weight:800;margin-bottom:6px} .fcard p{font-size:13.5px;color:var(--ink-soft);min-height:2.6em}
  .fcard .fp{margin-top:12px;display:flex;align-items:center;justify-content:space-between}
  .fcard .price{font-family:var(--latin);font-weight:600;font-size:20px;color:var(--accent)}
  .addmini{width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:22px;line-height:1;cursor:pointer;transition:.18s}
  .addmini:hover{background:var(--accent);color:#1a120b;border-color:var(--accent)} [data-mood="nar"] .addmini:hover{color:#fff}
  /* The category rail stays within reach down the whole menu, and marks where
     you are as you scroll. */
  .menutools{position:sticky;inset-block-start:0;z-index:30;padding:10px 0 12px;margin-bottom:6px;background:linear-gradient(180deg,var(--bg) 62%,transparent)}
  .search{position:relative;margin-bottom:10px}
  .search input{width:100%;height:46px;padding:0 44px;border-radius:14px;border:1px solid var(--line);background:color-mix(in srgb,var(--surface) 70%,transparent);color:var(--ink);font-family:var(--body);font-size:15px}
  .search input:focus{outline:none;border-color:var(--accent)}
  .search svg{position:absolute;inset-block-start:13px;inset-inline-start:15px;width:20px;height:20px;color:var(--ink-faint)}
  .search .clear{position:absolute;inset-block-start:9px;inset-inline-end:8px;width:30px;height:30px;border-radius:50%;border:0;background:transparent;color:var(--ink-faint);font-size:17px;cursor:pointer}
  .catnav{display:flex;gap:9px;overflow-x:auto;padding:2px 0;scrollbar-width:none} .catnav::-webkit-scrollbar{display:none}
  .catnav button{white-space:nowrap;background:transparent;border:1px solid var(--line);color:var(--ink-soft);padding:9px 16px;border-radius:999px;font-family:var(--body);font-weight:600;font-size:13.5px;cursor:pointer;transition:.18s}
  .catnav button.on{background:var(--accent);border-color:var(--accent);color:#1a120b} [data-mood="nar"] .catnav button.on{color:#fff}
  .nores{text-align:center;color:var(--ink-faint);padding:52px 0;font-size:15px}
  /* A dish already in the basket shows its own counter: no need to open the cart. */
  .dish .rowstep{display:flex;align-items:center;gap:6px;flex:none}
  .dish .rowstep button{width:34px;height:34px;border-radius:11px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:18px;line-height:1;cursor:pointer}
  .dish .rowstep b{min-width:20px;text-align:center;font-variant-numeric:tabular-nums;font-family:var(--latin)}
  .err{margin:0 0 10px;padding:10px 12px;border-radius:11px;background:color-mix(in srgb,#e5544a 18%,transparent);color:var(--ink);font-size:13.5px;font-weight:600}
  .cat{margin-top:44px} .cat:first-of-type{margin-top:0}
  .catname{font-family:var(--display);font-weight:700;font-size:clamp(28px,4.5vw,42px);margin-bottom:4px}
  .catrule{height:1px;background:var(--line);margin:14px 0 6px}
  .dish{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:6px 14px;padding:14px 10px;border-radius:14px;cursor:pointer;transition:background .2s}
  .dish:hover{background:color-mix(in srgb,var(--surface) 55%,transparent)}
  .dish .th{width:58px;height:58px;border-radius:14px;object-fit:cover;background:color-mix(in srgb,var(--surface) 80%,transparent);display:flex;align-items:center;justify-content:center;color:var(--ink-faint);font-size:22px;grid-row:1/span 2}
  .dish .th img{width:100%;height:100%;object-fit:cover;border-radius:14px}
  .dish .dn{font-weight:700;font-size:17px}
  .dish .dd{grid-column:2;font-size:13px;color:var(--ink-soft);max-width:52ch}
  .dish .right{grid-column:3;grid-row:1/span 2;display:flex;align-items:center;gap:12px}
  .dish .dp{font-family:var(--latin);font-weight:600;font-size:19px;white-space:nowrap}
  .dish .plus{width:38px;height:38px;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--ink-soft);font-size:21px;line-height:1;cursor:pointer;transition:.18s;flex:none}
  .dish:hover .plus{background:var(--accent);color:#1a120b;border-color:var(--accent)} [data-mood="nar"] .dish:hover .plus{color:#fff}
  .dish.na{opacity:.5;cursor:default} .na-badge{font-size:12px;color:var(--ink-faint)}
  .visit{display:grid;grid-template-columns:1.1fr 1fr;gap:40px;align-items:center}
  .visit .big{font-family:var(--display);font-size:clamp(38px,7vw,76px);line-height:1;margin-bottom:18px}
  .vrow{display:flex;gap:14px;padding:16px 0;border-top:1px solid var(--line)}
  .vrow .vk{width:110px;flex:none;color:var(--ink-faint);font-size:12.5px;letter-spacing:.04em;text-transform:uppercase;font-weight:700} .vrow .vv{font-size:15.5px}
  .platter{aspect-ratio:1;border-radius:28px;border:1px solid var(--line);background:radial-gradient(circle at 50% 42%,var(--glow),transparent 62%),linear-gradient(160deg,color-mix(in srgb,var(--surface) 80%,transparent),transparent);display:flex;align-items:center;justify-content:center;overflow:hidden}
  .platter svg{width:58%;color:var(--accent);opacity:.92} .platter img{width:100%;height:100%;object-fit:cover}
  footer{position:relative;z-index:1;border-top:1px solid var(--line);padding:40px 0;text-align:center;color:var(--ink-faint)}
  footer .fl{font-family:var(--display);font-size:30px;color:var(--ink);margin-bottom:8px}
  footer .pb{display:inline-flex;gap:7px;align-items:center;font-size:12.5px;margin-top:14px} footer .pb b{color:var(--accent);font-weight:700}
  .cartfab{position:fixed;inset-block-end:20px;inset-inline-end:20px;z-index:45;display:none;align-items:center;gap:12px;height:60px;padding:0 14px 0 24px;border-radius:18px;background:var(--accent);color:#1a120b;border:0;cursor:pointer;font-family:var(--body);font-weight:800;font-size:16px;box-shadow:0 18px 40px -12px var(--glow)}
  [data-mood="nar"] .cartfab{color:#fff} .cartfab .c{background:rgba(0,0,0,.18);border-radius:12px;min-width:30px;height:34px;display:grid;place-items:center;padding:0 9px}
  .cartfab .ft{font-family:var(--latin);font-weight:600;opacity:.85;font-size:14.5px}
  .scrim{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.55);backdrop-filter:blur(3px);opacity:0;pointer-events:none;transition:opacity .3s} .scrim.open{opacity:1;pointer-events:auto}
  .drawer{position:fixed;z-index:61;inset-block:0;inset-inline-end:0;width:min(440px,100%);background:var(--bg2);border-inline-start:1px solid var(--line);transform:translateX(110%);transition:transform .35s cubic-bezier(.4,0,.1,1);display:flex;flex-direction:column;box-shadow:-20px 0 60px -20px var(--shadow)}
  [dir="rtl"] .drawer{transform:translateX(-110%)} .drawer.open{transform:none}
  .dhead{display:flex;align-items:center;justify-content:space-between;padding:22px 22px 14px;border-bottom:1px solid var(--line)} .dhead h3{font-family:var(--display);font-size:26px;font-weight:700}
  .x{width:38px;height:38px;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--ink);font-size:20px;cursor:pointer}
  .ditems{flex:1;overflow-y:auto;padding:8px 22px} .empty{text-align:center;color:var(--ink-faint);padding:60px 0;font-size:15px}
  .citem{display:flex;align-items:center;gap:12px;padding:15px 0;border-bottom:1px solid var(--line)} .citem .cn{flex:1;font-weight:600;font-size:15px} .citem .cn small{display:block;color:var(--ink-faint);font-weight:400;font-family:var(--latin)}
  .step{display:flex;align-items:center;gap:4px} .step button{width:32px;height:32px;border-radius:9px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:17px;cursor:pointer} .step b{min-width:22px;text-align:center;font-variant-numeric:tabular-nums}
  .dfoot{padding:18px 22px 22px;border-top:1px solid var(--line);background:color-mix(in srgb,var(--surface) 40%,transparent)}
  .seg{display:flex;gap:8px;margin-bottom:14px} .seg button{flex:1;padding:11px;border-radius:12px;border:1px solid var(--line);background:transparent;color:var(--ink-soft);font-family:var(--body);font-weight:700;font-size:14px;cursor:pointer}
  .seg button.on{background:var(--accent);color:#1a120b;border-color:var(--accent)} [data-mood="nar"] .seg button.on{color:#fff}
  .field{margin-bottom:11px} .field label{display:block;font-size:12.5px;font-weight:700;color:var(--ink-soft);margin-bottom:5px}
  .field input,.field textarea{width:100%;padding:12px 13px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-family:var(--body);font-size:15px} .field input:focus,.field textarea:focus{outline:none;border-color:var(--accent)}
  .total{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 14px} .total .tl{font-size:14px;color:var(--ink-soft);font-weight:600} .total .tv{font-family:var(--latin);font-weight:600;font-size:30px;color:var(--accent)}
  .send{width:100%;height:56px;border:0;border-radius:15px;background:#25d366;color:#06240f;font-family:var(--body);font-weight:800;font-size:16.5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px}
  .send.api{background:var(--accent);color:#1a120b} [data-mood="nar"] .send.api{color:#fff} .send:disabled{opacity:.45;cursor:not-allowed}
  .closedNote{text-align:center;padding:14px;margin:0 22px 16px;border-radius:12px;background:color-mix(in srgb,#e5544a 16%,transparent);color:var(--ink);font-size:13.5px;font-weight:600}
  .ok{text-align:center;padding:30px 10px} .ok .big{font-size:50px}
  @media(max-width:860px){.feat{grid-template-columns:1fr;gap:14px}.visit{grid-template-columns:1fr;gap:26px}.platter{max-width:360px;margin:0 auto;width:100%}}
  @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}html{scroll-behavior:auto}}
</style>
</head>
<body>
<div class="topbar" id="topbar"><div class="brandmark" id="brandmark"></div><button class="pill" id="langbtn"></button></div>
<header class="hero"><div class="ember"></div><div id="heroBody"></div></header>
<div id="closedBanner"></div>
<section class="band wrap" id="featSec"><div class="shead"><div><div class="k" id="specK"></div><h2 id="specH"></h2></div><p id="specP"></p></div><div class="feat" id="feat"></div></section>
<section class="band wrap" id="menu"><div class="shead"><div><div class="k" id="menuK"></div><h2 id="menuH"></h2></div><p id="menuP"></p></div>
<div class="menutools"><div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" type="search" autocomplete="off"><button class="clear" id="qclear" hidden>&#10005;</button></div><nav class="catnav" id="catnav" aria-label="menu"></nav></div>
<div id="menuList"></div><div class="nores" id="nores" hidden></div></section>
<section class="band wrap"><div class="visit"><div id="visitBody"></div><div class="platter" id="platter"></div></div></section>
<footer><div class="fl" id="footName"></div><div id="footTag" style="color:var(--ink-soft)"></div><div class="pb">⚡ <span id="poweredBy"></span> <b>Afus</b></div></footer>
<button class="cartfab" id="cartfab" aria-live="polite"><span id="viewOrder"></span><span class="ft" id="fabTotal"></span><span class="c" id="fabCount">0</span></button>
<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="yourOrder"><div class="dhead"><h3 id="yourOrder"></h3><button class="x" id="closeCart" aria-label="Close">✕</button></div><div class="closedNote" id="closedNote" hidden></div><div class="ditems" id="ditems"></div><div class="dfoot" id="dfoot" hidden></div></aside>
<script id="afus-data" type="application/json">${embed(bundle)}</script>
<script>
(function(){
  "use strict";
  var B = JSON.parse(document.getElementById("afus-data").textContent);
  var T = {
    ar:{eyebrow:"مطعم · الجزائر",open:"مفتوح الآن",closed:"مغلق الآن",order:"اطلب الآن",seeMenu:"تصفّح القائمة",specK:"المختارة",specH:"أطباق الدار",specP:"الأكثر طلبًا عندنا.",menuK:"القائمة",menuH:"كل ما نقدّمه",menuP:"الأسعار بالدينار الجزائري. اضغط على أي طبق لإضافته.",visitK:"زورونا",visitH:"على مائدتنا",vAddr:"العنوان",vHours:"الأوقات",vPhone:"الهاتف",vDeliv:"التوصيل",poweredBy:"موقع من إنشاء",viewOrder:"عرض الطلب",yourOrder:"طلبك",empty:"سلتك فارغة. اختر من القائمة.",delivery:"توصيل",pickup:"استلام",name:"الاسم",phone:"الهاتف",address:"العنوان",note:"ملاحظة (اختياري)",total:"المجموع",sendWa:"أرسل عبر واتساب",sendApi:"أرسل الطلب",na:"غير متوفر",add:"إضافة",waHi:"السلام عليكم، أريد أن أطلب من",waType:"نوع الطلب",waTotal:"المجموع",waName:"الاسم",waPhone:"الهاتف",waAddr:"العنوان",waNote:"ملاحظة",waBranch:"الفرع",fillName:"اكتب اسمك ورقم هاتفك.",sent:"تم إرسال طلبك!",sentSub:"سيتصل بك المطعم للتأكيد.",fail:"تعذّر الإرسال، حاول مجددًا",lang:"Français",search:"ابحث عن طبق…",noRes:"لا يوجد طبق بهذا الاسم.",all:"الكل"},
    fr:{eyebrow:"Restaurant · Algérie",open:"Ouvert",closed:"Fermé",order:"Commander",seeMenu:"Voir la carte",specK:"Sélection",specH:"Plats maison",specP:"Nos plats les plus demandés.",menuK:"La carte",menuH:"Tout ce que nous servons",menuP:"Prix en dinars algériens. Touchez un plat pour l'ajouter.",visitK:"Visitez-nous",visitH:"À notre table",vAddr:"Adresse",vHours:"Horaires",vPhone:"Téléphone",vDeliv:"Livraison",poweredBy:"Site réalisé avec",viewOrder:"Voir la commande",yourOrder:"Votre commande",empty:"Votre panier est vide.",delivery:"Livraison",pickup:"À emporter",name:"Nom",phone:"Téléphone",address:"Adresse",note:"Note (facultatif)",total:"Total",sendWa:"Envoyer sur WhatsApp",sendApi:"Envoyer la commande",na:"Indisponible",add:"Ajouter",waHi:"Bonjour, je souhaite commander chez",waType:"Type",waTotal:"Total",waName:"Nom",waPhone:"Téléphone",waAddr:"Adresse",waNote:"Note",waBranch:"Succursale",fillName:"Entrez votre nom et téléphone.",sent:"Commande envoyée !",sentSub:"Le restaurant vous contactera pour confirmer.",fail:"Échec, réessayez",lang:"العربية",search:"Chercher un plat…",noRes:"Aucun plat à ce nom.",all:"Tout"}
  };
  var EMB='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c1.5 4 5 4.5 5 9a5 5 0 0 1-10 0c0-2 1-3 1.5-3.5C9 9 10.5 8 12 2z"/><path d="M12 22v-5"/></svg>';
  var PLATE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 3 4 3.6 4 7a4 4 0 0 1-8 0c0-2 1-2.7 1.5-3.5"/><path d="M5.5 13a6.5 6.5 0 0 0 13 0"/><path d="M4 16.5h16"/><path d="M6 20h12"/></svg>';
  var lang=B.initialLang, cart={}, otype=B.orderTypes[0]||"delivery", query="", spy=null;
  var qs=new URLSearchParams(location.search); var branchId = +(qs.get("branch")||0) || B.defaultBranchId;
  function D(){ return B.data[lang]; }
  function br(){ var d=D(); return d.branches.find(function(b){return b.id===branchId}) || d.branches[0]; }
  function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function fmt(c){ return (c/100).toLocaleString("en-US")+" "+(lang==="ar"?"دج":"DA"); }
  function id(x){ return document.getElementById(x); }

  function render(){
    var d=D(), tt=T[lang], b=br();
    document.documentElement.lang=lang; document.documentElement.dir=lang==="ar"?"rtl":"ltr"; document.title=d.restaurant.name;
    id("brandmark").textContent=d.restaurant.name; id("langbtn").textContent=tt.lang;
    var multi=d.branches.length>1;
    id("heroBody").innerHTML=(d.restaurant.logo?'<img class="logo" src="'+esc(d.restaurant.logo)+'" alt="">':'')+
      '<span class="eyebrow">'+esc(tt.eyebrow)+'</span><h1 class="title">'+esc(d.restaurant.name)+'</h1><p class="sub">'+esc(d.restaurant.tagline)+'</p>'+
      '<div class="hero-meta"><span class="status '+(b&&b.openNow?"":"closed")+'"><span class="dot"></span><b>'+(b&&b.openNow?tt.open:tt.closed)+'</b></span>'+
      (b&&b.hoursText?'<span>'+esc(b.hoursText)+'</span>':'')+(b&&b.deliveryNote?'<span><b>'+esc(tt.vDeliv)+'</b> · '+esc(b.deliveryNote)+'</span>':'')+'</div>'+
      (multi?'<div class="branches">'+d.branches.map(function(x){return '<button data-b="'+x.id+'" class="'+(x.id===b.id?"on":"")+'"><span class="bd '+(x.openNow?"":"off")+'"></span>'+esc(x.name)+'</button>'}).join("")+'</div>':'')+
      '<div class="cta"><button class="btn btn-primary" id="heroOrder">'+tt.order+'</button><a class="btn btn-ghost" href="#menu">'+tt.seeMenu+'</a></div>';
    id("heroBody").querySelectorAll("[data-b]").forEach(function(x){x.addEventListener("click",function(){branchId=+x.dataset.b;cart={};syncFab();render();});});
    id("heroOrder").addEventListener("click",function(){ if(count()===0) id("menu").scrollIntoView({behavior:"smooth"}); else openCart(); });
    id("closedBanner").innerHTML = b&&b.openNow ? "" : '<div class="closedBanner">'+esc(d.closedMessage)+'</div>';
    id("specK").textContent=tt.specK; id("specH").textContent=tt.specH; id("specP").textContent=tt.specP;
    id("menuK").textContent=tt.menuK; id("menuH").textContent=tt.menuH; id("menuP").textContent=tt.menuP;
    id("footName").textContent=d.restaurant.name; id("footTag").textContent=d.restaurant.tagline; id("poweredBy").textContent=tt.poweredBy;
    id("viewOrder").textContent=tt.viewOrder; id("yourOrder").textContent=tt.yourOrder; id("closedNote").textContent=d.closedMessage;
    id("q").placeholder=tt.search; id("q").setAttribute("aria-label",tt.search); id("nores").textContent=tt.noRes;
    renderFeatured(); renderMenu(); renderVisit(); renderCart();
  }
  function allDishes(){ var out=[]; (br()?br().categories:[]).forEach(function(c){c.products.forEach(function(p){out.push(p)})}); return out; }
  function renderFeatured(){
    var b=br(), open=b&&b.openNow, el=id("feat"), tt=T[lang];
    var picks=allDishes().filter(function(p){return p.available}).sort(function(x,y){return y.priceCents-x.priceCents}).slice(0,3);
    id("featSec").style.display=picks.length?"":"none"; el.innerHTML="";
    picks.forEach(function(p){ var c=document.createElement("article"); c.className="fcard";
      c.innerHTML='<div class="fimg">'+(p.image?'<img src="'+esc(p.image)+'" alt="" loading="lazy" decoding="async">':EMB)+'</div><div class="fb"><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||"")+'</p><div class="fp"><span class="price">'+fmt(p.priceCents)+'</span>'+(open?'<button class="addmini" aria-label="'+tt.add+'">+</button>':'')+'</div></div>';
      var a=c.querySelector(".addmini"); if(a) a.addEventListener("click",function(){add(p)}); el.appendChild(c); });
  }
  function matches(p){
    if(!query) return true;
    var q=query.toLowerCase();
    return String(p.name||"").toLowerCase().indexOf(q)>=0 || String(p.description||"").toLowerCase().indexOf(q)>=0;
  }
  function renderMenu(){
    var b=br(), open=b&&b.openNow, nav=id("catnav"), list=id("menuList"), tt=T[lang];
    if(spy){ spy.disconnect(); spy=null; }
    nav.innerHTML=""; list.innerHTML="";
    var shown=0;
    (b?b.categories:[]).forEach(function(cat){
      var dishes=cat.products.filter(matches);
      if(!dishes.length) return;
      shown+=dishes.length;
      var nb=document.createElement("button"); nb.type="button"; nb.textContent=cat.name; nb.dataset.cat=cat.id;
      nb.addEventListener("click",function(){ id("cat-"+cat.id).scrollIntoView({behavior:"smooth",block:"start"}); });
      nav.appendChild(nb);
      var sec=document.createElement("div"); sec.className="cat"; sec.id="cat-"+cat.id; sec.dataset.cat=cat.id;
      sec.innerHTML='<div class="catname">'+esc(cat.name)+'</div><div class="catrule"></div>';
      dishes.forEach(function(p){
        var ok=open&&p.available;
        var row=document.createElement("div"); row.className="dish"+(ok?"":" na"); row.dataset.id=p.id;
        /* width/height + lazy: the row keeps its height before the photo lands */
        var thumb=p.image
          ? '<img src="'+esc(p.image)+'" alt="" width="58" height="58" loading="lazy" decoding="async">'
          : '🍽️';
        row.innerHTML='<div class="th">'+thumb+'</div><div class="dn">'+esc(p.name)+'</div>'
          +(p.description?'<div class="dd">'+esc(p.description)+'</div>':'')
          +'<div class="right"><span class="dp">'+fmt(p.priceCents)+'</span><span class="rowslot"></span></div>';
        sec.appendChild(row);
        paintRow(row,p,ok,tt);
      });
      list.appendChild(sec);
    });
    id("nores").hidden = shown>0;
    markCat(nav.querySelector("button"));
    /* Which category you are reading is marked in the rail. */
    if(window.IntersectionObserver){
      spy=new IntersectionObserver(function(entries){
        entries.forEach(function(e){
          if(!e.isIntersecting) return;
          markCat(nav.querySelector('[data-cat="'+e.target.dataset.cat+'"]'));
        });
      },{rootMargin:"-140px 0px -70% 0px"});
      list.querySelectorAll(".cat").forEach(function(sec){ spy.observe(sec); });
    }
  }
  function markCat(button){
    if(!button) return;
    id("catnav").querySelectorAll("button").forEach(function(x){ x.classList.toggle("on", x===button); x.setAttribute("aria-current", x===button?"true":"false"); });
  }
  /* The dish row shows "+" until it is in the basket, then its own counter. */
  function paintRow(row,p,ok,tt){
    var slot=row.querySelector(".rowslot"); if(!slot) return;
    if(!ok){ slot.outerHTML='<span class="na-badge">'+tt.na+'</span>'; return; }
    var line=cart[p.id];
    if(!line){
      slot.innerHTML='<button class="plus" type="button" aria-label="'+esc(tt.add+" "+p.name)+'">+</button>';
      slot.querySelector("button").addEventListener("click",function(ev){ ev.stopPropagation(); add(p); });
      return;
    }
    slot.innerHTML='<span class="rowstep"><button type="button" data-s="-" aria-label="−">−</button><b>'+line.qty+'</b><button type="button" data-s="+" aria-label="+">+</button></span>';
    slot.querySelectorAll("[data-s]").forEach(function(x){
      x.addEventListener("click",function(ev){
        ev.stopPropagation();
        step(p.id, x.dataset.s==="+"?1:-1);
      });
    });
  }
  function repaintRows(){
    var b=br(), open=b&&b.openNow, tt=T[lang];
    var byId={}; (b?b.categories:[]).forEach(function(c){ c.products.forEach(function(p){ byId[p.id]=p; }); });
    document.querySelectorAll(".dish").forEach(function(row){
      var p=byId[row.dataset.id]; if(!p) return;
      var right=row.querySelector(".right");
      var slot=right.querySelector(".rowslot");
      if(!slot){ slot=document.createElement("span"); slot.className="rowslot"; right.appendChild(slot); }
      paintRow(row,p,open&&p.available,tt);
    });
  }
  function renderVisit(){
    var b=br(), tt=T[lang], d=D();
    id("visitBody").innerHTML='<div class="k" style="color:var(--accent);font-size:12px;letter-spacing:.3em;text-transform:uppercase;font-weight:700;margin-bottom:12px">'+tt.visitK+'</div><div class="big">'+esc(b?b.name:d.restaurant.name)+'</div>'+
      (b&&b.address?'<div class="vrow"><span class="vk">'+tt.vAddr+'</span><span class="vv">'+esc(b.address)+'</span></div>':'')+
      (b&&b.hoursText?'<div class="vrow"><span class="vk">'+tt.vHours+'</span><span class="vv">'+esc(b.hoursText)+'</span></div>':'')+
      (b&&b.phone?'<div class="vrow"><span class="vk">'+tt.vPhone+'</span><span class="vv" dir="ltr" style="font-family:var(--latin)">'+esc(b.phone)+'</span></div>':'');
    id("platter").innerHTML = d.restaurant.logo ? '<img src="'+esc(d.restaurant.logo)+'" alt="">' : PLATE;
  }
  function add(p){ if(!cart[p.id]) cart[p.id]={id:p.id,name:p.name,price:p.priceCents,qty:0}; cart[p.id].qty++; syncFab(); renderCart(); repaintRows(); }
  function step(productId,delta){
    var line=cart[productId]; if(!line) return;
    line.qty+=delta; if(line.qty<=0) delete cart[productId];
    syncFab(); renderCart(); repaintRows();
  }
  function count(){ return Object.values(cart).reduce(function(s,i){return s+i.qty},0); }
  function total(){ return Object.values(cart).reduce(function(s,i){return s+i.qty*i.price},0); }
  function syncFab(){ var n=count(); id("cartfab").style.display=n>0?"flex":"none"; id("fabCount").textContent=n; id("fabTotal").textContent=n>0?fmt(total()):""; }
  function renderCart(){
    var b=br(), open=b&&b.openNow, box=id("ditems"), foot=id("dfoot"), tt=T[lang];
    id("closedNote").hidden=!!open;
    if(count()===0){ box.innerHTML='<div class="empty">'+tt.empty+'</div>'; foot.hidden=true; return; }
    box.innerHTML=Object.values(cart).map(function(i){return '<div class="citem"><div class="cn">'+esc(i.name)+'<small>'+fmt(i.price)+'</small></div><div class="step"><button data-m="-" data-id="'+i.id+'">−</button><b>'+i.qty+'</b><button data-m="+" data-id="'+i.id+'">+</button></div></div>'}).join("");
    box.querySelectorAll("[data-m]").forEach(function(x){x.addEventListener("click",function(){ step(x.dataset.id, x.dataset.m==="+"?1:-1); });});
    foot.hidden=false;
    var seg=B.orderTypes.length>1?'<div class="seg">'+B.orderTypes.map(function(t){return '<button type="button" data-t="'+t+'" class="'+(t===otype?"on":"")+'">'+(t==="delivery"?tt.delivery:tt.pickup)+'</button>'}).join("")+'</div>':'';
    foot.innerHTML=seg+'<div class="err" id="ferr" hidden></div><div class="field"><label>'+tt.name+' *</label><input id="f-name" autocomplete="name"></div><div class="field"><label>'+tt.phone+' *</label><input id="f-phone" inputmode="tel" autocomplete="tel"></div>'+(otype==="delivery"?'<div class="field"><label>'+tt.address+'</label><input id="f-addr"></div>':'')+'<div class="field"><label>'+tt.note+'</label><textarea id="f-note" rows="2"></textarea></div><div class="total"><span class="tl">'+tt.total+'</span><span class="tv">'+fmt(total())+'</span></div>'+
      '<button class="send'+(B.apiOrder?" api":"")+'" id="sendBtn"'+(open?"":" disabled")+'>'+(B.apiOrder?tt.sendApi:tt.sendWa)+'</button>';
    foot.querySelectorAll("[data-t]").forEach(function(x){x.addEventListener("click",function(){otype=x.dataset.t;renderCart();});});
    id("sendBtn").addEventListener("click",send);
  }
  function showErr(message){
    var box=id("ferr"); if(!box) return;
    box.textContent=message; box.hidden=false; box.setAttribute("role","alert");
  }
  function send(){
    var box=id("ferr"); if(box) box.hidden=true;
    var b=br(); if(!(b&&b.openNow)) return;
    var tt=T[lang], name=(id("f-name").value||"").trim(), phone=(id("f-phone").value||"").trim(), addr=id("f-addr")?id("f-addr").value.trim():"", note=(id("f-note").value||"").trim();
    if(!name||!phone){ showErr(tt.fillName); (name?id("f-phone"):id("f-name")).focus(); return; }
    if(B.apiOrder){
      var btn=id("sendBtn"); btn.disabled=true;
      fetch("/api/order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({branchId:b.id,type:otype==="pickup"?"takeaway":"delivery",customerName:name,phone:phone,address:addr,note:note,items:Object.values(cart).map(function(i){return {productId:i.id,qty:i.qty}})})})
        .then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(res){ id("dfoot").hidden=true; id("ditems").innerHTML='<div class="ok"><div class="big">✅</div><h2 style="font-family:var(--display)">'+tt.sent+'</h2><p style="color:var(--ink-soft)">'+tt.sentSub+'</p><p style="font-weight:800;margin-top:10px">'+esc(res.orderNumber||"")+'</p></div>'; cart={}; syncFab(); })
        .catch(function(){ btn.disabled=false; showErr(tt.fail); });
      return;
    }
    var lines=[tt.waHi+" *"+D().restaurant.name+"*:",""];
    Object.values(cart).forEach(function(i){lines.push("• "+i.qty+"× "+i.name+" — "+fmt(i.qty*i.price))});
    lines.push("",tt.waTotal+": "+fmt(total()),tt.waType+": "+(otype==="delivery"?tt.delivery:tt.pickup));
    if(D().branches.length>1) lines.push(tt.waBranch+": "+b.name);
    lines.push(tt.waName+": "+name,tt.waPhone+": "+phone); if(otype==="delivery"&&addr) lines.push(tt.waAddr+": "+addr); if(note) lines.push(tt.waNote+": "+note);
    var wa=b.whatsapp||""; if(!wa){ showErr(tt.fail); return; }
    window.open("https://wa.me/"+wa+"?text="+encodeURIComponent(lines.join("\\n")),"_blank","noopener");
  }
  var scrim=id("scrim"), drawer=id("drawer");
  function openCart(){ renderCart(); scrim.classList.add("open"); drawer.classList.add("open"); }
  function closeCart(){ scrim.classList.remove("open"); drawer.classList.remove("open"); }
  id("cartfab").addEventListener("click",openCart); id("closeCart").addEventListener("click",closeCart); scrim.addEventListener("click",closeCart);
  document.addEventListener("keydown",function(e){ if(e.key==="Escape"&&drawer.classList.contains("open")) closeCart(); });
  var qbox=id("q"), qtimer=null;
  qbox.addEventListener("input",function(){
    id("qclear").hidden=!qbox.value;
    clearTimeout(qtimer);
    qtimer=setTimeout(function(){ query=qbox.value.trim(); renderMenu(); },160);
  });
  id("qclear").addEventListener("click",function(){ qbox.value=""; id("qclear").hidden=true; query=""; renderMenu(); qbox.focus(); });
  id("langbtn").addEventListener("click",function(){ lang=lang==="ar"?"fr":"ar"; render(); });
  window.addEventListener("scroll",function(){ id("topbar").classList.toggle("solid",window.scrollY>60); },{passive:true});
  render(); syncFab();
})();
</script>
</body>
</html>`
}
