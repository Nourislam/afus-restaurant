/**
 * Every screen in the program, once.
 *
 * The menu and the route guards both read this list, so a screen can never be
 * offered in the menu but left unguarded, nor guarded differently from the way
 * it is shown. It also answers the question the login screen needs: **which
 * screen may this person actually open first?**
 */
import {
  BarChart3,
  Bike,
  BookOpen,
  CalendarClock,
  ChefHat,
  FileText,
  Flame,
  Globe,
  LayoutDashboard,
  Lightbulb,
  Package,
  Percent,
  ReceiptText,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon
} from 'lucide-react'
import type { Permission } from '@shared/permissions'

export interface NavEntry {
  to: string
  /** Translation key for the label. */
  labelKey: string
  icon: LucideIcon
  /** Any one of these is enough. Absent means "signed in is enough". */
  permission?: Permission | Permission[]
  exact?: boolean
  /** Which block of the menu it belongs to. */
  group: 'service' | 'backOffice' | 'figures' | 'system'
  /**
   * Where a person who can open this screen would rather start their shift.
   * Lower wins. Without it a stock keeper lands on the menu simply because it
   * happens to come first in the list, which is not where they work.
   */
  landing?: number
}

export const NAV: NavEntry[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, permission: 'dashboard.view', exact: true, group: 'service', landing: 0 },
  { to: '/pos', labelKey: 'nav.pos', icon: ShoppingCart, permission: 'pos.use', group: 'service', landing: 1 },
  { to: '/tables', labelKey: 'nav.tables', icon: UtensilsCrossed, permission: ['tables.manage', 'pos.use'], group: 'service', landing: 4 },
  { to: '/kitchen', labelKey: 'nav.kitchen', icon: Flame, permission: 'kitchen.view', group: 'service', landing: 2 },
  { to: '/orders', labelKey: 'nav.orders', icon: ReceiptText, permission: 'orders.view', group: 'service', landing: 5 },
  { to: '/reservations', labelKey: 'nav.reservations', icon: CalendarClock, permission: 'reservations.manage', group: 'service' },
  { to: '/delivery', labelKey: 'nav.delivery', icon: Bike, permission: 'delivery.manage', group: 'service' },

  { to: '/menu', labelKey: 'nav.menu', icon: BookOpen, permission: 'menu.view', group: 'backOffice' },
  { to: '/recipes', labelKey: 'nav.recipes', icon: ChefHat, permission: 'recipes.view', group: 'backOffice' },
  { to: '/inventory', labelKey: 'nav.inventory', icon: Package, permission: 'inventory.view', group: 'backOffice', landing: 3 },
  { to: '/purchases', labelKey: 'nav.purchases', icon: Truck, permission: 'purchases.view', group: 'backOffice' },
  { to: '/customers', labelKey: 'nav.customers', icon: Users, permission: 'customers.manage', group: 'backOffice' },
  { to: '/offers', labelKey: 'nav.offers', icon: Percent, permission: 'menu.manage', group: 'backOffice' },
  { to: '/website', labelKey: 'web.nav', icon: Globe, permission: 'settings.manage', group: 'backOffice' },
  { to: '/employees', labelKey: 'nav.employees', icon: ShieldCheck, permission: 'employees.manage', group: 'backOffice' },

  { to: '/invoices', labelKey: 'nav.invoices', icon: FileText, permission: ['finance.view', 'reports.view'], group: 'figures' },
  { to: '/finance', labelKey: 'nav.finance', icon: Wallet, permission: 'finance.view', group: 'figures', landing: 6 },
  { to: '/reports', labelKey: 'nav.reports', icon: BarChart3, permission: 'reports.view', group: 'figures' },
  { to: '/insight', labelKey: 'nav.insight', icon: Lightbulb, permission: 'insight.view', group: 'figures' },

  { to: '/settings', labelKey: 'nav.settings', icon: SettingsIcon, permission: 'settings.manage', group: 'system' }
]

/** Screens that are reachable but never listed in the menu. */
export const DETAIL_ROUTES: { to: string; permission?: Permission | Permission[] }[] = [
  { to: '/orders/:id', permission: 'orders.view' }
]

export function allows(permissions: readonly string[], required?: Permission | Permission[]): boolean {
  if (!required) return true
  const list = Array.isArray(required) ? required : [required]
  return list.some((permission) => permissions.includes(permission))
}

export const visibleNav = (permissions: readonly string[]): NavEntry[] => NAV.filter((entry) => allows(permissions, entry.permission))

/**
 * The first screen this person can actually open. A cook has no dashboard, so
 * sending them to `/` on login only shows them a refusal.
 */
export function homePathFor(permissions: readonly string[]): string {
  const visible = visibleNav(permissions)
  const ranked = visible.filter((entry) => entry.landing !== undefined).sort((a, b) => a.landing! - b.landing!)
  return ranked[0]?.to ?? visible[0]?.to ?? '/settings'
}

/** What a given path needs, for the guard. */
export function permissionFor(path: string): Permission | Permission[] | undefined {
  return NAV.find((entry) => entry.to === path)?.permission ?? DETAIL_ROUTES.find((entry) => entry.to === path)?.permission
}
