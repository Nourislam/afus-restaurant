/**
 * The demo restaurant: everything a restaurant owner should see in the first
 * two minutes, built in one go on an empty database.
 *
 * It exists for the web demo on the Afus website (`demo-web/`), where the whole
 * program runs in a browser tab with its files in memory. Nothing here is
 * reachable from the shipped program: no IPC channel, no screen, and it refuses
 * to touch a database that already has a restaurant in it.
 *
 * Everything is made through the program's own services, so the figures, the
 * stock, the loyalty points and the fiscal chain are all genuinely consistent —
 * a visitor who opens Settings › Fiscal compliance and presses Verify gets a
 * clean answer, because the sales really are a sealed chain.
 */
import type { Lang } from '@shared/types'
import { dbAll, dbGet, dbRun, dbWrite, transaction } from '../db/client'
import { AppError } from '../utils/errors'
import { nowStamp, today } from '../utils/dates'
import { clearSession, setSession } from '../security/session'
import { completeSetup, setupStatus } from './setup'
import { updateSettings } from './settings'
import { saveUser } from './users'
import { saveArea, saveTable, setTableStatus } from './venue'
import { saveCategory, saveProduct } from './catalog'
import { saveCustomer } from './customers'
import { saveOffer } from './offers'
import { saveReservation } from './reservations'
import { openSession } from './finance'
import { createOrder, payOrder, sendToKitchen } from './orders'
import { setItemKitchenStatus } from './kitchen'
import { computeStamp, saleHash } from './fiscal'

export interface DemoOptions {
  /** Which language the demo opens in. */
  lang?: Lang
  /** How many days of trading to invent. Kept small so the page opens fast. */
  historyDays?: number
}

/** The owner's PIN, and every member of staff's: a demo, so it is on the tin. */
export const DEMO_PIN = '1111'

/* ---------------- The restaurant ---------------- */

/** The same five people, written the way the demo's language writes them. */
const STAFF: { ar: string; fr: string; roleId: string; phone: string }[] = [
  { ar: 'أمينة قاسي', fr: 'Amina Kaci', roleId: 'cashier', phone: '0551 00 00 02' },
  { ar: 'ياسين مبارك', fr: 'Yacine Mebarek', roleId: 'waiter', phone: '0551 00 00 03' },
  { ar: 'كريم بوعلام', fr: 'Karim Boualem', roleId: 'kitchen', phone: '0551 00 00 04' },
  { ar: 'سارة حمادي', fr: 'Sara Hammadi', roleId: 'stock', phone: '0551 00 00 05' }
]

const AREAS = [
  { nameAr: 'الصالة', nameFr: 'Salle', color: '#6366f1', tables: [['T1', 2], ['T2', 2], ['T3', 4], ['T4', 4], ['T5', 4], ['T6', 6]] },
  { nameAr: 'الطراس', nameFr: 'Terrasse', color: '#22c55e', tables: [['A1', 4], ['A2', 4], ['A3', 2], ['A4', 6]] },
  { nameAr: 'الطابق الأول', nameFr: 'Étage', color: '#8b5cf6', tables: [['E1', 6], ['E2', 8], ['E3', 4]] }
]

