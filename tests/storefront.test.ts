import { describe, expect, it } from 'vitest'
import { renderStorefront, THEMES, type StorefrontBundle, type StorefrontData } from '../src/main/services/storefront'

function lang(l: 'ar' | 'fr', open = true, branches = 1): StorefrontData {
  const cats = [
    {
      id: 1,
      name: 'Grillades',
      products: [
        { id: 1, name: 'Mixed grill', description: 'Tasty', priceCents: 160000, image: null, available: true },
        { id: 2, name: 'Kebab', description: null, priceCents: 90000, image: null, available: false }
      ]
    }
  ]
  return {
    restaurant: { name: 'Chez Afus', tagline: 'Order in a tap', logo: null, slug: 'chez-afus' },
    branches: Array.from({ length: branches }, (_, i) => ({
      id: i + 1,
      name: `Branch ${i + 1}`,
      address: 'Alger',
      phone: '+213554025284',
      whatsapp: '213554025284',
      hoursText: '11:00 → 23:00',
      openNow: open,
      deliveryNote: null,
      categories: cats
    })),
    closedMessage: l === 'ar' ? 'مغلق' : 'Fermé',
    currency: 'DZD',
    lang: l
  }
}
function bundle(overrides: Partial<StorefrontBundle> = {}, open = true, branches = 1): StorefrontBundle {
  return { data: { ar: lang('ar', open, branches), fr: lang('fr', open, branches) }, initialLang: 'fr', theme: 'ember', orderTypes: ['delivery', 'takeaway'], apiOrder: false, defaultBranchId: 1, ...overrides }
}

describe('storefront rendering', () => {
  it('embeds the bilingual data, name and prices', () => {
    const html = renderStorefront(bundle())
    expect(html).toContain('<title>Chez Afus</title>')
    expect(html).toContain('id="afus-data"')
    expect(html).toContain('Mixed grill')
    expect(html).toContain('"priceCents":160000')
  })

  it('applies the chosen theme on the root and exposes four themes', () => {
    expect(renderStorefront(bundle({ theme: 'noir' }))).toContain('data-mood="noir"')
    expect(renderStorefront(bundle({ theme: 'nar' }))).toContain(THEMES.nar.accent)
    expect(Object.keys(THEMES).sort()).toEqual(['ember', 'nar', 'noir', 'sable'])
  })

  it('carries the closed state and per-branch data for the page script', () => {
    const closed = renderStorefront(bundle({}, false))
    expect(closed).toContain('"openNow":false')
    const multi = renderStorefront(bundle({}, true, 3))
    expect(multi).toContain('"name":"Branch 3"')
  })

  it('escapes HTML in the title and never breaks out of the data script', () => {
    const b = bundle()
    b.data.fr.restaurant.name = '</script><script>alert(1)</script>'
    const html = renderStorefront(b)
    expect(html).not.toContain('</script><script>alert(1)')
    expect(html).toContain('\\u003c/script>')
  })
})
