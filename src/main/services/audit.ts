import type { AuditRow } from '@shared/types'
import { dbAll, dbWrite } from '../db/client'
import { nowStamp } from '../utils/dates'
import { currentUserId } from '../security/session'

export function writeAudit(action: string, entity: string, entityId: string | number | null, details?: unknown): void {
  dbWrite('INSERT INTO audit_log (userId, action, entity, entityId, details, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
    currentUserId(),
    action,
    entity,
    entityId === null || entityId === undefined ? null : String(entityId),
    details === undefined ? null : JSON.stringify(details),
    nowStamp()
  ])
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
