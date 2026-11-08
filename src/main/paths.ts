import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export interface AppPaths {
  userData: string
  database: string
  backups: string
  reports: string
  webMenu: string
  logs: string
}

let cached: AppPaths | null = null

export function appPaths(): AppPaths {
  if (cached) return cached
  const userData = app.getPath('userData')
  const paths: AppPaths = {
    userData,
    database: join(userData, 'afus.sqlite'),
    backups: join(userData, 'backups'),
    reports: join(userData, 'reports'),
    webMenu: join(userData, 'webmenu'),
    logs: join(userData, 'logs')
  }
  cached = paths
  return paths
}

/** Create every writable directory once, before the database is opened. */
export function ensureDirectories(paths: AppPaths = appPaths()): void {
  for (const directory of [paths.userData, paths.backups, paths.reports, paths.webMenu, paths.logs]) {
    mkdirSync(directory, { recursive: true })
  }
}
