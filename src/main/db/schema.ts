/**
 * Database schema, expressed as versioned SQL migrations.
 *
 * Columns are camelCase on purpose: sql.js returns rows keyed by the declared
 * column name, so services hand domain objects straight to the renderer without
 * a mapping layer (and without the drift that comes with one).
 */
export const SCHEMA_VERSION = 1

const V1 = `
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  labelAr TEXT NOT NULL,
  labelFr TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  fullName TEXT NOT NULL,
  roleId TEXT NOT NULL REFERENCES roles(id),
  phone TEXT,
  passwordHash TEXT NOT NULL,
  isActive INTEGER NOT NULL DEFAULT 1,
  lastLoginAt TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nameAr TEXT NOT NULL,
  nameFr TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'food',
  color TEXT NOT NULL DEFAULT '#6366f1',
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isArchived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  nameAr TEXT NOT NULL,
  nameFr TEXT NOT NULL,
  descriptionAr TEXT,
  descriptionFr TEXT,
  image TEXT,
  categoryId INTEGER NOT NULL REFERENCES categories(id),
  type TEXT NOT NULL DEFAULT 'main',
  priceCents INTEGER NOT NULL DEFAULT 0 CHECK (priceCents >= 0),
  costCents INTEGER NOT NULL DEFAULT 0 CHECK (costCents >= 0),
  prepMinutes INTEGER NOT NULL DEFAULT 0,
  station TEXT NOT NULL DEFAULT 'grill',
  isAvailable INTEGER NOT NULL DEFAULT 1,
  isArchived INTEGER NOT NULL DEFAULT 0,
  sortOrder INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  nameAr TEXT NOT NULL,
  nameFr TEXT NOT NULL,
  priceDeltaCents INTEGER NOT NULL DEFAULT 0,
  isDefault INTEGER NOT NULL DEFAULT 0,
  sortOrder INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS modifier_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nameAr TEXT NOT NULL,
  nameFr TEXT NOT NULL,
  minSelect INTEGER NOT NULL DEFAULT 0,
  maxSelect INTEGER NOT NULL DEFAULT 1,
  isRequired INTEGER NOT NULL DEFAULT 0,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isArchived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS modifiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  groupId INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  nameAr TEXT NOT NULL,
  nameFr TEXT NOT NULL,
  priceCents INTEGER NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_modifier_groups (
  productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  groupId INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (productId, groupId)
);

CREATE TABLE IF NOT EXISTS dining_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nameAr TEXT NOT NULL,
  nameFr TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isArchived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dining_tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  areaId INTEGER NOT NULL REFERENCES dining_areas(id),
  name TEXT NOT NULL,
  seats INTEGER NOT NULL DEFAULT 2 CHECK (seats > 0),
  status TEXT NOT NULL DEFAULT 'free',
  positionX REAL NOT NULL DEFAULT 0,
  positionY REAL NOT NULL DEFAULT 0,
  isArchived INTEGER NOT NULL DEFAULT 0,
  UNIQUE (areaId, name)
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  area TEXT,
  notes TEXT,
  isFavorite INTEGER NOT NULL DEFAULT 0,
  loyaltyPoints INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderNumber TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'dineIn',
  status TEXT NOT NULL DEFAULT 'new',
  tableId INTEGER REFERENCES dining_tables(id) ON DELETE SET NULL,
  customerId INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  userId INTEGER NOT NULL REFERENCES users(id),
  subtotalCents INTEGER NOT NULL DEFAULT 0,
  discountCents INTEGER NOT NULL DEFAULT 0,
  discountReason TEXT,
  taxCents INTEGER NOT NULL DEFAULT 0,
  deliveryFeeCents INTEGER NOT NULL DEFAULT 0,
  totalCents INTEGER NOT NULL DEFAULT 0,
  paidCents INTEGER NOT NULL DEFAULT 0,
  dueCents INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  isHeld INTEGER NOT NULL DEFAULT 0,
  stockDeducted INTEGER NOT NULL DEFAULT 0,
  scheduledFor TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT,
  cancelledAt TEXT,
  cancelReason TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  productId INTEGER NOT NULL REFERENCES products(id),
  variantId INTEGER REFERENCES product_variants(id),
  productNameAr TEXT NOT NULL,
  productNameFr TEXT NOT NULL,
  variantNameAr TEXT,
  variantNameFr TEXT,
  unitPriceCents INTEGER NOT NULL,
  unitCostCents INTEGER NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  modifiersCents INTEGER NOT NULL DEFAULT 0,
  lineTotalCents INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  station TEXT NOT NULL DEFAULT 'grill',
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_item_modifiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderItemId INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifierId INTEGER,
  nameAr TEXT NOT NULL,
  nameFr TEXT NOT NULL,
  priceCents INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'cash',
  amountCents INTEGER NOT NULL CHECK (amountCents > 0),
  reference TEXT,
  userId INTEGER REFERENCES users(id),
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  fromStatus TEXT,
  toStatus TEXT NOT NULL,
  userId INTEGER REFERENCES users(id),
  note TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  customerName TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  area TEXT,
  feeCents INTEGER NOT NULL DEFAULT 0,
  courier TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  deliveredAt TEXT
);

CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nameAr TEXT NOT NULL,
  nameFr TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  baseUnit TEXT NOT NULL DEFAULT 'g',
  costMicrosPerBase INTEGER NOT NULL DEFAULT 0,
  stockQtyBase INTEGER NOT NULL DEFAULT 0,
  minQtyBase INTEGER NOT NULL DEFAULT 0,
  isArchived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ingredient_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredientId INTEGER NOT NULL REFERENCES ingredients(id),
  type TEXT NOT NULL,
  qtyDeltaBase INTEGER NOT NULL,
  unitCostMicros INTEGER NOT NULL DEFAULT 0,
  refType TEXT,
  refId TEXT,
  note TEXT,
  userId INTEGER REFERENCES users(id),
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  productId INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  note TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipeId INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredientId INTEGER NOT NULL REFERENCES ingredients(id),
  qtyBase INTEGER NOT NULL CHECK (qtyBase > 0),
  UNIQUE (recipeId, ingredientId)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  isArchived INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplierId INTEGER NOT NULL REFERENCES suppliers(id),
  invoiceNo TEXT,
  purchaseDate TEXT NOT NULL,
  subtotalCents INTEGER NOT NULL DEFAULT 0,
  discountCents INTEGER NOT NULL DEFAULT 0,
  extraCents INTEGER NOT NULL DEFAULT 0,
  totalCents INTEGER NOT NULL DEFAULT 0,
  paidCents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  note TEXT,
  userId INTEGER REFERENCES users(id),
  createdAt TEXT NOT NULL,
  receivedAt TEXT
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchaseId INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  ingredientId INTEGER NOT NULL REFERENCES ingredients(id),
  qtyBase INTEGER NOT NULL CHECK (qtyBase > 0),
  unitCostMicros INTEGER NOT NULL DEFAULT 0,
  lineTotalCents INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplierId INTEGER NOT NULL REFERENCES suppliers(id),
  purchaseId INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
  amountCents INTEGER NOT NULL CHECK (amountCents > 0),
  method TEXT NOT NULL DEFAULT 'cash',
  note TEXT,
  userId INTEGER REFERENCES users(id),
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  amountCents INTEGER NOT NULL CHECK (amountCents > 0),
  method TEXT NOT NULL DEFAULT 'cash',
  expenseDate TEXT NOT NULL,
  userId INTEGER REFERENCES users(id),
  cashSessionId INTEGER REFERENCES cash_sessions(id) ON DELETE SET NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openedBy INTEGER NOT NULL REFERENCES users(id),
  openedAt TEXT NOT NULL,
  openingFloatCents INTEGER NOT NULL DEFAULT 0,
  closedBy INTEGER REFERENCES users(id),
  closedAt TEXT,
  expectedCents INTEGER,
  countedCents INTEGER,
  differenceCents INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  note TEXT
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amountCents INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  refType TEXT,
  refId TEXT,
  note TEXT,
  userId INTEGER REFERENCES users(id),
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customerName TEXT NOT NULL,
  phone TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  partySize INTEGER NOT NULL DEFAULT 2 CHECK (partySize > 0),
  tableId INTEGER REFERENCES dining_tables(id) ON DELETE SET NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  clockIn TEXT NOT NULL,
  clockOut TEXT,
  minutes INTEGER,
  note TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entityId TEXT,
  details TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kitchen_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  orderItemId INTEGER REFERENCES order_items(id) ON DELETE CASCADE,
  station TEXT NOT NULL DEFAULT 'grill',
  status TEXT NOT NULL DEFAULT 'new',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (createdAt);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders (tableId);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (orderId);
CREATE INDEX IF NOT EXISTS idx_payments_order ON order_payments (orderId);
CREATE INDEX IF NOT EXISTS idx_movements_ingredient ON ingredient_movements (ingredientId, createdAt);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (createdAt);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations (date);
`

export const MIGRATIONS: Record<number, string> = {
  1: V1
}
