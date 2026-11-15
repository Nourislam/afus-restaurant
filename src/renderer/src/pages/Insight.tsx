import { useState } from 'react'
import { AlertTriangle, Clock, Lightbulb, MessageCircleQuestion, PackageSearch, Send, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import type { InsightAnswer } from '@shared/types'
import { api } from '../lib/api'
import { useApi } from '../lib/hooks'
import { formatMoney, formatNumber } from '../lib/format'
import { unitSymbol } from '../lib/labels'
import { useT } from '../i18n'
import { useAppStore } from '../store/app'
import { Badge, Button, Card, EmptyState, ErrorBox, Input, Loading, PageHeader } from '../components/ui'

export default function Insight() {
  const { t, language } = useT()
  const settings = useAppStore((state) => state.settings)
  const currency = settings?.currency ?? 'DZD'
  const overview = useApi(() => api.insight.overview(), [])
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<InsightAnswer | null>(null)
  const [asking, setAsking] = useState(false)

  const ask = async () => {
    const q = question.trim()
    if (!q) return
    setAsking(true)
    try {
      setAnswer(await api.insight.ask(q))
    } finally {
      setAsking(false)
    }
  }

  const name = (row: { nameAr: string; nameFr: string }) => (language === 'ar' ? row.nameAr : row.nameFr)
  const data = overview.data

  return (
    <section className="space-y-4">
      <PageHeader title={t('insight.title')} subtitle={t('insight.subtitle')} />

      <Card className="p-4">
        <p className="afus-label flex items-center gap-2"><MessageCircleQuestion className="h-4 w-4" /> {t('insight.ask')}</p>
        <div className="flex gap-2">
          <Input value={question} placeholder={t('insight.placeholder')} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void ask() }} />
          <Button icon={Send} loading={asking} onClick={() => void ask()}>{t('insight.ask')}</Button>
        </div>
        {answer ? (
          <div className={`mt-3 rounded-lg border p-3 text-sm ${answer.understood ? 'border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-700/40 dark:bg-brand-500/10 dark:text-brand-100' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/40 dark:bg-amber-500/10 dark:text-amber-200'}`}>
            <p className="font-medium">{language === 'ar' ? answer.answerAr : answer.answerFr}</p>
            {answer.data && answer.data.rows.length ? (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr>{answer.data.columns.slice(0, 5).map((c) => <th key={c.key} className="py-1 text-start font-semibold">{c.label[language]}</th>)}</tr></thead>
                  <tbody>
                    {answer.data.rows.slice(0, 6).map((row, i) => (
                      <tr key={i}>{answer.data!.columns.slice(0, 5).map((c) => <td key={c.key} className="py-1">{c.type === 'money' ? formatMoney(Number(row[c.key] ?? 0), currency, 0) : String(row[c.key] ?? '—')}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {overview.loading && !data ? (
        <Loading />
      ) : overview.error ? (
        <ErrorBox code={overview.error} onRetry={() => void overview.reload()} />
      ) : !data ? null : (
        <>
          <Card className="p-4">
            <p className="afus-label flex items-center gap-2"><Sparkles className="h-4 w-4" /> {t('insight.highlights')}</p>
            {data.highlights.length ? (
              <ul className="space-y-2">
                {data.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Badge tone={h.tone === 'positive' ? 'positive' : h.tone === 'warning' ? 'warning' : 'info'}>{h.tone === 'positive' ? '▲' : h.tone === 'warning' ? '!' : 'i'}</Badge>
                    <span className="text-ink-700 dark:text-ink-200">{language === 'ar' ? h.ar : h.fr}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">{t('insight.empty')}</p>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel icon={TrendingUp} title={t('insight.bestProfit')} empty={!data.bestProfit.length} emptyText={t('insight.empty')}>
              {data.bestProfit.map((row, i) => (
                <Row key={i} label={name(row)} value={formatMoney(row.marginCents, currency, 0)} hint={`${(row.marginBp / 100).toFixed(0)} %`} />
              ))}
            </Panel>
            <Panel icon={TrendingDown} title={t('insight.declining')} empty={!data.declining.length} emptyText={t('insight.empty')}>
              {data.declining.map((row, i) => (
                <Row key={i} label={name(row)} value={`${row.changePct} %`} tone="danger" />
              ))}
            </Panel>
            <Panel icon={PackageSearch} title={t('insight.forecast')} empty={!data.forecast.length} emptyText={t('insight.empty')}>
              {data.forecast.map((row) => (
                <Row key={row.ingredientId} label={name(row)} value={`${formatNumber(row.suggestedQty, 2)} ${unitSymbol(row.unit)}`} hint={`${row.daysLeft} ${t('insight.daysLeft')}`} tone={row.daysLeft <= 2 ? 'danger' : 'warning'} />
              ))}
            </Panel>
            <Panel icon={Clock} title={t('insight.peakHours')} empty={!data.peakHours.length} emptyText={t('insight.empty')}>
              {data.peakHours.map((row) => (
                <Row key={row.hour} label={row.hour} value={`${row.orders}`} />
              ))}
            </Panel>
            <Panel icon={AlertTriangle} title={t('insight.wasteTop')} empty={!data.wasteTop.length} emptyText={t('insight.empty')}>
              {data.wasteTop.map((row, i) => (
                <Row key={i} label={name(row)} value={formatMoney(row.wasteCents, currency, 0)} tone="warning" />
              ))}
            </Panel>
            <Panel icon={Lightbulb} title={t('insight.anomalies')} empty={!data.anomalies.length} emptyText={t('insight.empty')}>
              {data.anomalies.map((row) => (
                <Row key={row.date} label={row.date} value={formatMoney(row.salesCents, currency, 0)} hint={`${row.deviationPct > 0 ? '+' : ''}${row.deviationPct} %`} tone={row.deviationPct > 0 ? 'positive' : 'danger'} />
              ))}
            </Panel>
          </div>
        </>
      )}
    </section>
  )
}

function Panel({ icon: Icon, title, empty, emptyText, children }: { icon: typeof Lightbulb; title: string; empty: boolean; emptyText: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="afus-label flex items-center gap-2"><Icon className="h-4 w-4" /> {title}</p>
      {empty ? <EmptyState icon={Icon} title={emptyText} /> : <ul className="divide-y divide-ink-100 dark:divide-ink-800">{children}</ul>}
    </Card>
  )
}

function Row({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'positive' | 'warning' | 'danger' }) {
  const color = tone === 'danger' ? 'text-red-600 dark:text-red-300' : tone === 'warning' ? 'text-amber-600 dark:text-amber-300' : tone === 'positive' ? 'text-accent-700 dark:text-accent-300' : 'text-ink-800 dark:text-ink-100'
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="truncate text-ink-700 dark:text-ink-200">{label}</span>
      <span className="shrink-0 text-end">
        <span className={`num font-semibold ${color}`} dir="ltr">{value}</span>
        {hint ? <span className="block text-[11px] text-ink-400" dir="ltr">{hint}</span> : null}
      </span>
    </li>
  )
}
