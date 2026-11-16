import { Navigate, useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Permission } from '@shared/permissions'
import { allows, homePathFor } from '../lib/navigation'
import { useAppStore } from '../store/app'
import { useT } from '../i18n'
import { Button, EmptyState } from './ui'

/**
 * A screen nobody may open must say so, not open and then fail.
 *
 * Without this a cook who lands on the dashboard sees the program fire a
 * channel it is not allowed to call, and gets a raw error instead of an answer.
 */
export function Protected({ permission, children }: { permission?: Permission | Permission[]; children: ReactNode }) {
  const { t } = useT()
  const navigate = useNavigate()
  const permissions = useAppStore((state) => state.user?.permissions) ?? []
  if (allows(permissions, permission)) return <>{children}</>

  const home = homePathFor(permissions)
  return (
    <div className="flex h-full items-center justify-center p-8">
      <EmptyState
        icon={Lock}
        title={t('access.denied')}
        hint={t('access.deniedHint')}
        action={
          <Button onClick={() => navigate(home, { replace: true })} variant="secondary">
            {t('access.goHome')}
          </Button>
        }
      />
    </div>
  )
}

/** The screen a person is sent to when they have no business where they asked. */
export function HomeRedirect() {
  const permissions = useAppStore((state) => state.user?.permissions) ?? []
  return <Navigate to={homePathFor(permissions)} replace />
}
