import type { z } from 'zod'
import { CHANNELS, type Channel } from '@shared/channels'
import type { IpcResult } from '@shared/ipc'
import type { Permission } from '@shared/permissions'
import { assertPermission, requireSession } from '../security/session'
import { AppError, toErrorPayload } from '../utils/errors'
import { me } from '../services/auth'

export interface HandlerDef {
  /** Required permission (any of the list). Omit for "authenticated only". */
  permission?: Permission | Permission[]
  allowAnonymous?: boolean
  schema?: z.ZodType
  handler: (payload: never) => unknown | Promise<unknown>
}

const allowed = new Set<string>(CHANNELS)
const definitions = new Map<string, HandlerDef>()

export function register(channel: Channel, definition: HandlerDef): void {
  if (definitions.has(channel)) throw new AppError('INTERNAL', `Channel registered twice: ${channel}`)
  definitions.set(channel, definition)
}

export function registerMany(entries: { channel: Channel; definition: HandlerDef }[]): void {
  for (const entry of entries) register(entry.channel, entry.definition)
}

/** Channels in the shared allowlist that still have no handler (phase 2 surface). */
export function missingChannels(): Channel[] {
  return CHANNELS.filter((channel) => !definitions.has(channel))
}

export function registeredCount(): number {
  return definitions.size
}

export function resetRegistry(): void {
  definitions.clear()
}

export async function dispatch(channel: string, payload: unknown): Promise<IpcResult> {
  try {
    if (!allowed.has(channel)) throw new AppError('CHANNEL_NOT_ALLOWED')
    const definition = definitions.get(channel)
    if (!definition) throw new AppError('NOT_IMPLEMENTED', channel)

    let input: unknown = payload ?? {}
    if (definition.schema) {
      const parsed = definition.schema.safeParse(payload ?? {})
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION',
          undefined,
          parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
        )
      }
      input = parsed.data
    }

    if (!definition.allowAnonymous) {
      requireSession()
      /* Re-read the user so a disabled account or changed role takes effect immediately. */
      const session = me()
      if (!session) throw new AppError('UNAUTHENTICATED')
      assertPermission(session.permissions, definition.permission)
    }

    const data = await definition.handler(input as never)
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: toErrorPayload(error) }
  }
}
