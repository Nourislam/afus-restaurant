import type { Lang, Localized, Unit } from './constants'

export type {
  DeliveryStatus,
  ExpenseCategory,
  Lang,
  Localized,
  MovementType,
  OrderItemStatus,
  OrderStatus,
  OrderType,
  ProductType,
  PurchaseStatus,
  ReservationStatus,
  Station,
  TableStatus,
  Unit
} from './constants'
import type { Permission } from './permissions'

export interface UserSession {
  id: number
  username: string
  fullName: string
  roleId: string
  roleName: string
  roleLabel: Localized
  permissions: Permission[]
}

export interface UserRow {
  id: number
  username: string
  fullName: string
  roleId: string
  phone: string | null
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface RoleRow {
  id: string
  labelAr: string
  labelFr: string
  permissions: Permission[]
}

export interface AppSettings {
  restaurantName: string
  restaurantNameFr: string
  phone: string
  address: string
  logo: string
  currency: string
  language: Lang
  theme: 'light' | 'dark'
  taxEnabled: boolean
  taxRateBp: number
  taxInclusive: boolean
  receiptFooter: string
  printerName: string
  paperWidth: '80' | '58' | 'a4'
  autoBackupEnabled: boolean
  backupIntervalHours: number
  backupDir: string
  backupKeep: number
  loyaltyEnabled: boolean
  loyaltyPointsPerUnit: number
  paymentMethods: string[]
  kitchenAlertMinutes: number
  preorderLeadMinutes: number
}

export interface SetupStatus {
  initialized: boolean
  restaurantName: string
}

export interface Category {
  id: number
  nameAr: string
  nameFr: string
  kind: string
  color: string
  sortOrder: number
  isArchived: boolean
  productCount?: number
}

export interface ProductVariant {
  id: number
  productId: number
  nameAr: string
  nameFr: string
  priceDeltaCents: number
  isDefault: boolean
  sortOrder: number
}

export interface Modifier {
  id: number
  groupId: number
  nameAr: string
  nameFr: string
  priceCents: number
  isActive: boolean
  sortOrder: number
}

export interface ModifierGroup {
  id: number
  nameAr: string
  nameFr: string
  minSelect: number
  maxSelect: number
  isRequired: boolean
  sortOrder: number
  isArchived: boolean
  modifiers: Modifier[]
}

export interface Product {
  id: number
  code: string | null
  nameAr: string
  nameFr: string
  descriptionAr: string | null
  descriptionFr: string | null
  image: string | null
  categoryId: number
  categoryNameAr: string
  categoryNameFr: string
  type: string
  priceCents: number
  costCents: number
  prepMinutes: number
  station: string
  isAvailable: boolean
  isArchived: boolean
  hasRecipe: boolean
  sortOrder: number
  variants: ProductVariant[]
  modifierGroups: ModifierGroup[]
}

export interface DiningArea {
  id: number
  nameAr: string
  nameFr: string
  color: string
  sortOrder: number
  isArchived: boolean
  tableCount?: number
}

export interface RestaurantTable {
  id: number
  areaId: number
  name: string
  seats: number
  status: string
  positionX: number
  positionY: number
  isArchived: boolean
  openOrderId: number | null
  openOrderNumber: string | null
  openOrderTotalCents: number
  waiterName: string | null
}

export interface TableMap {
  areas: DiningArea[]
  tables: RestaurantTable[]
}

export interface OrderItemModifier {
  id: number
  modifierId: number | null
  nameAr: string
  nameFr: string
  priceCents: number
}

export interface OrderItem {
  id: number
  orderId: number
  productId: number
  productNameAr: string
  productNameFr: string
  variantId: number | null
  variantNameAr: string | null
  variantNameFr: string | null
  unitPriceCents: number
  unitCostCents: number
  qty: number
  modifiersCents: number
  lineTotalCents: number
  note: string | null
  station: string
  status: string
  createdAt: string
  modifiers: OrderItemModifier[]
}

export interface Payment {
  id: number
  method: string
  amountCents: number
  reference: string | null
  userName: string | null
  createdAt: string
}

export interface OrderStatusEvent {
  id: number
  fromStatus: string | null
  toStatus: string
  userName: string | null
  note: string | null
  createdAt: string
}

export interface KitchenTicket {
  orderId: number
  orderNumber: string
  type: string
  status: string
  tableName: string | null
  waiterName: string | null
  customerName: string | null
  createdAt: string
  elapsedMinutes: number
  late: boolean
  note: string | null
  items: OrderItem[]
}

export interface KitchenBoard {
  tickets: KitchenTicket[]
  stations: { value: string; pending: number }[]
  counts: { new: number; preparing: number; ready: number; late: number }
}

export interface DeliveryInfo {
  id: number
  orderId: number
  customerName: string
  phone: string
  address: string
  area: string | null
  feeCents: number
  courier: string | null
  status: string
  note: string | null
  deliveredAt: string | null
}

export interface DeliveryRecord extends DeliveryInfo {
  orderNumber: string
  orderTotalCents: number
  orderPaidCents: number
  orderStatus: string
  orderCreatedAt: string
}

export interface Order {
  id: number
  orderNumber: string
  type: string
  status: string
  tableId: number | null
  tableName: string | null
  customerId: number | null
  customerName: string | null
  userId: number
  waiterName: string | null
  subtotalCents: number
  discountCents: number
  discountReason: string | null
  taxCents: number
  deliveryFeeCents: number
  totalCents: number
  paidCents: number
  dueCents: number
  note: string | null
  isHeld: boolean
  stockDeducted: boolean
  scheduledFor: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  items: OrderItem[]
  payments: Payment[]
  history: OrderStatusEvent[]
  delivery: DeliveryInfo | null
  itemCount: number
}

export interface OrderSummary {
  id: number
  orderNumber: string
  type: string
  status: string
  tableName: string | null
  customerName: string | null
  waiterName: string | null
  totalCents: number
  paidCents: number
  dueCents: number
  itemCount: number
  isHeld: boolean
  createdAt: string
  scheduledFor: string | null
}

export interface Customer {
  id: number
  name: string
  phone: string | null
  address: string | null
  area: string | null
  notes: string | null
  isFavorite: boolean
  loyaltyPoints: number
  createdAt: string
  orderCount: number
  totalSpentCents: number
  lastOrderAt: string | null
}

export interface Ingredient {
  id: number
  nameAr: string
  nameFr: string
  unit: Unit
  baseUnit: Unit
  costMicrosPerBase: number
  unitCostCents: number
  stockQtyBase: number
  stockQty: number
  minQtyBase: number
  minQty: number
  isArchived: boolean
  isLow: boolean
  stockValueCents: number
}

export interface InventoryMovement {
  id: number
  ingredientId: number
  ingredientNameAr: string
  ingredientNameFr: string
  unit: Unit
  type: string
  qtyDeltaBase: number
  qtyDelta: number
  unitCostMicros: number
  refType: string | null
  refId: string | null
  note: string | null
  userName: string | null
  createdAt: string
  balanceAfter?: number
}

export interface RecipeItem {
  id: number
  recipeId: number
  ingredientId: number
  ingredientNameAr: string
  ingredientNameFr: string
  unit: string
  qtyBase: number
  qty: number
  costCents: number
}

export interface Recipe {
  productId: number
  productNameAr: string
  productNameFr: string
  hasRecipe: boolean
  items: RecipeItem[]
  totalCostCents: number
  salePriceCents: number
  marginCents: number
  marginBp: number
}

export interface Supplier {
  id: number
  name: string
  phone: string | null
  address: string | null
  notes: string | null
  isArchived: boolean
  createdAt: string
  totalPurchasesCents: number
  totalPaidCents: number
  balanceCents: number
  purchases?: Purchase[]
  payments?: SupplierPayment[]
}

export interface PurchaseItem {
  id: number
  purchaseId: number
  ingredientId: number
  ingredientNameAr: string
  ingredientNameFr: string
  unit: string
  qtyBase: number
  qty: number
  unitCostCents: number
  lineTotalCents: number
}

export interface Purchase {
  id: number
  supplierId: number
  supplierName: string | null
  invoiceNo: string | null
  purchaseDate: string
  subtotalCents: number
  discountCents: number
  extraCents: number
  totalCents: number
  paidCents: number
  status: string
  note: string | null
  userName: string | null
  createdAt: string
  receivedAt: string | null
  items: PurchaseItem[]
}

export interface SupplierPayment {
  id: number
  supplierId: number
  purchaseId: number | null
  amountCents: number
  method: string
  note: string | null
  userName: string | null
  createdAt: string
}

export interface Expense {
  id: number
  category: string
  description: string
  amountCents: number
  method: string
  expenseDate: string
  userName: string | null
  createdAt: string
}

export interface CashSession {
  id: number
  openedBy: number
  openedByName: string | null
  openedAt: string
  openingFloatCents: number
  closedBy: number | null
  closedByName: string | null
  closedAt: string | null
  expectedCents: number | null
  countedCents: number | null
  differenceCents: number | null
  status: 'open' | 'closed'
  note: string | null
  cashSalesCents: number
  expensesCents: number
  supplierPaymentsCents: number
  depositsCents: number
  withdrawalsCents: number
}

export interface CashMovement {
  id: number
  sessionId: number
  type: string
  amountCents: number
  method: string
  refType: string | null
  refId: string | null
  note: string | null
  userName: string | null
  createdAt: string
}

export interface Reservation {
  id: number
  customerName: string
  phone: string
  date: string
  time: string
  partySize: number
  tableId: number | null
  tableName: string | null
  note: string | null
  status: string
  createdAt: string
}

export interface AttendanceRow {
  id: number
  userId: number
  userName: string
  clockIn: string
  clockOut: string | null
  minutes: number | null
  note: string | null
}

export interface AuditRow {
  id: number
  userId: number | null
  userName: string | null
  action: string
  entity: string
  entityId: string | null
  details: string | null
  createdAt: string
}

export interface DashboardSummary {
  from: string
  to: string
  salesCents: number
  ordersCount: number
  preparingCount: number
  readyCount: number
  averageOrderCents: number
  expensesCents: number
  netResultCents: number
  itemsSold: number
  topProducts: { productId: number; nameAr: string; nameFr: string; qty: number; revenueCents: number }[]
  lowStock: { id: number; nameAr: string; nameFr: string; unit: string; stockQty: number; minQty: number }[]
  recentActivity: { id: number; orderNumber: string; status: string; totalCents: number; createdAt: string }[]
  hourlySales: { hour: string; salesCents: number; orders: number }[]
  dailySales: { date: string; salesCents: number; orders: number }[]
}

export interface ReportColumn {
  key: string
  label: Localized
  type?: 'text' | 'money' | 'number' | 'date' | 'percent'
  width?: string
}

export interface ReportTable {
  title: Localized
  columns: ReportColumn[]
  rows: Record<string, string | number | null>[]
  summary?: Record<string, string | number | null>
  totals?: Record<string, number>
}

export interface InsightAnswer {
  question: string
  understood: boolean
  answerAr: string
  answerFr: string
  data?: ReportTable
}

export interface InsightOverview {
  generatedAt: string
  rangeDays: number
  highlights: { ar: string; fr: string; tone: 'positive' | 'warning' | 'info' }[]
  bestProfit: { nameAr: string; nameFr: string; marginCents: number; marginBp: number }[]
  declining: { nameAr: string; nameFr: string; changePct: number }[]
  peakHours: { hour: string; orders: number }[]
  forecast: { ingredientId: number; nameAr: string; nameFr: string; unit: Unit; suggestedQty: number; daysLeft: number }[]
  wasteTop: { nameAr: string; nameFr: string; wasteCents: number }[]
  anomalies: { date: string; salesCents: number; expectedCents: number; deviationPct: number }[]
}

export interface BackupFile {
  name: string
  path: string
  sizeBytes: number
  createdAt: string
  kind: 'manual' | 'auto' | 'pre-restore'
}

export interface PrinterInfo {
  name: string
  displayName: string
  isDefault: boolean
}

export interface WebStatus {
  running: boolean
  url: string | null
  directory: string | null
  lastExportedAt: string | null
}
