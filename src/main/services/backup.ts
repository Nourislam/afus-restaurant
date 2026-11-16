/** SQLite image backups in the user-data folder. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { shell } from 'electron'
import type { BackupFile } from '@shared/types'
import { databaseFile, exportDatabase, replaceDatabase } from '../db/client'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { appPaths } from '../paths'
import { writeAudit } from './audit'
import { getSettings } from './settings'

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

/**
 * The automatic copy, on the owner's own schedule.
 *
 * When a second folder is configured the copy is written there too. That folder
 * is how a shop gets its data off the machine: point it at a Drive, a OneDrive
 * or a network share and every automatic backup leaves the building. A first
 * party cloud would need an account per shop; a synced folder needs nothing and
 * the owner already understands it.
 */
export function autoBackup(force = false): { made: boolean; copiedTo: string | null } {
  const settings = getSettings()
  if (!force && !settings.autoBackupEnabled) return { made: false, copiedTo: null }

  const existing = listBackups().filter((entry) => entry.kind === 'auto')
  const last = existing[0]
  if (!force && last) {
    const sinceHours = (Date.now() - new Date(last.createdAt.replace(' ', 'T')).getTime()) / 3_600_000
    if (Number.isFinite(sinceHours) && sinceHours < settings.backupIntervalHours) return { made: false, copiedTo: null }
  }

  const result = write('auto-', 'daily')

  /* Keep what the owner asked for, and no more. */
  const keep = Math.max(1, settings.backupKeep)
  for (const old of listBackups().filter((entry) => entry.kind === 'auto').slice(keep)) {
    try {
      unlinkSync(old.path)
    } catch {
      /* a file already gone is not a failure */
    }
  }

  let copiedTo: string | null = null
  const away = settings.backupDir.trim()
  if (away) {
    try {
      if (!existsSync(away)) mkdirSync(away, { recursive: true })
      const target = join(away, result.backupName)
      copyFileSync(result.path, target)
      copiedTo = target
      /* The same retention applies to the copies that left the building. */
      const mine = readdirSync(away)
        .filter((name) => name.startsWith('auto-') && name.endsWith('.sqlite'))
        .sort()
        .reverse()
      for (const name of mine.slice(keep)) {
        try {
          unlinkSync(join(away, name))
        } catch {
          /* ignore */
        }
      }
    } catch (error) {
      /* An unreachable folder must never stop the local backup. */
      console.warn('[afus] off-site backup copy failed:', error)
    }
  }
  writeAudit('backup.auto', 'backup', result.backupName, { copiedTo })
  return { made: true, copiedTo }
}

/** Runs the automatic copy on the owner's interval, for as long as the app lives. */
export function startBackupSchedule(): () => void {
  const tick = (): void => {
    try {
      autoBackup()
    } catch (error) {
      console.warn('[afus] scheduled backup skipped:', error)
    }
  }
  /* Checked hourly; the interval setting decides whether a copy is actually due. */
  const timer = setInterval(tick, 60 * 60 * 1000)
  return () => clearInterval(timer)
}
