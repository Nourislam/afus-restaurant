/**
 * Branches: one restaurant (the tenant) can run several branches. Each branch
 * has its own hours, a manual open/closed switch, phone/address, and optional
 * per-product price / availability overrides on top of the shared core menu.
 * A single-site owner simply has one default branch.
 */
import type { Branch, BranchHours, BranchOverride } from '@shared/types'
import { dbAll, dbGet, dbWrite } from '../db/client'
import { AppError } from '../utils/errors'
import { writeAudit } from './audit'

interface BranchRow {
  id: number
  nameAr: string
  nameFr: string
  address: string | null
  phone: string | null
  hoursJson: string
  isOpen: number
  deliveryNote: string | null
  sortOrder: number
  isActive: number
}

const SELECT = 'SELECT id, nameAr, nameFr, address, phone, hoursJson, isOpen, deliveryNote, sortOrder, isActive FROM branches'

function parseHours(json: string): BranchHours {
  try {
    const parsed = JSON.parse(json) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as BranchHours) : {}
  } catch {
    return {}
  }
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Effective state now: the manual switch must be on, and if hours are set for
 * today the time must fall inside them (overnight ranges like 18:00→02:00 wrap).
 * An empty hours map means "no schedule" — only the manual switch counts.
 */
export function isOpenNow(hours: BranchHours, isOpen: boolean, now: Date = new Date()): boolean {
  if (!isOpen) return false
  if (Object.keys(hours).length === 0) return true
  const key = String(now.getDay()) as keyof BranchHours
  const today = hours[key]
  if (today === undefined) return true // no entry for today → not restricted
  if (today === null) return false // explicitly closed today
  const cur = now.getHours() * 60 + now.getMinutes()
  const open = toMinutes(today.open)
  const close = toMinutes(today.close)
  if (close > open) return cur >= open && cur < close
  // overnight
  return cur >= open || cur < close
}

function map(row: BranchRow): Branch {
  const hours = parseHours(row.hoursJson)
  const isOpen = row.isOpen === 1
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameFr: row.nameFr,
    address: row.address,
    phone: row.phone,
    hours,
    isOpen,
    deliveryNote: row.deliveryNote,
    sortOrder: row.sortOrder,
    isActive: row.isActive === 1,
    openNow: isOpenNow(hours, isOpen)
  }
}

export function listBranches(includeInactive = false): Branch[] {
  return dbAll<BranchRow>(`${SELECT}${includeInactive ? '' : ' WHERE isActive = 1'} ORDER BY sortOrder, id`).map(map)
}

export function getBranch(id: number): Branch {
  const row = dbGet<BranchRow>(`${SELECT} WHERE id = ?`, [id])
  if (!row) throw new AppError('NOT_FOUND', 'Branch not found')
  return map(row)
}

/** Make sure a restaurant always has one branch (the main one). Idempotent. */
export function ensureDefaultBranch(seed: { nameAr: string; nameFr: string; address?: string | null; phone?: string | null }): Branch {
  const existing = dbGet<BranchRow>(`${SELECT} ORDER BY id LIMIT 1`)
  if (existing) return map(existing)
  const result = dbWrite(
    "INSERT INTO branches (nameAr, nameFr, address, phone, hoursJson, isOpen, sortOrder, isActive) VALUES (?, ?, ?, ?, '{}', 1, 0, 1)",
    [seed.nameAr, seed.nameFr, seed.address ?? null, seed.phone ?? null]
  )
  return getBranch(Number(result.lastInsertRowid))
}

export interface SaveBranchInput {
  id?: number
  nameAr: string
  nameFr: string
  address?: string | null
  phone?: string | null
  hours?: BranchHours
  deliveryNote?: string | null
  sortOrder?: number
}

