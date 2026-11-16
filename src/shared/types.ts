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
  /** null = head office: sees every branch. */
  branchId?: number | null
  id: number
  username: string
  fullName: string
  roleId: string
  roleName: string
  roleLabel: Localized
  permissions: Permission[]
}

export interface UserRow {
  /** null = head office: sees every branch. */
  branchId?: number | null
  branchName?: string | null
  id: number
  username: string
  fullName: string
  roleId: string
  phone: string | null
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

/** One stamp-duty bracket: the rate (DA per 100 DA) applied when the cash amount is ≤ uptoCents (null = no upper bound). */
export interface StampBracket {
  uptoCents: number | null
  ratePerHundred: number
}

export interface FiscalClosure {
  id: number
  kind: 'day' | 'year'
  periodKey: string
  fromAt: string
  toAt: string
  salesCount: number
  grossCents: number
  taxCents: number
  stampCents: number
  netCents: number
  firstSeq: number | null
  lastSeq: number | null
  chainHash: string
  createdAt: string
}

/** A year sealed into one file: the head is readable, the year itself is not. */
export interface FiscalArchive {
  name: string
  path: string
  sizeBytes: number
  year: number
  createdAt: string
  restaurant: { name: string; legalName: string; nif: string; nis: string; rc: string; ai: string }
  counts: { sales: number; auditRows: number; closures: number }
  payloadSha256: string
}

export interface FiscalArchiveReport {
  ok: boolean
  year: number
  createdAt: string
  counts: { sales: number; auditRows: number; closures: number }
  checks: { sealIntact: boolean; payloadHashMatches: boolean; countsMatch: boolean; salesChainIntact: boolean }
  brokenAt: number | null
  problem: string | null
}

export interface IntegrityReport {
  ok: boolean
  checkedAt: string
  orders: { checked: number; brokenAt: number | null; headHash: string | null }
  audit: { checked: number; legacyRows: number; brokenAt: number | null; headHash: string | null }
}

/** Opening hours per weekday (0 = Sunday … 6 = Saturday); null/missing = closed that day. */
export type BranchHours = Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', { open: string; close: string } | null>>

export interface Branch {
  id: number
  nameAr: string
  nameFr: string
  address: string | null
  phone: string | null
  hours: BranchHours
  /** Manual switch set by the owner. */
  isOpen: boolean
  deliveryNote: string | null
  sortOrder: number
  isActive: boolean
  /** Effective state right now: manual switch AND inside today's hours. */
  openNow: boolean
}

export interface BranchOverride {
  branchId: number
  productId: number
  priceCents: number | null
  isAvailable: boolean | null
}

export type WebsiteTheme = 'ember' | 'noir' | 'sable' | 'nar'

export interface WebsiteConfig {
  theme: WebsiteTheme
  isOpen: boolean
  port: number
  orderTypes: ('delivery' | 'takeaway')[]
  running: boolean
  closedMessageAr: string
  closedMessageFr: string
}

export interface WebsiteState extends WebsiteConfig {
  url: string | null
  lanUrl: string | null
  qrDataUrl: string | null
  themes: { id: WebsiteTheme; label: Localized }[]
  /** The tenant id used in the site URL / artifact name. */
  slug: string
  branches: Branch[]
  /** One QR per branch (data URL), keyed by branch id, when the site is running. */
  branchQr: Record<number, string>
}

/** Shown on the login screen (pre-auth): just enough to pick a profile. No secrets. */
export interface LoginProfile {
  id: number
  fullName: string
  roleId: string
  roleLabel: Localized
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
  /** 'simple' trims the sidebar to the essentials for floor staff; 'full' shows everything (managers). */
  uiMode: 'simple' | 'full'
  /** URL-safe tenant id for the restaurant's own site (a-z, 0-9, dashes). */
  restaurantSlug: string
  /** Fiscal identity printed on tickets (Algeria). */
  legalName: string
  nif: string
  nis: string
  rc: string
  ai: string
  fiscalAddress: string
  /** Classified tourist restaurant → reduced TVA (9%) applies. */
  touristClassified: boolean
  /** Stamp duty (timbre fiscal) on cash receipts. */
  stampEnabled: boolean
  stampBrackets: StampBracket[]
  stampMinCents: number
  /** 0 = no cap. */
  stampMaxCents: number
  /** Loyalty: points per 100 DA, what a point is worth, and the redeem floor. */
  loyaltyEnabled: boolean
  loyaltyEarnPer100: number
  loyaltyPointValueCents: number
  loyaltyMinRedeem: number
  /** Which branch this terminal belongs to; every sale it opens carries it. */
  currentBranchId: number | null
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
  /** For an occupied table: how many are seated and when the order opened. */
  openOrderCovers: number | null
  openOrderOpenedAt: string | null
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
  covers: number
  /** Stamp duty charged on the cash part of the payment (0 when disabled). */
  stampCents: number
  /** The offer that produced the discount, when one did. */
  offerId: number | null
  offerName: string | null
  offerDiscountCents: number
  loyaltyPointsEarned: number
  loyaltyPointsRedeemed: number
  loyaltyDiscountCents: number
  /** Sequential fiscal number + hash chain, set once the sale is completed (sealed). */
  fiscalSeq: number | null
  fiscalHash: string | null
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

/** How an offer takes money off: a share, a fixed sum, a set price, or a free line. */
export type OfferKind = 'percent' | 'amount' | 'combo' | 'freeItem'
/** What the offer looks at: the whole order, one category, or one product. */
export type OfferScope = 'order' | 'category' | 'product'

export interface OfferItem {
  productId: number
  nameAr: string
  nameFr: string
  qty: number
}

export interface Offer {
  id: number
  nameAr: string
  nameFr: string
  kind: OfferKind
  scope: OfferScope
  targetId: number | null
  targetNameAr: string | null
  targetNameFr: string | null
  /** Share off, in basis points (2000 = 20 %). */
  valueBp: number
  /** Fixed sum off, in centimes. */
  valueCents: number
  minSubtotalCents: number
  comboPriceCents: number
  /** How many of the matching lines are free (3-for-2 is freeQty 1). */
  freeQty: number
  startsOn: string | null
  endsOn: string | null
  /** Bit per weekday, Sunday = 1 … Saturday = 64. 127 = every day. */
  daysMask: number
  startTime: string | null
  endTime: string | null
  usageLimit: number
  usedCount: number
  isActive: boolean
  createdAt: string
  items: OfferItem[]
}

/** An offer measured against one order: what it would take off, and why not. */
export interface OfferOffer {
  offer: Offer
  discountCents: number
  eligible: boolean
  reason: string | null
}

export interface LoyaltyMovement {
  id: number
  customerId: number
  orderId: number | null
  orderNumber: string | null
  kind: 'earn' | 'redeem' | 'adjust'
  points: number
  note: string | null
  userName: string | null
  createdAt: string
}

export interface LoyaltyRules {
  enabled: boolean
  /** Points earned per 100 DA spent. */
  earnPer100: number
  /** What one point is worth, in centimes. */
  pointValueCents: number
  minRedeem: number
}

/** A formal invoice issued against a completed sale, with its own numbering. */
/** A key for the open API. Only its hash is stored; the key is shown once. */
export interface ApiToken {
  id: number
  name: string
  prefix: string
  scopes: ('read' | 'write')[]
  isActive: boolean
  lastUsedAt: string | null
  useCount: number
  createdAt: string
  userName: string | null
}

export interface Invoice {
  id: number
  orderId: number
  orderNumber: string
  number: string
  seq: number
  year: number
  buyerName: string
  buyerAddress: string | null
  buyerNif: string | null
  buyerRc: string | null
  buyerPhone: string | null
  subtotalCents: number
  discountCents: number
  taxCents: number
  stampCents: number
  totalCents: number
  taxRateBp: number
  currency: string
  issuedAt: string
  userName: string | null
}

export interface InvoiceBuyer {
  name: string
  address?: string | null
  nif?: string | null
  rc?: string | null
  phone?: string | null
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
