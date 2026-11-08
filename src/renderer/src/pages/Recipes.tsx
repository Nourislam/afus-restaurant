import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useT } from '../i18n'
import { formatMoney } from '../lib/format'
import { unitSymbol } from '../lib/labels'
import { useAppStore } from '../store/app'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Loading,
  Money,
  PageHeader,
  Select,
  Textarea
} from '../components/ui'

interface Row {
  ingredientId: string
  qty: string
  note: string
}

export default function RecipesPage() {
  const { t, language } = useT()
  const settings = useAppStore((state) => state.settings)
  const can = useAppStore((state) => state.can)
  const manage = can('recipes.manage')
  const [productId, setProductId] = useState<string>('')
  const [rows, setRows] = useState<Row[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const products = useApi(() => api.products.list({ includeArchived: false }), [])
  const ingredients = useApi(() => api.ingredients.list(false), [])
  const recipe = useApi(() => api.recipes.get(Number(productId)), [productId], { enabled: Boolean(productId) })

  useEffect(() => {
    if (!productId) return
    if (recipe.data) {
      setRows(
        recipe.data.items.map((item) => ({
          ingredientId: String(item.ingredientId),
          qty: String(item.qty),
          note: ''
        }))
      )
    }
  }, [recipe.data, productId])

  const ingredientById = useMemo(
    () => new Map((ingredients.data ?? []).map((ingredient) => [ingredient.id, ingredient])),
    [ingredients.data]
  )

  const currency = settings?.currency ?? 'DZD'
  const salePriceCents = recipe.data?.salePriceCents ?? 0
  const estimatedCost = rows.reduce((sum, row) => {
    const ingredient = ingredientById.get(Number(row.ingredientId))
    if (!ingredient) return sum
    const qty = Number(row.qty || '0')
    const factor = ingredient.baseUnit === 'g' || ingredient.baseUnit === 'ml' ? 1000 : 1
    return sum + Math.round(((ingredient.costMicrosPerBase * factor) / 1_000_000) * qty * 100)
  }, 0)
  const margin = salePriceCents - estimatedCost

  const save = async () => {
    setError(null)
    if (!productId) return
    const items = rows
      .filter((row) => row.ingredientId && Number(row.qty) > 0)
      .map((row) => ({
        ingredientId: Number(row.ingredientId),
        qty: Number(row.qty),
        note: row.note || null
      }))
    if (items.length === 0) {
      setError(t('errors.RECIPE_EMPTY'))
      return
    }
    setBusy(true)
    try {
      await api.recipes.save({ productId: Number(productId), note: note.trim() || null, items })
      setNotice(t('common.saved'))
      await recipe.reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={t('recipes.title')}
        subtitle={t('recipes.subtitle')}
        actions={
          manage && productId ? (
            <Button onClick={save} loading={busy}>{t('recipes.saveRecipe')}</Button>
          ) : null
        }
      />

      {error ? <div className="mb-3"><ErrorBox code={error} /></div> : null}
      {notice ? <div className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800 dark:bg-brand-900/30 dark:text-brand-200">{notice}</div> : null}

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('recipes.selectProduct')} className="min-w-[260px] flex-1">
            <Select value={productId} onChange={(event) => setProductId(event.target.value)}>
              <option value="">—</option>
              {(products.data ?? []).map((product) => (
                <option key={product.id} value={product.id}>
                  {language === 'ar' ? product.nameAr : product.nameFr} · {formatMoney(product.priceCents, currency, 0)}
                </option>
              ))}
            </Select>
          </Field>
          {recipe.data ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="brand">{t('menu.price')}: {formatMoney(recipe.data.salePriceCents, currency, 0)}</Badge>
              <Badge tone="amber">{t('recipes.recipeCost')}: {formatMoney(recipe.data.totalCostCents, currency, 0)}</Badge>
              <Badge tone={margin >= 0 ? 'brand' : 'red'}>{t('recipes.margin')}: {formatMoney(recipe.data.marginCents, currency, 0)} ({Math.round(recipe.data.marginBp / 100)}%)</Badge>
            </div>
          ) : null}
        </div>
      </Card>

      {!productId ? (
        <Card>
          <EmptyState icon={ClipboardList} title={t('recipes.selectProduct')} hint={t('recipes.note')} />
        </Card>
      ) : recipe.loading && !recipe.data ? (
        <Loading />
      ) : recipe.error ? (
        <ErrorBox code={recipe.error} onRetry={() => void recipe.reload()} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{t('recipes.ingredients')}</h2>
              {manage ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Plus}
                  onClick={() => setRows([...rows, { ingredientId: '', qty: '1', note: '' }])}
                >
                  {t('recipes.addIngredient')}
                </Button>
              ) : null}
            </div>

            {rows.length === 0 ? (
              <EmptyState title={t('recipes.noRecipe')} hint={t('recipes.note')} />
            ) : (
              <div className="space-y-2">
                {rows.map((row, index) => {
                  const ingredient = ingredientById.get(Number(row.ingredientId))
                  const qty = Number(row.qty || '0')
                  const factor = ingredient && (ingredient.baseUnit === 'g' || ingredient.baseUnit === 'ml') ? 1000 : 1
                  const cost = ingredient ? Math.round(((ingredient.costMicrosPerBase * factor) / 1_000_000) * qty * 100) : 0
                  return (
                    <div key={index} className="grid grid-cols-[1fr_90px_70px_1fr_28px] items-center gap-2">
                      <Select
                        value={row.ingredientId}
                        onChange={(event) => setRows(rows.map((item, i) => (i === index ? { ...item, ingredientId: event.target.value } : item)))}
                      >
                        <option value="">—</option>
                        {(ingredients.data ?? []).map((item) => (
                          <option key={item.id} value={item.id}>
                            {language === 'ar' ? item.nameAr : item.nameFr} ({item.stockQty} {unitSymbol(item.unit)})
                          </option>
                        ))}
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        step="0.001"
                        value={row.qty}
                        onChange={(event) => setRows(rows.map((item, i) => (i === index ? { ...item, qty: event.target.value } : item)))}
                      />
                      <span className="text-[11px] text-slate-400">{ingredient ? unitSymbol(ingredient.unit) : '—'}</span>
                      <Money cents={cost} className="text-xs text-slate-500" />
                      <button className="rounded p-1 text-red-500" onClick={() => setRows(rows.filter((_, i) => i !== index))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-4">
              <Field label={t('common.notes')}>
                <Textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-[52px] text-xs" />
              </Field>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">{t('recipes.note')}</p>
          </Card>

          <Card className="h-fit p-4">
            <h2 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">{t('menu.cost')}</h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">{t('recipes.recipeCost')}</span><Money cents={estimatedCost} className="font-semibold" /></div>
              <div className="flex justify-between"><span className="text-slate-500">{t('menu.price')}</span><Money cents={salePriceCents} /></div>
              <div className={`flex justify-between border-t border-dashed border-slate-200 pt-2 font-bold dark:border-slate-700 ${margin >= 0 ? 'text-brand-700 dark:text-brand-300' : 'text-red-600'}`}>
                <span>{t('recipes.margin')}</span>
                <span className="num" dir="ltr">{formatMoney(margin, currency, 0)}</span>
              </div>
              <p className="text-[10px] text-slate-400">
                {salePriceCents > 0 ? `${Math.round((margin / salePriceCents) * 100)}%` : '—'}
              </p>
            </div>
            {!recipe.data?.hasRecipe && recipe.data ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-700 dark:bg-amber-500/10">{t('recipes.noRecipe')}</p>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  )
}
