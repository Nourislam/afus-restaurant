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
  return { code: 'INTERNAL' }
}

export function assert(condition: unknown, code: ErrorCode, message?: string): asserts condition {
  if (!condition) throw new AppError(code, message)
}

export function assertFound<T>(value: T | null | undefined, code: ErrorCode = 'NOT_FOUND'): T {
  if (value === null || value === undefined) throw new AppError(code)
  return value
}
