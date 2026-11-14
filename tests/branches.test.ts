import { beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, dbGet, openDatabase } from '../src/main/db/client'
import { seedCoreData } from '../src/main/db/seed'
import { completeSetup } from '../src/main/services/setup'
import { clearSession } from '../src/main/security/session'
import {
  ensureDefaultBranch,
  isOpenNow,
  listBranches,
  listOverrides,
  saveBranch,
  setBranchActive,
  setBranchOpen,
  setOverride
} from '../src/main/services/branches'
import { hoursText, publicData, whatsappDigits } from '../src/main/services/website'

function seed() {
  completeSetup({ restaurantName: 'Djemr', currency: 'DZD', language: 'ar', taxEnabled: false, taxRateBp: 0, ownerFullName: 'Owner', ownerPin: '1234', phone: '0554025284', address: 'Alger' })
}

beforeEach(async () => {
  closeDatabase()
  clearSession()
  await openDatabase(null)
  seedCoreData()
})

describe('branches', () => {
  it('setup seeds exactly one main branch from the restaurant details', () => {
    seed()
    const branches = listBranches()
    expect(branches).toHaveLength(1)
    expect(branches[0]).toMatchObject({ nameAr: 'الفرع الرئيسي', address: 'Alger', phone: '0554025284', isOpen: true })
    ensureDefaultBranch({ nameAr: 'x', nameFr: 'x' })
    expect(listBranches()).toHaveLength(1)
  })

  it('creates and edits a branch with hours', () => {
    seed()
    const b = saveBranch({ nameAr: 'فرع وهران', nameFr: 'Oran', hours: { '5': null, '1': { open: '10:00', close: '22:00' } } })
    expect(b.hours['5']).toBeNull()
    expect(b.hours['1']).toEqual({ open: '10:00', close: '22:00' })
    const edited = saveBranch({ id: b.id, nameAr: 'وهران', nameFr: 'Oran', phone: '0661000000' })
    expect(edited.nameAr).toBe('وهران')
    expect(listBranches()).toHaveLength(2)
  })

  it('manual switch closes a branch; the last active branch cannot be deactivated', () => {
    seed()
    const [main] = listBranches()
    expect(setBranchOpen(main!.id, false).openNow).toBe(false)
    expect(() => setBranchActive(main!.id, false)).toThrowError(expect.objectContaining({ code: 'CONFLICT' }))
  })

  it('sets and clears per-branch overrides, applied in the public menu', () => {
    seed()
    const [main] = listBranches()
    const product = dbGet<{ id: number; priceCents: number }>('SELECT id, priceCents FROM products ORDER BY id LIMIT 1')!
    setOverride({ branchId: main!.id, productId: product.id, priceCents: product.priceCents + 500 })
    expect(listOverrides(main!.id)).toHaveLength(1)
    const menu = publicData('ar').branches[0]!.categories.flatMap((c) => c.products)
    expect(menu.find((p) => p.id === product.id)?.priceCents).toBe(product.priceCents + 500)
    setOverride({ branchId: main!.id, productId: product.id, isAvailable: false })
    expect(publicData('ar').branches[0]!.categories.flatMap((c) => c.products).find((p) => p.id === product.id)?.available).toBe(false)
    expect(setOverride({ branchId: main!.id, productId: product.id, priceCents: null, isAvailable: null })).toBeNull()
    expect(listOverrides(main!.id)).toHaveLength(0)
  })
})

describe('isOpenNow', () => {
  const monday10 = new Date(2026, 10, 9, 10, 0) // Mon 9 Nov 2026 10:00
  it('is open with no schedule when the switch is on, closed when off', () => {
    expect(isOpenNow({}, true, monday10)).toBe(true)
    expect(isOpenNow({}, false, monday10)).toBe(false)
  })
  it('respects a day explicitly closed and a time range', () => {
    expect(isOpenNow({ '1': null }, true, monday10)).toBe(false)
    expect(isOpenNow({ '1': { open: '11:00', close: '23:00' } }, true, monday10)).toBe(false)
    expect(isOpenNow({ '1': { open: '09:00', close: '23:00' } }, true, monday10)).toBe(true)
  })
  it('handles overnight ranges', () => {
    const monday01 = new Date(2026, 10, 9, 1, 0)
    expect(isOpenNow({ '1': { open: '18:00', close: '02:00' } }, true, monday01)).toBe(true)
    expect(isOpenNow({ '1': { open: '18:00', close: '02:00' } }, true, monday10)).toBe(false)
  })
})

describe('website helpers', () => {
  it('formats uniform hours and WhatsApp digits', () => {
    expect(hoursText({ '0': { open: '11:00', close: '23:00' }, '1': { open: '11:00', close: '23:00' } }, 'ar')).toBe('كل يوم · 11:00 → 23:00')
    expect(hoursText({}, 'fr')).toBeNull()
    expect(whatsappDigits('0554 02 52 84')).toBe('213554025284')
    expect(whatsappDigits('+213 554 02 52 84')).toBe('213554025284')
    expect(whatsappDigits(null)).toBeNull()
  })
})
