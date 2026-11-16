import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const messages = readFileSync('src/renderer/src/i18n/messages.ts', 'utf8')
const has = (code: string) => messages.includes(`'errors.${code}':`)

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('no failure is left mute', () => {
  it('translates every error the main process can return', () => {
    /* The screens show `errors.<CODE>`; a code with no entry fell back to
       "an unexpected error", which tells the owner nothing. */
    const codes = readFileSync('src/main/utils/errors.ts', 'utf8')
      .match(/\|\s*'([A-Z_]+)'/g)!
      .map((line) => line.replace(/\|\s*'|'/g, ''))
    const missing = ['UNAUTHENTICATED', ...codes].filter((code) => !has(code))
    expect(missing, `error codes with no message: ${missing.join(', ')}`).toEqual([])
  })

  it('translates every code the screens raise themselves', () => {
    /* These never reach the main process: the till refuses before it calls.
       Paying a dine-in order with no table chosen was one of them. */
    const raised = new Set<string>()
    for (const path of sourceFiles('src/renderer/src')) {
      const source = readFileSync(path, 'utf8')
      for (const match of source.matchAll(/errorText\([^,]+,\s*'([A-Z_][A-Z0-9_]*)'\)/g)) raised.add(match[1]!)
      for (const match of source.matchAll(/setError\('([A-Z_][A-Z0-9_]*)'\)/g)) raised.add(match[1]!)
    }
    expect(raised.size).toBeGreaterThan(3)
    const missing = [...raised].filter((code) => !has(code))
    expect(missing, `codes the screens show with no message: ${missing.join(', ')}`).toEqual([])
  })

  it('names the ones that used to be silent', () => {
    for (const code of ['TABLE_REQUIRED', 'DELIVERY_DETAILS_REQUIRED', 'PREORDER_TIME_REQUIRED', 'INSUFFICIENT_STOCK', 'PRINT_FAILED']) {
      expect(has(code), code).toBe(true)
    }
  })

  it('still shows the code when there is no message for it', () => {
    const source = readFileSync('src/renderer/src/i18n/index.tsx', 'utf8')
    expect(source).toContain('looksLikeCode')
    expect(source).toContain('${generic} (${code})')
  })
})

describe('a finished job is never reported as a failure', () => {
  const pos = readFileSync('src/renderer/src/pages/Pos.tsx', 'utf8')

  it('keeps sending to the kitchen separate from printing its ticket', () => {
    /* Before: the ticket was printed inside the same try, so a printer problem
       told the waiter the order had not reached the kitchen. */
    const block = pos.slice(pos.indexOf('const sendKitchen'), pos.indexOf('const holdCurrent'))
    expect(block).toContain("flash(t('pos.orderCreated'))")
    expect(block).toContain("errorText(language, 'PRINT_FAILED')")
    expect(block.indexOf("flash(t('pos.orderCreated'))")).toBeLessThan(block.indexOf('kitchenTicketHtml'))
  })

  it('tells the cashier the money is in before it tries to print', () => {
    const block = pos.slice(pos.indexOf('onPaid={async'), pos.indexOf('onPaid={async') + 1400)
    expect(block.indexOf("flash(t('pos.paid'))")).toBeLessThan(block.indexOf('receiptHtml('))
    expect(block).toContain("errorText(language, 'PRINT_FAILED')")
  })
})