/** The dishes the starter menu does not have: enough to fill a real card. */
const EXTRA_CATEGORIES = [
  {
    nameAr: 'مقبّلات',
    nameFr: 'Entrées',
    kind: 'food',
    color: '#f59e0b',
    dishes: [
      { ar: 'شربة فريك', fr: 'Chorba frik', price: 25_000, cost: 8_000, station: 'meat', minutes: 5 },
      { ar: 'بوراك باللحم', fr: 'Bourek viande', price: 35_000, cost: 12_000, station: 'grill', minutes: 8 },
      { ar: 'سلطة مشوية', fr: 'Salade cuite', price: 30_000, cost: 9_000, station: 'cold', minutes: 6 }
    ]
  },
  {
    nameAr: 'أطباق تقليدية',
    nameFr: 'Plats traditionnels',
    kind: 'food',
    color: '#ef4444',
    dishes: [
      { ar: 'رشتة بالدجاج', fr: 'Rechta poulet', price: 110_000, cost: 42_000, station: 'meat', minutes: 18 },
      { ar: 'طاجين زيتون', fr: 'Tajine olives', price: 130_000, cost: 55_000, station: 'meat', minutes: 22 },
      { ar: 'شخشوخة', fr: 'Chakhchoukha', price: 120_000, cost: 48_000, station: 'meat', minutes: 20 }
    ]
  },
  {
    nameAr: 'ساندويتش',
    nameFr: 'Sandwichs',
    kind: 'food',
    color: '#0ea5e9',
    dishes: [
      { ar: 'ساندويتش شاورما', fr: 'Sandwich chawarma', price: 45_000, cost: 16_000, station: 'grill', minutes: 7 },
      { ar: 'ساندويتش كفتة', fr: 'Sandwich kefta', price: 40_000, cost: 14_000, station: 'grill', minutes: 7 }
    ]
  },
  {
    nameAr: 'حلويات',
    nameFr: 'Desserts',
    kind: 'food',
    color: '#ec4899',
    dishes: [
      { ar: 'قلب اللوز', fr: 'Qalb el louz', price: 20_000, cost: 6_000, station: 'dessert', minutes: 3 },
      { ar: 'كريم كراميل', fr: 'Crème caramel', price: 25_000, cost: 7_000, station: 'dessert', minutes: 3 }
    ]
  }
]

/* A real file has both alphabets in it, whichever language the screen is in. */
const CUSTOMERS = [
  { name: 'محمد العربي', phone: '0661 23 45 67', address: 'حي النصر، عمارة 4', area: 'قسنطينة' },
  { name: 'Nadia Belkacem', phone: '0770 11 22 33', address: '12 rue Didouche Mourad', area: 'Alger' },
  { name: 'عائلة بن صالح', phone: '0555 98 76 54', address: 'شارع العربي بن مهيدي', area: 'سطيف' },
  { name: 'SARL Amel Travaux', phone: '0541 00 11 22', address: 'Zone industrielle', area: 'Alger' }
]

/* ---------------- Helpers ---------------- */

const dayOf = (daysAgo: number): string => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

const at = (daysAgo: number, hour: number, minute: number): string =>
  `${dayOf(daysAgo)} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`

/** A small deterministic generator, so the demo is the same restaurant twice. */
function roller(seed = 7): (max: number) => number {
  let state = seed
  return (max: number) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    /* Taken from the high bits: the low ones of this generator cycle short, and
       picking dishes with them served the same grill four hundred times. */
    return Math.floor((state / 0x80000000) * max)
  }
}

const menu = (): { id: number; priceCents: number; station: string }[] =>
  dbAll<{ id: number; priceCents: number; station: string }>(
    'SELECT id, priceCents, station FROM products WHERE isArchived = 0 ORDER BY id'
  )

/**
 * Put the invented sales where they belong in time, then re-seal the chain in
 * that order. The seal covers the moment of sale, so moving a sale means its
 * hash has to be struck again — and the whole chain after it, which is exactly
 * what makes the chain worth having. Done here, once, before anyone looks.
 */
function backdateAndReseal(): void {
  transaction(() => resealInDateOrder())
}

function resealInDateOrder(): void {
  const sales = dbAll<{
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
  }>(
    `SELECT id, orderNumber, subtotalCents, discountCents, taxCents, stampCents, totalCents,
            paidAt, completedAt, fiscalSeq, fiscalHash, fiscalPrevHash
       FROM orders WHERE fiscalSeq IS NOT NULL ORDER BY COALESCE(paidAt, completedAt), id`
  )
  /* The numbers are unique, so they all have to come off before any of them
     can go back on. */
  dbWrite('UPDATE orders SET fiscalSeq = NULL, fiscalHash = NULL, fiscalPrevHash = NULL WHERE fiscalSeq IS NOT NULL')
  let prevHash = ''
  let seq = 1
  for (const sale of sales) {
    const hash = saleHash(prevHash, seq, sale)
    dbWrite('UPDATE orders SET fiscalSeq = ?, fiscalHash = ?, fiscalPrevHash = ? WHERE id = ?', [
      seq,
      hash,
      prevHash,
      sale.id
    ])
    prevHash = hash
    seq += 1
  }
}

