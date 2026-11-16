import { useState } from 'react'
import { FileText, Printer, Search } from 'lucide-react'
import type { Invoice } from '@shared/types'
import { api } from '../lib/api'
import { useApi, useDebounced } from '../lib/hooks'
import { formatDate, monthStart, todayString } from '../lib/format'
import { useT } from '../i18n'
import { useAppStore } from '../store/app'
import { Button, Card, Column, DataTable, EmptyState, ErrorBox, Field, Input, Money, PageHeader, SearchInput } from '../components/ui'

export default function InvoicesPage() {
  const { t, language } = useT()
  const settings = useAppStore((state) => state.settings)
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayString())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const query = useDebounced(search, 300)

  const invoices = useApi(() => api.invoices.list({ from, to, search: query || undefined }), [from, to, query])
  const next = useApi(() => api.invoices.next(), [invoices.data?.length])

  const print = async (invoice: Invoice) => {
    setBusy(invoice.id)
    setError(null)
    try {
      const { html } = await api.invoices.document(invoice.id, language)
      await api.print.html(html, settings?.printerName || undefined, false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'UNEXPECTED_ERROR')
    } finally {
      setBusy(null)
    }
  }

  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      header: t('invoices.number'),
      render: (row) => (
        <div className="min-w-0">
          <p className="num truncate font-semibold text-ink-800 dark:text-ink-100" dir="ltr">{row.number}</p>
          <p className="num text-[11px] text-ink-400" dir="ltr">{row.orderNumber}</p>
        </div>
      )
    },
    {
      key: 'buyer',
      header: t('invoices.buyer'),
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-ink-700 dark:text-ink-200">{row.buyerName}</p>
          {row.buyerNif ? <p className="num truncate text-[11px] text-ink-400" dir="ltr">NIF {row.buyerNif}</p> : null}
        </div>
      )
    },
    { key: 'date', header: t('common.date'), render: (row) => <span className="text-xs text-ink-500">{formatDate(row.issuedAt)}</span> },
    { key: 'tax', header: t('invoices.vat'), align: 'end', render: (row) => <Money cents={row.taxCents} className="text-xs" /> },
    { key: 'total', header: t('common.total'), align: 'end', render: (row) => <Money cents={row.totalCents} className="font-semibold" /> },
    {
      key: 'print',
      header: '',
      align: 'end',
      render: (row) => (
        <Button variant="ghost" size="sm" icon={Printer} loading={busy === row.id} onClick={() => void print(row)}>
          {t('common.print')}
        </Button>
      )
    }
  ]

  return (
    <section>
      <PageHeader
        title={t('invoices.title')}
        subtitle={t('invoices.subtitle')}
        actions={
          next.data ? (
            <span className="rounded-lg border border-ink-200 px-2.5 py-1.5 text-[11px] text-ink-500 dark:border-ink-700">
              {t('invoices.nextNumber')}: <strong className="num" dir="ltr">{next.data.number}</strong>
            </span>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-52"><SearchInput value={search} onChange={setSearch} /></div>
          <Field className="w-36"><Input type="date" dir="ltr" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field className="w-36"><Input type="date" dir="ltr" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
        </div>
      </PageHeader>

      {error ? <div className="mb-3"><ErrorBox code={error} /></div> : null}

      <Card className="overflow-hidden">
        <DataTable<Invoice>
          columns={columns}
          rows={invoices.data ?? []}
          keyField={(row) => row.id}
          loading={invoices.loading}
          empty={<EmptyState icon={query ? Search : FileText} title={t('invoices.empty')} hint={t('invoices.emptyHint')} />}
        />
      </Card>
      <p className="mt-3 text-[11px] text-ink-400">{t('invoices.hint')}</p>
    </section>
  )
}
