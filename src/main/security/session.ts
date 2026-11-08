import type { Permission } from '@shared/permissions'
import { AppError } from '../utils/errors'

export interface Session {
  userId: number
  username: string
  issuedAt: number
}

/**
 * The session lives in the main process only. The renderer can never assert an
 * identity: every channel is authorised from this value, never from IPC payload.
 */
let current: Session | null = null

export function setSession(session: Session | null): void {
  current = session
}

export function clearSession(): void {
  current = null
}

export function getSession(): Session | null {
  return current
}

export function requireSession(): Session {
  if (!current) throw new AppError('UNAUTHENTICATED')
  return current
}

export function currentUserId(): number | null {
  return current?.userId ?? null
}

export function assertPermission(permissions: readonly Permission[], required?: Permission | Permission[]): void {
  if (!required) return
  const list = Array.isArray(required) ? required : [required]
  /* An empty requirement list means "authenticated only". */
  if (list.length === 0) return
  const allowed = list.some((permission) => permissions.includes(permission))
  if (!allowed) throw new AppError('FORBIDDEN')
}
