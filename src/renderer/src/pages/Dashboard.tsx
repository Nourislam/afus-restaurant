import { ArrowUpRight, ClipboardList, PackageX, Receipt, TrendingUp, Wallet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/app'
import { useApi } from '../lib/hooks'
import { formatMoney, formatDate, formatTime } from '../lib/format'
import { orderStatusLabel, orderStatusTone } from '../lib/labels'
import { Badge, Card, ErrorBox, Loading, Money, PageHeader, StatCard } from '../components/ui'
import { api } from '../lib/api'
import { useT } from '../i18n'

export default function Dashboard() {
  const { t, language } = useT()
  const language$ = useAppStore((state) => state.language)
  const currency = useAppStore((state) => state.settings?.currency ?? 'DZD')
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi(() => api.dashboard(), [language$])

  return (
    <section className="space-y-5">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        actions={
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-600 transition hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
            onClick={() => void reload()}
          >
            {t('common.refresh')}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        }
      />

      {error ? <ErrorBox code={error} onRetry={() => void reload()} /> : null}
      {loading && !data ? <Loading /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={t('dashboard.sales')} value={<Money cents={data.salesCents} short />} icon={TrendingUp} tone="brand" />
            <StatCard label={t('dashboard.orders')} value={data.ordersCount} icon={Receipt} tone="blue" />
            <StatCard label={t('dashboard.average')} value={<Money cents={data.averageOrderCents} short />} icon={ClipboardList} tone="purple" />
            <StatCard label={t('dashboard.net')} value={<Money cents={data.netResultCents} short />} icon={Wallet} tone={data.netResultCents >= 0 ? 'positive' : 'danger'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-bold text-ink-800 dark:text-ink-100">{t('dashboard.topProducts')}</h2>
              {data.topProducts.length === 0 ? (
                <p className="py-6 text-center text-xs text-ink-400">{t('common.noData')}</p>
              ) : (
                <ul className="space-y-2">
                  {data.topProducts.map((product) => (
                    <li key={product.productId} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-ink-700 dark:text-ink-200">
                        {language === 'ar' ? product.nameAr : product.nameFr}
                      </span>
                      <span className="flex items-center gap-3 text-ink-400">
                        <span className="num text-xs">×{product.qty}</span>
                        <Money cents={product.revenueCents} short className="text-ink-700 dark:text-ink-200" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-800 dark:text-ink-100">
                <PackageX className="h-4 w-4 text-amber-500" />
                {t('dashboard.lowStock')}
              </h2>
              {data.lowStock.length === 0 ? (
                <p className="py-6 text-center text-xs text-ink-400">{t('common.noData')}</p>
              ) : (
                <ul className="space-y-2">
                  {data.lowStock.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-ink-700 dark:text-ink-200">
                        {language === 'ar' ? item.nameAr : item.nameFr}
                      </span>
                      <Badge tone="warning">
                        <span className="num">{item.stockQty}</span> / <span className="num">{item.minQty}</span> {item.unit}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 dark:border-ink-800">
              <h2 className="text-sm font-bold text-ink-800 dark:text-ink-100">{t('dashboard.recent')}</h2>
              <button className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300" onClick={() => navigate('/tables')}>
                {t('nav.tables')}
              </button>
            </div>
            {data.recentActivity.length === 0 ? (
              <p className="py-8 text-center text-xs text-ink-400">{t('common.noData')}</p>
            ) : (
              <table className="afus-table w-full">
                <tbody>
                  {data.recentActivity.map((order) => (
                    <tr key={order.id}>
                      <td className="font-semibold text-ink-700 dark:text-ink-200">{order.orderNumber}</td>
                      <td>
                        <Badge tone={orderStatusTone(order.status)}>{orderStatusLabel(language, order.status)}</Badge>
                      </td>
                      <td className="text-ink-400">
                        {formatDate(order.createdAt)} · {formatTime(order.createdAt)}
                      </td>
                      <td className="text-end">
                        <Money cents={order.totalCents} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <p className="text-[11px] text-ink-400">
            {formatDate(data.from)} → {formatDate(data.to)} · {formatMoney(data.expensesCents, currency)} {t('dashboard.expenses')}
          </p>
        </>
      ) : null}
    </section>
  )
}
