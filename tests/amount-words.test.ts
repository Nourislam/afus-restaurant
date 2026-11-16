import { describe, expect, it } from 'vitest'
import { amountToWords } from '../src/shared/amountWords'

/* An invoice whose words disagree with its figures is worse than no invoice. */
const fr = (cents: number) => amountToWords(cents, 'fr')
const ar = (cents: number) => amountToWords(cents, 'ar')

describe('the total written out in French', () => {
  it('handles the cases French numbering is awkward about', () => {
    expect(fr(0)).toBe('zéro dinars algériens')
    expect(fr(100)).toBe('un dinar algérien')
    expect(fr(200)).toBe('deux dinars algériens')
    expect(fr(1_100)).toBe('onze dinars algériens')
    expect(fr(7_000)).toBe('soixante-dix dinars algériens')
    expect(fr(7_100)).toBe('soixante et onze dinars algériens')
    expect(fr(8_000)).toBe('quatre-vingts dinars algériens')
    expect(fr(8_100)).toBe('quatre-vingt-un dinars algériens')
    expect(fr(9_000)).toBe('quatre-vingt-dix dinars algériens')
    expect(fr(9_700)).toBe('quatre-vingt-dix-sept dinars algériens')
  })

  it('pluralises cent and keeps mille invariable', () => {
    expect(fr(10_000)).toBe('cent dinars algériens')
    expect(fr(20_000)).toBe('deux cents dinars algériens')
    expect(fr(20_100)).toBe('deux cent un dinars algériens')
    expect(fr(100_000)).toBe('mille dinars algériens')
    expect(fr(200_000)).toBe('deux mille dinars algériens')
    expect(fr(123_456)).toBe('mille deux cent trente-quatre dinars algériens et cinquante-six centimes')
  })

  it('says the centimes', () => {
    expect(fr(150)).toBe('un dinar algérien et cinquante centimes')
    expect(fr(101)).toBe('un dinar algérien et un centime')
  })
})

describe('the total written out in Arabic', () => {
  it('uses the dual and the plural the way a reader expects', () => {
    expect(ar(0)).toBe('صفر دينار جزائري')
    expect(ar(100)).toBe('دينار جزائري')
    expect(ar(200)).toBe('ديناران جزائريان')
    expect(ar(300)).toBe('ثلاثة دنانير جزائرية')
    expect(ar(1_000)).toBe('عشرة دنانير جزائرية')
    expect(ar(1_100)).toBe('أحد عشر دينارًا جزائريًا')
    expect(ar(2_100)).toBe('واحد وعشرون دينارًا جزائريًا')
  })

  it('makes the noun singular after an exact hundred or thousand', () => {
    /* مئة دينار, not مئة دينارًا — the tamyiz follows the last two digits. */
    expect(ar(10_000)).toBe('مئة دينار جزائري')
    expect(ar(100_000)).toBe('ألف دينار جزائري')
    expect(ar(500_000)).toBe('خمسة آلاف دينار جزائري')
    expect(ar(100_000_000)).toBe('مليون دينار جزائري')
  })

  it('drops the nun of a dual that counts something', () => {
    /* مئتا دينار, not مئتان دينار. */
    expect(ar(20_000)).toBe('مئتا دينار جزائري')
    expect(ar(200_000)).toBe('ألفا دينار جزائري')
  })

  it('still counts correctly when the hundreds carry a remainder', () => {
    expect(ar(10_500)).toBe('مئة وخمسة دنانير جزائرية')
    expect(ar(12_500)).toBe('مئة وخمسة وعشرون دينارًا جزائريًا')
  })

  it('adds the centimes with و', () => {
    expect(ar(150)).toBe('دينار جزائري وخمسون سنتيمًا')
    expect(ar(102)).toBe('دينار جزائري وسنتيمان')
  })
})

describe('other currencies', () => {
  it('names the unit it was given', () => {
    expect(amountToWords(200, 'fr', 'EUR')).toBe('deux euros')
    expect(amountToWords(100, 'ar', 'EUR')).toBe('يورو')
    expect(amountToWords(500, 'fr', 'XYZ')).toBe('cinq XYZ')
  })
})
