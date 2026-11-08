export type Lang = 'ar' | 'fr'

export interface Localized {
  ar: string
  fr: string
}

export interface LocalizedChoice {
  value: string
  label: Localized
}

export interface LocalizedMap {
  [key: string]: Localized
}

export const LANGUAGES: { value: Lang; labelAr: string; labelFr: string }[] = [
  { value: 'ar', labelAr: 'العربية', labelFr: 'Arabe' },
  { value: 'fr', labelAr: 'الفرنسية', labelFr: 'Français' }
]

export const THEMES = ['light', 'dark'] as const

export const DOMAIN = 'afus-restaurant'

export type Theme = (typeof THEMES)[number]

export const STATIONS = [
  { value: 'grill', label: { ar: 'شواية', fr: 'Grillade' } },
  { value: 'pizza', label: { ar: 'بيتزا', fr: 'Pizza' } },
  { value: 'dessert', label: { ar: 'حلويات', fr: 'Dessert' } },
  { value: 'drinks', label: { ar: 'مشروبات', fr: 'Boissons' } },
  { value: 'starters', label: { ar: 'مقبلات', fr: 'Entrées' } },
  { value: 'meat', label: { ar: 'لحوم', fr: 'Viandes' } },
  { value: 'fish', label: { ar: 'سمك', fr: 'Poissons' } },
  { value: 'veg', label: { ar: 'خضروات', fr: 'Légumes' } },
  { value: 'sauces', label: { ar: 'صلصات', fr: 'Sauces' } },
  { value: 'side', label: { ar: 'أطباق جانبية', fr: 'Accompagnements' } }
] as const

export const PRODUCT_TYPES = [
  { value: 'entree', label: { ar: 'مقبل', fr: 'Entrée' } },
  { value: 'main', label: { ar: 'رئيسي', fr: 'Plat' } },
  { value: 'dessert', label: { ar: 'حلوى', fr: 'Dessert' } },
  { value: 'drink', label: { ar: 'شراب', fr: 'Boisson' } },
  { value: 'side', label: { ar: 'طبق جانبي', fr: 'Accompagnement' } },
  { value: 'combo', label: { ar: 'وجبة مركبة', fr: 'Formule' } }
] as const

export const UNITS = [
  { value: 'g', label: { ar: 'غرام', fr: 'Gramme' } },
  { value: 'kg', label: { ar: 'كيلوجرام', fr: 'Kilogramme' } },
  { value: 'ml', label: { ar: 'ملليلتر', fr: 'Millilitre' } },
  { value: 'l', label: { ar: 'لتر', fr: 'Litre' } },
  { value: 'piece', label: { ar: 'قطعة', fr: 'Pièce' } },
  { value: 'unit', label: { ar: 'وحدة', fr: 'Unité' } }
] as const

export const ORDER_TYPES = [
  { value: 'dineIn', label: { ar: 'داخل المطعم', fr: 'Sur place' } },
  { value: 'delivery', label: { ar: 'توصيل', fr: 'Livraison' } },
  { value: 'takeaway', label: { ar: 'استلام', fr: 'À emporter' } },
  { value: 'preorder', label: { ar: 'طلب مسبق', fr: 'Précommande' } }
] as const

export const ORDER_STATUSES = [
  { value: 'new', label: { ar: 'جديد', fr: 'Nouveau' } },
  { value: 'preparing', label: { ar: 'قيد التحضير', fr: 'En préparation' } },
  { value: 'ready', label: { ar: 'جاهز', fr: 'Prêt' } },
  { value: 'sent', label: { ar: 'تم الإرسال', fr: 'Envoyé' } },
  { value: 'inProgress', label: { ar: 'قيد التنفيذ', fr: 'En cours' } },
  { value: 'completed', label: { ar: 'مكتمل', fr: 'Complété' } },
  { value: 'cancelled', label: { ar: 'ملغي', fr: 'Annulé' } },
  { value: 'held', label: { ar: 'معلق', fr: 'En attente' } }
] as const

export const ORDER_ITEM_STATUSES = [
  { value: 'active', label: { ar: 'نشط', fr: 'Actif' } },
  { value: 'served', label: { ar: 'مقدّم', fr: 'Servi' } },
  { value: 'ready', label: { ar: 'جاهز', fr: 'Prêt' } },
  { value: 'preparing', label: { ar: 'قيد التحضير', fr: 'En préparation' } },
  { value: 'removed', label: { ar: 'محذوف', fr: 'Supprimé' } }
] as const

export const TABLE_STATUSES = [
  { value: 'free', label: { ar: 'فارغة', fr: 'Libre' } },
  { value: 'occupied', label: { ar: 'مشغولة', fr: 'Occupée' } },
  { value: 'reserved', label: { ar: 'محجوزة', fr: 'Réservée' } },
  { value: 'cleaning', label: { ar: 'قيد التنظيف', fr: 'À nettoyer' } }
] as const

