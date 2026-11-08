import type { Localized } from './constants'

export const PERMISSIONS = [
  'dashboard.view',
  'pos.use',
  'tables.manage',
  'orders.view',
  'orders.create',
  'orders.discount',
  'orders.cancel',
  'orders.close',
  'kitchen.view',
  'kitchen.update',
  'menu.view',
  'menu.manage',
  'recipes.view',
  'recipes.manage',
  'inventory.view',
  'inventory.manage',
  'purchases.view',
  'purchases.manage',
  'suppliers.view',
  'suppliers.manage',
  'customers.manage',
  'delivery.manage',
  'reservations.manage',
  'employees.manage',
  'finance.view',
  'finance.manage',
  'reports.view',
  'reports.export',
  'insight.view',
  'settings.manage',
  'backup.manage',
  'audit.view'
] as const

export type Permission = (typeof PERMISSIONS)[number]

export interface RoleDefinition {
  id: string
  name: string
  labelAr: string
  labelFr: string
  permissions: Permission[]
}

const ALL: Permission[] = [...PERMISSIONS]

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  { id: 'owner', name: 'owner', labelAr: 'صاحب المطعم', labelFr: 'Propriétaire', permissions: ALL },
  { id: 'admin', name: 'admin', labelAr: 'مدير', labelFr: 'Administrateur', permissions: ALL },
  {
    id: 'accountant',
    name: 'accountant',
    labelAr: 'محاسب',
    labelFr: 'Comptable',
    permissions: [
      'dashboard.view',
      'orders.view',
      'menu.view',
      'inventory.view',
      'purchases.view',
      'purchases.manage',
      'finance.view',
      'finance.manage',
      'reports.view',
      'reports.export',
      'insight.view',
      'audit.view',
      'customers.manage',
      'suppliers.view',
      'suppliers.manage'
    ]
  },
  {
    id: 'cashier',
    name: 'cashier',
    labelAr: 'أمين الصندوق',
    labelFr: 'Caissier',
    permissions: [
      'dashboard.view',
      'pos.use',
      'orders.view',
      'orders.create',
      'orders.close',
      'orders.discount',
      'finance.view',
      'finance.manage',
      'customers.manage',
      'delivery.manage',
      'reports.view',
      'menu.view',
      'kitchen.view'
    ]
  },
  {
    id: 'waiter',
    name: 'waiter',
    labelAr: 'نادل',
    labelFr: 'Serveur',
    permissions: [
      'dashboard.view',
      'pos.use',
      'tables.manage',
      'orders.view',
      'orders.create',
      'kitchen.view',
      'menu.view',
      'customers.manage',
      'delivery.manage',
      'reservations.manage'
    ]
  },
  {
    id: 'kitchen',
    name: 'kitchen',
    labelAr: 'مسؤول المطبخ',
    labelFr: 'Cuisine',
    permissions: ['kitchen.view', 'kitchen.update', 'orders.view', 'menu.view', 'inventory.view', 'recipes.view']
  },
  {
    id: 'stock',
    name: 'stock_manager',
    labelAr: 'مسؤول المخزون',
    labelFr: 'Gestion des stocks',
    permissions: [
      'inventory.view',
      'inventory.manage',
      'recipes.view',
      'recipes.manage',
      'purchases.view',
      'purchases.manage',
      'menu.view',
      'reports.view',
      'suppliers.view',
      'suppliers.manage'
    ]
  }
]

export const ROLE_LABELS: Record<string, Localized> = Object.fromEntries(
  ROLE_DEFINITIONS.map((role) => [role.id, { ar: role.labelAr, fr: role.labelFr }])
)

export function permissionsForRole(roleId: string): Permission[] {
  return ROLE_DEFINITIONS.find((role) => role.id === roleId)?.permissions ?? []
}

export function hasPermission(permissions: readonly string[] | undefined, permission: Permission): boolean {
  if (!permissions) return false
  return permissions.includes(permission) || permissions.includes('*')
}

export function canAny(permissions: readonly string[] | undefined, required: Permission[]): boolean {
  return required.some((permission) => hasPermission(permissions, permission))
}
