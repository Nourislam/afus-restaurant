import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_DATA = mkdtempSync(join(tmpdir(), 'afus-archive-'))
vi.mock('electron', () => ({
  app: { getPath: () => USER_DATA, getName: () => 'AFUS Restaurant', getVersion: () => '1.0.0-test' },
  shell: { showItemInFolder: () => undefined, openPath: async () => '' },
  BrowserWindow: class {
    static getAllWindows(): unknown[] {
      return []
    }
  },
  ipcMain: { handle: () => undefined }
}))

const { archiveYear, deleteArchive, listArchives, openArchive, verifyArchive } = await import('../src/main/services/archive')
const { closeDatabase, dbGet, dbWrite, openDatabase } = await import('../src/main/db/client')
const { seedCoreData } = await import('../src/main/db/seed')
const { completeSetup } = await import('../src/main/services/setup')
const { updateSettings } = await import('../src/main/services/settings')
const { createOrder, payOrder } = await import('../src/main/services/orders')
const { closePeriod } = await import('../src/main/services/fiscal')
const { clearSession } = await import('../src/main/security/session')
const { ensureDirectories } = await import('../src/main/paths')

const PASS = 'un-mot-de-passe-solide'
const product = () => dbGet<{ id: number; priceCents: number }>('SELECT id, priceCents FROM products ORDER BY id LIMIT 1')!
const thisYear = new Date().getFullYear()

function sell(times = 1) {
  for (let i = 0; i < times; i += 1) {
    const order = createOrder({ type: 'takeaway', items: [{ productId: product().id, qty: 1 }] })
    payOrder({ orderId: order.id, payments: [{ method: 'cash', amountCents: order.totalCents }] })
  }
}

beforeAll(() => ensureDirectories())

beforeEach(async () => {
  closeDatabase()
  clearSession()
  await openDatabase(null)
  seedCoreData()
  completeSetup({ restaurantName: 'Djemr', currency: 'DZD', language: 'ar', taxEnabled: false, taxRateBp: 0, ownerFullName: 'Owner', ownerPin: '1234' })
  updateSettings({ legalName: 'SARL Djemr', nif: '000123456789012', rc: '16/00-1234567B26' })
  for (const file of listArchives()) deleteArchive(file.name)
})

describe('sealing a year', () => {
  it('writes a file whose head is readable without any key', () => {
    sell(3)
    const archive = archiveYear(thisYear, PASS)
    const onDisk = JSON.parse(readFileSync(archive.path, 'utf8'))
    /* An inspector with a folder of files must see whose year this is. */
    expect(onDisk.restaurant.legalName).toBe('SARL Djemr')
    expect(onDisk.restaurant.nif).toBe('000123456789012')
    expect(onDisk.year).toBe(thisYear)
    expect(onDisk.counts.sales).toBe(3)
    /* And nothing commercial must be readable there. */
    expect(JSON.stringify(onDisk.payload)).not.toContain('orderNumber')
    expect(onDisk.cipher.name).toBe('aes-256-gcm')
    expect(onDisk.kdf.name).toBe('scrypt')
  })

  it('refuses a short passphrase, a silly year, and an empty year', () => {
    sell(1)
    expect(() => archiveYear(thisYear, 'court')).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
    expect(() => archiveYear(1800, PASS)).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
    expect(() => archiveYear(thisYear - 5, PASS)).toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }))
  })

  it('lists what has been put away', () => {
    sell(1)
    archiveYear(thisYear, PASS)
    const listed = listArchives()
    expect(listed).toHaveLength(1)
    expect(listed[0]?.year).toBe(thisYear)
    expect(listed[0]?.counts.sales).toBe(1)
  })
})