export const PURCHASE_STATUSES = [
  { value: 'draft', label: { ar: 'مسودة', fr: 'Brouillon' } },
  { value: 'received', label: { ar: 'مستلمة', fr: 'Reçue' } },
  { value: 'paid', label: { ar: 'مسددة', fr: 'Payée' } },
  { value: 'cancelled', label: { ar: 'ملغاة', fr: 'Annulée' } }
] as const

export const DELIVERY_STATUSES = [
  { value: 'pending', label: { ar: 'معلقة', fr: 'En attente' } },
  { value: 'assigned', label: { ar: 'مخصصة', fr: 'Affectée' } },
  { value: 'delivered', label: { ar: 'مقدّمة', fr: 'Livrée' } },
  { value: 'cancelled', label: { ar: 'ملغاة', fr: 'Annulée' } }
] as const

export const RESERVATION_STATUSES = [
  { value: 'pending', label: { ar: 'قيد الانتظار', fr: 'En attente' } },
  { value: 'confirmed', label: { ar: 'مؤكدة', fr: 'Confirmée' } },
  { value: 'arrived', label: { ar: 'حضرت', fr: 'Arrivée' } },
  { value: 'noShow', label: { ar: 'لم يحضر', fr: 'Absence' } },
  { value: 'cancelled', label: { ar: 'ملغاة', fr: 'Annulée' } }
] as const

export const INVENTORY_MOVEMENT_TYPES = [
  { value: 'stockIn', label: { ar: 'استلام', fr: 'Réception' } },
  { value: 'usage', label: { ar: 'استهلاك', fr: 'Consommation' } },
  { value: 'adjustment', label: { ar: 'تعديل', fr: 'Ajustement' } },
  { value: 'waste', label: { ar: 'هدر', fr: 'Perte' } },
  { value: 'return', label: { ar: 'استرجاع', fr: 'Retour' } },
  { value: 'transfer', label: { ar: 'نقل', fr: 'Transfert' } }
] as const

export const EXPENSE_CATEGORIES = [
  { value: 'ingredients', label: { ar: 'مكونات', fr: 'Ingrédients' } },
  { value: 'supplies', label: { ar: 'مواد تزويد', fr: 'Fournitures' } },
  { value: 'utilities', label: { ar: 'مرافق', fr: 'Services' } },
  { value: 'maintenance', label: { ar: 'صيانة', fr: 'Entretien' } },
  { value: 'equipment', label: { ar: 'أدوات', fr: 'Équipement' } },
  { value: 'marketing', label: { ar: 'تسويق', fr: 'Marketing' } },
  { value: 'tax', label: { ar: 'ضريبة', fr: 'Taxes' } },
  { value: 'rent', label: { ar: 'إيجار', fr: 'Loyer' } },
  { value: 'wages', label: { ar: 'أجور', fr: 'Salaires' } },
  { value: 'other', label: { ar: 'أخرى', fr: 'Autre' } }
] as const

export const PAYMENT_METHOD_LABELS: Record<string, Localized> = {
  cash: { ar: 'نقداً', fr: 'Espèces' },
  card: { ar: 'بطاقة', fr: 'Carte' },
  transfer: { ar: 'تحويل', fr: 'Virement' },
  wallet: { ar: 'محفظة', fr: 'Portefeuille' },
  giftCard: { ar: 'بطاقة هدية', fr: 'Carte cadeau' }
}

/* Closed unions derived from the label lists, so status filters and cells are typed. */
export type Unit = (typeof UNITS)[number]['value']
export type Station = (typeof STATIONS)[number]['value']
export type ProductType = (typeof PRODUCT_TYPES)[number]['value']
export type OrderType = (typeof ORDER_TYPES)[number]['value']
export type OrderStatus = (typeof ORDER_STATUSES)[number]['value']
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number]['value']
export type TableStatus = (typeof TABLE_STATUSES)[number]['value']
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number]['value']
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]['value']
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]['value']
export type MovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number]['value']
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['value']

export type Tone = 'positive' | 'warning' | 'info' | 'danger'

const TONE_BY_VALUE: Record<string, Tone> = {
  completed: 'positive',
  ready: 'positive',
  paid: 'positive',
  delivered: 'positive',
  confirmed: 'positive',
  received: 'positive',
  active: 'positive',
  free: 'positive',
  available: 'positive',
  new: 'info',
  preparing: 'info',
  inProgress: 'info',
  sent: 'info',
  draft: 'info',
  pending: 'info',
  arrived: 'info',
  reserved: 'info',
  occupied: 'info',
  cleaning: 'warning',
  low: 'warning',
  late: 'warning',
  noShow: 'warning',
  cancelled: 'danger',
  removed: 'danger',
  failed: 'danger',
  error: 'danger'
}

export function labelOf<T extends readonly LocalizedChoice[]>(
  list: T,
  value: string | null | undefined
): T[number] {
  const fallback = list[0] as T[number]
  if (!value) return fallback
  return (list.find((item) => item.value === value) ?? fallback) as T[number]
}

export function toneOf(_list: readonly LocalizedChoice[], value: string | null | undefined): Tone {
  if (!value) return 'info'
  return TONE_BY_VALUE[value] ?? 'info'
}
