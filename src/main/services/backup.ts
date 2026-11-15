/** SQLite image backups in the user-data folder. */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { shell } from 'electron'
import type { BackupFile } from '@shared/types'
import { databaseFile, exportDatabase, replaceDatabase } from '../db/client'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { appPaths } from '../paths'
import { writeAudit } from './audit'

const SAFE = /^[A-Za-z0-9؀-ۿ _.-]{1,60}$/

function dir(): string {
  const path = appPaths().backups
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
  return path
}

function kindOf(name: string): BackupFile['kind'] {
  if (name.startsWith('auto-')) return 'auto'
  if (name.startsWith('pre-restore-')) return 'pre-restore'
  return 'manual'
}

export function listBackups(): BackupFile[] {
  return readdirSync(dir())
    .filter((name) => name.endsWith('.sqlite'))
    .map((name) => {
      const path = join(dir(), name)
      const stat = statSync(path)
      return { name, path, sizeBytes: stat.size, createdAt: nowStamp(stat.mtime), kind: kindOf(name) }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function write(prefix: string, label: string): { backupName: string; path: string } {
  const safe = label.trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 40) || 'backup'
  const backupName = `${prefix}${safe}-${nowStamp().replace(/[: ]/g, '-')}.sqlite`
  const path = join(dir(), backupName)
  writeFileSync(path, exportDatabase())
  return { backupName, path }
}

export function createBackup(name: string): { backupName: string; path: string } {
  if (!SAFE.test(name)) throw new AppError('VALIDATION', 'Backup name')
  const result = write('', name)
  writeAudit('backup.create', 'backup', result.backupName)
  return result
}

function resolve(name: string): string {
  if (name !== basename(name) || !name.endsWith('.sqlite')) throw new AppError('VALIDATION', 'Backup name')
  const path = join(dir(), name)
  if (!existsSync(path)) throw new AppError('NOT_FOUND')
  return path
}

export async function restoreBackup(name: string): Promise<{ restored: boolean }> {
  const path = resolve(name)
  const bytes = readFileSync(path)
  write('pre-restore-', 'before-restore')
  await replaceDatabase(new Uint8Array(bytes), databaseFile())
  writeAudit('backup.restore', 'backup', name)
  return { restored: true }
}

export function deleteBackup(name: string): { deleted: boolean } {
  unlinkSync(resolve(name))
  writeAudit('backup.delete', 'backup', name)
  return { deleted: true }
}

export function revealBackup(path: string): string {
  const target = path.startsWith(dir()) ? path : join(dir(), basename(path))
  if (existsSync(target)) shell.showItemInFolder(target)
  else shell.openPath(dir()).catch(() => undefined)
  return target
}

/** Daily automatic copy, called at startup; keeps the last 14. */
export function autoBackup(): void {
  const todayKey = nowStamp().slice(0, 10)
  const existing = listBackups().filter((b) => b.kind === 'auto')
  if (existing.some((b) => b.name.includes(todayKey))) return
  write('auto-', 'daily')
  for (const old of existing.slice(13)) {
    try {
      unlinkSync(old.path)
    } catch {
      /* ignore */
    }
  }
}
