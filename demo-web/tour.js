// The guided tour of the web demo: a small panel that walks a restaurant owner
// through what Afus Restaurant does, one screen at a time, in Arabic or French.
// It only opens screens of the program; everything on them can be tried.
const LANG = document.documentElement.lang === 'fr' ? 'fr' : 'ar'
const T = (ar, fr) => (LANG === 'fr' ? fr : ar)

const STEPS = [
  {
    title: T('مرحبًا في مطعم تجريبي', 'Bienvenue dans un restaurant de démo'),
    text: T(
      'هذا هو البرنامج الحقيقي، على مطعم تجريبي في وسط الخدمة: طاولات مشغولة، طلبات في المطبخ، وأسابيع من المبيعات. اختر «إسلام نوري» (المدير) واكتب الرمز 1111.',
      "C'est le vrai programme, sur un restaurant de démo en pleine service : des tables occupées, des commandes en cuisine et des semaines de ventes. Choisissez « Islam Nouri » (gérant) et tapez 1111."
    )
  },
  {
    route: '/',
    title: T('لوحة التحكم', 'Tableau de bord'),
    text: T(
      'مبيعات اليوم والشهر، الأطباق الأكثر طلبًا، ساعات الزحمة، وما ينقص من المخزون: كل صباح في نظرة واحدة.',
      "Ventes du jour et du mois, plats les plus demandés, heures d'affluence et ce qui manque en stock : chaque matin d'un coup d'œil."
    )
  },
  {
    route: '/tables',
    title: T('مخطط الطاولات', 'Plan de salle'),
    text: T(
      'الصالة والطراس والطابق الأول بحالاتها: حرة، مشغولة، محجوزة، تنظيف. الحلقة حول رقم الطاولة تمتلئ مع طول جلوس الزبون. اضغط على طاولة مشغولة لتفتح طلبها.',
      "Salle, terrasse et étage avec leur état : libre, occupée, réservée, nettoyage. L'anneau autour du numéro se remplit avec le temps passé à table. Touchez une table occupée pour ouvrir sa commande."
    )
  },
  {
    route: '/pos',
    title: T('نقطة البيع', 'La caisse'),
    text: T(
      'اختر الطاولة، أضف الأطباق بالمقادير والملاحظات (بدون حار…)، ثم «إرسال للمطبخ» أو «الدفع». جرّب بيعًا كاملًا الآن.',
      "Choisissez la table, ajoutez les plats avec portions et notes (sans piment…), puis « Envoyer en cuisine » ou « Encaisser ». Faites une vente complète maintenant."
    )
  },
  {
    route: '/kitchen',
    title: T('شاشة المطبخ', 'Écran cuisine'),
    text: T(
      'كل طلب يصل مرتبًا حسب المحطة، بمؤقّت ولون أحمر للمتأخر، ومكتوب عليه إن كان مدفوعًا. الطباخ يعلّم ما جهز والنادل يرى ذلك فورًا.',
      "Chaque commande arrive triée par poste, avec un minuteur, du rouge pour les retards, et la mention payé ou non. Le cuisinier marque ce qui est prêt, le serveur le voit aussitôt."
    )
  },
  {
    route: '/orders',
    title: T('الطلبات ومساري الدفع', 'Commandes et les deux paiements'),
    text: T(
      'طاولات تدفع في الآخر، وشبّاك يدفع قبل التحضير — البرنامج يعرف الاثنين. الطلب المدفوع مسبقًا يظهر بشارة «مدفوع مسبقًا» وينزل للمطبخ وحده.',
      "À table on règle à la fin, au comptoir on paie d'abord : le programme connaît les deux. Une commande prépayée porte la mention « Prépayé » et part seule en cuisine."
    )
  },
  {
    route: '/delivery',
    title: T('التوصيل والحجوزات', 'Livraison et réservations'),
    text: T(
      'طلبات التوصيل بالعنوان والهاتف والموزّع وتتبّع الحالة، وحجوزات الليلة باسم الزبون والساعة وعدد الأشخاص.',
      "Les livraisons avec adresse, téléphone, livreur et suivi, et les réservations du soir au nom du client, à l'heure et au nombre de couverts."
    )
  },
  {
    route: '/inventory',
    title: T('المخزون والوصفات', 'Stock et recettes'),
    text: T(
      'المواد الأولية وما سينفد قبل أن ينفد. الوصفة تربط الطبق بمكوّناته، فيُخصم المخزون وحده مع كل طبق يُباع.',
      "Les matières premières et ce qui va manquer avant qu'il ne manque. La recette relie le plat à ses ingrédients : le stock baisse tout seul à chaque plat vendu."
    )
  },
  {
    route: '/reports',
    title: T('التقارير والربح الحقيقي', 'Rapports et bénéfice réel'),
    text: T(
      'المبيعات والربح بعد تكلفة المواد، الأطباق الرابحة والخاسرة، أداء العمال، وكل تقرير يُصدَّر إلى Excel أو PDF.',
      "Ventes et bénéfice après le coût des matières, plats rentables et perdants, performance du personnel, et chaque rapport s'exporte en Excel ou PDF."
    )
  },
  {
    route: '/settings?tab=fiscal',
    title: T('الامتثال الجبائي', 'Conformité fiscale'),
    text: T(
      'رقم جبائي متسلسل وبصمة مرتبطة لكل بيع، الطابع الجبائي، تقارير Z، وشهادة الناشر (المادة 74 من قانون المالية 2026). اضغط «تحقّق» لترى السلسلة سليمة.',
      "Numéro fiscal séquentiel et empreinte chaînée pour chaque vente, timbre fiscal, rapports Z et attestation de l'éditeur (art. 74 LF 2026). Touchez « Vérifier » : la chaîne est intacte."
    )
  },
  {
    final: true,
    title: T('أعجبك البرنامج؟', 'Le programme vous plaît ?'),
    text: T(
      'نأتي إلى مطعمك: التنصيب، إدخال قائمتك، وتدريب العمال. يعمل بدون إنترنت، وبياناتك تبقى عندك.',
      'Nous venons à votre restaurant : installation, saisie de votre carte, formation du personnel. Il marche sans internet, vos données restent chez vous.'
    )
  }
]

