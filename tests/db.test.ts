import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  dbAll,
  dbGet,
  dbRun,
  exportDatabase,
  openDatabase,
  persist,
  transaction
} from '../src/main/db/client'
import { seedCoreData, seedStarterCatalog } from '../src/main/db/seed'
import { SCHEMA_VERSION } from '../src/main/db/schema'
import { ROLE_DEFINITIONS } from '../src/shared/permissions'

const tables = (): string[] =>
  dbAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((row) => row.name)

beforeEach(async () => {
  closeDatabase()
  await openDatabase(null)
  seedCoreData()
})

afterEach(() => {
  closeDatabase()
})

describe('database bootstrap', () => {
  it('creates the schema and records the migration version', () => {
    const version = dbGet<{ user_version: number }>('PRAGMA user_version;')
    expect(version?.user_version).toBe(SCHEMA_VERSION)
    expect(tables()).toEqual(
      expect.arrayContaining([
        'users',
        'roles',
        'settings',
        'orders',
        'order_items',
        'order_payments',
        'ingredients',
        'recipes',
        'purchases',
        'audit_log'
      ])
    )
  })

  it('enables foreign keys', () => {
    expect(dbGet<{ foreign_keys: number }>('PRAGMA foreign_keys;')?.foreign_keys).toBe(1)
  })

  it('is idempotent when seed runs twice', () => {
    seedCoreData()
    const roles = dbAll<{ id: string }>('SELECT id FROM roles')
    expect(roles).toHaveLength(ROLE_DEFINITIONS.length)
    expect(dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM settings')?.count).toBeGreaterThan(0)
  })
})

describe('queries', () => {
  it('binds parameters instead of interpolating them', () => {
    dbRun('INSERT INTO roles (id, labelAr, labelFr, permissions) VALUES (?, ?, ?, ?)', [
      "weird'role",
      'اسم',
      "Nom 'test'",
      '[]'
    ])
    expect(dbGet<{ labelFr: string }>('SELECT labelFr FROM roles WHERE id = ?', ["weird'role"])?.labelFr).toBe(
      "Nom 'test'"
    )
  })

  it('returns camelCase columns so rows map directly to domain types', () => {
    const row = dbAll<Record<string, unknown>>('SELECT 1 AS someColumn, 2 AS anotherColumn')[0]
    expect(row).toEqual({ someColumn: 1, anotherColumn: 2 })
  })

  it('enforces foreign keys', () => {
    expect(() =>
      dbRun('INSERT INTO users (username, fullName, roleId, passwordHash, isActive, createdAt) VALUES (?, ?, ?, ?, 1, ?)', [
        'ghost',
        'Ghost',
        'missing-role',
        'x',
        '2026-01-01 00:00:00'
      ])
    ).toThrow()
  })

  it('enforces CHECK constraints', () => {
    const category = dbRun('INSERT INTO categories (nameAr, nameFr) VALUES (?, ?)', ['أ', 'A'])
    expect(() =>
      dbRun('INSERT INTO products (nameAr, nameFr, categoryId, priceCents) VALUES (?, ?, ?, ?)', [
        'أ',
        'A',
        category.lastInsertRowid,
        -1
      ])
    ).toThrow()
  })

  it('reports the rows changed by a write', () => {
    const result = dbRun('UPDATE roles SET labelFr = ? WHERE id = ?', ['Propriétaire', 'owner'])
    expect(result.changes).toBe(1)
  })
})

describe('transactions', () => {
  it('rolls back every statement when the work throws', () => {
    expect(() =>
      transaction(() => {
        dbRun('INSERT INTO categories (nameAr, nameFr) VALUES (?, ?)', ['مؤقت', 'Temporaire'])
        throw new Error('boom')
      })
    ).toThrow('boom')
    expect(dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM categories')?.count).toBe(0)
  })

  it('commits when the work succeeds', () => {
    transaction(() => {
      dbRun('INSERT INTO categories (nameAr, nameFr) VALUES (?, ?)', ['مشاوي', 'Grillades'])
    })
    expect(dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM categories')?.count).toBe(1)
  })
})

describe('in-memory persistence', () => {
  it('keeps data in memory without touching disk', () => {
    seedStarterCatalog()
    expect(dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM products')?.count).toBe(6)
    persist()
    expect(exportDatabase().byteLength).toBeGreaterThan(0)
  })

  it('seeds the starter catalogue once', () => {
    seedStarterCatalog()
    seedStarterCatalog()
    expect(dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM categories')?.count).toBe(3)
    expect(dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM dining_tables')?.count).toBe(6)
  })
})
