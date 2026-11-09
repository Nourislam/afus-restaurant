/**
 * Printing: render the receipt/kitchen HTML in a hidden window and print it to a
 * (thermal) printer, or export to PDF. Offline and OS-native; when no printer is
 * configured we fall back to the system print dialog so nothing is lost.
 */
import { BrowserWindow, webContents } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appPaths } from '../paths'
import { nowStamp } from '../utils/dates'

interface PrinterInfo {
  name: string
  displayName: string
  isDefault: boolean
}

async function render(html: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: false, sandbox: false } })
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  return win
}

export async function listPrinters(): Promise<PrinterInfo[]> {
  const all = BrowserWindow.getAllWindows()
  const target = all[0]?.webContents ?? webContents.getAllWebContents()[0]
  if (!target) return []
  const printers = await target.getPrintersAsync()
  return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: p.isDefault }))
}

export async function printHtml(input: {
  html: string
  printerName?: string
  silent?: boolean
}): Promise<{ success: boolean; printed: boolean; reason: string | null }> {
  let win: BrowserWindow | null = null
  try {
    win = await render(input.html)
    const silent = Boolean(input.silent && input.printerName)
    const printed = await new Promise<boolean>((resolve) => {
      win!.webContents.print(
        {
          silent,
          printBackground: true,
          ...(input.printerName ? { deviceName: input.printerName } : {}),
          margins: { marginType: 'none' }
        },
        (ok) => resolve(ok)
      )
    })
    return { success: true, printed, reason: printed ? null : 'CANCELLED' }
  } catch (error) {
    return { success: false, printed: false, reason: error instanceof Error ? error.message : 'PRINT_FAILED' }
  } finally {
    win?.close()
  }
}

export async function exportPdf(input: { html: string }): Promise<{ filePath: string | null }> {
  let win: BrowserWindow | null = null
  try {
    win = await render(input.html)
    const data = await win.webContents.printToPDF({ printBackground: true })
    const filePath = join(appPaths().reports, `ticket-${nowStamp().replace(/[: ]/g, '-')}.pdf`)
    writeFileSync(filePath, data)
    return { filePath }
  } catch {
    return { filePath: null }
  } finally {
    win?.close()
  }
}
