import { useState } from 'react'
import { BookOpen, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Category, ModifierGroup, Product, ProductVariant } from '@shared/types'
import { PRODUCT_TYPES, STATIONS } from '@shared/constants'
import { api, type ProductInput } from '../lib/api'
import { useApi, useDebounced } from '../lib/hooks'
import { errorText, useT } from '../i18n'
import { centsToInput, toCents } from '../lib/format'
import { productTypeLabel, stationLabel } from '../lib/labels'
import { useAppStore } from '../store/app'
import {
  Badge,
  Button,
  Card,
  Confirm,
  DataTable,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Loading,
  Modal,
  Money,
  PageHeader,
  SearchInput,
  Select,
  Tabs,
  Textarea,
  Toggle,
  type Column
} from '../components/ui'

type TabKey = 'products' | 'categories' | 'modifiers'

const CATEGORY_KINDS = [
  { value: 'food', ar: 'طعام', fr: 'Nourriture' },
  { value: 'drink', ar: 'مشروبات', fr: 'Boissons' },
  { value: 'dessert', ar: 'حلويات', fr: 'Desserts' },
  { value: 'other', ar: 'أخرى', fr: 'Autres' }
]

export default function MenuPage() {
  const { t, language } = useT()
  const can = useAppStore((state) => state.can)
  const manage = can('menu.manage')
  const [tab, setTab] = useState<TabKey>('products')
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')
  const term = useDebounced(search)
  const [error, setError] = useState<string | null>(null)
  const [productModal, setProductModal] = useState<Product | 'new' | null>(null)
  const [categoryModal, setCategoryModal] = useState<Category | 'new' | null>(null)
  const [groupModal, setGroupModal] = useState<ModifierGroup | 'new' | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null)

  const categories = useApi(() => api.categories.list(true), [])
  const products = useApi(
    () => api.products.list({ search: term || undefined, includeArchived: true, categoryId: categoryFilter === 'all' ? undefined : categoryFilter }),
    [term, categoryFilter]
  )
  const groups = useApi(() => api.modifierGroups.list(true), [])

  const reloadAll = async () => {
    await Promise.all([categories.reload(), products.reload(), groups.reload()])
  }

  const productColumns: Column<Product>[] = [
    {
      key: 'product',
      header: t('menu.products'),
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.image ? (
            <img src={row.image} alt="" className="h-9 w-9 rounded-md object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-400 dark:bg-slate-800">
              {(language === 'ar' ? row.nameAr : row.nameFr).slice(0, 2)}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{language === 'ar' ? row.nameAr : row.nameFr}</p>
            <p className="text-[10px] text-slate-400">{language === 'ar' ? row.categoryNameAr : row.categoryNameFr} · {row.code ?? '—'}</p>
          </div>
        </div>
      )
    },
    { key: 'type', header: t('common.type'), render: (row) => <span className="text-xs text-slate-500">{productTypeLabel(language, row.type)}</span> },
    { key: 'station', header: t('menu.station'), render: (row) => <span className="text-xs text-slate-500">{stationLabel(language, row.station)}</span> },
    { key: 'price', header: t('menu.price'), align: 'end', render: (row) => <Money cents={row.priceCents} className="text-xs font-semibold" /> },
    { key: 'cost', header: t('menu.cost'), align: 'end', render: (row) => <Money cents={row.costCents} className="text-xs text-slate-500" /> },
    {
      key: 'available',
      header: t('menu.available'),
      align: 'center',
      render: (row) =>
        row.isArchived ? (
          <Badge tone="neutral">{t('menu.archive')}</Badge>
        ) : (
          <Toggle
            checked={row.isAvailable}
            disabled={!manage}
            onChange={async (value) => {
              try {
                await api.products.setAvailability(row.id, value)
                await products.reload()
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
              }
            }}
          />
        )
    },
    {
      key: 'actions',
      header: t('common.actions'),
      align: 'end',
      render: (row) =>
        manage ? (
          <div className="flex items-center justify-end gap-1">
            <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setProductModal(row)} title={t('common.edit')}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {!row.isArchived ? (
              <button className="rounded p-1.5 text-red-500 hover:bg-red-50" onClick={() => setArchiveTarget(row)} title={t('menu.archive')}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null
    }
  ]

  return (
    <div>
      <PageHeader title={t('menu.title')} subtitle={t('menu.subtitle')} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Tabs<TabKey>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'products', label: t('menu.products') },
            { value: 'categories', label: t('menu.categories') },
            { value: 'modifiers', label: t('menu.modifierGroups') }
          ]}
        />
        {manage ? (
          <div className="flex gap-2">
            {tab === 'products' ? (
              <Button icon={Plus} onClick={() => setProductModal('new')}>{t('menu.addProduct')}</Button>
            ) : null}
            {tab === 'categories' ? (
              <Button icon={Plus} onClick={() => setCategoryModal('new')}>{t('menu.addCategory')}</Button>
            ) : null}
            {tab === 'modifiers' ? (
              <Button icon={Plus} onClick={() => setGroupModal('new')}>{t('menu.addGroup')}</Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? <div className="mb-3"><ErrorBox code={error} /></div> : null}

      {tab === 'products' ? (
        <>
          <Card className="mb-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-56"><SearchInput value={search} onChange={setSearch} /></div>
              <Select
                value={String(categoryFilter)}
                onChange={(event) => setCategoryFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))}
                className="h-9 w-44"
              >
                <option value="all">{t('common.all')}</option>
                {(categories.data ?? []).map((category) => (
                  <option key={category.id} value={category.id}>{language === 'ar' ? category.nameAr : category.nameFr}</option>
                ))}
              </Select>
              <span className="ms-auto text-[11px] text-slate-400">{products.data?.length ?? 0}</span>
            </div>
          </Card>
          <Card>
            {products.error ? (
              <ErrorBox code={products.error} onRetry={() => void products.reload()} />
            ) : (
              <DataTable
                columns={productColumns}
                rows={products.data ?? []}
                keyField={(row) => row.id}
                loading={products.loading}
                empty={<EmptyState icon={BookOpen} title={t('common.noData')} hint={t('menu.subtitle')} />}
              />
            )}
          </Card>
        </>
      ) : null}

      {tab === 'categories' ? (
        <Card>
          {categories.loading && !categories.data ? (
            <Loading />
          ) : (categories.data ?? []).length === 0 ? (
            <EmptyState icon={BookOpen} title={t('common.noData')} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {(categories.data ?? []).map((category) => (
                <li key={category.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color }} />
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{language === 'ar' ? category.nameAr : category.nameFr}</p>
                      <p className="text-[10px] text-slate-400">
                        {CATEGORY_KINDS.find((kind) => kind.value === category.kind)?.[language] ?? category.kind} · {category.productCount ?? 0} {t('menu.products')}
                        {category.isArchived ? ` · ${t('menu.archive')}` : ''}
                      </p>
                    </div>
                  </div>
                  {manage ? (
                    <div className="flex items-center gap-1">
                      <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setCategoryModal(category)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {!category.isArchived ? (
                        <button
                          className="rounded p-1.5 text-red-500 hover:bg-red-50"
                          onClick={async () => {
                            try {
                              await api.categories.archive(category.id)
                              await categories.reload()
                            } catch (caught) {
                              setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === 'modifiers' ? (
        <div className="grid gap-3 md:grid-cols-2">
          {(groups.data ?? []).map((group) => (
            <Card key={group.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{language === 'ar' ? group.nameAr : group.nameFr}</p>
                  <p className="text-[10px] text-slate-400">
                    {group.isRequired ? `${t('menu.required')} · ` : ''}{group.minSelect}–{group.maxSelect || '∞'} · {group.modifiers.length} {t('menu.options')}
                  </p>
                </div>
                {manage ? (
                  <div className="flex gap-1">
                    <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setGroupModal(group)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="rounded p-1.5 text-red-500 hover:bg-red-50"
                      onClick={async () => {
                        try {
                          await api.modifierGroups.remove(group.id)
                          await groups.reload()
                        } catch (caught) {
                          setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
              <ul className="mt-2 space-y-1">
                {group.modifiers.map((modifier) => (
                  <li key={modifier.id} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>{language === 'ar' ? modifier.nameAr : modifier.nameFr}{!modifier.isActive ? ` (${t('common.none')})` : ''}</span>
                    <Money cents={modifier.priceCents} className="text-[11px] text-slate-500" />
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {(groups.data ?? []).length === 0 ? (
            <Card className="md:col-span-2">
              <EmptyState icon={Plus} title={t('common.noData')} hint={t('menu.modifiers')} />
            </Card>
          ) : null}
        </div>
      ) : null}

      {productModal ? (
        <ProductModal
          product={productModal === 'new' ? null : productModal}
          categories={categories.data ?? []}
          groups={groups.data ?? []}
          onClose={() => setProductModal(null)}
          onSaved={async () => {
            setProductModal(null)
            await reloadAll()
          }}
        />
      ) : null}

      {categoryModal ? (
        <CategoryModal
          category={categoryModal === 'new' ? null : categoryModal}
          sortOrder={(categories.data ?? []).length}
          onClose={() => setCategoryModal(null)}
          onSaved={async () => {
            setCategoryModal(null)
            await categories.reload()
          }}
        />
      ) : null}

      {groupModal ? (
        <GroupModal
          group={groupModal === 'new' ? null : groupModal}
          onClose={() => setGroupModal(null)}
          onSaved={async () => {
            setGroupModal(null)
            await reloadAll()
          }}
        />
      ) : null}

      <Confirm
        open={Boolean(archiveTarget)}
        title={t('menu.archive')}
        message={t('menu.archiveConfirm')}
        confirmLabel={t('menu.archive')}
        danger
        onClose={() => setArchiveTarget(null)}
        onConfirm={async () => {
          if (!archiveTarget) return
          try {
            await api.products.archive(archiveTarget.id)
            setArchiveTarget(null)
            await products.reload()
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
            setArchiveTarget(null)
          }
        }}
      />
    </div>
  )
}

function ProductModal({
  product,
  categories,
  groups,
  onClose,
  onSaved
}: {
  product: Product | null
  categories: Category[]
  groups: ModifierGroup[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t, language } = useT()
  const [form, setForm] = useState({
    code: product?.code ?? '',
    nameAr: product?.nameAr ?? '',
    nameFr: product?.nameFr ?? '',
    descriptionAr: product?.descriptionAr ?? '',
    descriptionFr: product?.descriptionFr ?? '',
    image: product?.image ?? '',
    categoryId: String(product?.categoryId ?? categories[0]?.id ?? ''),
    type: product?.type ?? 'main',
    price: centsToInput(product?.priceCents ?? 0),
    cost: centsToInput(product?.costCents ?? 0),
    prepMinutes: String(product?.prepMinutes ?? 10),
    station: product?.station ?? 'hot',
    isAvailable: product?.isAvailable ?? true,
    hasRecipe: product?.hasRecipe ?? false,
    sortOrder: String(product?.sortOrder ?? 0)
  })
  const [variants, setVariants] = useState<ProductVariant[]>(product?.variants ?? [])
  const [modifierGroupIds, setModifierGroupIds] = useState<number[]>(product?.modifierGroups.map((group) => group.id) ?? [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }))

  const addVariant = () =>
    setVariants((current) => [
      ...current,
      {
        id: 0,
        productId: product?.id ?? 0,
        nameAr: '',
        nameFr: '',
        priceDeltaCents: 0,
        isDefault: current.length === 0,
        sortOrder: current.length
      }
    ])

  const pickImage = (file: File | null) => {
    if (!file) return
    if (file.size > 1_500_000) {
      setError(language === 'ar' ? 'حجم الصورة كبير (1.5MB كحد أقصى)' : 'Image trop lourde (max 1.5MB)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => set('image', String(reader.result ?? ''))
    reader.readAsDataURL(file)
  }

  const submit = async () => {
    setError(null)
    if (!form.nameAr.trim() || !form.nameFr.trim() || !form.categoryId) {
      setError(t('common.required'))
      return
    }
    const input: ProductInput = {
      id: product?.id,
      code: form.code.trim() || null,
      nameAr: form.nameAr.trim(),
      nameFr: form.nameFr.trim(),
      descriptionAr: form.descriptionAr.trim() || null,
      descriptionFr: form.descriptionFr.trim() || null,
      image: form.image || null,
      categoryId: Number(form.categoryId),
      type: form.type as ProductInput['type'],
      priceCents: toCents(form.price) ?? 0,
      costCents: toCents(form.cost) ?? 0,
      prepMinutes: Number(form.prepMinutes || '0'),
      station: form.station as ProductInput['station'],
      isAvailable: form.isAvailable,
      hasRecipe: form.hasRecipe,
      sortOrder: Number(form.sortOrder || '0'),
      variants: variants.map((variant, index) => ({
        id: variant.id || undefined,
        nameAr: variant.nameAr,
        nameFr: variant.nameFr,
        priceDeltaCents: variant.priceDeltaCents,
        isDefault: variant.isDefault,
        sortOrder: index
      })),
      modifierGroupIds
    }
    setBusy(true)
    try {
      await api.products.save(input)
      onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={product ? t('common.edit') : t('menu.addProduct')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={busy}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('menu.nameAr')} required>
            <Input value={form.nameAr} onChange={(event) => set('nameAr', event.target.value)} />
          </Field>
          <Field label={t('menu.nameFr')} required>
            <Input value={form.nameFr} onChange={(event) => set('nameFr', event.target.value)} />
          </Field>
          <Field label={t('common.category')} required>
            <Select value={form.categoryId} onChange={(event) => set('categoryId', event.target.value)}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{language === 'ar' ? category.nameAr : category.nameFr}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('menu.internalCode')}>
            <Input value={form.code} onChange={(event) => set('code', event.target.value)} />
          </Field>
          <Field label={t('common.type')}>
            <Select value={form.type} onChange={(event) => set('type', event.target.value as typeof form.type)}>
              {PRODUCT_TYPES.map((item) => (
                <option key={item.value} value={item.value}>{item.label[language]}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('menu.station')}>
            <Select value={form.station} onChange={(event) => set('station', event.target.value as typeof form.station)}>
              {STATIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label[language]}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('menu.price')}>
            <Input type="number" min={0} step="1" value={form.price} onChange={(event) => set('price', event.target.value)} />
          </Field>
          <Field label={t('menu.cost')}>
            <Input type="number" min={0} step="1" value={form.cost} onChange={(event) => set('cost', event.target.value)} />
          </Field>
          <Field label={t('menu.prepMinutes')}>
            <Input type="number" min={0} value={form.prepMinutes} onChange={(event) => set('prepMinutes', event.target.value)} />
          </Field>
          <Field label={t('common.value')}>
            <div className="flex items-center gap-4 pt-2">
              <Toggle checked={form.isAvailable} onChange={(value) => set('isAvailable', value)} label={t('menu.available')} />
              <Toggle checked={form.hasRecipe} onChange={(value) => set('hasRecipe', value)} label={t('recipes.title')} />
            </div>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`${t('menu.description')} (AR)`}>
            <Textarea value={form.descriptionAr} onChange={(event) => set('descriptionAr', event.target.value)} className="min-h-[60px]" />
          </Field>
          <Field label={`${t('menu.description')} (FR)`}>
            <Textarea value={form.descriptionFr} onChange={(event) => set('descriptionFr', event.target.value)} className="min-h-[60px]" />
          </Field>
        </div>

        <div>
          <p className="afus-label">{t('menu.image')}</p>
          <div className="flex items-center gap-3">
            {form.image ? (
              <img src={form.image} alt="" className="h-16 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-300 dark:border-slate-700">
                <ImagePlus className="h-5 w-5" />
              </div>
            )}
            <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
              {t('menu.chooseImage')}
              <input type="file" accept="image/*" className="hidden" onChange={(event) => pickImage(event.target.files?.[0] ?? null)} />
            </label>
            {form.image ? (
              <button className="rounded p-1 text-red-500" onClick={() => set('image', '')} title={t('menu.removeImage')}>
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{t('menu.variants')}</p>
            <Button size="sm" variant="secondary" icon={Plus} onClick={addVariant}>{t('common.add')}</Button>
          </div>
          {variants.length === 0 ? (
            <p className="text-[11px] text-slate-400">{t('common.none')}</p>
          ) : (
            <div className="space-y-2">
              {variants.map((variant, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_90px_60px_24px] items-center gap-2">
                  <Input
                    value={variant.nameAr}
                    placeholder={t('menu.nameAr')}
                    onChange={(event) => setVariants(variants.map((item, i) => (i === index ? { ...item, nameAr: event.target.value } : item)))}
                  />
                  <Input
                    value={variant.nameFr}
                    placeholder={t('menu.nameFr')}
                    onChange={(event) => setVariants(variants.map((item, i) => (i === index ? { ...item, nameFr: event.target.value } : item)))}
                  />
                  <Input
                    type="number"
                    value={variant.priceDeltaCents / 100}
                    onChange={(event) =>
                      setVariants(
                        variants.map((item, i) =>
                          i === index ? { ...item, priceDeltaCents: Math.round(Number(event.target.value || 0) * 100) } : item
                        )
                      )
                    }
                  />
                  <label className="flex items-center gap-1 text-[10px] text-slate-500">
                    <input
                      type="radio"
                      name="defaultVariant"
                      checked={variant.isDefault}
                      onChange={() => setVariants(variants.map((item, i) => ({ ...item, isDefault: i === index })))}
                    />
                    {t('menu.default')}
                  </label>
                  <button className="rounded p-1 text-red-500" onClick={() => setVariants(variants.filter((_, i) => i !== index))}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <p className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-200">{t('menu.modifierGroups')}</p>
          {groups.length === 0 ? (
            <p className="text-[11px] text-slate-400">{t('common.none')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {groups.map((group) => (
                <label key={group.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs dark:border-slate-700">
                  <input
                    type="checkbox"
                    checked={modifierGroupIds.includes(group.id)}
                    onChange={(event) =>
                      setModifierGroupIds((current) =>
                        event.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id)
                      )
                    }
                    className="h-3.5 w-3.5 rounded"
                  />
                  {language === 'ar' ? group.nameAr : group.nameFr}
                </label>
              ))}
            </div>
          )}
        </div>

        {error ? <p className="text-xs font-medium text-red-600">{errorText(language, error)}</p> : null}
      </div>
    </Modal>
  )
}

function CategoryModal({
  category,
  sortOrder,
  onClose,
  onSaved
}: {
  category: Category | null
  sortOrder: number
  onClose: () => void
  onSaved: () => void
}) {
  const { t, language } = useT()
  const [nameAr, setNameAr] = useState(category?.nameAr ?? '')
  const [nameFr, setNameFr] = useState(category?.nameFr ?? '')
  const [kind, setKind] = useState(category?.kind ?? 'food')
  const [color, setColor] = useState(category?.color ?? '#166534')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      open
      title={category ? t('common.edit') : t('menu.addCategory')}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={busy}
            disabled={!nameAr.trim() || !nameFr.trim()}
            onClick={async () => {
              setBusy(true)
              try {
                await api.categories.save({
                  id: category?.id,
                  nameAr: nameAr.trim(),
                  nameFr: nameFr.trim(),
                  kind: kind as 'food' | 'drink' | 'dessert' | 'other',
                  color,
                  sortOrder: category?.sortOrder ?? sortOrder
                })
                onSaved()
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
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
        <Field label={t('menu.nameAr')} required>
          <Input value={nameAr} onChange={(event) => setNameAr(event.target.value)} autoFocus />
        </Field>
        <Field label={t('menu.nameFr')} required>
          <Input value={nameFr} onChange={(event) => setNameFr(event.target.value)} />
        </Field>
        <Field label={t('common.type')}>
          <Select value={kind} onChange={(event) => setKind(event.target.value)}>
            {CATEGORY_KINDS.map((item) => (
              <option key={item.value} value={item.value}>{item[language]}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.value')}>
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-9 w-16 rounded border border-slate-300 bg-white p-0.5" />
        </Field>
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
      </div>
    </Modal>
  )
}

function GroupModal({
  group,
  onClose,
  onSaved
}: {
  group: ModifierGroup | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useT()
  const [nameAr, setNameAr] = useState(group?.nameAr ?? '')
  const [nameFr, setNameFr] = useState(group?.nameFr ?? '')
  const [minSelect, setMinSelect] = useState(String(group?.minSelect ?? 0))
  const [maxSelect, setMaxSelect] = useState(String(group?.maxSelect ?? 1))
  const [isRequired, setIsRequired] = useState(group?.isRequired ?? false)
  const [modifiers, setModifiers] = useState(
    (group?.modifiers ?? []).map((modifier) => ({
      id: modifier.id,
      nameAr: modifier.nameAr,
      nameFr: modifier.nameFr,
      price: centsToInput(modifier.priceCents),
      isActive: modifier.isActive
    }))
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      open
      title={group ? t('common.edit') : t('menu.addGroup')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={busy}
            disabled={!nameAr.trim() || !nameFr.trim()}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await api.modifierGroups.save({
                  id: group?.id,
                  nameAr: nameAr.trim(),
                  nameFr: nameFr.trim(),
                  minSelect: Number(minSelect || '0'),
                  maxSelect: Number(maxSelect || '0'),
                  isRequired,
                  sortOrder: group?.sortOrder ?? 0,
                  modifiers: modifiers
                    .filter((modifier) => modifier.nameAr.trim() && modifier.nameFr.trim())
                    .map((modifier, index) => ({
                      id: modifier.id ? modifier.id : undefined,
                      nameAr: modifier.nameAr.trim(),
                      nameFr: modifier.nameFr.trim(),
                      priceCents: toCents(modifier.price) ?? 0,
                      isActive: modifier.isActive,
                      sortOrder: index
                    }))
                })
                onSaved()
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('menu.nameAr')} required>
            <Input value={nameAr} onChange={(event) => setNameAr(event.target.value)} autoFocus />
          </Field>
          <Field label={t('menu.nameFr')} required>
            <Input value={nameFr} onChange={(event) => setNameFr(event.target.value)} />
          </Field>
          <Field label={t('menu.minSelect')}>
            <Input type="number" min={0} value={minSelect} onChange={(event) => setMinSelect(event.target.value)} />
          </Field>
          <Field label={t('menu.maxSelect')}>
            <Input type="number" min={0} value={maxSelect} onChange={(event) => setMaxSelect(event.target.value)} />
          </Field>
        </div>
        <Toggle checked={isRequired} onChange={setIsRequired} label={t('menu.required')} />

        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{t('menu.options')}</p>
            <Button
              size="sm"
              variant="secondary"
              icon={Plus}
              onClick={() => setModifiers([...modifiers, { id: 0, nameAr: '', nameFr: '', price: '0', isActive: true }])}
            >
              {t('common.add')}
            </Button>
          </div>
          {modifiers.length === 0 ? (
            <p className="text-[11px] text-slate-400">{t('common.none')}</p>
          ) : (
            <div className="space-y-2">
              {modifiers.map((modifier, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_80px_40px_24px] items-center gap-2">
                  <Input
                    value={modifier.nameAr}
                    placeholder={t('menu.nameAr')}
                    onChange={(event) => setModifiers(modifiers.map((item, i) => (i === index ? { ...item, nameAr: event.target.value } : item)))}
                  />
                  <Input
                    value={modifier.nameFr}
                    placeholder={t('menu.nameFr')}
                    onChange={(event) => setModifiers(modifiers.map((item, i) => (i === index ? { ...item, nameFr: event.target.value } : item)))}
                  />
                  <Input
                    type="number"
                    min={0}
                    value={modifier.price}
                    onChange={(event) => setModifiers(modifiers.map((item, i) => (i === index ? { ...item, price: event.target.value } : item)))}
                  />
                  <label className="flex items-center gap-1 text-[10px] text-slate-500">
                    <input
                      type="checkbox"
                      checked={modifier.isActive}
                      onChange={(event) => setModifiers(modifiers.map((item, i) => (i === index ? { ...item, isActive: event.target.checked } : item)))}
                      className="h-3.5 w-3.5 rounded"
                    />
                  </label>
                  <button className="rounded p-1 text-red-500" onClick={() => setModifiers(modifiers.filter((_, i) => i !== index))}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
      </div>
    </Modal>
  )
}