/* ---------------- The build ---------------- */

/**
 * Build the demo restaurant. Refuses outright if the database already holds a
 * restaurant: the only thing worse than an empty demo is a demo that writes
 * invented sales into somebody's books.
 */
export function seedDemoRestaurant(options: DemoOptions = {}): { userId: number; pin: string } {
  if (setupStatus().initialized) throw new AppError('ALREADY_INITIALIZED', 'This database already has a restaurant')
  const lang: Lang = options.lang === 'fr' ? 'fr' : 'ar'
  const historyDays = Math.max(1, Math.min(60, options.historyDays ?? 24))
  /* One transaction around the whole thing. Not only so a half-built
     restaurant can never exist, but because every write otherwise saves the
     database to disk, and saving is a full export — hundreds of them for the
     weeks of trading below, which is most of the time the demo takes to open. */
  let created = { userId: 0, pin: DEMO_PIN }
  transaction(() => {
    created = build(lang, historyDays)
  })
  return created
}

function build(lang: Lang, historyDays: number): { userId: number; pin: string } {
  const owner = completeSetup({
    restaurantName: lang === 'fr' ? 'Restaurant Djemr' : 'مطعم الجمر',
    currency: 'DZD',
    language: lang,
    phone: '0551 00 00 01',
    address: lang === 'fr' ? '14 rue des Frères Bouadou, Alger' : 'شارع الإخوة بوعدو 14، الجزائر',
    taxEnabled: true,
    taxRateBp: 1900,
    ownerFullName: lang === 'fr' ? 'Islam Nouri' : 'إسلام نوري',
    ownerPin: DEMO_PIN
  })
  setSession({ userId: owner.id, username: owner.username, issuedAt: Date.now() })

  /* A restaurant that has filled its papers in: the receipts and the facture
     then print as the real thing, which is half of what a buyer is checking. */
  updateSettings({
    restaurantNameFr: 'Restaurant Djemr',
    legalName: lang === 'fr' ? 'SARL Djemr' : 'ذ.م.م الجمر',
    nif: '000416001234567',
    nis: '000416007654321',
    rc: '16/00-1234567B16',
    ai: '16123456789',
    fiscalAddress: lang === 'fr' ? '14 rue des Frères Bouadou, Alger' : 'شارع الإخوة بوعدو 14، الجزائر',
    touristClassified: false,
    stampEnabled: true,
    uiMode: 'full',
    loyaltyEnabled: true,
    loyaltyEarnPer100: 1,
    loyaltyPointValueCents: 100,
    loyaltyMinRedeem: 20,
    receiptFooter: lang === 'fr' ? 'Merci de votre visite — à bientôt' : 'شكرًا لزيارتكم — إلى اللقاء',
    /* The counter takes the money first, the tables settle at the end: the demo
       shows both, because a visitor recognises their own house in one of them. */
    orderFlow: { dineIn: 'payLast', takeaway: 'payFirst', delivery: 'payLast', preorder: 'payFirst' },
    kitchenAlertMinutes: 12
  })

  for (const person of STAFF) saveUser({ fullName: person[lang], roleId: person.roleId, phone: person.phone, pin: DEMO_PIN })

  /* The floor. The starter catalogue already made one room with six tables;
     the demo wants a restaurant with a terrace and an upstairs. */
  transaction(() => {
    dbWrite("UPDATE dining_areas SET nameAr = ?, nameFr = ? WHERE id = (SELECT MIN(id) FROM dining_areas)", [
      AREAS[0]!.nameAr,
      AREAS[0]!.nameFr
    ])
    for (const [index, area] of AREAS.entries()) {
      const areaId =
        index === 0
          ? dbGet<{ id: number }>('SELECT MIN(id) AS id FROM dining_areas')!.id
          : saveArea({ nameAr: area.nameAr, nameFr: area.nameFr, color: area.color, sortOrder: index }).id
      const have = new Set(
        dbAll<{ name: string }>('SELECT name FROM dining_tables WHERE areaId = ?', [areaId]).map((row) => row.name)
      )
      for (const [position, [name, seats]] of area.tables.entries()) {
        if (have.has(String(name))) continue
        saveTable({
          areaId,
          name: String(name),
          seats: Number(seats),
          positionX: (position % 4) * 150,
          positionY: Math.floor(position / 4) * 150
        })
      }
    }
  })

  /* The card. */
  transaction(() => {
    for (const [index, group] of EXTRA_CATEGORIES.entries()) {
      const category = saveCategory({
        nameAr: group.nameAr,
        nameFr: group.nameFr,
        kind: group.kind,
        color: group.color,
        sortOrder: 10 + index
      })
      for (const [position, dish] of group.dishes.entries()) {
        saveProduct({
          nameAr: dish.ar,
          nameFr: dish.fr,
          categoryId: category.id,
          priceCents: dish.price,
          costCents: dish.cost,
          station: dish.station,
          prepMinutes: dish.minutes,
          sortOrder: position
        })
      }
    }
    /* Portions on the grill, where a restaurant really uses them. */
    const grill = dbGet<{ id: number }>("SELECT id FROM products WHERE nameFr = 'Grillade mixte'")
    if (grill) {
      dbRun('INSERT INTO product_variants (productId, nameAr, nameFr, priceDeltaCents, isDefault, sortOrder) VALUES (?, ?, ?, ?, 1, 0)', [grill.id, 'عادي', 'Normale', 0])
      dbRun('INSERT INTO product_variants (productId, nameAr, nameFr, priceDeltaCents, isDefault, sortOrder) VALUES (?, ?, ?, ?, 0, 1)', [grill.id, 'كبير', 'Grande', 60_000])
    }
  })

  /* The starter catalogue leaves a placeholder customer behind; the demo gives
     it a name, so no screen ever shows the words "test customer" to a buyer. */
  const placeholder = dbGet<{ id: number }>("SELECT id FROM customers WHERE name LIKE '%تجريبي%' LIMIT 1")
  for (const [index, person] of CUSTOMERS.entries()) {
    saveCustomer(index === 0 && placeholder ? { ...person, id: placeholder.id } : person)
  }

  /* An offer the kitchen actually runs: the family menu at the weekend. */
  saveOffer({
    nameAr: 'عرض العائلة −15٪',
    nameFr: 'Offre famille −15%',
    kind: 'percent',
    valueBp: 1500,
    minSubtotalCents: 400_000,
    /* Thursday, Friday and Saturday (bit per weekday, Sunday = 1). */
    daysMask: 0b1110000,
    isActive: true
  })

  /* The drawer has to be open before the first sale of the day is taken. */
  openSession({ openingFloatCents: 500_000, note: lang === 'fr' ? 'Fond de caisse du matin' : 'رصيد الصباح' })

  seedHistory(historyDays, owner.id)
  seedLiveService()
  seedReservations()

  seedExpenses()
  restock()
  backdateAndReseal()
  /* Hand the program back locked. The first thing a visitor should see is the
     profile-and-PIN screen every member of staff signs in on. */
  clearSession()
  return { userId: owner.id, pin: DEMO_PIN }
}

