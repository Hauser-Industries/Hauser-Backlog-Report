import type { WebContents } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import {
  PdfPrintService,
  safePdfFileName,
  type PdfPrintDependencies
} from '../src/main/services/pdfPrintService'

function webContents(printToPDF = vi.fn(async () => Buffer.from('pdf'))): WebContents {
  return {
    isDestroyed: () => false,
    printToPDF
  } as unknown as WebContents
}

describe('PdfPrintService', () => {
  it('returns cleanly when the save dialog is cancelled without generating a PDF', async () => {
    const printToPDF = vi.fn(async () => Buffer.from('pdf'))
    const writeFile = vi.fn(async () => undefined)
    const dependencies: PdfPrintDependencies = {
      getOwner: () => null,
      showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: '' })),
      writeFile
    }

    const result = await new PdfPrintService(dependencies).save(webContents(printToPDF), {
      suggestedFileName: 'Hauser Backlog.pdf'
    })

    expect(result).toEqual({ saved: false, cancelled: true, message: 'PDF save cancelled.' })
    expect(printToPDF).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('generates a landscape Letter PDF with backgrounds and saves only to the chosen path', async () => {
    const pdf = Buffer.from('generated-pdf')
    const printToPDF = vi.fn(async () => pdf)
    const writeFile = vi.fn(async () => undefined)
    const dependencies: PdfPrintDependencies = {
      getOwner: () => null,
      showSaveDialog: vi.fn(async () => ({
        canceled: false,
        filePath: 'C:\\Reports\\Hauser Backlog.pdf'
      })),
      writeFile
    }

    const result = await new PdfPrintService(dependencies).save(webContents(printToPDF), {
      suggestedFileName: 'Hauser Backlog.pdf'
    })

    expect(printToPDF).toHaveBeenCalledWith({
      landscape: true,
      pageSize: 'Letter',
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
      margins: { top: 0.28, bottom: 0.28, left: 0.28, right: 0.28 }
    })
    expect(writeFile).toHaveBeenCalledWith('C:\\Reports\\Hauser Backlog.pdf', pdf)
    expect(result).toEqual({ saved: true, message: 'PDF saved successfully.' })
  })

  it('sanitizes only the suggested filename before displaying the save dialog', () => {
    expect(safePdfFileName('Hauser: Ottawa / Backlog')).toBe('Hauser- Ottawa - Backlog.pdf')
    expect(safePdfFileName('report.PDF')).toBe('report.PDF')
  })
})
