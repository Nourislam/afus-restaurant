import { useEffect, useState } from 'react'
import { CalendarCheck, DatabaseBackup, Download, FileCheck2, FolderOpen, Printer, ReceiptText, RotateCcw, Save, ShieldCheck, Store, Trash2 } from 'lucide-react'
import type { AppSettings, BackupFile, Branch, FiscalClosure, IntegrityReport, StampBracket } from '@shared/types'
import { PAYMENT_METHOD_LABELS } from '@shared/constants'
import { api } from '../lib/api'
import { useApi } from '../lib/hooks'
import { formatDateTime, formatMoney } from '../lib/format'
import { useT } from '../i18n'
import { useAppStore } from '../store/app'
import { Badge, Button, Card, Confirm, ErrorBox, Field, Input, PageHeader, Select, Spinner, Tabs, Toggle } from '../components/ui'

type SettingsTab = 'shop' | 'receipt' | 'fiscal' | 'backup'

const todayKey = () => new Date().toISOString().slice(0, 10)
const daToCents = (value: string) => Math.max(0, Math.round(Number(value || '0') * 100))
const centsToDa = (cents: number) => String(cents / 100)

export default function Settings() {
  const { t, language, setLanguage } = useT()
  const settings = useAppStore((state) => state.settings)
  const setSettings = useAppStore((state) => state.setSettings)
  const setTheme = useAppStore((state) => state.setTheme)

  const [form, setForm] = useState<AppSettings | null>(settings)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* Four tabs instead of one long scroll: each one fits a screen. */
  const [tab, setTab] = useState<SettingsTab>('shop')

  // Fiscal pack state
  const [report, setReport] = useState<IntegrityReport | null>(null)
  const [closures, setClosures] = useState<FiscalClosure[]>([])
  const [exportRange, setExportRange] = useState({ from: todayKey().slice(0, 8) + '01', to: todayKey() })
  const [exported, setExported] = useState<{ dir: string; count: number } | null>(null)
  const [fiscalBusy, setFiscalBusy] = useState<string | null>(null)

  // Backups
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [backupName, setBackupName] = useState('')
  const [backupBusy, setBackupBusy] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<BackupFile | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BackupFile | null>(null)
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    if (!form && settings) setForm(settings)
  }, [form, settings])

  const branches = useApi<Branch[]>(() => api.branches.list(), [])

  useEffect(() => {
    api.fiscal.closures().then(setClosures).catch(() => setClosures([]))
    api.backup.list().then(setBackups).catch(() => setBackups([]))
  }, [])

  const runBackup = async (key: string, action: () => Promise<void>) => {
    setBackupBusy(key)
    setError(null)
    try {
      await action()
      setBackups(await api.backup.list())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'INTERNAL')
    } finally {
      setBackupBusy(null)
    }
  }

  const patch = (values: Partial<AppSettings>) => setForm((current) => (current ? { ...current, ...values } : current))

  const save = async () => {
    if (!form) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await api.updateSettings({
        restaurantName: form.restaurantName,
        restaurantNameFr: form.restaurantNameFr,
        phone: form.phone,
        address: form.address,
        currency: form.currency,
        taxEnabled: form.taxEnabled,
        taxRateBp: form.taxRateBp,
        receiptFooter: form.receiptFooter,
        paperWidth: form.paperWidth,
        printerName: form.printerName,
        language: form.language,
        theme: form.theme,
        paymentMethods: form.paymentMethods,
        currentBranchId: form.currentBranchId,
        legalName: form.legalName,
        nif: form.nif,
        nis: form.nis,
        rc: form.rc,
        ai: form.ai,
        fiscalAddress: form.fiscalAddress,
        touristClassified: form.touristClassified,
        stampEnabled: form.stampEnabled,
        stampBrackets: form.stampBrackets,
        stampMinCents: form.stampMinCents,
        stampMaxCents: form.stampMaxCents
      })
      setSettings(updated)
      setForm(updated)
      setLanguage(updated.language)
      setTheme(updated.theme)
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'INTERNAL')
    } finally {
      setBusy(false)
    }
  }

  const runFiscal = async (key: string, action: () => Promise<void>) => {
    setFiscalBusy(key)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'INTERNAL')
    } finally {
      setFiscalBusy(null)
    }
  }

  const verify = () => runFiscal('verify', async () => setReport(await api.fiscal.verify()))
  const closePeriod = (kind: 'day' | 'year') =>
    runFiscal(kind, async () => {
      await api.fiscal.closePeriod(kind, kind === 'day' ? todayKey() : todayKey().slice(0, 4))
      setClosures(await api.fiscal.closures())
    })
  const exportFiscal = () =>
    runFiscal('export', async () => {
      const result = await api.fiscal.export(exportRange.from, exportRange.to)
      setExported({ dir: result.dir, count: result.count })
    })
  const printAttestation = () =>
    runFiscal('attestation', async () => {
      const { html } = await api.fiscal.attestation(language)
      await api.print.html(html, form?.printerName || undefined, false)
    })

  const setBracket = (index: number, values: Partial<StampBracket>) =>
    patch({ stampBrackets: form!.stampBrackets.map((bracket, i) => (i === index ? { ...bracket, ...values } : bracket)) })

  if (!form) return <Spinner />

  const touristRateBp = form.touristClassified ? 900 : 1900

  return (
    <section className="space-y-4">
      <PageHeader
        title={t('nav.settings')}
        actions={
          tab === 'backup' ? undefined : (
            <Button icon={Save} loading={busy} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          )
        }
      >
        <Tabs<SettingsTab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'shop', label: t('setup.restaurant'), icon: Store },
            { value: 'receipt', label: t('settings.receiptTab'), icon: ReceiptText },
            { value: 'fiscal', label: t('fiscal.title'), icon: ShieldCheck },
            { value: 'backup', label: t('backup.title'), icon: DatabaseBackup }
          ]}
        />
      </PageHeader>

      {error ? <ErrorBox code={error} /> : null}
      {saved ? (
        <p className="rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-xs font-semibold text-accent-700 dark:border-accent-700/40 dark:bg-accent-500/10 dark:text-accent-300">
          {t('settings.saved')}
        </p>
      ) : null}

      {tab === 'shop' ? (
      <div className="max-w-3xl">
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-bold text-ink-800 dark:text-ink-100">{t('setup.restaurant')}</h2>
          <Field label={t('settings.restaurantName')} required>
            <Input value={form.restaurantName} onChange={(event) => patch({ restaurantName: event.target.value })} />
          </Field>
          <Field label={`${t('settings.restaurantName')} (FR)`}>
            <Input value={form.restaurantNameFr} onChange={(event) => patch({ restaurantNameFr: event.target.value })} dir="ltr" />
          </Field>
          <Field label={t('settings.phone')}>
            <Input value={form.phone} onChange={(event) => patch({ phone: event.target.value })} dir="ltr" />
          </Field>
          <Field label={t('settings.address')}>
            <Input value={form.address} onChange={(event) => patch({ address: event.target.value })} />
          </Field>
          {(branches.data?.length ?? 0) > 0 ? (
            <Field label={t('branch.terminal')} hint={t('branch.terminalHint')}>
              <Select
                value={form.currentBranchId ? String(form.currentBranchId) : ''}
                onChange={(event) => patch({ currentBranchId: event.target.value ? Number(event.target.value) : null })}
              >
                <option value="">—</option>
                {(branches.data ?? []).map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {language === 'ar' ? branch.nameAr : branch.nameFr}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label={t('settings.currency')}>
            <Select value={form.currency} onChange={(event) => patch({ currency: event.target.value })}>
              {['DZD', 'EUR', 'USD', 'MAD', 'TND'].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
      </div>
      ) : null}

      {tab === 'receipt' ? (
      <div className="max-w-3xl">
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-bold text-ink-800 dark:text-ink-100">{t('settings.taxEnabled')}</h2>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.taxEnabled}
              onChange={(event) => patch({ taxEnabled: event.target.checked, taxRateBp: form.taxRateBp || touristRateBp })}
              className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-700"
            />
            <span>
              <span className="block text-sm font-semibold text-ink-800 dark:text-ink-100">{t('settings.taxEnabled')}</span>
              <span className="block text-xs text-ink-500">{t('settings.taxHint')}</span>
            </span>
          </label>
          {form.taxEnabled ? (
            <Field label={`${t('settings.taxRate')} %`}>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.taxRateBp / 100}
                onChange={(event) => patch({ taxRateBp: Math.round(Number(event.target.value || '0') * 100) })}
              />
            </Field>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('setup.language')}>
              <Select
                value={form.language}
                onChange={(event) => patch({ language: event.target.value as AppSettings['language'] })}
              >
                <option value="ar">العربية</option>
                <option value="fr">Français</option>
              </Select>
            </Field>
            <Field label={t('settings.theme')}>
              <Select value={form.theme} onChange={(event) => patch({ theme: event.target.value as AppSettings['theme'] })}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </Select>
            </Field>
            <Field label={t('settings.paperWidth')}>
              <Select
                value={form.paperWidth}
                onChange={(event) => patch({ paperWidth: event.target.value as AppSettings['paperWidth'] })}
              >
                <option value="80">80 mm</option>
                <option value="58">58 mm</option>
                <option value="a4">A4</option>
              </Select>
            </Field>
            <Field label={t('settings.printerName')}>
              <Input value={form.printerName} onChange={(event) => patch({ printerName: event.target.value })} dir="ltr" />
            </Field>
          </div>

          <Field label={t('settings.receiptFooter')}>
            <Input value={form.receiptFooter} onChange={(event) => patch({ receiptFooter: event.target.value })} />
          </Field>

          <div>
            <p className="afus-label">{t('pos.pay')}</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PAYMENT_METHOD_LABELS).map(([method, label]) => {
                const enabled = form.paymentMethods.includes(method)
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() =>
                      patch({
                        paymentMethods: enabled
                          ? form.paymentMethods.filter((entry) => entry !== method)
                          : [...form.paymentMethods, method]
                      })
                    }
                    className={
                      enabled
                        ? 'rounded-full bg-brand-700 px-3 py-1 text-[11px] font-semibold text-white'
                        : 'rounded-full border border-ink-200 px-3 py-1 text-[11px] font-semibold text-ink-500 dark:border-ink-700'
                    }
                  >
                    {label[language]}
                  </button>
                )
              })}
            </div>
          </div>
        </Card>
      </div>
      ) : null}

      {/* ───────── Fiscal compliance pack ───────── */}
      {tab === 'fiscal' ? (
      <div className="space-y-3">
        <p className="text-xs text-ink-500">{t('fiscal.subtitle')}</p>
        <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h3 className="text-sm font-bold text-ink-800 dark:text-ink-100">{t('fiscal.identity')}</h3>
          <Field label={t('fiscal.legalName')}>
            <Input value={form.legalName} onChange={(event) => patch({ legalName: event.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="NIF">
              <Input value={form.nif} onChange={(event) => patch({ nif: event.target.value.trim() })} dir="ltr" inputMode="numeric" />
            </Field>
            <Field label="NIS">
              <Input value={form.nis} onChange={(event) => patch({ nis: event.target.value.trim() })} dir="ltr" inputMode="numeric" />
            </Field>
            <Field label="RC">
              <Input value={form.rc} onChange={(event) => patch({ rc: event.target.value.trim() })} dir="ltr" />
            </Field>
            <Field label="AI">
              <Input value={form.ai} onChange={(event) => patch({ ai: event.target.value.trim() })} dir="ltr" inputMode="numeric" />
            </Field>
          </div>
          <Field label={t('fiscal.address')}>
            <Input value={form.fiscalAddress} onChange={(event) => patch({ fiscalAddress: event.target.value })} />
          </Field>
          <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
            <Toggle
              checked={form.touristClassified}
              onChange={(value) => patch({ touristClassified: value, taxRateBp: form.taxEnabled ? (value ? 900 : 1900) : form.taxRateBp })}
              label={t('fiscal.tourist')}
            />
            <p className="mt-1 text-xs text-ink-500">{t('fiscal.touristHint')}</p>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h3 className="text-sm font-bold text-ink-800 dark:text-ink-100">{t('fiscal.stamp')}</h3>
          <Toggle checked={form.stampEnabled} onChange={(value) => patch({ stampEnabled: value })} label={t('fiscal.stamp')} />
          <p className="text-xs text-ink-500">{t('fiscal.stampHint')}</p>
          {form.stampEnabled ? (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-start text-[11px] uppercase tracking-wide text-ink-500">
                      <th className="py-1 text-start">{t('fiscal.bracketUpto')}</th>
                      <th className="py-1 text-start">{t('fiscal.bracketRate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.stampBrackets.map((bracket, index) => (
                      <tr key={index}>
                        <td className="py-1 pe-2">
                          {bracket.uptoCents === null ? (
                            <span className="text-ink-500">{t('fiscal.noLimit')}</span>
                          ) : (
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              dir="ltr"
                              value={centsToDa(bracket.uptoCents)}
                              onChange={(event) => setBracket(index, { uptoCents: daToCents(event.target.value) })}
                            />
                          )}
                        </td>
                        <td className="py-1">
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            dir="ltr"
                            value={String(bracket.ratePerHundred)}
                            onChange={(event) => setBracket(index, { ratePerHundred: Math.max(0, Number(event.target.value || '0')) })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('fiscal.stampMin')}>
                  <Input type="number" min="0" dir="ltr" value={centsToDa(form.stampMinCents)} onChange={(event) => patch({ stampMinCents: daToCents(event.target.value) })} />
                </Field>
                <Field label={t('fiscal.stampMax')}>
                  <Input type="number" min="0" dir="ltr" value={centsToDa(form.stampMaxCents)} onChange={(event) => patch({ stampMaxCents: daToCents(event.target.value) })} />
                </Field>
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="space-y-4 p-5">
          <h3 className="text-sm font-bold text-ink-800 dark:text-ink-100">{t('fiscal.integrity')}</h3>
          <div className="flex flex-wrap gap-2">
            <Button icon={ShieldCheck} variant="secondary" loading={fiscalBusy === 'verify'} onClick={() => void verify()}>
              {t('fiscal.verify')}
            </Button>
            <Button icon={CalendarCheck} variant="secondary" loading={fiscalBusy === 'day'} onClick={() => void closePeriod('day')}>
              {t('fiscal.closeDay')}
            </Button>
            <Button icon={CalendarCheck} variant="secondary" loading={fiscalBusy === 'year'} onClick={() => void closePeriod('year')}>
              {t('fiscal.closeYear')}
            </Button>
          </div>
          {report ? (
            <div className="space-y-1 rounded-lg border border-ink-200 p-3 text-xs dark:border-ink-700">
              <div className="flex items-center gap-2">
                <Badge tone={report.ok ? 'positive' : 'danger'}>{report.ok ? t('fiscal.ok') : t('fiscal.broken')}</Badge>
                <span className="text-ink-500">{formatDateTime(report.checkedAt)}</span>
              </div>
              <p dir="ltr" className="text-ink-600 dark:text-ink-300">
                {t('fiscal.sealedSales')}: {report.orders.checked}
                {report.orders.brokenAt !== null ? ` — ${t('fiscal.broken')} #${report.orders.brokenAt}` : ''}
              </p>
              <p dir="ltr" className="text-ink-600 dark:text-ink-300">
                {t('fiscal.auditRows')}: {report.audit.checked}
                {report.audit.brokenAt !== null ? ` — ${t('fiscal.broken')} #${report.audit.brokenAt}` : ''}
              </p>
              {report.orders.headHash ? (
                <p dir="ltr" className="truncate font-mono text-[10px] text-ink-400">
                  {report.orders.headHash}
                </p>
              ) : null}
            </div>
          ) : null}

          {closures.length ? (
            <div>
              <p className="afus-label">{t('fiscal.closures')}</p>
              <ul className="divide-y divide-ink-100 text-xs dark:divide-ink-800">
                {closures.slice(0, 8).map((closure) => (
                  <li key={closure.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="font-semibold text-ink-800 dark:text-ink-100" dir="ltr">
                      {closure.kind === 'day' ? 'Z' : 'A'} · {closure.periodKey}
                    </span>
                    <span className="text-ink-500">
                      {closure.salesCount} {t('fiscal.sales')} · {formatMoney(closure.grossCents, form.currency, 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        <Card className="space-y-4 p-5">
          <h3 className="text-sm font-bold text-ink-800 dark:text-ink-100">{t('fiscal.export')}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('fiscal.from')}>
              <Input type="date" dir="ltr" value={exportRange.from} onChange={(event) => setExportRange({ ...exportRange, from: event.target.value })} />
            </Field>
            <Field label={t('fiscal.to')}>
              <Input type="date" dir="ltr" value={exportRange.to} onChange={(event) => setExportRange({ ...exportRange, to: event.target.value })} />
            </Field>
          </div>
          <Button icon={Download} variant="secondary" loading={fiscalBusy === 'export'} onClick={() => void exportFiscal()}>
            {t('fiscal.export')}
          </Button>
          {exported ? (
            <p className="text-xs text-ink-500">
              {t('fiscal.exported')} <span dir="ltr" className="font-mono">{exported.dir}</span> · {exported.count} {t('fiscal.sales')}
            </p>
          ) : null}

          <div className="border-t border-ink-100 pt-4 dark:border-ink-800">
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink-800 dark:text-ink-100">
              <FileCheck2 className="h-4 w-4" aria-hidden />
              {t('fiscal.attestation')}
            </h3>
            <p className="mb-3 mt-1 text-xs text-ink-500">{t('fiscal.attestationHint')}</p>
            <Button icon={Printer} loading={fiscalBusy === 'attestation'} onClick={() => void printAttestation()}>
              {t('fiscal.print')}
            </Button>
          </div>
        </Card>
        </div>
      </div>
      ) : null}

      {tab === 'backup' ? (
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink-800 dark:text-ink-100">
            <DatabaseBackup className="h-4 w-4 text-brand-700" aria-hidden />
            {t('backup.title')}
          </h2>
          <p className="mt-1 text-xs text-ink-500">{t('backup.hint')}</p>
        </div>
        {restored ? (
          <p className="rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-xs font-semibold text-accent-700 dark:border-accent-700/40 dark:bg-accent-500/10 dark:text-accent-300">{t('backup.restored')}</p>
        ) : null}
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t('backup.name')} className="min-w-[220px] flex-1">
            <Input value={backupName} onChange={(event) => setBackupName(event.target.value)} placeholder={form.restaurantName} />
          </Field>
          <Button
            icon={DatabaseBackup}
            loading={backupBusy === 'create'}
            onClick={() =>
              void runBackup('create', async () => {
                await api.backup.create(backupName.trim() || form.restaurantName || 'backup')
                setBackupName('')
              })
            }
          >
            {t('backup.create')}
          </Button>
        </div>
        {backups.length ? (
          <ul className="divide-y divide-ink-100 text-xs dark:divide-ink-800">
            {backups.slice(0, 12).map((backup) => (
              <li key={backup.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink-800 dark:text-ink-100" dir="ltr">{backup.name}</span>
                  <span className="text-ink-500" dir="ltr">{formatDateTime(backup.createdAt)} · {(backup.sizeBytes / 1024).toFixed(0)} KB</span>
                </span>
                <Badge tone={backup.kind === 'manual' ? 'brand' : backup.kind === 'auto' ? 'neutral' : 'warning'}>{t(`backup.kind.${backup.kind}`)}</Badge>
                <span className="flex gap-1">
                  <Button variant="ghost" size="sm" icon={FolderOpen} onClick={() => void api.backup.reveal(backup.path)}>{t('backup.reveal')}</Button>
                  <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => setRestoreTarget(backup)}>{t('backup.restore')}</Button>
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setDeleteTarget(backup)} aria-label={t('common.delete')} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-400">{t('common.noData')}</p>
        )}
      </Card>
      ) : null}

      <Confirm
        open={Boolean(restoreTarget)}
        title={t('backup.restore')}
        message={`${restoreTarget?.name ?? ''}\n${t('backup.restoreConfirm')}`}
        confirmLabel={t('backup.restore')}
        danger
        loading={backupBusy === 'restore'}
        onClose={() => setRestoreTarget(null)}
        onConfirm={() =>
          void runBackup('restore', async () => {
            if (!restoreTarget) return
            await api.backup.restore(restoreTarget.name)
            setRestoreTarget(null)
            setRestored(true)
          })
        }
      />
      <Confirm
        open={Boolean(deleteTarget)}
        title={t('common.delete')}
        message={`${deleteTarget?.name ?? ''} — ${t('common.confirmDelete')}`}
        confirmLabel={t('common.delete')}
        danger
        loading={backupBusy === 'delete'}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() =>
          void runBackup('delete', async () => {
            if (!deleteTarget) return
            await api.backup.delete(deleteTarget.name)
            setDeleteTarget(null)
          })
        }
      />

      <p className="text-[11px] text-ink-400">{t('setup.localOnly')}</p>
    </section>
  )
}
