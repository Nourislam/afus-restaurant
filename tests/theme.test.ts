import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

/**
 * The menu used to be painted dark whatever the theme, so switching to the
 * light mode changed every screen except the one the owner looks at most.
 * These guards keep both themes real.
 */
describe('the menu follows the theme', () => {
  const css = read('src/renderer/src/index.css')

  it('gives every menu entry a light colour and a dark one', () => {
    const entry = css.slice(css.indexOf('.sidebar-item {'), css.indexOf('.sidebar-item.active svg'))
    for (const token of ['text-ink-600', 'hover:bg-ink-100', 'dark:text-white/60', 'dark:hover:bg-white/[0.07]']) {
      expect(entry).toContain(token)
    }
    const active = css.slice(css.indexOf('.sidebar-item.active {'))
    expect(active).toContain('bg-brand-50')
    expect(active).toContain('dark:bg-brand-600/15')
  })

  it('leaves no dark-only surface in the menu component', () => {
    const source = read('src/renderer/src/components/Sidebar.tsx')
    /* Read one class list at a time: a white foreground is fine when that same
       element also paints itself dark (the tooltip), and wrong otherwise. */
    const offenders: string[] = []
    for (const match of source.matchAll(/className=(?:"([^"]*)"|\{[^}]*?'([^']*)'[^}]*?\})/g)) {
      const list = match[1] ?? match[2] ?? ''
      const paintsItselfDark = /\bbg-(ink-(8|9)\d0|ink-950)\b/.test(list)
      const bare = list.match(/(^|\s)(bg-ink-950|border-white\/\S+|ring-white\/\S+|text-white\/\S+|text-white)(?=\s|$)/g) ?? []
      for (const token of bare) {
        if (paintsItselfDark) continue
        offenders.push(token.trim())
      }
    }
    expect(offenders, `dark-only classes with no light counterpart: ${offenders.join(', ')}`).toEqual([])
  })
})

describe('the theme is applied to the document, not to one screen', () => {
  const store = read('src/renderer/src/store/app.ts')

  it('stamps the document as soon as the store loads', () => {
    /* The login and setup screens live outside the shell; before this they
       stayed light whatever the owner had chosen. */
    expect(store).toContain('applyTheme(storedTheme())')
    expect(store).toContain("classList.toggle('dark'")
    expect(store).toContain('colorScheme')
  })

  it('re-stamps it whenever the theme changes', () => {
    const setter = store.slice(store.indexOf('setTheme: (theme) => {'), store.indexOf('setBooting: (booting)'))
    expect(setter).toContain('applyTheme(theme)')
  })
})
