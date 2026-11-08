import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ChefHat,
  CreditCard,
  Merge,
  MoveRight,
  Pause,
  Percent,
  Play,
  Printer,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  X
} from 'lucide-react'
import { ORDER_TYPES, type OrderType } from '@shared/constants'
import type { Modifier, Order, Product, ProductVariant } from '@shared/types'
import { api } from '../lib/api'
import { useApi, useAppEvent } from '../lib/hooks'
import { errorText, useT } from '../i18n'
import { centsToInput, formatMoney, toCents } from '../lib/format'
import { orderStatusLabel, orderStatusTone, orderTypeLabel, paymentMethodLabel } from '../lib/labels'
import { useAppStore } from '../store/app'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Money,
  PageHeader,
  Select,
  Spinner,
  Textarea
} from '../components/ui'
import { kitchenTicketHtml, receiptHtml } from '../lib/receipts'

interface DraftLine {
  key: string
  product: Product
  variant: ProductVariant | null
  modifiers: Modifier[]
  qty: number
  note: string
  unitPriceCents: number
}

export default function PosPage() {
  const { t, language } = useT()
  const settings = useAppStore((state) => state.settings)
  const can = useAppStore((state) => state.can)
  const [params, setParams] = useSearchParams()

  const [order, setOrder] = useState<Order | null>(null)
  const [draft, setDraft] = useState<DraftLine[]>([])
  const [type, setType] = useState<OrderType>('dineIn')
  const [tableId, setTableId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [note, setNote] = useState('')
  const [schedule, setSchedule] = useState('')
  const [delivery, setDelivery] = useState({ customerName: '', phone: '', address: '', area: '', fee: '0', courier: '' })
  const [category, setCategory] = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')
  const [itemTarget, setItemTarget] = useState<Product | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [discountOpen, setDiscountOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [heldOpen, setHeldOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [noteTarget, setNoteTarget] = useState<{ itemId: number; note: string } | null>(null)
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const initialized = useRef(false)

  const categories = useApi(() => api.categories.list(false), [])
  const products = useApi(() => api.products.list({ includeArchived: false }), [])
  const tableMap = useApi(() => api.tables.map(), [])
  const customerList = useApi(() => api.customers.list({}), [])
  const held = useApi(() => api.orders.list({ held: true, limit: 50 }), [])
  const openOrders = useApi(() => api.orders.list({ limit: 100 }), [])

  const flash = (text: string, tone: 'ok' | 'error' = 'ok') => {
    setNotice({ text, tone })
    window.setTimeout(() => setNotice(null), 3800)
  }

  useAppEvent((event) => {
    if (event.type.startsWith('order')) {
      void held.reload()
      void openOrders.reload()
    }
  })

  const tables = tableMap.data?.tables ?? []
  const customers = customerList.data ?? []
  const activeProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (products.data ?? []).filter((product) => {
      if (category !== 'all' && product.categoryId !== category) return false
      if (!term) return true
      return (
        product.nameAr.toLowerCase().includes(term) ||
        product.nameFr.toLowerCase().includes(term) ||
        (product.code ?? '').toLowerCase().includes(term)
      )
    })
  }, [products.data, category, search])

  const loadOrder = async (id: number) => {
    setBusy('load')
    try {
      const loaded = await api.orders.get(id)
      setOrder(loaded)
      setType(loaded.type as OrderType)
      setTableId(loaded.tableId ? String(loaded.tableId) : '')
      setCustomerId(loaded.customerId ? String(loaded.customerId) : '')
      setNote(loaded.note ?? '')
      setDraft([])
      setParams({ order: String(id) }, { replace: true })
    } catch (caught) {
      flash(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'), 'error')
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (initialized.current || !tableMap.data) return
    initialized.current = true
    const orderId = params.get('order')
    const tableParam = params.get('table')
    if (orderId) {
      void loadOrder(Number(orderId))
      return
    }
    if (tableParam) {
      const table = tableMap.data.tables.find((item) => item.id === Number(tableParam))
      if (table?.openOrderId) void loadOrder(table.openOrderId)
      else if (table) setTableId(String(table.id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableMap.data])

  const resetAll = () => {
    setOrder(null)
    setDraft([])
    setType('dineIn')
    setTableId('')
    setCustomerId('')
    setNote('')
    setSchedule('')
    setDelivery({ customerName: '', phone: '', address: '', area: '', fee: '0', courier: '' })
    setParams({}, { replace: true })
    void tableMap.reload()
  }

  const draftSubtotal = draft.reduce((sum, line) => sum + line.unitPriceCents * line.qty, 0)
  const draftDeliveryFee = type === 'delivery' ? (toCents(delivery.fee) ?? 0) : 0

  const addLine = (product: Product, variant: ProductVariant | null, modifiers: Modifier[], qty: number, itemNote: string) => {
    const unitPriceCents =
      product.priceCents + (variant?.priceDeltaCents ?? 0) + modifiers.reduce((sum, modifier) => sum + modifier.priceCents, 0)
    const key = `${product.id}-${variant?.id ?? 0}-${modifiers.map((modifier) => modifier.id).sort().join('.')}-${Date.now()}-${Math.random()}`
    setDraft((current) => [...current, { key, product, variant, modifiers, qty, note: itemNote, unitPriceCents }])
    flash(t('pos.itemAdded'))
  }

  const addToOrder = async (product: Product, variant: ProductVariant | null, modifiers: Modifier[], qty: number, itemNote: string) => {
    if (order) {
      setBusy('add')
      try {
        const updated = await api.orders.addItem(order.id, {
          productId: product.id,
          qty,
          variantId: variant?.id ?? null,
          modifierIds: modifiers.map((modifier) => modifier.id),
          note: itemNote || null
        })
        setOrder(updated)
        flash(t('pos.itemAdded'))
      } catch (caught) {
        flash(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'), 'error')
      } finally {
        setBusy(null)
      }
      return
    }
    addLine(product, variant, modifiers, qty, itemNote)
  }

  const updateDraftQty = (key: string, delta: number) => {
    setDraft((current) =>
      current
        .map((line) => (line.key === key ? { ...line, qty: line.qty + delta } : line))
        .filter((line) => line.qty > 0)
    )
  }

  const updateOrderItemQty = async (itemId: number, qty: number) => {
    if (!order) return
    if (qty <= 0) {
      await removeOrderItem(itemId)
      return
    }
    setBusy('item')
    try {
      setOrder(await api.orders.updateItem(itemId, { qty }))
    } catch (caught) {
      flash(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const removeOrderItem = async (itemId: number) => {
    if (!order) return
    setBusy('item')
    try {
      setOrder(await api.orders.removeItem(itemId))
    } catch (caught) {
      flash(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const ensureOrder = async (): Promise<Order | null> => {
    if (order) return order
    if (type === 'dineIn' && !tableId) {
      flash(errorText(language, 'TABLE_REQUIRED'), 'error')
      return null
    }
    if (type === 'delivery' && (!delivery.customerName.trim() || !delivery.phone.trim() || !delivery.address.trim())) {
      flash(errorText(language, 'DELIVERY_DETAILS_REQUIRED'), 'error')
      return null
    }
    if (type === 'preorder' && !schedule) {
      flash(errorText(language, 'PREORDER_TIME_REQUIRED'), 'error')
      return null
    }
    if (draft.length === 0) {
      flash(t('pos.selectItemsFirst'), 'error')
      return null
    }
    setBusy('create')
    try {
      const created = await api.orders.create({
        type,
        tableId: type === 'dineIn' ? Number(tableId) : null,
        customerId: customerId ? Number(customerId) : null,
        note: note.trim() || null,
        scheduledFor: type === 'preorder' ? schedule.replace('T', ' ') : null,
        delivery:
          type === 'delivery'
            ? {
                customerName: delivery.customerName.trim(),
                phone: delivery.phone.trim(),
                address: delivery.address.trim(),
                area: delivery.area.trim() || null,
                feeCents: toCents(delivery.fee) ?? 0,
                courier: delivery.courier.trim() || null
              }
            : undefined,
        items: draft.map((line) => ({
          productId: line.product.id,
          qty: line.qty,
          variantId: line.variant?.id ?? null,
          modifierIds: line.modifiers.map((modifier) => modifier.id),
          note: line.note || null
        }))
      })
      setOrder(created)
      setDraft([])
      setParams({ order: String(created.id) }, { replace: true })
      void tableMap.reload()
      return created
    } catch (caught) {
      flash(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'), 'error')
      return null
    } finally {
      setBusy(null)
    }
  }

  const print = async (html: string, silent = false) => {
    if (!settings) return
    try {
      const result = await api.print.html(html, settings.printerName || undefined, silent)
      if (!result.success) flash(result.reason ?? t('common.error'), 'error')
    } catch (caught) {
      flash(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'), 'error')
    }
  }

  const sendKitchen = async () => {
    const target = await ensureOrder()
    if (!target || !settings) return
    setBusy('send')
    try {
      const updated = await api.orders.sendToKitchen(target.id)
      setOrder(updated)
      flash(t('pos.orderCreated'))
      await print(kitchenTicketHtml(updated, settings, language), false)
      void tableMap.reload()
    } catch (caught) {
      flash(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const holdCurrent = async () => {
    const target = await ensureOrder()
    if (!target) return
    setBusy('hold')
    try {
      await api.orders.hold(target.id)
      flash(t('pos.hold'))
      resetAll()
      void held.reload()
    } catch (caught) {
      flash(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const resumeOrder = async (id: number) => {
    setHeldOpen(false)
    try {
      await api.orders.resume(id)
      await loadOrder(id)
      flash(t('pos.resume'))
    } catch (caught) {
      flash(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'), 'error')
    }
  }

  const printReceipt = async () => {
    if (!order || !settings) return
    await print(receiptHtml(order, settings, language, settings.paperWidth), false)
  }

  const printKitchen = async () => {
    if (!order || !settings) return
    await print(kitchenTicketHtml(order, settings, language), false)
  }

  const hasItems = order ? order.items.length > 0 : draft.length > 0
  const closed = order ? order.status === 'completed' || order.status === 'cancelled' : false
  const canPay = can('orders.close')
  const typeLocked = Boolean(order)
  const currency = settings?.currency ?? 'DZD'

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t('pos.title')}
        subtitle={t('pos.subtitle')}
        actions={
          <>
            <Button variant="secondary" icon={Play} onClick={() => setHeldOpen(true)}>
              {t('pos.heldOrders')} {held.data && held.data.length > 0 ? `(${held.data.length})` : ''}
            </Button>
            <Button variant="secondary" icon={ShoppingCart} onClick={resetAll}>
              {t('pos.newOrder')}
            </Button>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1fr_400px]">
        <div className="flex min-h-0 flex-col">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="min-w-[220px] flex-1">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('pos.searchProducts')}
                  className="afus-input ps-9"
                />
              </div>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => setCategory('all')}
              className={
                category === 'all'
                  ? 'rounded-full bg-brand-800 px-3 py-1 text-xs font-semibold text-white'
                  : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 hover:border-brand-400 dark:border-slate-700 dark:bg-slate-900'
              }
            >
              {t('common.all')}
            </button>
            {(categories.data ?? []).map((item) => (
              <button
                key={item.id}
                onClick={() => setCategory(item.id)}
                className={
                  category === item.id
                    ? 'rounded-full bg-brand-800 px-3 py-1 text-xs font-semibold text-white'
                    : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 hover:border-brand-400 dark:border-slate-700 dark:bg-slate-900'
                }
              >
                <span className="me-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                {language === 'ar' ? item.nameAr : item.nameFr}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            {products.loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Spinner />
              </div>
            ) : activeProducts.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Search}
                  title={t('common.noResults')}
                  hint={language === 'ar' ? 'أضف منتجات من صفحة القائمة أولاً.' : "Ajoutez des produits depuis la carte."}
                />
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
                {activeProducts.map((product) => (
                  <button
                    key={product.id}
                    disabled={!product.isAvailable || closed}
                    onClick={() => {
                      if (product.variants.length > 1 || product.modifierGroups.length > 0) setItemTarget(product)
                      else void addToOrder(product, product.variants[0] ?? null, [], 1, '')
                    }}
                    className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-start transition hover:border-brand-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="relative h-24 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                      {product.image ? (
                        <img src={product.image} alt={product.nameFr} className="h-full w-full object-cover transition group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-2xl font-black text-slate-300 dark:text-slate-600">
                          {(language === 'ar' ? product.nameAr : product.nameFr).slice(0, 2)}
                        </div>
                      )}
                      {!product.isAvailable ? (
                        <span className="absolute end-1.5 top-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {t('menu.unavailable')}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-1 flex-col p-2.5">
                      <p className="line-clamp-1 text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {language === 'ar' ? product.nameAr : product.nameFr}
                      </p>
                      <p className="mt-auto pt-1 text-xs font-bold text-brand-700 dark:text-brand-300">
                        {formatMoney(product.priceCents, currency, 0)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <Card className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{t('pos.cart')}</h2>
              <p className="text-[11px] text-slate-400">
                {order ? order.orderNumber : t('pos.newOrder')}
                {order ? ` · ${orderTypeLabel(language, order.type)}` : ''}
              </p>
            </div>
            {order ? (
              <div className="flex items-center gap-1.5">
                <Badge tone={orderStatusTone(order.status)}>{orderStatusLabel(language, order.status)}</Badge>
                {order.isHeld ? <Badge tone="amber">{t('orders.held')}</Badge> : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-2.5 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="grid grid-cols-2 gap-2">
              {ORDER_TYPES.map((option) => (
                <button
                  key={option.value}
                  disabled={typeLocked}
                  onClick={() => setType(option.value)}
                  className={
                    type === option.value
                      ? 'rounded-lg border border-brand-700 bg-brand-50 px-2 py-1.5 text-xs font-semibold text-brand-800 dark:border-brand-500 dark:bg-brand-900/40 dark:text-brand-200'
                      : 'rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-500 disabled:opacity-50 dark:border-slate-700'
                  }
                >
                  {orderTypeLabel(language, option.value)}
                </button>
              ))}
            </div>

            {type === 'dineIn' ? (
              <Field label={t('pos.table')}>
                <Select
                  value={tableId}
                  disabled={typeLocked}
                  onChange={(event) => setTableId(event.target.value)}
                >
                  <option value="">{t('pos.selectTable')}</option>
                  {tables
                    .filter((table) => table.status !== 'occupied' || String(table.id) === tableId)
                    .map((table) => (
                      <option key={table.id} value={table.id}>
                        {table.name} · {table.seats} {t('tables.seats')}
                      </option>
                    ))}
                </Select>
              </Field>
            ) : null}

            {type === 'preorder' ? (
              <Field label={t('common.date')}>
                <Input
                  type="datetime-local"
                  value={schedule}
                  disabled={typeLocked}
                  onChange={(event) => setSchedule(event.target.value)}
                />
              </Field>
            ) : null}

            {type === 'delivery' && !order ? (
              <div className="space-y-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder={t('common.name')}
                    value={delivery.customerName}
                    onChange={(event) => setDelivery({ ...delivery, customerName: event.target.value })}
                  />
                  <Input
                    placeholder={t('common.phone')}
                    value={delivery.phone}
                    onChange={(event) => setDelivery({ ...delivery, phone: event.target.value })}
                  />
                </div>
                <Input
                  placeholder={t('common.address')}
                  value={delivery.address}
                  onChange={(event) => setDelivery({ ...delivery, address: event.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder={t('delivery.area')}
                    value={delivery.area}
                    onChange={(event) => setDelivery({ ...delivery, area: event.target.value })}
                  />
                  <Input
                    placeholder={t('delivery.fee')}
                    type="number"
                    min={0}
                    step="1"
                    value={delivery.fee}
                    onChange={(event) => setDelivery({ ...delivery, fee: event.target.value })}
                  />
                </div>
                <Input
                  placeholder={t('delivery.courier')}
                  value={delivery.courier}
                  onChange={(event) => setDelivery({ ...delivery, courier: event.target.value })}
                />
              </div>
            ) : null}

            {type === 'delivery' && order?.delivery ? (
              <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500 dark:bg-slate-800">
                {order.delivery.customerName} · {order.delivery.phone} · {order.delivery.address}
              </p>
            ) : null}

            <Field label={t('pos.customer')}>
              <Select
                value={customerId}
                disabled={typeLocked}
                onChange={(event) => setCustomerId(event.target.value)}
              >
                <option value="">{t('pos.walkIn')}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} {customer.phone ? `· ${customer.phone}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {!hasItems ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <ShoppingCart className="mb-2 h-8 w-8 text-slate-200 dark:text-slate-700" />
                <p className="text-xs text-slate-400">{t('pos.emptyCart')}</p>
              </div>
            ) : order ? (
              <ul className="space-y-2">
                {order.items.map((item) => (
                  <li key={item.id} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {language === 'ar' ? item.productNameAr : item.productNameFr}
                          {item.variantNameAr || item.variantNameFr ? (
                            <span className="text-[10px] text-slate-400">
                              {' '}
                              ({language === 'ar' ? item.variantNameAr : item.variantNameFr})
                            </span>
                          ) : null}
                        </p>
                        {item.modifiers.length > 0 ? (
                          <p className="text-[10px] text-slate-400">
                            + {item.modifiers.map((modifier) => (language === 'ar' ? modifier.nameAr : modifier.nameFr)).join(', ')}
                          </p>
                        ) : null}
                        {item.note ? <p className="text-[10px] text-amber-600">✎ {item.note}</p> : null}
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {formatMoney(item.unitPriceCents + item.modifiersCents, currency, 0)} × {item.qty}
                        </p>
                      </div>
                      <Money cents={item.lineTotalCents} className="text-xs font-bold text-slate-700 dark:text-slate-200" />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button
                          className="h-6 w-6 rounded border border-slate-200 text-xs font-bold text-slate-500 disabled:opacity-40 dark:border-slate-700"
                          disabled={Boolean(busy) || closed || order.isHeld}
                          onClick={() => void updateOrderItemQty(item.id, item.qty - 1)}
                        >
                          −
                        </button>
                        <span className="num w-7 text-center text-xs font-semibold">{item.qty}</span>
                        <button
                          className="h-6 w-6 rounded border border-slate-200 text-xs font-bold text-slate-500 disabled:opacity-40 dark:border-slate-700"
                          disabled={Boolean(busy) || closed || order.isHeld}
                          onClick={() => void updateOrderItemQty(item.id, item.qty + 1)}
                        >
                          +
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                          disabled={closed || order.isHeld}
                          onClick={() => setNoteTarget({ itemId: item.id, note: item.note ?? '' })}
                          title={t('pos.noteItem')}
                        >
                          <Percent className="h-3 w-3" />
                        </button>
                        <button
                          className="rounded p-1 text-red-500 hover:bg-red-50"
                          disabled={Boolean(busy) || closed || order.isHeld}
                          onClick={() => void removeOrderItem(item.id)}
                          title={t('common.delete')}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-2">
                {draft.map((line) => (
                  <li key={line.key} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {language === 'ar' ? line.product.nameAr : line.product.nameFr}
                          {line.variant ? (
                            <span className="text-[10px] text-slate-400">
                              {' '}
                              ({language === 'ar' ? line.variant.nameAr : line.variant.nameFr})
                            </span>
                          ) : null}
                        </p>
                        {line.modifiers.length > 0 ? (
                          <p className="text-[10px] text-slate-400">
                            + {line.modifiers.map((modifier) => (language === 'ar' ? modifier.nameAr : modifier.nameFr)).join(', ')}
                          </p>
                        ) : null}
                        {line.note ? <p className="text-[10px] text-amber-600">✎ {line.note}</p> : null}
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {formatMoney(line.unitPriceCents, currency, 0)} × {line.qty}
                        </p>
                      </div>
                      <Money cents={line.unitPriceCents * line.qty} className="text-xs font-bold text-slate-700 dark:text-slate-200" />
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      <button
                        className="h-6 w-6 rounded border border-slate-200 text-xs font-bold text-slate-500 dark:border-slate-700"
                        onClick={() => updateDraftQty(line.key, -1)}
                      >
                        −
                      </button>
                      <span className="num w-7 text-center text-xs font-semibold">{line.qty}</span>
                      <button
                        className="h-6 w-6 rounded border border-slate-200 text-xs font-bold text-slate-500 dark:border-slate-700"
                        onClick={() => updateDraftQty(line.key, 1)}
                      >
                        +
                      </button>
                      <button
                        className="ms-auto rounded p-1 text-red-500 hover:bg-red-50"
                        onClick={() => setDraft((current) => current.filter((item) => item.key !== line.key))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3">
              <Field label={t('pos.orderNote')}>
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  onBlur={async () => {
                    if (order && !closed && !order.isHeld && note !== (order.note ?? '')) {
                      try {
                        setOrder(await api.orders.setNote(order.id, note))
                      } catch {
                        /* note stays local until saved */
                      }
                    }
                  }}
                  className="min-h-[52px] text-xs"
                  placeholder="…"
                />
              </Field>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{t('common.subtotal')}</span>
              <Money cents={order ? order.subtotalCents : draftSubtotal} />
            </div>
            {order && order.discountCents > 0 ? (
              <div className="flex items-center justify-between text-xs text-red-500">
                <span>{t('common.discount')}{order.discountReason ? ` · ${order.discountReason}` : ''}</span>
                <Money cents={-order.discountCents} />
              </div>
            ) : null}
            {order && order.taxCents > 0 ? (
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{t('common.tax')}</span>
                <Money cents={order.taxCents} />
              </div>
            ) : null}
            {(order ? order.deliveryFeeCents : draftDeliveryFee) > 0 ? (
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{t('delivery.fee')}</span>
                <Money cents={order ? order.deliveryFeeCents : draftDeliveryFee} />
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-2 dark:border-slate-700">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{t('common.total')}</span>
              <Money cents={order ? order.totalCents : draftSubtotal + draftDeliveryFee} className="text-base font-bold text-brand-800 dark:text-brand-300" />
            </div>
            {order && order.paidCents > 0 ? (
              <>
                <div className="flex items-center justify-between text-xs text-brand-700 dark:text-brand-300">
                  <span>{t('common.paid')}</span>
                  <Money cents={order.paidCents} />
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-amber-700">
                  <span>{t('common.due')}</span>
                  <Money cents={order.dueCents} />
                </div>
              </>
            ) : null}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="secondary"
                icon={Send}
                size="sm"
                loading={busy === 'send' || busy === 'create'}
                disabled={!hasItems || closed}
                onClick={() => void sendKitchen()}
              >
                {t('pos.sendKitchen')}
              </Button>
              {canPay ? (
                <Button
                  icon={CreditCard}
                  size="sm"
                  disabled={!hasItems || closed || Boolean(busy)}
                  onClick={async () => {
                    const target = await ensureOrder()
                    if (target) setPayOpen(true)
                  }}
                >
                  {t('pos.pay')}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                icon={Pause}
                disabled={!hasItems || closed || Boolean(order?.stockDeducted)}
                loading={busy === 'hold'}
                onClick={() => void holdCurrent()}
              >
                {t('pos.hold')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Percent}
                disabled={!order || closed || !can('orders.discount')}
                onClick={() => setDiscountOpen(true)}
              >
                {t('pos.discount')}
              </Button>
            </div>

            {order ? (
              <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2 text-[11px] dark:border-slate-800">
                <button className="flex items-center gap-1 rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void printReceipt()}>
                  <Printer className="h-3 w-3" /> {t('pos.printReceipt')}
                </button>
                <button className="flex items-center gap-1 rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void printKitchen()}>
                  <ChefHat className="h-3 w-3" /> {t('pos.printKitchen')}
                </button>
                {!closed ? (
                  <>
                    <button className="flex items-center gap-1 rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setMoveOpen(true)}>
                      <MoveRight className="h-3 w-3" /> {t('pos.moveTable')}
                    </button>
                    <button
                      className="flex items-center gap-1 rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                      disabled={order.payments.length > 0 || order.stockDeducted}
                      onClick={() => setMergeOpen(true)}
                    >
                      <Merge className="h-3 w-3" /> {t('pos.merge')}
                    </button>
                    <button className="flex items-center gap-1 rounded px-1.5 py-1 text-red-500 hover:bg-red-50" onClick={() => setCancelOpen(true)}>
                      <X className="h-3 w-3" /> {t('pos.cancelOrder')}
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      {notice ? (
        <div
          className={`fixed bottom-5 start-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-lg ${
            notice.tone === 'error' ? 'bg-red-600' : 'bg-brand-800'
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <ItemModal
        product={itemTarget}
        currency={currency}
        onClose={() => setItemTarget(null)}
        onAdd={async (product, variant, modifiers, qty, itemNote) => {
          setItemTarget(null)
          await addToOrder(product, variant, modifiers, qty, itemNote)
        }}
      />

      {payOpen && order ? (
        <PaymentModal
          order={order}
          currency={currency}
          methods={settings?.paymentMethods ?? ['cash', 'card', 'transfer']}
          onClose={() => setPayOpen(false)}
          onPaid={async (updated, printReceiptFlag) => {
            setOrder(updated)
            setPayOpen(false)
            if (updated.dueCents <= 0) {
              if (printReceiptFlag && settings) {
                await print(receiptHtml(updated, settings, language, settings.paperWidth), false)
              }
              flash(t('pos.paid'))
              resetAll()
            } else {
              flash(t('common.saved'))
            }
          }}
        />
      ) : null}

      <DiscountModal
        open={discountOpen}
        order={order}
        currency={currency}
        onClose={() => setDiscountOpen(false)}
        onSaved={(updated) => {
          setOrder(updated)
          setDiscountOpen(false)
        }}
      />

      <CancelModal
        open={cancelOpen}
        order={order}
        onClose={() => setCancelOpen(false)}
        onDone={() => {
          setCancelOpen(false)
          flash(t('common.updated'))
          resetAll()
        }}
      />

      <MoveTableModal
        open={moveOpen}
        order={order}
        tables={tables}
        onClose={() => setMoveOpen(false)}
        onMoved={(updated) => {
          setOrder(updated)
          setMoveOpen(false)
          void tableMap.reload()
        }}
      />

      <MergeModal
        open={mergeOpen}
        order={order}
        candidates={(openOrders.data ?? []).filter(
          (row) =>
            order &&
            row.id !== order.id &&
            !row.isHeld &&
            ['new', 'accepted', 'preparing', 'ready'].includes(row.status) &&
            row.paidCents === 0
        )}
        onClose={() => setMergeOpen(false)}
        onMerged={async (targetId) => {
          setMergeOpen(false)
          if (order) await loadOrder(targetId)
          flash(t('common.saved'))
        }}
      />

      <HeldModal
        open={heldOpen}
        orders={held.data ?? []}
        onClose={() => setHeldOpen(false)}
        onResume={(id) => void resumeOrder(id)}
      />

      <Modal
        open={Boolean(noteTarget)}
        title={t('pos.noteItem')}
        onClose={() => setNoteTarget(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNoteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={async () => {
                if (!noteTarget || !order) return
                try {
                  setOrder(await api.orders.updateItem(noteTarget.itemId, { note: noteTarget.note || null }))
                  setNoteTarget(null)
                } catch (caught) {
                  flash(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'), 'error')
                }
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Textarea
          value={noteTarget?.note ?? ''}
          onChange={(event) => setNoteTarget((current) => (current ? { ...current, note: event.target.value } : current))}
          autoFocus
        />
      </Modal>
    </div>
  )
}

function ItemModal({
  product,
  currency,
  onClose,
  onAdd
}: {
  product: Product | null
  currency: string
  onClose: () => void
  onAdd: (product: Product, variant: ProductVariant | null, modifiers: Modifier[], qty: number, note: string) => void
}) {
  const { t, language } = useT()
  const [variantId, setVariantId] = useState<number | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!product) return
    setVariantId(product.variants.find((variant) => variant.isDefault)?.id ?? product.variants[0]?.id ?? null)
    setSelected([])
    setQty(1)
    setNote('')
    setError(null)
  }, [product])

  if (!product) return null
  const variant = product.variants.find((item) => item.id === variantId) ?? null
  const allModifiers = product.modifierGroups.flatMap((group) => group.modifiers)
  const chosen = allModifiers.filter((modifier) => selected.includes(modifier.id))
  const unit =
    product.priceCents + (variant?.priceDeltaCents ?? 0) + chosen.reduce((sum, modifier) => sum + modifier.priceCents, 0)

  const toggle = (group: { minSelect: number; maxSelect: number; modifiers: Modifier[] }, modifier: Modifier) => {
    setSelected((current) => {
      const inGroup = group.modifiers.filter((item) => current.includes(item.id))
      if (current.includes(modifier.id)) return current.filter((id) => id !== modifier.id)
      if (group.maxSelect > 0 && inGroup.length >= group.maxSelect) {
        const oldest = inGroup[0]
        return [...current.filter((id) => id !== oldest?.id), modifier.id]
      }
      return [...current, modifier.id]
    })
  }

  const submit = () => {
    for (const group of product.modifierGroups) {
      const count = group.modifiers.filter((modifier) => selected.includes(modifier.id)).length
      if (group.isRequired && count < Math.max(1, group.minSelect)) {
        setError(`${language === 'ar' ? group.nameAr : group.nameFr}: ${t('errors.MODIFIER_MIN_NOT_MET')}`)
        return
      }
    }
    onAdd(product, variant, chosen, qty, note)
  }

  return (
    <Modal
      open
      title={language === 'ar' ? product.nameAr : product.nameFr}
      subtitle={product.descriptionFr ?? product.descriptionAr ?? undefined}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit}>
            {t('pos.addToOrder')} · {formatMoney(unit * qty, currency, 0)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {product.variants.length > 1 ? (
          <div>
            <p className="afus-label">{t('pos.variant')}</p>
            <div className="flex flex-wrap gap-1.5">
              {product.variants.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setVariantId(item.id)}
                  className={
                    variantId === item.id
                      ? 'rounded-lg border border-brand-700 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 dark:bg-brand-900/40 dark:text-brand-200'
                      : 'rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-700'
                  }
                >
                  {language === 'ar' ? item.nameAr : item.nameFr}
                  {item.priceDeltaCents !== 0 ? ` (${item.priceDeltaCents > 0 ? '+' : ''}${item.priceDeltaCents / 100})` : ''}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {product.modifierGroups.map((group) => (
          <div key={group.id}>
            <p className="afus-label flex items-center gap-2">
              {language === 'ar' ? group.nameAr : group.nameFr}
              {group.isRequired ? <span className="text-red-500">*</span> : null}
              <span className="text-[10px] font-normal text-slate-400">
                {group.minSelect}–{group.maxSelect || '∞'}
              </span>
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {group.modifiers
                .filter((modifier) => modifier.isActive)
                .map((modifier) => (
                  <label
                    key={modifier.id}
                    className={
                      selected.includes(modifier.id)
                        ? 'flex cursor-pointer items-center justify-between rounded-lg border border-brand-600 bg-brand-50/60 px-2.5 py-1.5 text-xs dark:bg-brand-900/20'
                        : 'flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700'
                    }
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(modifier.id)}
                        onChange={() => toggle(group, modifier)}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      {language === 'ar' ? modifier.nameAr : modifier.nameFr}
                    </span>
                    {modifier.priceCents > 0 ? (
                      <span className="text-[10px] text-slate-500">+{formatMoney(modifier.priceCents, currency, 0)}</span>
                    ) : null}
                  </label>
                ))}
            </div>
          </div>
        ))}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.quantity')}>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setQty((value) => Math.max(1, value - 1))}>
                −
              </Button>
              <span className="num w-8 text-center text-sm font-bold">{qty}</span>
              <Button variant="secondary" size="sm" onClick={() => setQty((value) => value + 1)}>
                +
              </Button>
            </div>
          </Field>
          <Field label={t('pos.noteItem')}>
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="…" />
          </Field>
        </div>
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
      </div>
    </Modal>
  )
}

function PaymentModal({
  order,
  currency,
  methods,
  onClose,
  onPaid
}: {
  order: Order
  currency: string
  methods: string[]
  onClose: () => void
  onPaid: (order: Order, printReceipt: boolean) => void
}) {
  const { t, language } = useT()
  const [rows, setRows] = useState<{ method: string; amount: string }[]>([
    { method: methods[0] ?? 'cash', amount: centsToInput(order.dueCents) }
  ])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [printReceipt, setPrintReceipt] = useState(true)

  const total = rows.reduce((sum, row) => sum + (toCents(row.amount) ?? 0), 0)
  const remaining = order.dueCents - total

  const submit = async () => {
    setError(null)
    if (total <= 0) {
      setError(t('errors.INVALID_PAYMENT_AMOUNT'))
      return
    }
    if (total > order.dueCents) {
      setError(t('errors.OVERPAYMENT'))
      return
    }
    setBusy(true)
    try {
      const updated = await api.orders.pay(
        order.id,
        rows.map((row) => ({ method: row.method, amountCents: toCents(row.amount) ?? 0 }))
      )
      onPaid(updated, printReceipt)
    } catch (caught) {
      setError(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={t('pos.pay')}
      subtitle={`${order.orderNumber} · ${t('common.due')}: ${formatMoney(order.dueCents, currency, 0)}`}
      onClose={onClose}
      footer={
        <>
          <label className="me-auto flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={printReceipt} onChange={(event) => setPrintReceipt(event.target.checked)} className="h-3.5 w-3.5 rounded" />
            {t('pos.printReceipt')}
          </label>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={busy} disabled={total <= 0}>
            {t('pos.pay')} · {formatMoney(total, currency, 0)}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_130px_28px] items-end gap-2">
            <Field label={index === 0 ? t('common.method') : undefined}>
              <Select value={row.method} onChange={(event) => setRows(rows.map((item, i) => (i === index ? { ...item, method: event.target.value } : item)))}>
                {methods.map((method) => (
                  <option key={method} value={method}>
                    {paymentMethodLabel(language, method)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={index === 0 ? t('common.amount') : undefined}>
              <Input
                type="number"
                min={0}
                step="1"
                value={row.amount}
                onChange={(event) => setRows(rows.map((item, i) => (i === index ? { ...item, amount: event.target.value } : item)))}
              />
            </Field>
            <button
              className="mb-1 rounded p-1 text-red-500 disabled:opacity-30"
              disabled={rows.length === 1}
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setRows([
                ...rows,
                { method: methods[0] ?? 'cash', amount: centsToInput(Math.max(0, order.dueCents - total)) }
              ])
            }
          >
            + {t('pos.split')}
          </Button>
          {rows.length > 1 ? (
            <Button variant="ghost" size="sm" onClick={() => setRows([{ method: methods[0] ?? 'cash', amount: centsToInput(order.dueCents) }])}>
              {t('common.clear')}
            </Button>
          ) : null}
        </div>

        <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
          <div className="flex justify-between">
            <span className="text-slate-500">{t('common.total')}</span>
            <Money cents={order.totalCents} />
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t('pos.remaining')}</span>
            <Money cents={Math.max(0, remaining)} className={remaining < 0 ? 'text-red-600' : 'font-semibold'} />
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t('common.change')}</span>
            <Money cents={Math.max(0, -remaining)} />
          </div>
        </div>
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
      </div>
    </Modal>
  )
}

function DiscountModal({
  open,
  order,
  currency,
  onClose,
  onSaved
}: {
  open: boolean
  order: Order | null
  currency: string
  onClose: () => void
  onSaved: (order: Order) => void
}) {
  const { t, language } = useT()
  const [amount, setAmount] = useState('0')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open && order) {
      setAmount(centsToInput(order.discountCents))
      setReason(order.discountReason ?? '')
      setError(null)
    }
  }, [open, order])

  return (
    <Modal
      open={open}
      title={t('pos.discount')}
      subtitle={order ? `${t('common.subtotal')}: ${formatMoney(order.subtotalCents, currency, 0)}` : undefined}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              if (!order) return
              const cents = toCents(amount) ?? 0
              if (cents > order.subtotalCents) {
                setError(t('errors.DISCOUNT_EXCEEDS_TOTAL'))
                return
              }
              setBusy(true)
              try {
                onSaved(await api.orders.setDiscount(order.id, cents, reason.trim() || '—'))
              } catch (caught) {
                setError(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'))
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('common.amount')}>
          <Input type="number" min={0} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus />
        </Field>
        <Field label={t('inventory.reason')}>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
      </div>
    </Modal>
  )
}

function CancelModal({
  open,
  order,
  onClose,
  onDone
}: {
  open: boolean
  order: Order | null
  onClose: () => void
  onDone: () => void
}) {
  const { t, language } = useT()
  const [reason, setReason] = useState('')
  const [policy, setPolicy] = useState<'waste' | 'return'>('waste')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setReason('')
      setPolicy('waste')
      setError(null)
    }
  }, [open])

  return (
    <Modal
      open={open}
      title={t('pos.cancelOrder')}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={!reason.trim()}
            onClick={async () => {
              if (!order) return
              setBusy(true)
              try {
                await api.orders.cancel(order.id, reason.trim(), policy)
                onDone()
              } catch (caught) {
                setError(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'))
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('pos.cancelOrder')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('pos.cancelReason')} required>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} autoFocus />
        </Field>
        <Field label={t('pos.stockPolicy')} hint={t('recipes.note')}>
          <Select value={policy} onChange={(event) => setPolicy(event.target.value as 'waste' | 'return')}>
            <option value="waste">{t('pos.waste')}</option>
            <option value="return">{t('pos.returnStock')}</option>
          </Select>
        </Field>
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
      </div>
    </Modal>
  )
}

function MoveTableModal({
  open,
  order,
  tables,
  onClose,
  onMoved
}: {
  open: boolean
  order: Order | null
  tables: { id: number; name: string; status: string; seats: number }[]
  onClose: () => void
  onMoved: (order: Order) => void
}) {
  const { t } = useT()
  const [tableId, setTableId] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal
      open={open}
      title={t('pos.moveTable')}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!tableId}
            onClick={async () => {
              if (!order) return
              try {
                onMoved(await api.orders.moveTable(order.id, Number(tableId)))
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
              }
            }}
          >
            {t('common.apply')}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Select value={tableId} onChange={(event) => setTableId(event.target.value)}>
          <option value="">{t('pos.selectTable')}</option>
          {tables
            .filter((table) => (table.status !== 'occupied' && table.status !== 'reserved') || table.id === order?.tableId)
            .map((table) => (
              <option key={table.id} value={table.id}>
                {table.name} · {table.seats}
              </option>
            ))}
        </Select>
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
      </div>
    </Modal>
  )
}

function MergeModal({
  open,
  order,
  candidates,
  onClose,
  onMerged
}: {
  open: boolean
  order: Order | null
  candidates: { id: number; orderNumber: string; tableName: string | null; totalCents: number; status: string }[]
  onClose: () => void
  onMerged: (targetId: number) => void
}) {
  const { t, language } = useT()
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal open={open} title={t('pos.merge')} onClose={onClose} size="sm">
      <p className="mb-3 text-xs text-slate-500">
        {language === 'ar' ? 'سيتم دمج أصناف هذا الطلب في الطلب المختار ثم إلغاء هذا الطلب.' : 'Les articles seront fusionnés dans la commande choisie, puis celle-ci sera annulée.'}
      </p>
      {candidates.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">{t('common.noData')}</p>
      ) : (
        <ul className="space-y-1.5">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <button
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs hover:border-brand-500 dark:border-slate-700"
                onClick={async () => {
                  if (!order) return
                  try {
                    await api.orders.merge(order.id, candidate.id)
                    onMerged(candidate.id)
                  } catch (caught) {
                    setError(errorText(language, caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR'))
                  }
                }}
              >
                <span className="font-semibold">{candidate.orderNumber}{candidate.tableName ? ` · ${candidate.tableName}` : ''}</span>
                <Money cents={candidate.totalCents} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
    </Modal>
  )
}

function HeldModal({
  open,
  orders,
  onClose,
  onResume
}: {
  open: boolean
  orders: { id: number; orderNumber: string; tableName: string | null; totalCents: number; createdAt: string }[]
  onClose: () => void
  onResume: (id: number) => void
}) {
  const { t } = useT()
  return (
    <Modal open={open} title={t('pos.heldOrders')} onClose={onClose} size="sm">
      {orders.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">{t('common.noData')}</p>
      ) : (
        <ul className="space-y-1.5">
          {orders.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
              <div>
                <p className="font-semibold">{row.orderNumber}</p>
                <p className="text-[10px] text-slate-400">{row.tableName ?? '—'} · {new Date(row.createdAt.replace(' ', 'T')).toLocaleTimeString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <Money cents={row.totalCents} />
                <Button size="sm" icon={Play} onClick={() => onResume(row.id)}>
                  {t('pos.resume')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
