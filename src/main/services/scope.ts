/**
 * Who may see which branch's figures.
 *
 * Head office (`users.branchId` is null) sees every branch and may compare them.
 * Someone attached to a branch sees only that branch — and the rule lives here,
 * in the services, never in the screens: a branch manager who reaches a channel
 * directly still gets their own branch and nothing else.
 */
import { dbGet } from '../db/client'
import { currentUserId } from '../security/session'
import { getSettings } from './settings'

/** The branch the signed-in person is tied to, or null for head office. */
export function userBranchId(): number | null {
  const id = currentUserId()
  if (!id) return null
  return dbGet<{ branchId: number | null }>('SELECT branchId FROM users WHERE id = ?', [id])?.branchId ?? null
}

export const isHeadOffice = (): boolean => userBranchId() === null

/**
 * The branch a report must actually run for. A branch user's choice is
 * **overridden** rather than refused, so no screen can leak another branch.
 * Head office keeps its choice: a branch, or null for all of them.
 */
export function resolveBranchFilter(asked: number | null | undefined): number | null {
  const own = userBranchId()
  if (own !== null) return own
  return asked ?? null
}

/** The branch a new sale belongs to: this terminal's, or the seller's own. */
export function terminalBranchId(): number | null {
  return userBranchId() ?? getSettings().currentBranchId ?? null
}

/** `AND o.branchId = ?` when a branch is in force, with its parameter. */
export function branchClause(branchId: number | null, alias = 'o'): { sql: string; params: number[] } {
  return branchId === null ? { sql: '', params: [] } : { sql: ` AND ${alias}.branchId = ?`, params: [branchId] }
}
