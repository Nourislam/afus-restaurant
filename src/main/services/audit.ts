/**
 * Audit log, hash-chained: every row stores the previous row's hash and its own
 * sha256 over (prevHash | user | action | entity | id | details | time). Editing
 * or deleting any past row breaks the chain, which fiscal.verifyIntegrity()
 * detects — one of the four guarantees of the publisher attestation.
 */
import { createHash } from 'node:crypto'
import type { AuditRow } from '@shared/types'
import { dbAll, dbGet, dbWrite } from '../db/client'
import { nowStamp } from '../utils/dates'
import { currentUserId } from '../security/session'

export const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

export function auditHash(prevHash: string, userId: number | null, action: string, entity: string, entityId: string | null, details: string | null, createdAt: string): string {
  return sha256([prevHash, userId ?? '', action, entity, entityId ?? '', details ?? '', createdAt].join('|'))
}

/** Write an audit row attributed to an explicit user (used before a session exists). */
export function writeAuditAs(userId: number | null, action: string, entity: string, entityId: string | number | null, details?: unknown): void {
  const prevHash = dbGet<{ hash: string | null }>('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1')?.hash ?? ''
  const createdAt = nowStamp()
  const eid = entityId === null || entityId === undefined ? null : String(entityId)
  const det = details === undefined ? null : JSON.stringify(details)
  const hash = auditHash(prevHash, userId, action, entity, eid, det, createdAt)
  dbWrite(
    'INSERT INTO audit_log (userId, action, entity, entityId, details, createdAt, prevHash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [userId, action, entity, eid, det, createdAt, prevHash, hash]
  )
}

export function writeAudit(action: string, entity: string, entityId: string | number | null, details?: unknown): void {
  writeAuditAs(currentUserId(), action, entity, entityId, details)
}

export function listAudit(): AuditRow[] {
  return dbAll<AuditRow>(
    `SELECT a.id, a.userId, u.fullName AS userName, a.action, a.entity, a.entityId, a.details, a.createdAt
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.userId
      ORDER BY a.id DESC
      LIMIT 500`
  )
}
