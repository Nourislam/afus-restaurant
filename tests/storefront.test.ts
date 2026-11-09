import { describe, expect, it } from 'vitest'
import { renderStorefront, THEMES, type StorefrontData } from '../src/main/services/storefront'

function data(overrides: Partial<StorefrontData> = {}): StorefrontData {
  return {
    restaurant: { name: 'Chez Afus', phone: '+213', address: 'Alger', logo: null },
    categories: [
      {
        id: 1,
        name: 'Grillades',
        products: [
          { id: 1, name: 'Mixed grill', description: 'Tasty', priceCents: 160000, image: null, available: true },
          { id: 2, name: 'Kebab', description: null, priceCents: 90000, image: null, available: false }
        ]
      }
    ],
    isOpen: true,
    closedMessage: 'Fermé',
    theme: 'fastfood',
    lang: 'fr',
    currency: 'DZD',
    orderTypes: ['delivery', 'takeaway'],
    ...overrides
  }
}

describe('storefront rendering', () => {
  it('renders the menu with prices and an add button for available items', () => {
    const html = renderStorefront(data())
    expect(html).toContain('Chez Afus')
    expect(html).toContain('Mixed grill')
    expect(html).toContain('1,600 DZD')
    expect(html).toContain('class="add"')
  })

  it('marks unavailable items and offers no add button for them', () => {
    const html = renderStorefront(data())
    // one available item -> one add button
    expect((html.match(/class="add"/g) || []).length).toBe(1)
    expect(html).toContain('Indisponible')
  })

  it('shows the closed banner and disables all ordering when closed', () => {
    const html = renderStorefront(data({ isOpen: false }))
    expect(html).toContain('closedBanner')
    expect(html).toContain('Fermé')
    expect(html).toContain('status closed')
    expect(html).not.toContain('class="add"')
  })

  it('applies the chosen theme palette', () => {
    expect(renderStorefront(data({ theme: 'grill' }))).toContain(THEMES.grill.vars.accent)
    expect(renderStorefront(data({ theme: 'cafe' }))).toContain(THEMES.cafe.vars.accent)
  })

  it('escapes HTML in restaurant and product names', () => {
    const html = renderStorefront(data({ restaurant: { name: '<script>x</script>', phone: '', address: '', logo: null } }))
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('exposes all four restaurant themes', () => {
    expect(Object.keys(THEMES).sort()).toEqual(['cafe', 'classic', 'fastfood', 'grill'])
  })
})
