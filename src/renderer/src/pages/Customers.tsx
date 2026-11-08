import { useState } from 'react'
import { Users } from 'lucide-react'
import type { Customer } from '@shared/types'
import { api } from '../lib/api'
import { useApi } from '../lib/hooks'
import { formatDate, formatMoney } from '../lib/format'
import { useT } from '../i18n'
import { Card, DataTable, EmptyState, Money, PageHeader, SearchInput } from '../components/ui'

export default function Customers() {
  const { t, language } = useT()
  const [search, setSearch] = useState('')
  const { data, loading, error } = useApi(() => api.customers.list({ search: search || undefined }), [search])
  const customers = data ?? []

  return (
    <section className="space-y-4">
      <PageHeader title={t('nav.customers')} subtitle={t('nav.customers')} />
      <Card className="p-3">
        <div className="w-64">
          <SearchInput value={search} onChange={setSearch} />
        </div>
      </Card>
      <Card className="overflow-hidden">
        <DataTable<Customer>
          rows={customers}
          keyField={(row) => row.id}
          loading={loading}
          empty={<EmptyState icon={Users} title={error ?? t('common.noData')} />}
          columns={[
            {
              key: 'name',
              header: t('common.name'),
              render: (row) => (
                <div>
                  <p className="font-semibold text-ink-800 dark:text-ink-100">{row.name}</p>
                  <p className="text-[11px] text-ink-400" dir="ltr">
                    {row.phone ?? '—'}
                  </p>
                </div>
              )
            },
            {
              key: 'orders',
              header: t('dashboard.orders'),
              render: (row) => <span className="num">{row.orderCount}</span>
            },
            {
              key: 'spent',
              header: t('common.total'),
              align: 'end',
              render: (row) => <Money cents={row.totalSpentCents} />
            },
            {
              key: 'last',
              header: t('common.date'),
              align: 'end',
              render: (row) => (
                <span className="text-xs text-ink-400">{row.lastOrderAt ? formatDate(row.lastOrderAt) : '—'}</span>
              )
            }
          ]}
        />
      </Card>
      {error ? (
        <p className="text-xs text-ink-400">
          {language === 'ar' ? 'تعذّر تحميل الزبائن' : 'Impossible de charger les clients'} · {formatMoney(0)}
        </p>
      ) : null}
    </section>
  )
}
