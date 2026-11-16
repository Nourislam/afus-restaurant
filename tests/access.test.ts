import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ROLE_DEFINITIONS, type Permission } from '../src/shared/permissions'
import { NAV, allows, homePathFor, permissionFor, visibleNav } from '../src/renderer/src/lib/navigation'

const permissionsOf = (roleId: string): Permission[] => ROLE_DEFINITIONS.find((role) => role.id === roleId)!.permissions

describe('every role lands somewhere it may actually work', () => {
  it.each(ROLE_DEFINITIONS.map((role) => [role.id] as const))('%s gets a home screen it is allowed to open', (roleId) => {
    const permissions = permissionsOf(roleId)
    const home = homePathFor(permissions)
    /* The bug this guards: a cook has no dashboard, so sending them to "/" on
       login only showed them a refusal. */
    expect(allows(permissions, permissionFor(home))).toBe(true)
    expect(visibleNav(permissions).length).toBeGreaterThan(0)
  })

  it('sends the cook to the kitchen and the stock keeper to the stock', () => {
    expect(homePathFor(permissionsOf('kitchen'))).toBe('/kitchen')
    expect(homePathFor(permissionsOf('stock'))).toBe('/inventory')
    expect(homePathFor(permissionsOf('owner'))).toBe('/')
    expect(homePathFor(permissionsOf('waiter'))).toBe('/')
  })

  it('never leaves someone with nowhere to go', () => {
    /* Even an account stripped of everything is given one screen, not a blank. */
    expect(homePathFor([])).toBe('/settings')
  })
})

describe('each account sees only what it needs', () => {
  it('shows the cook the kitchen and the menu, not the till or the figures', () => {
    const seen = visibleNav(permissionsOf('kitchen')).map((entry) => entry.to)
    expect(seen).toContain('/kitchen')
    expect(seen).toContain('/menu')
    expect(seen).not.toContain('/pos')
    expect(seen).not.toContain('/finance')
    expect(seen).not.toContain('/reports')
    expect(seen).not.toContain('/settings')
    expect(seen).not.toContain('/employees')
    /* An offer is a commercial decision and an invoice a commercial document:
       neither is the cook's business. */
    expect(seen).not.toContain('/offers')
    expect(seen).not.toContain('/invoices')
  })

  it('shows the waiter the floor, not the money', () => {
    const seen = visibleNav(permissionsOf('waiter')).map((entry) => entry.to)
    expect(seen).toContain('/tables')
    expect(seen).toContain('/pos')
    expect(seen).toContain('/reservations')
    expect(seen).not.toContain('/finance')
    expect(seen).not.toContain('/reports')
    expect(seen).not.toContain('/purchases')
    expect(seen).not.toContain('/settings')
  })

  it('shows the stock keeper the goods, not the till', () => {
    const seen = visibleNav(permissionsOf('stock')).map((entry) => entry.to)
    expect(seen).toContain('/inventory')
    expect(seen).toContain('/purchases')
    expect(seen).toContain('/recipes')
    expect(seen).not.toContain('/pos')
    expect(seen).not.toContain('/finance')
  })

  it('gives the owner everything', () => {
    expect(visibleNav(permissionsOf('owner')).length).toBe(NAV.length)
  })

  it('offers nothing it would then refuse', () => {
    /* Whatever the menu lists for a person, the guard must let through. */
    for (const role of ROLE_DEFINITIONS) {
      for (const entry of visibleNav(role.permissions)) {
        expect(allows(role.permissions, permissionFor(entry.to))).toBe(true)
      }
    }
  })
})

describe('the shell and the routes read the same list', () => {
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
  const layout = readFileSync('src/renderer/src/components/layout.tsx', 'utf8')

  it('guards every screen the menu can reach', () => {
    for (const entry of NAV) {
      expect(app, `${entry.to} must be guarded`).toContain(`permissionFor('${entry.to}')`)
    }
  })

  it('builds the menu from the list rather than its own copy', () => {
    expect(layout).toContain("from '../lib/navigation'")
    expect(layout).not.toMatch(/const service: NavItem\[\] = \[/)
  })

  it('comes back to the login screen when the session ends', () => {
    /* Without this the shell stayed mounted with nobody in it: every channel
       answered UNAUTHENTICATED and the menu emptied, so the person could not
       even log out again. */
    expect(app).toContain("if (phase === 'ready' && !user) setPhase('login')")
  })

  it('tells the router the address changed when it lands someone', () => {
    /* replaceState alone changes the bar but not the router's own location. */
    expect(app).toContain('window.history.replaceState')
    expect(app).toContain("new PopStateEvent('popstate')")
  })

  it('sends anything unknown to a screen the person can open', () => {
    expect(app).toContain('<HomeRedirect />')
    expect(app).not.toContain('<Navigate to="/" replace />')
  })
})
