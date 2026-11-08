import {
  DELIVERY_STATUSES,
  EXPENSE_CATEGORIES,
  INVENTORY_MOVEMENT_TYPES,
  ORDER_ITEM_STATUSES,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_METHOD_LABELS,
  PRODUCT_TYPES,
  PURCHASE_STATUSES,
  RESERVATION_STATUSES,
  STATIONS,
  TABLE_STATUSES,
  UNITS,
  labelOf,
  toneOf,
  type Lang,
  type Localized,
  type LocalizedChoice,
  type Tone
} from '@shared/constants'
import { ROLE_LABELS } from '@shared/permissions'

function text(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback
  return value
}

function pick(list: readonly LocalizedChoice[], value: string | null | undefined, lang: Lang): string {
  const item = labelOf(list, value)
  return item.label[lang] ?? item.label.ar ?? text(value)
}

function tone(list: readonly LocalizedChoice[], value: string | null | undefined): Tone {
  return toneOf(list, value)
}

export const orderStatusLabel = (lang: Lang, value: string | null | undefined) => pick(ORDER_STATUSES, value, lang)
export const orderStatusTone = (value: string | null | undefined) => tone(ORDER_STATUSES, value)
export const orderTypeLabel = (lang: Lang, value: string | null | undefined) => pick(ORDER_TYPES, value, lang)
export const itemStatusLabel = (lang: Lang, value: string | null | undefined) => pick(ORDER_ITEM_STATUSES, value, lang)
export const itemStatusTone = (value: string | null | undefined) => tone(ORDER_ITEM_STATUSES, value)
export const tableStatusLabel = (lang: Lang, value: string | null | undefined) => pick(TABLE_STATUSES, value, lang)
export const tableStatusTone = (value: string | null | undefined) => tone(TABLE_STATUSES, value)
export const stationLabel = (lang: Lang, value: string | null | undefined) => pick(STATIONS, value, lang)
export const productTypeLabel = (lang: Lang, value: string | null | undefined) => pick(PRODUCT_TYPES, value, lang)
export const unitLabel = (lang: Lang, value: string | null | undefined) => pick(UNITS, value, lang)
export const purchaseStatusLabel = (lang: Lang, value: string | null | undefined) => pick(PURCHASE_STATUSES, value, lang)
export const purchaseStatusTone = (value: string | null | undefined) => tone(PURCHASE_STATUSES, value)
export const reservationStatusLabel = (lang: Lang, value: string | null | undefined) =>
  pick(RESERVATION_STATUSES, value, lang)
export const reservationStatusTone = (value: string | null | undefined) => tone(RESERVATION_STATUSES, value)
export const deliveryStatusLabel = (lang: Lang, value: string | null | undefined) => pick(DELIVERY_STATUSES, value, lang)
export const deliveryStatusTone = (value: string | null | undefined) => tone(DELIVERY_STATUSES, value)
export const movementTypeLabel = (lang: Lang, value: string | null | undefined) =>
  pick(INVENTORY_MOVEMENT_TYPES, value, lang)
export const movementTypeTone = (value: string | null | undefined) => tone(INVENTORY_MOVEMENT_TYPES, value)
export const expenseCategoryLabel = (lang: Lang, value: string | null | undefined) => pick(EXPENSE_CATEGORIES, value, lang)

export const paymentMethodLabel = (lang: Lang, value: string | null | undefined): string => {
  const entry: Localized | undefined = PAYMENT_METHOD_LABELS[value ?? '']
  return entry ? entry[lang] : text(value)
}

export const roleLabel = (lang: Lang, roleId: string): string => {
  const entry: Localized | undefined = ROLE_LABELS[roleId]
  return entry ? entry[lang] : roleId
}

const UNIT_SYMBOLS: Record<string, string> = { g: 'g', kg: 'kg', ml: 'ml', l: 'L', piece: 'pcs', custom: 'u' }
export const unitSymbol = (unit: string | null | undefined): string => UNIT_SYMBOLS[unit ?? ''] ?? ''