/* ---------------- Trading already done ---------------- */

/**
 * Weeks of finished service, so the dashboard, the reports and the insights are
 * reading real arithmetic rather than an empty table. Lunch and dinner, busier
 * at the end of the week, the same every time the demo is opened.
 */
function seedHistory(days: number, userId: number): void {
  const dishes = menu()
  if (dishes.length === 0) return
  const roll = roller(11)
  const customers = dbAll<{ id: number }>('SELECT id FROM customers ORDER BY id').map((row) => row.id)

  for (let daysAgo = days; daysAgo >= 1; daysAgo -= 1) {
    const weekday = new Date(`${dayOf(daysAgo)}T12:00:00`).getDay()
    const busy = weekday === 4 || weekday === 5 || weekday === 6
    const covers = (busy ? 14 : 8) + roll(5)
    for (let n = 0; n < covers; n += 1) {
      const evening = n % 2 === 1
      const hour = evening ? 19 + roll(3) : 11 + roll(3)
      const stamp = at(daysAgo, hour, roll(60))
      const type = n % 7 === 0 ? 'delivery' : n % 3 === 0 ? 'takeaway' : 'dineIn'
      const items = Array.from({ length: 1 + roll(3) }, () => {
        const dish = dishes[roll(dishes.length)]!
        return { productId: dish.id, qty: 1 + roll(2) }
      })
      const order = createOrder({
        type,
        customerId: type === 'delivery' ? customers[roll(customers.length)] ?? null : null,
        covers: type === 'dineIn' ? 1 + roll(4) : 1,
        items,
        delivery:
          type === 'delivery'
            ? { customerName: 'زبون التوصيل', phone: '0660 00 00 00', address: 'حي 1000 مسكن', feeCents: 20_000 }
            : null
      })
      /* Dine-in settles at the end, the counter pays first: the history shows
         both, so every figure in the reports was made the way the shop works. */
      if (type === 'dineIn') sendToKitchen(order.id)
      /* The bill a cashier presents: the dishes plus the stamp on a cash
         payment, which is what the till now shows before taking the money. */
      const method = roll(5) === 0 ? 'card' : 'cash'
      const stampCents = method === 'cash' ? computeStamp(order.totalCents) : 0
      payOrder({
        orderId: order.id,
        payments: [{ method, amountCents: order.totalCents + stampCents }],
        closeNow: true
      })
      dbWrite('UPDATE orders SET createdAt = ?, updatedAt = ?, paidAt = ?, completedAt = ?, sentAt = ? WHERE id = ?', [
        stamp,
        stamp,
        stamp,
        stamp,
        type === 'dineIn' ? stamp : null,
        order.id
      ])
      dbWrite('UPDATE order_payments SET createdAt = ? WHERE orderId = ?', [stamp, order.id])
    }
  }
  dbWrite('UPDATE cash_movements SET userId = ? WHERE userId IS NULL', [userId])
}

