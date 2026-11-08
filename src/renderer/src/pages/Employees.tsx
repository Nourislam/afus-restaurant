import { useEffect, useMemo, useState } from 'react'
import { KeyRound, Plus, ShieldCheck, UserCheck, UserX } from 'lucide-react'
import type { RoleRow, UserRow } from '@shared/types'
import { api } from '../lib/api'
import { useApi } from '../lib/hooks'
import { formatDate } from '../lib/format'
import { errorText, localized, useT } from '../i18n'
import { useAppStore } from '../store/app'
import { Badge, Button, Card, DataTable, ErrorBox, Field, Input, Modal, PageHeader, Select } from '../components/ui'

interface FormState {
  id?: number
  username: string
  fullName: string
  roleId: string
  phone: string
  password: string
}

const EMPTY: FormState = { username: '', fullName: '', roleId: 'waiter', phone: '', password: '' }

export default function Employees() {
  const { t, language } = useT()
  const currentUser = useAppStore((state) => state.user)
  const users = useApi(() => api.users.list(), [])
  const roles = useApi(() => api.users.roles(), [])
  const [form, setForm] = useState<FormState | null>(null)
  const [resetFor, setResetFor] = useState<UserRow | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (users.error) setError(users.error)
  }, [users.error])

  const roleOptions: RoleRow[] = useMemo(() => roles.data ?? [], [roles.data])

  const closeForm = () => {
    setForm(null)
    setError(null)
  }

  const submit = async () => {
    if (!form) return
    setBusy(true)
    setError(null)
    try {
      await api.users.save({
        id: form.id,
        username: form.username.trim(),
        fullName: form.fullName.trim(),
        roleId: form.roleId,
        phone: form.phone.trim() || null,
        password: form.password ? form.password : undefined
      })
      closeForm()
      await users.reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'INTERNAL')
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (row: UserRow) => {
    setError(null)
    try {
      await api.users.setActive(row.id, !row.isActive)
      await users.reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'INTERNAL')
    }
  }

  const submitReset = async () => {
    if (!resetFor) return
    setBusy(true)
    setError(null)
    try {
      await api.users.resetPassword(resetFor.id, resetPassword)
      setResetFor(null)
      setResetPassword('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'INTERNAL')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title={t('employees.title')}
        subtitle={t('employees.subtitle')}
        actions={
          <Button icon={Plus} onClick={() => setForm({ ...EMPTY })}>
            {t('employees.add')}
          </Button>
        }
      />

      {error ? <ErrorBox code={error} onRetry={() => void users.reload()} /> : null}

      <Card className="overflow-hidden">
        <DataTable<UserRow>
          rows={users.data ?? []}
          keyField={(row) => row.id}
          loading={users.loading && !users.data}
          columns={[
            {
              key: 'name',
              header: t('common.name'),
              render: (row) => (
                <div>
                  <p className="font-semibold text-ink-800 dark:text-ink-100">{row.fullName}</p>
                  <p className="text-[11px] text-ink-400" dir="ltr">
                    @{row.username}
                  </p>
                </div>
              )
            },
            {
              key: 'role',
              header: t('employees.role'),
              render: (row) => {
                const role = roleOptions.find((entry) => entry.id === row.roleId)
                return (
                  <Badge tone={row.roleId === 'owner' ? 'brand' : 'neutral'}>
                    {role ? localized(language, { ar: role.labelAr, fr: role.labelFr }) : row.roleId}
                  </Badge>
                )
              }
            },
            {
              key: 'status',
              header: t('common.status'),
              render: (row) => (
                <Badge tone={row.isActive ? 'positive' : 'danger'}>
                  {row.isActive ? t('employees.active') : t('employees.inactive')}
                </Badge>
              )
            },
            {
              key: 'lastLogin',
              header: t('employees.lastLogin'),
              render: (row) => <span className="text-xs text-ink-400">{row.lastLoginAt ? formatDate(row.lastLoginAt) : '—'}</span>
            },
            {
              key: 'actions',
              header: t('common.actions'),
              align: 'end',
              render: (row) => (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={KeyRound}
                    title={t('employees.resetPassword')}
                    onClick={() => {
                      setResetFor(row)
                      setResetPassword('')
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={row.isActive ? UserX : UserCheck}
                    title={row.isActive ? t('employees.inactive') : t('employees.active')}
                    disabled={row.id === currentUser?.id}
                    onClick={() => void toggleActive(row)}
                  />
                </div>
              )
            }
          ]}
        />
      </Card>

      <Modal
        open={form !== null}
        title={form?.id ? t('common.edit') : t('employees.add')}
        onClose={closeForm}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              {t('common.cancel')}
            </Button>
            <Button loading={busy} onClick={() => void submit()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('setup.ownerName')} required className="sm:col-span-2">
              <Input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
            </Field>
            <Field label={t('auth.username')} required>
              <Input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} dir="ltr" />
            </Field>
            <Field label={t('employees.role')} required>
              <Select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.id}>
                    {localized(language, { ar: role.labelAr, fr: role.labelFr })}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('common.phone')}>
              <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} dir="ltr" />
            </Field>
            <Field label={t('auth.password')} hint={form.id ? t('common.yes') : t('auth.passwordHint')}>
              <Input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </Field>
            <p className="sm:col-span-2 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-[11px] text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t('setup.securityNote')}
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={resetFor !== null}
        title={t('employees.resetPassword')}
        onClose={() => setResetFor(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetFor(null)}>
              {t('common.cancel')}
            </Button>
            <Button loading={busy} onClick={() => void submitReset()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')} required>
          <Input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} />
        </Field>
        {error ? <p className="mt-2 text-xs text-red-600">{errorText(language, error)}</p> : null}
      </Modal>
    </section>
  )
}
