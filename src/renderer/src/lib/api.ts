import type {
  AppSettings,
  AuditRow,
  BackupFile,
  CashSession,
  Category,
  Customer,
  DashboardSummary,
  DeliveryRecord,
  DiningArea,
  Expense,
  Ingredient,
  InsightAnswer,
  InsightOverview,
  InventoryMovement,
  KitchenBoard,
  ModifierGroup,
  Order,
  OrderSummary,
  PrinterInfo,
  Product,
  Purchase,
  Recipe,
  Reservation,
  RestaurantTable,
  LoginProfile,
  RoleRow,
  Supplier,
  SupplierPayment,
  TableMap,
  UserRow,
  UserSession,
  WebStatus
} from '@shared/types'

export class ApiError extends Error {
  readonly code: string
  readonly details?: unknown

  constructor(code: string, details?: unknown) {
    super(code)
    this.name = 'ApiError'
    this.code = code
    this.details = details
  }
}

async function call<T>(channel: string, payload?: unknown): Promise<T> {
  if (!window.afus) throw new ApiError('BRIDGE_UNAVAILABLE')
  const result = await window.afus.invoke<T>(channel, payload)
  if (!result.ok) throw new ApiError(result.error.code, result.error.details)
  return result.data
}

const payload = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

export interface ProductListInput {
  search?: string
  categoryId?: number
  includeArchived?: boolean
  page?: number
  pageSize?: number
}

export interface ListInput {
  search?: string
  status?: string
  type?: string
  from?: string
  to?: string
  held?: boolean
  limit?: number
  page?: number
  pageSize?: number
  ingredientId?: number
}

/** Product create/update payload accepted by products.save. */
export interface ProductInput {
  id?: number
  code?: string | null
  nameAr: string
  nameFr: string
  descriptionAr?: string | null
  descriptionFr?: string | null
  image?: string | null
  categoryId: number
  type?: string
  priceCents: number
  costCents?: number
  prepMinutes?: number
  station?: string
  isAvailable?: boolean
  hasRecipe?: boolean
  modifierGroupIds?: number[]
  sortOrder?: number
  variants?: { id?: number; nameAr: string; nameFr: string; priceDeltaCents?: number; isRequired?: boolean; isDefault?: boolean; sortOrder?: number }[]
}