const CSS = `
#afus-tour{position:fixed;inset-inline-end:20px;bottom:20px;z-index:2147483000;width:min(380px,calc(100vw - 32px));background:#fff;color:#18181b;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.35);font-family:'Cairo Variable','Inter Variable',system-ui,sans-serif;overflow:hidden;direction:${LANG === 'ar' ? 'rtl' : 'ltr'}}
#afus-tour .tt-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px 0}
#afus-tour .tt-step{font-size:12px;font-weight:700;color:#6366f1;letter-spacing:.04em}
#afus-tour .tt-x{background:none;border:0;font-size:22px;line-height:1;cursor:pointer;color:#71717a;width:36px;height:36px;border-radius:10px}
#afus-tour .tt-x:hover{background:#f4f4f5}
#afus-tour h3{margin:6px 18px 6px;font-size:19px;line-height:1.35}
#afus-tour p{margin:0 18px 14px;font-size:14.5px;line-height:1.7;color:#3f3f46}
#afus-tour .tt-bar{display:flex;height:5px;margin:0 18px 12px;border-radius:9px;background:#e4e4e7;overflow:hidden}
#afus-tour .tt-bar i{flex:none;height:100%;background:#6366f1;border-radius:9px;transition:width .25s}
#afus-tour .tt-row{display:flex;gap:8px;padding:12px 18px 16px;border-top:1px solid #f4f4f5}
#afus-tour button.tt-btn,#afus-tour a.tt-btn{flex:1;min-height:44px;border-radius:12px;border:1px solid #e4e4e7;background:#fff;color:#18181b;font:inherit;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;text-decoration:none}
#afus-tour .tt-primary{background:#6366f1 !important;border-color:#6366f1 !important;color:#fff !important}
#afus-tour .tt-note{margin:-6px 18px 12px;font-size:12.5px;color:#b45309;background:#fffbeb;border-radius:10px;padding:8px 10px}
#afus-dock{position:fixed;inset-inline-end:20px;bottom:20px;z-index:2147482999;display:flex;gap:8px;direction:${LANG === 'ar' ? 'rtl' : 'ltr'};font-family:'Cairo Variable','Inter Variable',system-ui,sans-serif}
#afus-dock a,#afus-dock button{display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border-radius:999px;border:0;font:inherit;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;box-shadow:0 10px 30px rgba(0,0,0,.3)}
#afus-dock .dk-tour{background:#6366f1;color:#fff}
#afus-dock .dk-site{background:#fff;color:#18181b}
@media (prefers-reduced-motion:no-preference){#afus-tour{animation:afus-tour-in .25s ease-out}}
@keyframes afus-tour-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
`