/* ---------------- Service in progress ---------------- */

/**
 * The middle of a service, which is the only state worth opening a demo on:
 * tables with food on them, tickets on the kitchen board at every stage, a
 * prepaid order waiting at the counter, and a delivery on the road.
 */
function seedLiveService(): void {
  const dish = (fr: string) => dbGet<{ id: number }>('SELECT id FROM products WHERE nameFr = ?', [fr])?.id ?? 0
  const tables = dbAll<{ id: number; name: string }>('SELECT id, name FROM dining_tables ORDER BY id')
  const customers = dbAll<{ id: number }>('SELECT id FROM customers ORDER BY id')
  if (tables.length < 6) return

  /* T1 — just sat down, the order is with the kitchen. */
  const first = createOrder({
    type: 'dineIn',
    tableId: tables[0]!.id,
    covers: 2,
    items: [
      { productId: dish('Chorba frik'), qty: 2 },
      { productId: dish('Grillade mixte'), qty: 1, note: 'بدون حار' },
      { productId: dish('Thé à la menthe'), qty: 2 }
    ]
  })
  sendToKitchen(first.id)

  /* T3 — the kitchen is on it. */
  const second = createOrder({
    type: 'dineIn',
    tableId: tables[2]!.id,
    covers: 4,
    items: [
      { productId: dish('Tajine olives'), qty: 2 },
      { productId: dish('Rechta poulet'), qty: 2 },
      { productId: dish('Jus d’orange'), qty: 4 }
    ]
  })
  sendToKitchen(second.id)
  for (const item of dbAll<{ id: number }>('SELECT id FROM order_items WHERE orderId = ? LIMIT 2', [second.id])) {
    setItemKitchenStatus({ itemId: item.id, status: 'preparing' })
  }

  /* T6 — the food is ready and waiting to be carried out. */
  const third = createOrder({
    type: 'dineIn',
    tableId: tables[5]!.id,
    covers: 6,
    items: [
      { productId: dish('Pizza Margherita'), qty: 2 },
      { productId: dish('Pizza végétarienne'), qty: 1 },
      { productId: dish('Qalb el louz'), qty: 3 }
    ]
  })
  sendToKitchen(third.id)
  for (const item of dbAll<{ id: number }>('SELECT id FROM order_items WHERE orderId = ?', [third.id])) {
    setItemKitchenStatus({ itemId: item.id, status: 'ready' })
  }

  /* The counter: paid before the grill was lit, and still waiting for it. */
  const counter = createOrder({
    type: 'takeaway',
    items: [
      { productId: dish('Sandwich chawarma'), qty: 2 },
      { productId: dish('Jus d’orange'), qty: 2 }
    ]
  })
  payOrder({
    orderId: counter.id,
    payments: [{ method: 'cash', amountCents: counter.totalCents + computeStamp(counter.totalCents) }]
  })

  /* A delivery on the road, with the address and the courier on it. */
  const ride = createOrder({
    type: 'delivery',
    customerId: customers[0]?.id ?? null,
    items: [
      { productId: dish('Chakhchoukha'), qty: 1 },
      { productId: dish('Sandwich kefta'), qty: 2 }
    ],
    delivery: {
      customerName: 'محمد العربي',
      phone: '0661 23 45 67',
      address: 'حي النصر، عمارة 4',
      area: 'قسنطينة',
      feeCents: 20_000,
      courier: 'ياسين'
    }
  })
  sendToKitchen(ride.id)
  dbWrite("UPDATE delivery_info SET status = 'onTheWay' WHERE orderId = ?", [ride.id])

  /* And a table that is being wiped down, so the floor plan is not all one colour. */
  setTableStatus(tables[3]!.id, 'cleaning')
  if (tables[7]) setTableStatus(tables[7].id, 'reserved')
}