export const api = {
  appInfo: () => call<{ name: string; version: string; databasePath: string; initialized: boolean }>('app.info'),

  setupStatus: () => call<{ initialized: boolean; restaurantName: string }>('setup.status'),
  completeSetup: (input: {
    restaurantName: string
    phone?: string | null
    address?: string | null
    currency: string
    language: 'ar' | 'fr'
    taxEnabled: boolean
    taxRateBp: number
    ownerFullName: string
    ownerPin: string
  }) => call<UserSession>('setup.complete', input),

  listForLogin: () => call<LoginProfile[]>('employees.listForLogin'),
  verifyPin: (input: { id: number; pin: string }) => call<UserSession>('auth.verifyPin', input),
  logout: () => call<{ ok: boolean }>('auth.logout'),
  me: () => call<UserSession | null>('auth.me'),
  changePin: (input: { currentPin: string; newPin: string }) => call<{ ok: boolean }>('auth.changePin', input),

  getSettings: () => call<AppSettings>('settings.get'),
  updateSettings: (patch: Partial<AppSettings>) => call<AppSettings>('settings.update', patch),

  dashboard: (from?: string, to?: string) => call<DashboardSummary>('dashboard.summary', { from, to }),

  tables: {
    list: () => call<RestaurantTable[]>('tables.list'),
    map: () => call<TableMap>('tables.map'),
    save: (input: { id?: number; areaId: number; name: string; seats?: number; positionX?: number; positionY?: number }) =>
      call<RestaurantTable>('tables.save', input),
    setStatus: (id: number, status: string) => call<RestaurantTable>('tables.setStatus', { id, status }),
    remove: (id: number) => call<{ removed: boolean }>('tables.remove', { id })
  },
  areas: {
    list: () => call<DiningArea[]>('areas.list'),
    save: (input: { id?: number; nameAr: string; nameFr: string; color?: string; sortOrder?: number }) =>
      call<DiningArea>('areas.save', input),
    archive: (id: number) => call<{ archived: boolean }>('areas.archive', { id })
  },

  categories: {
    list: (includeArchived = false) => call<Category[]>('categories.list', { includeArchived }),
    save: (input: { id?: number; nameAr: string; nameFr: string; kind?: string; color?: string; sortOrder?: number }) =>
      call<Category>('categories.save', input),
    archive: (id: number) => call<{ archived: boolean }>('categories.archive', { id })
  },

  products: {
    list: (input: ProductListInput = {}) => call<Product[]>('products.list', input),
    get: (id: number) => call<Product>('products.get', { id }),
    save: (input: ProductInput) => call<Product>('products.save', input),
    setAvailability: (id: number, available: boolean) => call<{ id: number; isAvailable: boolean }>('products.setAvailability', { id, available }),
    archive: (id: number) => call<{ id: number; isArchived: boolean }>('products.archive', { id })
  },

  modifierGroups: {
    list: (_includeArchived = false) => call<ModifierGroup[]>('modifierGroups.list'),
    save: (input: {
      id?: number
      nameAr: string
      nameFr: string
      minSelect?: number
      maxSelect?: number
      isRequired?: boolean
      isActive?: boolean
      sortOrder?: number
      modifiers?: {
        id?: number
        nameAr: string
        nameFr: string
        priceCents: number
        isActive?: boolean
        sortOrder?: number
      }[]
    }) => call<ModifierGroup>('modifierGroups.save', input),
    remove: (id: number) => call<{ removed: boolean }>('modifierGroups.remove', { id })
  },

  orders: {
    list: (_input: ListInput = {}) => call<OrderSummary[]>('orders.list'),
    get: (id: number) => call<Order>('orders.get', { id }),
    create: (input: Record<string, unknown>) => call<Order>('orders.create', input),
    addItem: (orderId: number, input: Record<string, unknown>) => call<Order>('orders.addItem', { orderId, ...input }),
    updateItem: (itemId: number, input: Record<string, unknown>) => call<Order>('orders.updateItem', { itemId, ...input }),
    removeItem: (itemId: number) => call<Order>('orders.removeItem', { itemId }),
    setDiscount: (orderId: number, discountCents: number, reason: string | null) =>
      call<Order>('orders.setDiscount', { orderId, discountCents, discountReason: reason }),
    setNote: (orderId: number, note: string | null) => call<Order>('orders.setNote', { orderId, note }),
    setStatus: (orderId: number, status: string, note?: string | null) => call<Order>('orders.setStatus', { orderId, status, note: note ?? null }),
    sendToKitchen: (orderId: number) => call<Order>('orders.sendToKitchen', { orderId }),
    hold: (orderId: number) => call<Order>('orders.hold', { orderId }),
    resume: (orderId: number) => call<Order>('orders.resume', { orderId }),
    pay: (orderId: number, payments: { method: string; amountCents: number; reference?: string | null }[]) =>
      call<Order>('orders.pay', { orderId, payments }),
    cancel: (orderId: number, reason: string, stockPolicy?: string) =>
      call<Order>('orders.cancel', { orderId, reason, stockPolicy: stockPolicy ?? null }),
    moveTable: (orderId: number, tableId: number | null) => call<Order>('orders.moveTable', { orderId, tableId }),
    merge: (fromOrderId: number, toOrderId: number) => call<Order>('orders.merge', { fromOrderId, toOrderId }),
    receipt: (orderId: number, language: string, paper: string) => call<{ html: string }>('orders.receipt', { orderId, language, paper })
  },

  kitchen: {
    board: (station?: string) => call<KitchenBoard>('kitchen.board', { station }),
    itemStatus: (itemId: number, status: string) => call<KitchenBoard>('kitchen.itemStatus', { itemId, status })
  },

  customers: {
    list: (_input: ListInput | number = {}, _pageSize?: number) => call<Customer[]>('customers.list'),
    get: (id: number) => call<Customer>('customers.get', { id }),
    save: (input: Partial<Customer> & { name: string }) => call<Customer>('customers.save', input),
    toggleFavorite: (id: number, favorite: boolean) => call<Customer>('customers.toggleFavorite', { id, favorite }),
    adjustLoyalty: (id: number, delta: number) => call<Customer>('customers.adjustLoyalty', { id, delta })
  },

  ingredients: {
    list: (_includeArchived = false) => call<Ingredient[]>('ingredients.list'),
    save: (input: Record<string, unknown>) => call<Ingredient>('ingredients.save', input),
    adjust: (id: number, qty: number, note?: string | null) => call<Ingredient>('ingredients.adjust', { id, qty, note: note ?? null }),
    waste: (id: number, qty: number, note?: string | null) => call<Ingredient>('ingredients.waste', { id, qty, note: note ?? null }),
    movements: (input: ListInput = {}) => call<InventoryMovement[]>('ingredients.movements', input),
    remove: (id: number) => call<{ removed: boolean }>('ingredients.remove', { id })
  },

  recipes: {
    get: (productId: number) => call<Recipe>('recipes.get', { productId }),
    save: (input: {
      productId: number
      note?: string | null
      items: { ingredientId: number; qty?: number; qtyBase?: number; note?: string | null }[]
    }) => call<Recipe>('recipes.save', input)
  },

  suppliers: {
    list: () => call<Supplier[]>('suppliers.list'),
    get: (id: number) => call<Supplier & { purchases: Purchase[]; payments: SupplierPayment[] }>('suppliers.get', { id }),
    save: (input: Partial<Supplier> & { name: string }) => call<Supplier>('suppliers.save', input)
  },

  purchases: {
    list: (_input: ListInput = {}) => call<Purchase[]>('purchases.list'),
    get: (id: number) => call<Purchase>('purchases.get', { id }),
    save: (input: Record<string, unknown>) => call<Purchase>('purchases.save', input),
    receive: (id: number) => call<Purchase>('purchases.receive', { id }),
    cancel: (id: number) => call<Purchase>('purchases.cancel', { id }),
    pay: (input: {
      supplierId: number
      purchaseId?: number | null
      amountCents: number
      method: string
      note?: string | null
    }) => call<SupplierPayment>('purchases.pay', input)
  },

  delivery: {
    list: (_input: ListInput = {}) => call<DeliveryRecord[]>('delivery.list'),
    save: (input: Record<string, unknown>) => call<DeliveryRecord>('delivery.save', input),
    setStatus: (id: number, status: string, note?: string | null) => call<DeliveryRecord>('delivery.setStatus', { id, status, note: note ?? null })
  },

  reservations: {
    list: (_input: ListInput = {}) => call<Reservation[]>('reservations.list'),
    save: (input: Record<string, unknown>) => call<Reservation>('reservations.save', input),
    setStatus: (id: number, status: string) => call<Reservation>('reservations.setStatus', { id, status })
  },

  users: {
    list: () => call<UserRow[]>('users.list'),
    roles: () => call<RoleRow[]>('users.roles'),
    save: (input: { id?: number; fullName: string; roleId: string; phone?: string | null; pin?: string }) =>
      call<UserRow>('users.save', input),
    setActive: (id: number, active: boolean) => call<{ id: number; isActive: boolean }>('users.setActive', { id, active }),
    resetPin: (id: number, pin: string) => call<{ ok: boolean }>('users.resetPin', { id, pin })
  },

  attendance: {
    list: (date: string) => call<unknown[]>('attendance.list', { date }),
    clock: (input: { type: 'in' | 'out'; note?: string | null }) => call<unknown>('attendance.clock', input)
  },

  audit: {
    list: () => call<AuditRow[]>('audit.list')
  },

  finance: {
    currentSession: () => call<CashSession | null>('finance.currentSession'),
    sessions: (_page = 1, _pageSize = 50) => call<CashSession[]>('finance.sessions'),
    openSession: (input: { openingFloatCents: number; note?: string | null }) => call<CashSession>('finance.openSession', input),
    closeSession: (input: { countedCents: number; note?: string | null }) => call<CashSession>('finance.closeSession', input),
    cashMovement: (input: { type: 'deposit' | 'withdrawal'; amountCents: number; note?: string | null }) =>
      call<CashSession>('finance.cashMovement', input),
    sessionMovements: (sessionId: number) => call<unknown[]>('finance.session.movements', { sessionId }),
    expenses: {
      list: (_page = 1, _pageSize = 50) => call<Expense[]>('finance.expenses.list'),
      save: (input: Record<string, unknown>) => call<Expense>('finance.expenses.save', input),
      remove: (id: number) => call<{ removed: boolean }>('finance.expenses.remove', { id })
    },
    payments: (_page = 1, _pageSize = 50) => call<unknown[]>('finance.payments')
  },

  reports: {
    sales: (from: string, to: string) => call<unknown>('reports.sales', { from, to }),
    products: (from: string, to: string) => call<unknown>('reports.products', { from, to }),
    payments: (from: string, to: string) => call<unknown>('reports.payments', { from, to }),
    orderTypes: (from: string, to: string) => call<unknown>('reports.orderTypes', { from, to }),
    expenses: (from: string, to: string) => call<unknown>('reports.expenses', { from, to }),
    waste: (from: string, to: string) => call<unknown>('reports.waste', { from, to }),
    staff: (from: string, to: string) => call<unknown>('reports.staff', { from, to }),
    inventory: (from: string, to: string) => call<unknown>('reports.inventory', { from, to }),
    purchases: (from: string, to: string) => call<unknown>('reports.purchases', { from, to }),
    suppliers: (from: string, to: string) => call<unknown>('reports.suppliers', { from, to }),
    delivery: (from: string, to: string) => call<unknown>('reports.delivery', { from, to }),
    export: (type: string, from: string, to: string, format: string) =>
      call<{ filePath: string | null }>('reports.export', { type, from, to, format })
  },

  insight: {
    overview: () => call<InsightOverview>('insight.overview'),
    ask: (question: string) => call<InsightAnswer>('insight.ask', { question })
  },

  print: {
    printers: () => call<PrinterInfo[]>('print.printers'),
    html: (html: string, printerName?: string, silent?: boolean) =>
      call<{ success: boolean; printed: boolean; reason: string | null }>('print.html', { html, printerName, silent }),
    exportPdf: (html: string) => call<{ filePath: string | null }>('print.exportPdf', { html })
  },

  backup: {
    list: () => call<BackupFile[]>('backup.list'),
    create: (name: string) => call<{ backupName: string; path: string }>('backup.create', { name }),
    restore: (name: string) => call<{ restored: boolean }>('backup.restore', { name }),
    delete: (name: string) => call<{ deleted: boolean }>('backup.delete', { name }),
    reveal: (path: string) => call<string>('backup.reveal', { path })
  },

  web: {
    export: () => call<{ file: string; url: string }>('web.export'),
    server: (port: number, directory: string) => call<{ running: boolean; url: string }>('web.server', { port, directory }),
    status: () => call<WebStatus>('web.status')
  }
}

export type Api = typeof api

/* Keep the helper referenced for future payload normalisation without tripping lint. */
void payload