let index = 0
let box = null

const go = (route) => {
  if (route) window.location.hash = `#${route}`
}

function render() {
  const step = STEPS[index]
  const last = index === STEPS.length - 1
  const narrow = window.innerWidth < 1024
  box.innerHTML = `
    <div class="tt-head"><span class="tt-step">${T('الخطوة', 'Étape')} ${index + 1} / ${STEPS.length}</span><button class="tt-x" type="button" aria-label="${T('إغلاق', 'Fermer')}">×</button></div>
    <h3>${step.title}</h3><p>${step.text}</p>
    ${index === 0 && narrow ? `<div class="tt-note">${T('البرنامج مصمم للحاسوب: افتح التجربة على حاسوب لترى كل شيء.', 'Le programme est fait pour un ordinateur : ouvrez la démo sur un PC pour tout voir.')}</div>` : ''}
    <div class="tt-bar" role="progressbar" aria-valuemin="1" aria-valuemax="${STEPS.length}" aria-valuenow="${index + 1}"><i style="width:${Math.round(((index + 1) / STEPS.length) * 100)}%"></i></div>
    <div class="tt-row">
      ${index > 0 ? `<button class="tt-btn" type="button" data-prev>${T('السابق', 'Précédent')}</button>` : ''}
      ${last
        ? `<a class="tt-btn tt-primary" href="${window.__AFUS_WEB_DEMO__?.orderUrl || '../'}" target="_top">${T('اطلب Afus Restaurant', 'Obtenir Afus Restaurant')}</a>`
        : `<button class="tt-btn tt-primary" type="button" data-next>${index === 0 ? T('ابدأ الجولة', 'Commencer') : T('التالي', 'Suivant')}</button>`}
    </div>`
  box.querySelector('.tt-x').onclick = close
  box.querySelector('[data-prev]')?.addEventListener('click', () => {
    index -= 1
    go(STEPS[index].route)
    render()
  })
  box.querySelector('[data-next]')?.addEventListener('click', () => {
    index += 1
    go(STEPS[index].route)
    render()
  })
}

/**
 * When the tour is put away the visitor still needs a way back: one pill to
 * reopen it and one to return to the website. Without them a closed panel left
 * the demo with no exit at all.
 */
function showDock() {
  if (document.getElementById('afus-dock')) return
  const dock = document.createElement('div')
  dock.id = 'afus-dock'
  dock.innerHTML = `
    <button class="dk-tour" type="button">${T('الجولة المشروحة', 'Visite guidée')}</button>
    <a class="dk-site" href="${window.__AFUS_WEB_DEMO__?.orderUrl || '../'}" target="_top">${T('اطلب البرنامج', 'Obtenir le logiciel')}</a>`
  dock.querySelector('.dk-tour').onclick = () => {
    dock.remove()
    openTour(0)
  }
  document.body.appendChild(dock)
}

function close() {
  box?.remove()
  box = null
  showDock()
}

export function openTour(at = 0) {
  document.getElementById('afus-dock')?.remove()
  if (!document.getElementById('afus-tour-css')) {
    const style = document.createElement('style')
    style.id = 'afus-tour-css'
    style.textContent = CSS
    document.head.appendChild(style)
  }
  index = at
  if (!box) {
    box = document.createElement('section')
    box.id = 'afus-tour'
    box.setAttribute('role', 'dialog')
    box.setAttribute('aria-label', T('جولة مشروحة', 'Visite guidée'))
    document.body.appendChild(box)
  }
  render()
}

window.__AFUS_WEB_DEMO__ = Object.assign(window.__AFUS_WEB_DEMO__ || {}, { tour: () => openTour(0) })
openTour(0)
