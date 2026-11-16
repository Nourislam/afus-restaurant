export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'WEAK_PASSWORD'
  | 'ALREADY_INITIALIZED'
  | 'NOT_INITIALIZED'
  | 'INVALID_STATUS'
  | 'INSUFFICIENT_STOCK'
  | 'SESSION_CLOSED'
  | 'CHANNEL_NOT_ALLOWED'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL'

/** Errors that are safe to surface to the renderer with a stable code. */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly details?: unknown

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? code)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/** Convert any thrown value into the envelope-safe `{ code, details }` shape. */
export function toErrorPayload(error: unknown): { code: ErrorCode; details?: unknown } {
  if (isAppError(error)) return { code: error.code, details: error.details }
  /* Anything else is a fault, not a refusal. The screen can only show
     "internal error", so the real cause has to be written down here or it is
     lost — and sql.js throws plain strings, which carry no stack at all. */
  const described = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
  console.error('[afus] unhandled fault:', described)
  /* Written down here and nowhere else: a stack can carry file paths and the
     shop's own data, and the screen has no use for either. */
  return { code: 'INTERNAL' }
}

export function assert(condition: unknown, code: ErrorCode, message?: string): asserts condition {
  if (!condition) throw new AppError(code, message)
}

export function assertFound<T>(value: T | null | undefined, code: ErrorCode = 'NOT_FOUND'): T {
  if (value === null || value === undefined) throw new AppError(code)
  return value
}
