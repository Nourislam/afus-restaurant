import { useState } from 'react'
import { BarChart3, FileDown, FileText, Printer } from 'lucide-react'
import type { ReportTable } from '@shared/types'
import { api } from '../lib/api'
import { useApi } from '../lib/hooks'
import { addDays, formatMoney, formatNumber, monthStart, todayString, weekStart } from '../lib/format'
import { useT } from '../i18n'
import { useAppStore } from '../store/app'
import { Button, Card, EmptyState, ErrorBox, Field, Input, Loading, PageHeader, Select } from '../components/ui'

const TYPES = ['sales', 'products', 'payments', 'orderTypes', 'expenses', 'waste', 'staff', 'inventory', 'purchases', 'suppliers', 'delivery'] as const
type ReportType = (typeof TYPES)[number]

export default function Reports() {
  const { t, language } = useT()
  const settings = useAppStore((state) => state.settings)
  const can = useAppStore((state) => state.can)
  const currency = settings?.currency ?? 'DZD'
  const [type, setType] = useState<ReportType>('sales')
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayString())
  const [exported, setExported] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const report = useApi<ReportTable>(() => api.reports[type](from, to) as Promise<ReportTable>, [type, from, to])
  const table = report.data

  const doExport = async (format: 'csv' | 'pdf') => {
    setBusy(format)
    setExported(null)
    try {
      const result = await api.reports.export(type, from, to, format)
      setExported(result.filePath)
    } finally {
      setBusy(null)
    }
  }

  const cell = (column: ReportTable['columns'][number], value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') return '—'
    if (column.type === 'money') return formatMoney(Number(value), currency, 0)
    if (column.type === 'percent') return `${(Number(value) / 100).toFixed(1)} %`
    if (column.type === 'number') return formatNumber(Number(value), Number.isInteger(Number(value)) ? 0 : 2)
    return String(value)
  }
  const numeric = (column: ReportTable['columns'][number]) => column.type === 'money' || column.type === 'number' || column.type === 'percent'

  return (
    <section className="space-y-4">
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={
          can('reports.export') ? (
            <div className="flex gap-2">
              <Button variant="secondary" icon={FileDown} loading={busy === 'csv'} onClick={() => void doExport('csv')}>CSV</Button>
              <Button variant="secondary" icon={Printer} loading={busy === 'pdf'} onClick={() => void doExport('pdf')}>PDF</Button>
            </div>
          ) : undefined
        }
      />

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-end">
          <Field label={t('reports.type')}>
            <Select value={type} onChange={(event) => setType(event.target.value as ReportType)}>
              {TYPES.map((item) => (
                <option key={item} value={item}>{t(`reports.${item}`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.from')}>
            <Input type="date" dir="ltr" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label={t('common.to')}>
            <Input type="date" dir="ltr" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <div className="flex gap-1">
            <Button variant="secondary" size="sm" onClick={() => { setFrom(todayString()); setTo(todayString()) }}>{t('common.today')}</Button>
            <Button variant="secondary" size="sm" onClick={() => { setFrom(weekStart()); setTo(todayString()) }}>{t('reports.week')}</Button>
            <Button variant="secondary" size="sm" onClick={() => { setFrom(monthStart()); setTo(todayString()) }}>{t('reports.month')}</Button>
            <Button variant="secondary" size="sm" onClick={() => { setFrom(addDays(todayString(), -29)); setTo(todayString()) }}>30j</Button>
          </div>
        </div>
        {exported ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-ink-500">
            <FileText className="h-3.5 w-3.5" /> {t('reports.exported')} <span dir="ltr" className="font-mono">{exported}</span>
          </p>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        {report.loading && !table ? (
          <Loading />
        ) : report.error ? (
          <ErrorBox code={report.error} onRetry={() => void report.reload()} />
        ) : !table || !Array.isArray(table.rows) || table.rows.length === 0 ? (
          <EmptyState icon={BarChart3} title={t('common.noData')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500 dark:bg-ink-900/60">
                <tr>
                  {table.columns.map((column) => (
                    <th key={column.key} className={`px-3 py-2 ${numeric(column) ? 'text-end' : 'text-start'}`}>{column.label[language]}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {table.rows.map((row, index) => (
                  <tr key={index} className="hover:bg-ink-50/60 dark:hover:bg-ink-900/40">
                    {table.columns.map((column) => (
                      <td key={column.key} className={`px-3 py-2 ${numeric(column) ? 'num text-end' : ''}`} dir={column.type === 'date' ? 'ltr' : undefined}>
                        {cell(column, row[column.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {table.totals ? (
                <tfoot className="border-t-2 border-ink-300 bg-ink-50 font-semibold dark:border-ink-600 dark:bg-ink-900/60">
                  <tr>
                    {table.columns.map((column, index) => (
                      <td key={column.key} className={`px-3 py-2 ${numeric(column) ? 'num text-end' : ''}`}>
                        {index === 0 && !(column.key in table.totals!) ? t('reports.total') : column.key in table.totals! ? cell(column, table.totals![column.key]) : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
      </Card>
    </section>
  )
}
