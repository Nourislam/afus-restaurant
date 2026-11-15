import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import { LogOut, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'
import type { Permission } from '@shared/permissions'
import { AfusMark } from './AfusLogo'
import { localized, useT } from '../i18n'
import { useAppStore } from '../store/app'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  permission?: Permission | Permission[]
  exact?: boolean
}

/* Open or closed menu, remembered on this computer only. */
const COLLAPSED_KEY = 'afus_sidebar_collapsed'
const readCollapsed = (): boolean => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}
const writeCollapsed = (value: boolean): void => {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0')
  } catch {
    /* kept for this session only */
  }
}

/** The name shown beside an icon while the menu is closed (also on keyboard focus). */
function useTooltip(enabled: boolean) {
  const [tip, setTip] = useState<{ text: string; top: number; x: number; rtl: boolean } | null>(null)
  useEffect(() => {
    if (!enabled) setTip(null)
  }, [enabled])

  const show = (text: string) => (event: { currentTarget: HTMLElement }) => {
    if (!enabled) return
    const box = event.currentTarget.getBoundingClientRect()
    const rtl = document.documentElement.dir === 'rtl'
    setTip({ text, top: box.top + box.height / 2, x: rtl ? box.left - 8 : box.right + 8, rtl })
  }
  const hide = () => setTip(null)

  const props = (text: string) =>
    enabled
      ? { onMouseEnter: show(text), onMouseLeave: hide, onFocus: show(text), onBlur: hide, 'aria-label': text }
      : {}

  const node =
    tip &&
    createPortal(
      <div
        role="tooltip"
        className="pointer-events-none fixed z-[120] whitespace-nowrap rounded-md border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
        style={{ top: tip.top, left: tip.x, transform: `translate(${tip.rtl ? '-100%' : '0'}, -50%)` }}
      >
        {tip.text}
      </div>,
      document.body
    )

  return { props, node }
}

const canSee = (permissions: readonly string[], required?: Permission | Permission[]): boolean => {
  if (!required) return true
  const list = Array.isArray(required) ? required : [required]
  return list.some((permission) => permissions.includes(permission))
}

/**
 * The menu, exactly as it works in Afus Boutique: the restaurant card at the top
 * is the open/close button (there is no separate one), the state is remembered,
 * and while it is closed every icon shows its name as a tooltip on hover and on
 * keyboard focus. Groups are split by hairlines, not labels, so all the entries
 * fit on a short screen without the menu scrolling.
 */
export function Sidebar({
  groups,
  onLogout,
  onNavigate,
  footer
}: {
  groups: NavItem[][]
  onLogout: () => void
  onNavigate?: () => void
  footer?: ReactNode
}) {
  const { t, language } = useT()
  const user = useAppStore((state) => state.user)
  const settings = useAppStore((state) => state.settings)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const tooltip = useTooltip(collapsed)
  const permissions = user?.permissions ?? []

  const toggle = () =>
    setCollapsed((value) => {
      writeCollapsed(!value)
      return !value
    })

  const restaurantName = settings?.restaurantName || t('app.name')
  const userName = user?.fullName ?? ''
  const roleName = user ? localized(language, user.roleLabel) : ''
  const who = [restaurantName, userName, roleName].filter(Boolean).join(' — ')

  const entry = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.exact}
      onClick={onNavigate}
      className={({ isActive }) => clsx('sidebar-item', collapsed && 'justify-center !px-0', isActive && 'active')}
      {...tooltip.props(item.label)}
    >
      {({ isActive }) => (
        <>
          <span
            className={clsx(
              'absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-brand-500 transition-opacity duration-150',
              isActive ? 'opacity-100' : 'opacity-0'
            )}
            aria-hidden
          />
          <item.icon className="h-[18px] w-[18px] flex-none" />
          <span className={collapsed ? 'sr-only' : 'min-w-0 truncate'}>{item.label}</span>
        </>
      )}
    </NavLink>
  )

  const settingsItem: NavItem = { to: '/settings', label: t('nav.settings'), icon: SettingsIcon, permission: 'settings.manage' }

  return (
    <aside
      className={clsx(
        'relative flex flex-none flex-col border-e border-white/5 bg-ink-950 text-white transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* The restaurant, who is working, and their role. A click opens or closes
          the menu — the only way, as in Boutique. Keyboard: Tab then Enter. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={`${who} · ${collapsed ? t('nav.expand') : t('nav.collapse')}`}
        title={collapsed ? undefined : t('nav.collapse')}
        data-testid="sidebar-toggle"
        className="flex flex-none items-center gap-2.5 border-b border-white/10 px-3 py-2.5 text-start transition-colors hover:bg-white/[0.06]"
        {...tooltip.props(`${who} · ${t('nav.expand')}`)}
      >
        <AfusMark className="h-9 w-9 flex-none rounded-lg shadow-sm ring-1 ring-white/10" title={restaurantName} />
        {collapsed ? null : (
          <span className="min-w-0 flex-1 leading-tight">
            <span dir="auto" className="block truncate text-sm font-bold" title={restaurantName}>
              {restaurantName}
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px]" title={`${userName} — ${roleName}`}>
              <span dir="auto" className="min-w-0 truncate text-white/70">
                {userName}
              </span>
              {roleName ? <span className="flex-none text-white/40">— {roleName}</span> : null}
            </span>
          </span>
        )}
      </button>

      <nav className="thin-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {groups.map((group, index) => {
          const items = group.filter((item) => canSee(permissions, item.permission))
          if (items.length === 0) return null
          return (
            <div key={index} className={index > 0 ? 'mt-1.5 border-t border-white/[0.07] pt-1.5' : undefined}>
              {items.map(entry)}
            </div>
          )
        })}
      </nav>

      <div className="flex-none space-y-0.5 border-t border-white/10 p-2">
        {canSee(permissions, settingsItem.permission) ? entry(settingsItem) : null}
        <button
          type="button"
          onClick={onLogout}
          data-testid="nav-logout"
          className={clsx(
            'sidebar-item w-full text-red-300 hover:bg-red-500/10 hover:text-red-200',
            collapsed && 'justify-center !px-0'
          )}
          {...tooltip.props(t('auth.logout'))}
        >
          <LogOut className="h-[18px] w-[18px] flex-none flip-rtl" />
          <span className={collapsed ? 'sr-only' : 'min-w-0 truncate'}>{t('auth.logout')}</span>
        </button>
        {collapsed ? null : footer}
      </div>

      {tooltip.node}
    </aside>
  )
}
