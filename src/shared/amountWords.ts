/**
 * The total written out in words — a legal requirement on an Algerian invoice.
 *
 * Arabic follows the forms a reader expects: the dual (ألفان, مئتان), the
 * plural for three to ten (ثلاثة آلاف), and the tens joined with و.
 * French follows the conventions used in Algeria: soixante-dix, quatre-vingts,
 * quatre-vingt-dix, and `vingt`/`cent` pluralised only when they end the number.
 */

const AR_ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة']
const AR_TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']
const AR_TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
const AR_HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة']

/** Arabic counts its scales by one, two, a few (3–10), or many. */
function arScale(count: number, one: string, two: string, few: string, many: string): string {
  if (count === 1) return one
  if (count === 2) return two
  if (count >= 3 && count <= 10) return `${arBelowThousand(count)} ${few}`
  return `${arBelowThousand(count)} ${many}`
}

function arBelowThousand(n: number): string {
  if (n === 0) return ''
  const parts: string[] = []
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  if (hundreds > 0) parts.push(AR_HUNDREDS[hundreds]!)
  if (rest > 0) {
    if (rest < 10) parts.push(AR_ONES[rest]!)
    else if (rest < 20) parts.push(AR_TEENS[rest - 10]!)
    else {
      const unit = rest % 10
      const ten = AR_TENS[Math.floor(rest / 10)]!
      parts.push(unit > 0 ? `${AR_ONES[unit]} و${ten}` : ten)
    }
  }
  return parts.join(' و')
}

function arabicWords(whole: number): string {
  if (whole === 0) return 'صفر'
  const parts: string[] = []
  const millions = Math.floor(whole / 1_000_000)
  const thousands = Math.floor((whole % 1_000_000) / 1000)
  const rest = whole % 1000
  if (millions > 0) parts.push(arScale(millions, 'مليون', 'مليونان', 'ملايين', 'مليون'))
  if (thousands > 0) parts.push(arScale(thousands, 'ألف', 'ألفان', 'آلاف', 'ألف'))
  if (rest > 0) parts.push(arBelowThousand(rest))
  return parts.join(' و')
}

/**
 * Arabic names the counted thing by the **last two digits**, not by the whole
 * number: ثلاثة دنانير (3–10, plural), أحد عشر دينارًا (11–99, accusative
 * singular), and مئة دينار (an exact hundred or thousand, singular). A dual that
 * governs a noun also drops its nun: مئتان → مئتا دينار.
 */
function arCounted(n: number, forms: readonly [string, string, string, string] | readonly string[]): string {
  const [one, two, few, many] = forms as readonly [string, string, string, string]
  if (n === 0) return `صفر ${one}`
  if (n === 1) return one
  if (n === 2) return two
  const lastTwo = n % 100
  const noun = lastTwo === 0 ? one : lastTwo === 1 ? many : lastTwo === 2 ? many : lastTwo <= 10 ? few : many
  return `${dropDualNun(arabicWords(n))} ${noun}`
}

/** A dual before the thing it counts loses its nun: مئتان دينار → مئتا دينار. */
function dropDualNun(words: string): string {
  return words.replace(/(مئتان|ألفان|مليونان|ملياران)$/u, (match) => match.slice(0, -1))
}

const FR_ONES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
const FR_TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']

function frBelowHundred(n: number): string {
  if (n < 20) return FR_ONES[n]!
  const ten = Math.floor(n / 10)
  const unit = n % 10
  /* 70 and 90 count on from 60 and 80: soixante-dix, quatre-vingt-dix. */
  if (ten === 7 || ten === 9) {
    const base = FR_TENS[ten]!
    const teen = FR_ONES[10 + unit]!
    return ten === 7 && unit === 1 ? 'soixante et onze' : `${base}-${teen}`
  }
  if (unit === 0) return ten === 8 ? 'quatre-vingts' : FR_TENS[ten]!
  if (unit === 1 && ten !== 8) return `${FR_TENS[ten]} et un`
  return `${FR_TENS[ten]}-${FR_ONES[unit]}`
}

function frBelowThousand(n: number): string {
  if (n < 100) return frBelowHundred(n)
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  /* `cent` takes an s only when it is plural and nothing follows it. */
  const head = hundreds === 1 ? 'cent' : rest === 0 ? `${FR_ONES[hundreds]} cents` : `${FR_ONES[hundreds]} cent`
  return rest === 0 ? head : `${head} ${frBelowHundred(rest)}`
}

function frenchWords(whole: number): string {
  if (whole === 0) return 'zéro'
  const parts: string[] = []
  const millions = Math.floor(whole / 1_000_000)
  const thousands = Math.floor((whole % 1_000_000) / 1000)
  const rest = whole % 1000
  if (millions > 0) parts.push(millions === 1 ? 'un million' : `${frBelowThousand(millions)} millions`)
  if (thousands > 0) parts.push(thousands === 1 ? 'mille' : `${frBelowThousand(thousands)} mille`)
  if (rest > 0) parts.push(frBelowThousand(rest))
  return parts.join(' ')
}

/**
 * `amountToWords(123456, 'fr', 'DZD')` → "mille deux cent trente-quatre dinars
 * algériens et cinquante-six centimes".
 */
export function amountToWords(cents: number, language: 'ar' | 'fr', currency = 'DZD'): string {
  const safe = Math.max(0, Math.round(cents))
  const whole = Math.floor(safe / 100)
  const fraction = safe % 100

  const names: Record<string, { ar: [string, string, string, string]; fr: [string, string] }> = {
    DZD: { ar: ['دينار جزائري', 'ديناران جزائريان', 'دنانير جزائرية', 'دينارًا جزائريًا'], fr: ['dinar algérien', 'dinars algériens'] },
    EUR: { ar: ['يورو', 'يوروان', 'يوروات', 'يورو'], fr: ['euro', 'euros'] },
    USD: { ar: ['دولار', 'دولاران', 'دولارات', 'دولارًا'], fr: ['dollar', 'dollars'] },
    MAD: { ar: ['درهم', 'درهمان', 'دراهم', 'درهمًا'], fr: ['dirham', 'dirhams'] },
    TND: { ar: ['دينار تونسي', 'ديناران تونسيان', 'دنانير تونسية', 'دينارًا تونسيًا'], fr: ['dinar tunisien', 'dinars tunisiens'] }
  }
  const unit = names[currency] ?? { ar: [currency, currency, currency, currency], fr: [currency, currency] }

  if (language === 'ar') {
    const head = arCounted(whole, unit.ar)
    if (fraction === 0) return head
    return `${head} و${arCounted(fraction, ['سنتيم', 'سنتيمان', 'سنتيمات', 'سنتيمًا'])}`
  }

  const head = `${frenchWords(whole)} ${whole === 1 ? unit.fr[0] : unit.fr[1]}`
  if (fraction === 0) return head
  return `${head} et ${frenchWords(fraction)} ${fraction === 1 ? 'centime' : 'centimes'}`
}
