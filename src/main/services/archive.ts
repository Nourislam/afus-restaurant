/**
 * Putting a year away. The attestation pack proves the program keeps its
 * records honestly; this proves a finished year can leave the program as one
 * file, be stored anywhere, and still show on opening that nothing moved.
 *
 * The head of the file stays readable on purpose — an inspector holding a
 * folder of archives must see which restaurant and which year each one is
 * without anybody's key. The year itself is sealed.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { dbAll } from '../db/client'
import { AppError } from '../utils/errors'
import { nowStamp } from '../utils/dates'
import { appPaths } from '../paths'
import { sha256, writeAudit } from './audit'
import { getSettings } from './settings'

const FORMAT = 'afus-fiscal-archive'
const VERSION = 1
const KDF = { name: 'scrypt', N: 16384, r: 8, p: 1, keyLength: 32 } as const
const CIPHER = 'aes-256-gcm'

export interface ArchiveHead {
  format: string
  version: number
  year: number
  createdAt: string
  restaurant: { name: string; legalName: string; nif: string; nis: string; rc: string; ai: string }
  counts: { sales: number; auditRows: number; closures: number }
  payloadSha256: string
}

export interface ArchiveFile extends ArchiveHead {
  name: string
  path: string
  sizeBytes: number
}

export interface ArchiveReport {
  ok: boolean
  year: number
  createdAt: string
  counts: { sales: number; auditRows: number; closures: number }
  /** Each question the opening asks, and whether it held. */
  checks: { sealIntact: boolean; payloadHashMatches: boolean; countsMatch: boolean; salesChainIntact: boolean }
  brokenAt: number | null
  problem: string | null
}

function dir(): string {
  const path = join(appPaths().backups, 'fiscal')
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
  return path
}

const deriveKey = (passphrase: string, salt: Buffer): Buffer =>
  scryptSync(passphrase, salt, KDF.keyLength, { N: KDF.N, r: KDF.r, p: KDF.p })

interface Payload {
  sales: Record<string, unknown>[]
  audit: Record<string, unknown>[]
  closures: Record<string, unknown>[]
  identity: Record<string, unknown>
}

function collect(year: number): Payload {
  const from = `${year}-01-01 00:00:00`
  const to = `${year}-12-31 23:59:59`
  const settings = getSettings()
  return {
    sales: dbAll<Record<string, unknown>>(
      `SELECT o.id, o.orderNumber, o.fiscalSeq, o.fiscalHash, o.fiscalPrevHash, o.type, o.status,
              o.subtotalCents, o.discountCents, o.taxCents, o.stampCents, o.totalCents, o.paidCents,
              o.branchId, o.createdAt, o.completedAt, u.fullName AS seller
         FROM orders o LEFT JOIN users u ON u.id = o.userId
        WHERE o.fiscalSeq IS NOT NULL AND o.completedAt BETWEEN ? AND ?
        ORDER BY o.fiscalSeq`,
      [from, to]
    ),
    audit: dbAll<Record<string, unknown>>(
      `SELECT a.id, a.userId, a.action, a.entity, a.entityId, a.details, a.prevHash, a.hash, a.createdAt
         FROM audit_log a WHERE a.createdAt BETWEEN ? AND ? ORDER BY a.id`,
      [from, to]
    ),
    closures: dbAll<Record<string, unknown>>('SELECT * FROM fiscal_closures WHERE periodKey LIKE ? ORDER BY id', [`${year}%`]),
    identity: {
      restaurantName: settings.restaurantName,
      legalName: settings.legalName,
      nif: settings.nif,
      nis: settings.nis,
      rc: settings.rc,
      ai: settings.ai,
      fiscalAddress: settings.fiscalAddress,
      currency: settings.currency,
      taxRateBp: settings.taxRateBp,
      touristClassified: settings.touristClassified
    }
  }
}

/** Seal a finished year into one file. The passphrase is never stored. */
export function archiveYear(year: number, passphrase: string): ArchiveFile {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new AppError('VALIDATION', 'Year')
  if (passphrase.length < 8) throw new AppError('VALIDATION', 'A passphrase of at least 8 characters')
  const payload = collect(year)
  if (payload.sales.length === 0 && payload.audit.length === 0) throw new AppError('NOT_FOUND', 'Nothing recorded that year')

  const settings = getSettings()
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const payloadSha256 = sha256(plaintext.toString('utf8'))

  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = deriveKey(passphrase, salt)
  const cipher = createCipheriv(CIPHER, key, iv)
  const sealed = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

  const envelope = {
    format: FORMAT,
    version: VERSION,
    year,
    createdAt: nowStamp(),
    restaurant: {
      name: settings.restaurantName,
      legalName: settings.legalName,
      nif: settings.nif,
      nis: settings.nis,
      rc: settings.rc,
      ai: settings.ai
    },
    counts: { sales: payload.sales.length, auditRows: payload.audit.length, closures: payload.closures.length },
    kdf: { name: KDF.name, N: KDF.N, r: KDF.r, p: KDF.p, salt: salt.toString('base64') },
    cipher: { name: CIPHER, iv: iv.toString('base64'), tag: tag.toString('base64') },
    payloadSha256,
    payload: sealed.toString('base64')
  }

  const name = `afus-fiscal-${year}.json`
  const path = join(dir(), name)
  writeFileSync(path, JSON.stringify(envelope, null, 2), 'utf8')
  writeAudit('fiscal.archive', 'year', String(year), { sales: payload.sales.length, file: name })
  return { ...envelope, name, path, sizeBytes: statSync(path).size } as ArchiveFile
}

