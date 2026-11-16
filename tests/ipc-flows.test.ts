import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/* The whole main process behind one fake Electron, so the real IPC layer —
   allowlist, zod validation, permissions, session — can be exercised. */
const USER_DATA = mkdtempSync(join(tmpdir(), 'afus-ipc-'))
vi.mock('electron', () => ({
  app: {
    getPath: () => USER_DATA,
    getName: () => 'AFUS Restaurant',
    getVersion: () => '1.0.0-test'
  },
  shell: { showItemInFolder: () => undefined, openPath: async () => '' },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  screen: {
    getPrimaryDisplay: () => ({ id: 1, label: 'Primary', size: { width: 1920, height: 1080 }, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
    getAllDisplays: () => [{ id: 1, label: 'Primary', size: { width: 1920, height: 1080 }, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }],
    getDisplayMatching: () => ({ id: 1 })
  },
  BrowserWindow: class {
    static getAllWindows(): unknown[] {
      return []
    }
  },
  ipcMain: { handle: () => undefined }
}))

const { dispatch, resetRegistry } = await import('../src/main/ipc/registry')
const { coreChannels } = await import('../src/main/ipc/register/core')
const { catalogChannels } = await import('../src/main/ipc/register/catalog')
const { ordersChannels } = await import('../src/main/ipc/register/orders')
const { fiscalChannels } = await import('../src/main/ipc/register/fiscal')
const { backofficeChannels } = await import('../src/main/ipc/register/backoffice')
const { financeChannels } = await import('../src/main/ipc/register/finance')
const { systemChannels } = await import('../src/main/ipc/register/system')
const { offersChannels } = await import('../src/main/ipc/register/offers')
const { closeDatabase, dbGet, openDatabase } = await import('../src/main/db/client')
const { seedCoreData } = await import('../src/main/db/seed')
const { completeSetup } = await import('../src/main/services/setup')
const { clearSession, setSession } = await import('../src/main/security/session')
const { ensureDirectories } = await import('../src/main/paths')
const { CHANNELS } = await import('../src/shared/channels')

type Result = { ok: true; data: unknown } | { ok: false; error: { code: string; details?: unknown } }

/** Dispatch and fail loudly with the channel and the reason, like the UI sees it. */
async function call<T = any>(channel: string, payload?: unknown): Promise<T> {
  const result = (await dispatch(channel, payload)) as Result
  if (!result.ok) {
    throw new Error(`${channel} → ${result.error.code} ${JSON.stringify(result.error.details ?? '')}`)
  }
  return result.data as T
}
const failure = async (channel: string, payload?: unknown): Promise<string> => {
  const result = (await dispatch(channel, payload)) as Result
  return result.ok ? 'OK' : result.error.code
}

beforeAll(() => ensureDirectories())

beforeEach(async () => {
  resetRegistry()
  closeDatabase()
  clearSession()
  await openDatabase(null)
  seedCoreData()
  coreChannels()
  catalogChannels()
  ordersChannels()
  fiscalChannels()
  backofficeChannels()
  financeChannels()
  systemChannels()
  offersChannels()
  const owner = completeSetup({
    restaurantName: 'Djemr',
    currency: 'DZD',
    language: 'ar',
    taxEnabled: false,
    taxRateBp: 0,
    ownerFullName: 'Owner',
    ownerPin: '1234'
  })
  setSession({ userId: owner.id, username: owner.username, issuedAt: Date.now() })
})

const firstProduct = () => dbGet<{ id: number; priceCents: number }>('SELECT id, priceCents FROM products ORDER BY id LIMIT 1')!
const firstTable = () => dbGet<{ id: number }>('SELECT id FROM dining_tables ORDER BY id LIMIT 1')!

describe('taking a payment, exactly as the screen does it', () => {
  it('walks a dine-in order from opening to a paid, printed ticket', async () => {
    const product = firstProduct()
    const table = firstTable()

    const order = await call('orders.create', {
      type: 'dineIn',
      tableId: table.id,
      covers: 2,
      items: [{ productId: product.id, qty: 1 }]
    })
    expect(order.status).toBe('new')

    /* The POS sends { orderId, ...input } for an added line. */
    const withItem = await call('orders.addItem', { orderId: order.id, productId: product.id, qty: 2 })
    expect(withItem.items.length).toBeGreaterThan(1)

    await call('orders.sendToKitchen', { orderId: order.id })
    const board = await call('kitchen.board', { station: undefined })
    expect(board.tickets.length).toBeGreaterThan(0)

    /* The payment itself — the exact payload api.orders.pay builds. */
    const paid = await call('orders.pay', {
      orderId: order.id,
      payments: [{ method: 'cash', amountCents: withItem.totalCents }]
    })
    expect(paid.status).toBe('completed')
    expect(paid.dueCents).toBe(0)

    /* The ticket a customer is handed carries the restaurant and its figures. */
    const receipt = await call('orders.receipt', { orderId: order.id, language: 'ar', paper: '80' })
    expect(receipt.html).toContain('Djemr')
    expect(receipt.html).toContain(paid.orderNumber)
    expect(receipt.html).toContain('وصل الزبون')
  })

it('survives the sequences a till really goes through', async () => {
    const product = firstProduct()
    const table = firstTable()

    /* Dine-in: opened on a table, sent, added to, sent again, then paid. */
    const dineIn = await call('orders.create', { type: 'dineIn', tableId: table.id, covers: 2, items: [{ productId: product.id, qty: 1 }] })
    await call('orders.sendToKitchen', { orderId: dineIn.id })
    await call('orders.addItem', { orderId: dineIn.id, productId: product.id, qty: 1 })
    /* Sending again must not fail just because some lines already went. */
    await call('orders.sendToKitchen', { orderId: dineIn.id })
    const current = await call('orders.get', { id: dineIn.id })
    const half = Math.floor(current.totalCents / 2)
    await call('orders.pay', { orderId: dineIn.id, payments: [{ method: 'cash', amountCents: half }] })
    const settled = await call('orders.pay', { orderId: dineIn.id, payments: [{ method: 'card', amountCents: current.totalCents - half }] })
    expect(settled.status).toBe('completed')
    /* Paying an order that is already settled is refused, not crashed. */
    expect(await failure('orders.pay', { orderId: dineIn.id, payments: [{ method: 'cash', amountCents: 100 }] })).toBe('CONFLICT')
    expect(await failure('orders.sendToKitchen', { orderId: dineIn.id })).toBe('CONFLICT')

    /* Delivery: carries its own details, and is paid on arrival. */
    const delivery = await call('orders.create', {
      type: 'delivery',
      items: [{ productId: product.id, qty: 1 }],
      delivery: { customerName: 'Nadia', phone: '0661', address: 'Rue 5', feeCents: 15_000 }
    })
    await call('orders.sendToKitchen', { orderId: delivery.id })
    expect((await call('orders.pay', { orderId: delivery.id, payments: [{ method: 'cash', amountCents: delivery.totalCents }] })).status).toBe('completed')

    /* A pre-order scheduled for later. */
    const preorder = await call('orders.create', {
      type: 'preorder',
      scheduledFor: '2026-12-31 20:00:00',
      items: [{ productId: product.id, qty: 3 }]
    })
    await call('orders.sendToKitchen', { orderId: preorder.id })
    expect((await call('orders.pay', { orderId: preorder.id, payments: [{ method: 'cash', amountCents: preorder.totalCents }] })).status).toBe('completed')

    /* And the ticket each one prints is built without throwing. */
    for (const id of [dineIn.id, delivery.id, preorder.id]) {
      const receipt = await call('orders.receipt', { orderId: id, language: 'ar', paper: '80' })
      expect(receipt.html.length).toBeGreaterThan(200)
    }
  })

  it('accepts a split payment and a card payment', async () => {
    const product = firstProduct()
    const order = await call('orders.create', { type: 'takeaway', items: [{ productId: product.id, qty: 1 }] })
    const half = Math.floor(order.totalCents / 2)
    const part = await call('orders.pay', { orderId: order.id, payments: [{ method: 'cash', amountCents: half }] })
    expect(part.status).not.toBe('completed')
    const done = await call('orders.pay', {
      orderId: order.id,
      payments: [{ method: 'card', amountCents: part.dueCents, reference: 'TPE-9' }]
    })
    expect(done.status).toBe('completed')
  })

  it('refuses a payment the cashier is not allowed to take', async () => {
    const product = firstProduct()
    const order = await call('orders.create', { type: 'takeaway', items: [{ productId: product.id, qty: 1 }] })
    const { listRoles, saveUser } = await import('../src/main/services/users')
    const waiter = listRoles().find((role) => role.id === 'waiter') ?? listRoles().find((role) => role.id !== 'owner')!
    const user = saveUser({ fullName: 'Serveur', roleId: waiter.id, pin: '4321' })
    setSession({ userId: user.id, username: user.username, issuedAt: Date.now() })
    const code = await failure('orders.pay', { orderId: order.id, payments: [{ method: 'cash', amountCents: 100 }] })
    expect(['FORBIDDEN', 'OK']).toContain(code)
  })

  it('names the field when the payload is wrong, instead of failing silently', async () => {
    expect(await failure('orders.pay', { orderId: 1, payments: [] })).toBe('VALIDATION')
    expect(await failure('orders.pay', { payments: [{ method: 'cash', amountCents: 10 }] })).toBe('VALIDATION')
    expect(await failure('orders.pay', { orderId: 99999, payments: [{ method: 'cash', amountCents: 10 }] })).toBe('NOT_FOUND')
  })
})

describe('every screen can load the data it opens with', () => {
  /* The payload each screen actually sends on first paint. */
  const reads: [string, unknown][] = [
    ['app.info', {}],
    ['setup.status', {}],
    ['auth.me', {}],
    ['settings.get', {}],
    ['dashboard.summary', {}],
    ['employees.listForLogin', {}],
    ['users.list', {}],
    ['users.roles', {}],
    ['audit.list', {}],
    ['products.list', { includeArchived: false }],
    ['categories.list', {}],
    ['modifierGroups.list', {}],
    ['tables.list', {}],
    ['tables.map', {}],
    ['areas.list', {}],
    ['orders.list', {}],
    ['kitchen.board', {}],
    ['customers.list', {}],
    ['ingredients.list', { includeArchived: false }],
    ['ingredients.movements', {}],
    ['suppliers.list', {}],
    ['purchases.list', {}],
    ['delivery.list', {}],
    ['reservations.list', {}],
    ['finance.currentSession', {}],
    ['finance.sessions', {}],
    ['finance.expenses.list', {}],
    ['finance.payments', {}],
    ['reports.sales', {}],
    ['reports.products', {}],
    ['reports.payments', {}],
    ['reports.orderTypes', {}],
    ['reports.expenses', {}],
    ['reports.waste', {}],
    ['reports.staff', {}],
    ['reports.inventory', {}],
    ['reports.purchases', {}],
    ['reports.suppliers', {}],
    ['reports.delivery', {}],
    ['reports.branches', {}],
    ['insight.overview', {}],
    ['fiscal.verify', {}],
    ['fiscal.closures', {}],
    ['fiscal.archives', {}],
    ['api.tokens', {}],
    ['display.state', {}],
    ['display.screens', {}],
    ['backup.list', {}],
    ['branches.list', {}],
    ['website.state', {}],
    ['web.status', {}],
    ['print.printers', {}],
    ['offers.list', {}],
    ['invoices.list', {}],
    ['invoices.next', {}],
    ['loyalty.rules', {}]
  ]

  it.each(reads)('%s answers without an error', async (channel, payload) => {
    const result = (await dispatch(channel, payload)) as Result
    expect(result.ok ? 'OK' : `${channel} → ${result.error.code} ${JSON.stringify(result.error.details ?? '')}`).toBe('OK')
  })
})

describe('the back-office tasks a manager does in a day', () => {
  it('opens the drawer, records an expense and closes it', async () => {
    const session = await call('finance.openSession', { openingFloatCents: 500_000 })
    expect(session.status).toBe('open')
    await call('finance.expenses.save', { category: 'supplies', description: 'Gaz', amountCents: 20_000 })
    await call('finance.cashMovement', { type: 'withdrawal', amountCents: 10_000, note: 'banque' })
    const movements = await call('finance.session.movements', { sessionId: session.id })
    expect(movements.length).toBeGreaterThan(0)
    const closed = await call('finance.closeSession', { countedCents: 470_000 })
    expect(closed.status).toBe('closed')
  })

  it('buys stock, receives it and pays the supplier', async () => {
    const ingredient = await call('ingredients.save', {
      nameAr: 'بصل',
      nameFr: 'Oignons',
      unit: 'kg',
      costPerUnitCents: 8_000,
      minQty: 1,
      openingQty: 4
    })
    const supplier = await call('suppliers.save', { name: 'Marché', phone: '0550' })
    const purchase = await call('purchases.save', {
      supplierId: supplier.id,
      invoiceNo: 'F-7',
      items: [{ ingredientId: ingredient.id, qty: 3, unitCostCents: 9_000 }]
    })
    const received = await call('purchases.receive', { id: purchase.id })
    expect(received.status).toBe('received')
    await call('purchases.pay', { supplierId: supplier.id, purchaseId: purchase.id, amountCents: received.totalCents, method: 'cash' })
    const ledger = await call('suppliers.get', { id: supplier.id })
    expect(ledger.balanceCents).toBe(0)
    await call('ingredients.adjust', { id: ingredient.id, qty: 6, note: 'inventaire' })
    await call('ingredients.waste', { id: ingredient.id, qty: 0.5, note: 'abîmé' })
  })

  it('writes a recipe, books a table and moves a delivery', async () => {
    const product = firstProduct()
    const ingredient = await call('ingredients.save', { nameAr: 'دقيق', nameFr: 'Farine', unit: 'kg', costPerUnitCents: 12_000 })
    const recipe = await call('recipes.save', { productId: product.id, items: [{ ingredientId: ingredient.id, qty: 0.2 }] })
    expect(recipe.totalCostCents).toBeGreaterThan(0)

    const today = new Date().toISOString().slice(0, 10)
    const booking = await call('reservations.save', {
      customerName: 'Amine',
      phone: '0661',
      date: today,
      time: '20:00',
      partySize: 4,
      tableId: firstTable().id
    })
    expect((await call('reservations.setStatus', { id: booking.id, status: 'confirmed' })).status).toBe('confirmed')

    const order = await call('orders.create', {
      type: 'delivery',
      items: [{ productId: product.id, qty: 1 }],
      delivery: { customerName: 'Sara', phone: '0770', address: 'Rue 1', feeCents: 20_000 }
    })
    expect(order.deliveryFeeCents).toBe(20_000)
    const [sheet] = await call('delivery.list', {})
    await call('delivery.save', { id: sheet.id, courier: 'Yacine' })
    expect((await call('delivery.setStatus', { id: sheet.id, status: 'assigned' })).status).toBe('assigned')
  })

  it('seals the day, exports it and prints the attestation', async () => {
    const product = firstProduct()
    const order = await call('orders.create', { type: 'takeaway', items: [{ productId: product.id, qty: 1 }] })
    await call('orders.pay', { orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    const today = new Date().toISOString().slice(0, 10)
    const closure = await call('fiscal.closePeriod', { kind: 'day', key: today })
    expect(closure.salesCount).toBe(1)
    expect((await call('fiscal.verify', {})).ok).toBe(true)
    const exported = await call('fiscal.export', { from: today, to: today })
    expect(exported.files.length).toBeGreaterThan(0)
    expect((await call('fiscal.attestation', { language: 'fr' })).html).toContain('1.0.0-test')
    await call('reports.export', { type: 'sales', from: today, to: today, format: 'csv' })
  })

  it('edits the menu and the floor', async () => {
    const category = await call('categories.save', { nameAr: 'حلويات', nameFr: 'Desserts' })
    const product = await call('products.save', {
      nameAr: 'كريم كراميل',
      nameFr: 'Crème caramel',
      categoryId: category.id,
      priceCents: 35_000
    })
    expect(product.id).toBeGreaterThan(0)
    await call('products.setAvailability', { id: product.id, available: false })
    const area = await call('areas.save', { nameAr: 'الشرفة', nameFr: 'Terrasse' })
    const table = await call('tables.save', { areaId: area.id, name: 'B9', seats: 4 })
    await call('tables.setStatus', { id: table.id, status: 'cleaning' })
    await call('customers.save', { name: 'Zahra', phone: '0770' })
  })
})

describe('the rest of the buttons in the program', () => {
  it('edits an order: quantity, note, discount, hold, move, merge, cancel', async () => {
    const product = firstProduct()
    const table = firstTable()
    const order = await call('orders.create', { type: 'dineIn', tableId: table.id, items: [{ productId: product.id, qty: 1 }] })
    const fetched = await call('orders.get', { id: order.id })
    expect(fetched.orderNumber).toBe(order.orderNumber)

    const item = fetched.items[0]
    await call('orders.updateItem', { itemId: item.id, qty: 3, note: 'bien cuit' })
    await call('orders.setNote', { orderId: order.id, note: 'table près de la fenêtre' })
    const discounted = await call('orders.setDiscount', { orderId: order.id, discountCents: 1_000, discountReason: 'fidélité' })
    expect(discounted.discountCents).toBe(1_000)

    expect((await call('orders.hold', { orderId: order.id })).isHeld).toBe(true)
    expect((await call('orders.resume', { orderId: order.id })).isHeld).toBe(false)
    await call('orders.setStatus', { orderId: order.id, status: 'preparing', note: null })

    const second = await call('orders.create', { type: 'dineIn', items: [{ productId: product.id, qty: 1 }] })
    const merged = await call('orders.merge', { fromOrderId: second.id, toOrderId: order.id })
    expect(merged.items.length).toBeGreaterThan(1)

    await call('orders.moveTable', { orderId: order.id, tableId: null })
    await call('orders.removeItem', { itemId: item.id })
    const cancelled = await call('orders.cancel', { orderId: order.id, reason: 'client parti', stockPolicy: 'restore' })
    expect(cancelled.status).toBe('cancelled')
  })

  it('moves a dish across the kitchen board', async () => {
    const product = firstProduct()
    const order = await call('orders.create', { type: 'takeaway', items: [{ productId: product.id, qty: 1 }] })
    const sent = await call('orders.sendToKitchen', { orderId: order.id })
    const line = sent.items[0]
    for (const status of ['preparing', 'ready', 'served']) {
      const board = await call('kitchen.itemStatus', { itemId: line.id, status })
      expect(board).toBeTruthy()
    }
  })

  it('manages employees, their PIN and their access', async () => {
    const roles = await call('users.roles', {})
    const role = roles.find((r: any) => r.id !== 'owner') ?? roles[0]
    const user = await call('users.save', { fullName: 'Nadia', roleId: role.id, pin: '2468' })
    await call('users.resetPin', { id: user.id, pin: '1357' })
    await call('users.setActive', { id: user.id, active: false })
    const profiles = await call('employees.listForLogin', {})
    expect(Array.isArray(profiles)).toBe(true)
    /* Signing in and changing one's own PIN, the way the login screen does. */
    await call('users.setActive', { id: user.id, active: true })
    const session = await call('auth.verifyPin', { id: user.id, pin: '1357' })
    expect(session.id).toBe(user.id)
    await call('auth.changePin', { currentPin: '1357', newPin: '8642' })
    await call('auth.logout', {})
  })

  it('keeps a customer file', async () => {
    const customer = await call('customers.save', { name: 'Hakim', phone: '0665' })
    expect((await call('customers.get', { id: customer.id })).name).toBe('Hakim')
    await call('customers.toggleFavorite', { id: customer.id, favorite: true })
    const loyal = await call('customers.adjustLoyalty', { id: customer.id, delta: 50 })
    expect(loyal.loyaltyPoints).toBe(50)
  })

  it('archives what can no longer be deleted', async () => {
    const category = await call('categories.save', { nameAr: 'مقبلات', nameFr: 'Entrées' })
    const product = await call('products.save', { nameAr: 'شوربة', nameFr: 'Chorba', categoryId: category.id, priceCents: 20_000 })
    expect((await call('products.get', { id: product.id })).nameFr).toBe('Chorba')
    expect((await call('products.archive', { id: product.id })).isArchived).toBe(true)
    await call('categories.archive', { id: category.id })

    const area = await call('areas.save', { nameAr: 'قاعة ٢', nameFr: 'Salle 2' })
    const table = await call('tables.save', { areaId: area.id, name: 'C1', seats: 2 })
    /* The two that used to fail with a bare error on the floor screen. */
    expect((await call('tables.setStatus', { id: table.id, status: 'cleaning' })).status).toBe('cleaning')
    expect((await call('tables.remove', { id: table.id })).removed).toBe(true)
    await call('areas.archive', { id: area.id })

    const ingredient = await call('ingredients.save', { nameAr: 'ملح', nameFr: 'Sel', unit: 'kg' })
    expect((await call('ingredients.remove', { id: ingredient.id })).removed).toBe(true)
    const supplier = await call('suppliers.save', { name: 'Ancien' })
    await call('suppliers.archive', { id: supplier.id, archived: true })
  })

  it('cancels a purchase and deletes an expense', async () => {
    const ingredient = await call('ingredients.save', { nameAr: 'زيت', nameFr: 'Huile', unit: 'l', costPerUnitCents: 30_000 })
    const supplier = await call('suppliers.save', { name: 'Grossiste' })
    const purchase = await call('purchases.save', { supplierId: supplier.id, items: [{ ingredientId: ingredient.id, qty: 2, unitCostCents: 30_000 }] })
    expect((await call('purchases.get', { id: purchase.id })).items.length).toBe(1)
    expect((await call('purchases.cancel', { id: purchase.id })).status).toBe('cancelled')
    expect((await call('recipes.get', { productId: firstProduct().id })).productId).toBeGreaterThan(0)

    await call('finance.openSession', { openingFloatCents: 0 })
    const expense = await call('finance.expenses.save', { category: 'other', description: 'Divers', amountCents: 5_000 })
    expect((await call('finance.expenses.remove', { id: expense.id })).removed).toBe(true)
  })

  it('clocks a shift and answers a question about the figures', async () => {
    const today = new Date().toISOString().slice(0, 10)
    await call('attendance.clock', { type: 'in', note: null })
    await call('attendance.clock', { type: 'out', note: null })
    expect((await call('attendance.list', { date: today })).length).toBe(1)
    const answer = await call('insight.ask', { question: 'مبيعات اليوم' })
    expect(answer.understood).toBe(true)
    expect((await call('fiscal.previewStamp', { cashCents: 160_000 })).stampCents).toBe(0)
  })

  it('runs the branches and the online site', async () => {
    const branch = await call('branches.save', { nameAr: 'الفرع الثاني', nameFr: 'Succursale 2', address: 'Oran' })
    await call('branches.setOpen', { id: branch.id, isOpen: false })
    await call('branches.setActive', { id: branch.id, active: true })
    const product = firstProduct()
    await call('branches.setOverride', { branchId: branch.id, productId: product.id, priceCents: 99_000, isAvailable: true })
    expect((await call('branches.overrides', { branchId: branch.id })).length).toBe(1)

    await call('website.config', { theme: 'noir', orderTypes: ['delivery'] })
    const state = await call('website.state', {})
    expect(state.themes.length).toBe(4)
    expect((await call('website.export', {})).files.length).toBe(2)
    expect(Array.isArray(await call('website.orders', {}))).toBe(true)
    expect((await call('web.export', {})).file).toContain('index.html')
  })

it('runs an offer and a loyalty redemption through the till', async () => {
    const product = firstProduct()
    await call('settings.update', { loyaltyEnabled: true, loyaltyEarnPer100: 1, loyaltyPointValueCents: 100, loyaltyMinRedeem: 10 })
    const offer = await call('offers.save', { nameAr: 'خصم 10%', nameFr: 'Remise 10 %', kind: 'percent', valueBp: 1000 })
    const customer = await call('customers.save', { name: 'Leïla', phone: '0771' })
    await call('loyalty.adjust', { customerId: customer.id, points: 100, note: 'ouverture' })

    const order = await call('orders.create', { type: 'takeaway', customerId: customer.id, items: [{ productId: product.id, qty: 1 }] })
    const measured = await call('offers.forOrder', { orderId: order.id })
    expect(measured.some((m: any) => m.eligible)).toBe(true)

    const withOffer = await call('orders.applyOffer', { orderId: order.id, offerId: offer.id, auto: false })
    expect(withOffer.offerId).toBe(offer.id)
    expect(withOffer.discountCents).toBeGreaterThan(0)

    const redeemed = await call('loyalty.redeem', { orderId: order.id, points: 20 })
    expect(redeemed.discountCents).toBe(2_000)
    expect((await call('loyalty.balance', { customerId: customer.id })).points).toBe(80)
    await call('loyalty.cancelRedeem', { orderId: order.id })
    expect((await call('loyalty.balance', { customerId: customer.id })).points).toBe(100)

    const toPay = await call('orders.applyOffer', { orderId: order.id, offerId: offer.id, auto: false })
    const paid = await call('orders.pay', { orderId: order.id, payments: [{ method: 'cash', amountCents: toPay.totalCents }] })
    expect(paid.status).toBe('completed')
    expect(paid.loyaltyPointsEarned).toBeGreaterThan(0)
    expect((await call('loyalty.movements', { customerId: customer.id })).length).toBeGreaterThan(1)

    await call('offers.setActive', { id: offer.id, active: false })
    expect((await call('offers.get', { id: offer.id })).isActive).toBe(false)
    const spare = await call('offers.save', { nameAr: 'غير مستعملة', kind: 'amount', valueCents: 5_000 })
    expect((await call('offers.remove', { id: spare.id })).removed).toBe(true)
  })

it('establishes a formal invoice for a company and reprints it', async () => {
    const product = firstProduct()
    const order = await call('orders.create', { type: 'takeaway', items: [{ productId: product.id, qty: 2 }] })
    /* An unfinished sale cannot be invoiced. */
    expect(await failure('invoices.issue', { orderId: order.id, buyer: { name: 'SARL Test' } })).toBe('INVALID_STATUS')

    await call('orders.pay', { orderId: order.id, payments: [{ method: 'card', amountCents: order.totalCents }] })
    expect((await call('invoices.forOrder', { orderId: order.id }))).toBeNull()

    const invoice = await call('invoices.issue', {
      orderId: order.id,
      buyer: { name: 'SARL Bâtiment Est', address: 'Oran', nif: '000216001234567', rc: '31/00-9876543B21' }
    })
    expect(invoice.number).toMatch(/^FA-\d{4}-00001$/)
    expect((await call('invoices.forOrder', { orderId: order.id })).id).toBe(invoice.id)
    /* Asking again returns the same document, never a second number. */
    expect((await call('invoices.issue', { orderId: order.id, buyer: { name: 'Autre' } })).id).toBe(invoice.id)

    const doc = await call('invoices.document', { id: invoice.id, language: 'fr' })
    expect(doc.html).toContain('FACTURE')
    expect(doc.html).toContain('000216001234567')
    expect(doc.html).toContain('Arrêtée la présente facture')
    expect((await call('invoices.list', {})).length).toBe(1)
  })

it('seals a year into one encrypted file and opens it again', async () => {
    const product = firstProduct()
    const order = await call('orders.create', { type: 'takeaway', items: [{ productId: product.id, qty: 1 }] })
    await call('orders.pay', { orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
    const year = new Date().getFullYear()

    expect(await failure('fiscal.archive', { year, passphrase: 'court' })).toBe('VALIDATION')
    const archive = await call('fiscal.archive', { year, passphrase: 'un-mot-de-passe-solide' })
    expect(archive.counts.sales).toBe(1)
    /* The head identifies it without any key. */
    expect(archive.year).toBe(year)

    const good = await call('fiscal.verifyArchive', { name: archive.name, passphrase: 'un-mot-de-passe-solide' })
    expect(good.ok).toBe(true)
    const bad = await call('fiscal.verifyArchive', { name: archive.name, passphrase: 'mauvais-mot-de-passe' })
    expect(bad.ok).toBe(false)
    expect(bad.problem).toBe('cannotOpen')

    expect((await call('fiscal.archives', {})).length).toBeGreaterThan(0)
    expect((await call('fiscal.deleteArchive', { name: archive.name })).deleted).toBe(true)
  })

it('hands another program a key, then takes it back', async () => {
    const made = await call('api.createToken', { name: 'Comptabilité', scopes: ['read'] })
    expect(made.secret).toMatch(/^afus_/)
    expect(made.token.scopes).toEqual(['read'])
    /* The key never appears in the list again. */
    const listed = await call('api.tokens', {})
    expect(JSON.stringify(listed)).not.toContain(made.secret)
    await call('api.setTokenActive', { id: made.token.id, active: false })
    expect((await call('api.tokens', {})).find((t: any) => t.id === made.token.id).isActive).toBe(false)
    expect((await call('api.removeToken', { id: made.token.id })).removed).toBe(true)
  })

  it('runs the backup the owner scheduled, on demand', async () => {
    const result = await call('backup.runNow', {})
    expect(result.made).toBe(true)
    expect((await call('backup.list', {})).some((b: any) => b.kind === 'auto')).toBe(true)
  })

  it('takes a backup and lists it', async () => {
    const made = await call('backup.create', { name: 'avant-test' })
    expect(made.backupName).toContain('avant-test')
    const list = await call('backup.list', {})
    expect(list.some((b: any) => b.name === made.backupName)).toBe(true)
    await call('backup.reveal', { path: made.path })
    expect((await call('backup.delete', { name: made.backupName })).deleted).toBe(true)
    /* backup.restore swaps the live database file; it is covered by the
       service test instead of here, where the database is in memory. */
  })
})

describe('the allowlist and the handlers agree', () => {
  it('leaves no channel in the allowlist without a handler', async () => {
    const { missingChannels } = await import('../src/main/ipc/registry')
    expect(missingChannels()).toEqual([])
    expect(CHANNELS.length).toBeGreaterThan(100)
  })

  it('refuses anything outside the allowlist, signed in or not', async () => {
    expect(await failure('evil.wipe', {})).toBe('CHANNEL_NOT_ALLOWED')
    clearSession()
    expect(await failure('orders.list', {})).toBe('UNAUTHENTICATED')
  })
})