describe('opening a year again', () => {
  it('answers every question it should be asked', () => {
    sell(4)
    closePeriod('day', new Date().toISOString().slice(0, 10))
    const archive = archiveYear(thisYear, PASS)
    const report = verifyArchive(archive.name, PASS)
    expect(report.ok).toBe(true)
    expect(report.checks).toEqual({ sealIntact: true, payloadHashMatches: true, countsMatch: true, salesChainIntact: true })
    expect(report.counts.sales).toBe(4)
    expect(report.counts.closures).toBe(1)
    expect(report.brokenAt).toBeNull()
  })

  it('gives the figures back, and only that year', () => {
    sell(2)
    /* A sale moved to last year must not come back in this year's archive. */
    const stray = createOrder({ type: 'takeaway', items: [{ productId: product().id, qty: 1 }] })
    payOrder({ orderId: stray.id, payments: [{ method: 'cash', amountCents: stray.totalCents }] })
    /* A sale is dated by the moment its money came in, so that is the stamp a
       sale moved into last year has to carry. */
    dbWrite("UPDATE orders SET paidAt = ?, completedAt = ? WHERE id = ?", [
      `${thisYear - 1}-06-01 12:00:00`,
      `${thisYear - 1}-06-01 12:00:00`,
      stray.id
    ])

    const archive = archiveYear(thisYear, PASS)
    const { payload, report } = openArchive(archive.name, PASS)
    expect(report.ok).toBe(true)
    expect(payload.sales).toHaveLength(2)
    expect(payload.sales.some((sale: any) => sale.id === stray.id)).toBe(false)
    expect(payload.identity.legalName).toBe('SARL Djemr')
  })

  it('fails cleanly on the wrong passphrase, instead of throwing something raw', () => {
    sell(1)
    const archive = archiveYear(thisYear, PASS)
    const report = verifyArchive(archive.name, 'ce-n-est-pas-le-bon')
    expect(report.ok).toBe(false)
    expect(report.checks.sealIntact).toBe(false)
    expect(report.problem).toBe('cannotOpen')
    expect(() => openArchive(archive.name, 'ce-n-est-pas-le-bon')).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
  })

  it('catches a single byte changed in the sealed body', () => {
    sell(2)
    const archive = archiveYear(thisYear, PASS)
    const envelope = JSON.parse(readFileSync(archive.path, 'utf8'))
    const body = Buffer.from(envelope.payload, 'base64')
    body[10] = body[10]! ^ 0x01
    envelope.payload = body.toString('base64')
    writeFileSync(archive.path, JSON.stringify(envelope), 'utf8')
    const report = verifyArchive(archive.name, PASS)
    expect(report.ok).toBe(false)
    expect(report.problem).toBe('cannotOpen')
  })

  it('catches a count edited in the clear head', () => {
    sell(3)
    const archive = archiveYear(thisYear, PASS)
    const envelope = JSON.parse(readFileSync(archive.path, 'utf8'))
    envelope.counts.sales = 99
    writeFileSync(archive.path, JSON.stringify(envelope), 'utf8')
    const report = verifyArchive(archive.name, PASS)
    expect(report.ok).toBe(false)
    expect(report.checks.sealIntact).toBe(true)
    expect(report.checks.countsMatch).toBe(false)
    expect(report.problem).toBe('countMismatch')
  })

  it('re-walks the sales chain inside rather than trusting it', () => {
    sell(3)
    /* Break the chain in the database, then archive: the archive reports it. */
    const second = dbGet<{ id: number }>('SELECT id FROM orders WHERE fiscalSeq = 2')!
    dbWrite("UPDATE orders SET fiscalPrevHash = 'forged' WHERE id = ?", [second.id])
    const archive = archiveYear(thisYear, PASS)
    const report = verifyArchive(archive.name, PASS)
    expect(report.ok).toBe(false)
    expect(report.checks.salesChainIntact).toBe(false)
    expect(report.brokenAt).toBe(2)
    expect(report.problem).toBe('chainBroken')
  })

  it('refuses a file that is not one of ours, and a name that escapes the folder', () => {
    writeFileSync(join(USER_DATA, 'backups', 'fiscal', 'autre.json'), JSON.stringify({ format: 'something-else' }), 'utf8')
    expect(() => verifyArchive('autre.json', PASS)).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
    expect(() => verifyArchive('../../escape.json', PASS)).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
    expect(listArchives().some((file) => file.name === 'autre.json')).toBe(false)
  })
})