export function listArchives(): ArchiveFile[] {
  return readdirSync(dir())
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const path = join(dir(), name)
      try {
        const head = JSON.parse(readFileSync(path, 'utf8')) as ArchiveHead
        return { ...head, name, path, sizeBytes: statSync(path).size }
      } catch {
        return null
      }
    })
    .filter((entry): entry is ArchiveFile => entry !== null && entry.format === FORMAT)
    .sort((a, b) => b.year - a.year)
}

function resolve(name: string): string {
  if (name !== basename(name) || !name.endsWith('.json')) throw new AppError('VALIDATION', 'Archive name')
  const path = join(dir(), name)
  if (!existsSync(path)) throw new AppError('NOT_FOUND')
  return path
}

/** Open an archive and answer every question it should be asked. */
export function verifyArchive(name: string, passphrase: string): ArchiveReport {
  const envelope = JSON.parse(readFileSync(resolve(name), 'utf8')) as Record<string, any>
  if (envelope.format !== FORMAT) throw new AppError('VALIDATION', 'Not an Afus fiscal archive')

  const checks = { sealIntact: false, payloadHashMatches: false, countsMatch: false, salesChainIntact: false }
  const base: Omit<ArchiveReport, 'ok' | 'checks'> = {
    year: envelope.year,
    createdAt: envelope.createdAt,
    counts: envelope.counts,
    brokenAt: null,
    problem: null
  }

  let plaintext: string
  try {
    const key = deriveKey(passphrase, Buffer.from(envelope.kdf.salt, 'base64'))
    const decipher = createDecipheriv(CIPHER, key, Buffer.from(envelope.cipher.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(envelope.cipher.tag, 'base64'))
    plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.payload, 'base64')), decipher.final()]).toString('utf8')
    checks.sealIntact = true
  } catch {
    /* A wrong key and a tampered body both land here: the tag covers both. */
    return { ...base, ok: false, checks, problem: 'cannotOpen' }
  }

  const actual = Buffer.from(sha256(plaintext), 'utf8')
  const claimed = Buffer.from(String(envelope.payloadSha256), 'utf8')
  checks.payloadHashMatches = actual.length === claimed.length && timingSafeEqual(actual, claimed)

  const payload = JSON.parse(plaintext) as Payload
  checks.countsMatch =
    payload.sales.length === envelope.counts.sales &&
    payload.audit.length === envelope.counts.auditRows &&
    payload.closures.length === envelope.counts.closures

  /* The chain is re-walked inside the archive, not taken on trust. */
  let brokenAt: number | null = null
  let previous = ''
  for (const row of payload.sales as Record<string, any>[]) {
    if (previous && row.fiscalPrevHash !== previous) {
      brokenAt = Number(row.fiscalSeq)
      break
    }
    previous = String(row.fiscalHash ?? '')
  }
  checks.salesChainIntact = brokenAt === null

  const ok = checks.sealIntact && checks.payloadHashMatches && checks.countsMatch && checks.salesChainIntact
  return {
    ...base,
    ok,
    checks,
    brokenAt,
    problem: ok ? null : !checks.payloadHashMatches ? 'hashMismatch' : !checks.countsMatch ? 'countMismatch' : 'chainBroken'
  }
}

/** Read a year back out, for an inspection that asks for the figures themselves. */
export function openArchive(name: string, passphrase: string): { report: ArchiveReport; payload: Payload } {
  const report = verifyArchive(name, passphrase)
  if (!report.checks.sealIntact) throw new AppError('VALIDATION', 'Wrong passphrase, or the file was altered')
  const envelope = JSON.parse(readFileSync(resolve(name), 'utf8')) as Record<string, any>
  const key = deriveKey(passphrase, Buffer.from(envelope.kdf.salt, 'base64'))
  const decipher = createDecipheriv(CIPHER, key, Buffer.from(envelope.cipher.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.cipher.tag, 'base64'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.payload, 'base64')), decipher.final()]).toString('utf8')
  return { report, payload: JSON.parse(plaintext) as Payload }
}

export function deleteArchive(name: string): { deleted: boolean } {
  unlinkSync(resolve(name))
  writeAudit('fiscal.archive.delete', 'archive', name)
  return { deleted: true }
}
