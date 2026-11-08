import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '../utils/errors'
import { MIGRATIONS, SCHEMA_VERSION } from './schema'

export type Params = SqlValue[]

let handle: Database | null = null
let databasePath: string | null = null
let wasmBinary: ArrayBuffer | null = null

/** Locate sql-wasm.wasm without relying on `require` (works in ESM and CJS builds). */
function resolveWasm(): ArrayBuffer {
  if (wasmBinary) return wasmBinary
  const candidates = [
    process.env.AFUS_SQL_WASM,
    join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    join(process.cwd(), '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const buffer = readFileSync(candidate)
      wasmBinary = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
      return wasmBinary
    }
  }
  throw new AppError('INTERNAL', 'sql-wasm.wasm not found')
}

/** Open (or create) the database. Pass `null` for an isolated in-memory database. */
export async function openDatabase(filePath: string | null): Promise<Database> {
  if (handle) return handle
  const SQL = await initSqlJs({ wasmBinary: resolveWasm() })
  const bytes = filePath && existsSync(filePath) ? readFileSync(filePath) : undefined
  handle = bytes ? new SQL.Database(bytes) : new SQL.Database()
  databasePath = filePath
  handle.run('PRAGMA foreign_keys = ON;')
  handle.run('PRAGMA journal_mode = MEMORY;')
  migrate()
  return handle
}

export function isOpen(): boolean {
  return handle !== null
}

export function getDb(): Database {
  if (!handle) throw new AppError('NOT_INITIALIZED', 'Database is not open')
  return handle
}

export function databaseFile(): string | null {
  return databasePath
}

function migrate(): void {
  const db = getDb()
  const result = db.exec('PRAGMA user_version;')
  const version = Number(result[0]?.values[0]?.[0] ?? 0)
  for (let next = version + 1; next <= SCHEMA_VERSION; next += 1) {
    const sql = MIGRATIONS[next]
    if (!sql) throw new AppError('INTERNAL', `Missing migration ${next}`)
    db.exec('BEGIN')
    try {
      db.exec(sql)
      db.exec(`PRAGMA user_version = ${next};`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  persist()
}

/** Durably write the in-memory image to disk (atomic tmp+rename). */
export function persist(): void {
  if (!databasePath || !handle) return
  const bytes = handle.export()
  const temporary = `${databasePath}.tmp`
  writeFileSync(temporary, bytes)
  renameSync(temporary, databasePath)
}

export function closeDatabase(): void {
  if (handle && databasePath) persist()
  handle?.close()
  handle = null
  databasePath = null
}

export function dbAll<T>(sql: string, params: Params = []): T[] {
  const statement = getDb().prepare(sql)
  try {
    if (params.length > 0) statement.bind(params)
    const rows: T[] = []
    while (statement.step()) rows.push(statement.getAsObject() as unknown as T)
    return rows
  } finally {
    statement.free()
  }
}

export function dbGet<T>(sql: string, params: Params = []): T | null {
  const rows = dbAll<T>(sql, params)
  return rows.length > 0 ? (rows[0] as T) : null
}

export interface RunResult {
  changes: number
  lastInsertRowid: number
}

export function dbRun(sql: string, params: Params = []): RunResult {
  const db = getDb()
  db.run(sql, params)
  const changes = db.getRowsModified()
  const idRows = db.exec('SELECT last_insert_rowid() AS id;')
  const lastInsertRowid = Number(idRows[0]?.values[0]?.[0] ?? 0)
  return { changes, lastInsertRowid }
}

/** Run `work` inside a transaction; rolls back on any throw. Commits persist to disk. */
export function transaction<T>(work: () => T): T {
  const db = getDb()
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec('COMMIT')
    persist()
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/** Mutating helper: one statement plus persistence. */
export function dbWrite(sql: string, params: Params = []): RunResult {
  const result = dbRun(sql, params)
  persist()
  return result
}

export function exportDatabase(): Uint8Array {
  return getDb().export()
}

/** Replace the live database from a file image (restore) and migrate it forward. */
export async function replaceDatabase(bytes: Uint8Array, filePath: string | null): Promise<void> {
  handle?.close()
  handle = null
  const SQL = await initSqlJs({ wasmBinary: resolveWasm() })
  handle = new SQL.Database(bytes)
  databasePath = filePath
  handle.run('PRAGMA foreign_keys = ON;')
  migrate()
  persist()
}