export function saveBranch(input: SaveBranchInput): Branch {
  const nameAr = input.nameAr.trim()
  const nameFr = input.nameFr.trim() || nameAr
  if (!nameAr) throw new AppError('VALIDATION', 'Branch name is required')
  const hoursJson = JSON.stringify(input.hours ?? {})
  if (input.id) {
    getBranch(input.id)
    dbWrite(
      'UPDATE branches SET nameAr = ?, nameFr = ?, address = ?, phone = ?, hoursJson = ?, deliveryNote = ?, sortOrder = ? WHERE id = ?',
      [nameAr, nameFr, input.address ?? null, input.phone ?? null, hoursJson, input.deliveryNote ?? null, input.sortOrder ?? 0, input.id]
    )
    writeAudit('branches.update', 'branch', input.id)
    return getBranch(input.id)
  }
  const count = dbGet<{ n: number }>('SELECT COUNT(*) AS n FROM branches')?.n ?? 0
  const result = dbWrite(
    'INSERT INTO branches (nameAr, nameFr, address, phone, hoursJson, isOpen, deliveryNote, sortOrder, isActive) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1)',
    [nameAr, nameFr, input.address ?? null, input.phone ?? null, hoursJson, input.deliveryNote ?? null, input.sortOrder ?? count]
  )
  writeAudit('branches.create', 'branch', result.lastInsertRowid)
  return getBranch(Number(result.lastInsertRowid))
}

export function setBranchOpen(id: number, isOpen: boolean): Branch {
  getBranch(id)
  dbWrite('UPDATE branches SET isOpen = ? WHERE id = ?', [isOpen ? 1 : 0, id])
  writeAudit(isOpen ? 'branches.open' : 'branches.close', 'branch', id)
  return getBranch(id)
}

export function setBranchActive(id: number, active: boolean): Branch {
  getBranch(id)
  if (!active) {
    const actives = dbGet<{ n: number }>('SELECT COUNT(*) AS n FROM branches WHERE isActive = 1')?.n ?? 0
    if (actives <= 1) throw new AppError('CONFLICT', 'Cannot deactivate the last branch')
  }
  dbWrite('UPDATE branches SET isActive = ? WHERE id = ?', [active ? 1 : 0, id])
  writeAudit(active ? 'branches.activate' : 'branches.deactivate', 'branch', id)
  return getBranch(id)
}

export function listOverrides(branchId: number): BranchOverride[] {
  return dbAll<{ branchId: number; productId: number; priceCents: number | null; isAvailable: number | null }>(
    'SELECT branchId, productId, priceCents, isAvailable FROM branch_product_overrides WHERE branchId = ? ORDER BY productId',
    [branchId]
  ).map((r) => ({
    branchId: r.branchId,
    productId: r.productId,
    priceCents: r.priceCents,
    isAvailable: r.isAvailable === null ? null : r.isAvailable === 1
  }))
}

/** Set a branch override; clearing both fields removes the row (back to inherit). */
export function setOverride(input: { branchId: number; productId: number; priceCents?: number | null; isAvailable?: boolean | null }): BranchOverride | null {
  getBranch(input.branchId)
  const price = input.priceCents === undefined ? null : input.priceCents
  const avail = input.isAvailable === undefined ? null : input.isAvailable
  if (price === null && avail === null) {
    dbWrite('DELETE FROM branch_product_overrides WHERE branchId = ? AND productId = ?', [input.branchId, input.productId])
    return null
  }
  dbWrite(
    `INSERT INTO branch_product_overrides (branchId, productId, priceCents, isAvailable) VALUES (?, ?, ?, ?)
     ON CONFLICT(branchId, productId) DO UPDATE SET priceCents = excluded.priceCents, isAvailable = excluded.isAvailable`,
    [input.branchId, input.productId, price, avail === null ? null : avail ? 1 : 0]
  )
  writeAudit('branches.override', 'branch', input.branchId, { productId: input.productId })
  return { branchId: input.branchId, productId: input.productId, priceCents: price, isAvailable: avail }
}

/** productId → override, for applying on top of the core menu. */
export function overrideMap(branchId: number): Map<number, BranchOverride> {
  return new Map(listOverrides(branchId).map((o) => [o.productId, o]))
}