/**
 * The larder after the invented weeks: a delivery has been taken, so most
 * things are comfortable and two are about to run out — which is the only
 * reason the dashboard has a "running low" card at all.
 */
function restock(): void {
  const ingredients = dbAll<{ id: number; minQtyBase: number }>('SELECT id, minQtyBase FROM ingredients ORDER BY id')
  for (const [index, ingredient] of ingredients.entries()) {
    const low = index % 4 === 1
    dbWrite('UPDATE ingredients SET stockQtyBase = ? WHERE id = ?', [
      low ? Math.round(ingredient.minQtyBase * 0.6) : Math.round(ingredient.minQtyBase * 6),
      ingredient.id
    ])
  }
}

const EXPENSE_NOTES: Record<string, string> = {
  rent: 'كراء المحل',
  salaries: 'أجور العمال',
  utilities: 'كهرباء وغاز وماء',
  supplies: 'مواد تنظيف وتغليف',
  other: 'صيانة الثلاجة'
}

/** The bills a restaurant actually pays, so the profit is profit and not takings. */
function seedExpenses(): void {
  const bills: [string, number, number][] = [
    ['rent', 8_000_000, 18],
    ['salaries', 12_000_000, 16],
    ['utilities', 2_400_000, 12],
    ['supplies', 1_800_000, 9],
    ['utilities', 1_600_000, 4],
    ['other', 900_000, 2]
  ]
  for (const [category, amountCents, daysAgo] of bills) {
    dbRun(
      'INSERT INTO expenses (category, description, amountCents, method, expenseDate, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [category, EXPENSE_NOTES[category] ?? '', amountCents, 'cash', dayOf(daysAgo), at(daysAgo, 9, 0)]
    )
  }
}

/* ---------------- Tonight's book ---------------- */

function seedReservations(): void {
  const tables = dbAll<{ id: number }>('SELECT id FROM dining_tables ORDER BY id')
  const bookings = [
    { customerName: 'عائلة بن صالح', phone: '0555 98 76 54', time: '19:30', partySize: 6, table: 8, status: 'confirmed' },
    { customerName: 'Nadia Belkacem', phone: '0770 11 22 33', time: '20:00', partySize: 2, table: 2, status: 'confirmed' },
    { customerName: 'SARL Amel Travaux', phone: '0541 00 11 22', time: '12:30', partySize: 8, table: 11, status: 'pending' }
  ]
  for (const booking of bookings) {
    saveReservation({
      customerName: booking.customerName,
      phone: booking.phone,
      date: today(),
      time: booking.time,
      partySize: booking.partySize,
      tableId: tables[booking.table]?.id ?? null,
      status: booking.status
    })
  }
  dbWrite('UPDATE reservations SET createdAt = ? WHERE createdAt IS NULL', [nowStamp()])
}
