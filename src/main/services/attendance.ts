/** Clock in / clock out per employee. */
import type { AttendanceRow } from '@shared/types'
import { dbAll, dbGet, dbWrite } from '../db/client'
import { AppError } from '../utils/errors'
import { minutesBetween, nowStamp } from '../utils/dates'
import { requireSession } from '../security/session'
import { writeAudit } from './audit'

const SELECT = `SELECT a.id, a.userId, u.fullName AS userName, a.clockIn, a.clockOut, a.minutes, a.note
                  FROM attendance a JOIN users u ON u.id = a.userId`

export function listAttendance(date: string): AttendanceRow[] {
  return dbAll<AttendanceRow>(`${SELECT} WHERE a.clockIn BETWEEN ? AND ? ORDER BY a.clockIn DESC`, [`${date} 00:00:00`, `${date} 23:59:59`])
}

export function openShift(userId: number): AttendanceRow | null {
  return dbGet<AttendanceRow>(`${SELECT} WHERE a.userId = ? AND a.clockOut IS NULL ORDER BY a.id DESC LIMIT 1`, [userId])
}

export function clock(input: { type: 'in' | 'out'; note?: string | null }): AttendanceRow {
  const session = requireSession()
  const open = openShift(session.userId)
  if (input.type === 'in') {
    if (open) throw new AppError('CONFLICT', 'Already clocked in')
    const id = Number(dbWrite('INSERT INTO attendance (userId, clockIn, note) VALUES (?, ?, ?)', [session.userId, nowStamp(), input.note ?? null]).lastInsertRowid)
    writeAudit('attendance.in', 'attendance', id)
    return dbGet<AttendanceRow>(`${SELECT} WHERE a.id = ?`, [id]) as AttendanceRow
  }
  if (!open) throw new AppError('CONFLICT', 'Not clocked in')
  const stamp = nowStamp()
  dbWrite('UPDATE attendance SET clockOut = ?, minutes = ?, note = COALESCE(?, note) WHERE id = ?', [stamp, minutesBetween(open.clockIn, stamp), input.note ?? null, open.id])
  writeAudit('attendance.out', 'attendance', open.id)
  return dbGet<AttendanceRow>(`${SELECT} WHERE a.id = ?`, [open.id]) as AttendanceRow
}
