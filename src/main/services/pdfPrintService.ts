import { writeFile } from 'node:fs/promises'
import electron, {
  type BrowserWindow as BrowserWindowType,
  type SaveDialogOptions,
  type SaveDialogReturnValue,
  type WebContents
} from 'electron'
import type { SaveBacklogPdfRequest, SaveBacklogPdfResult } from '@shared/types/backlog'

const { BrowserWindow, dialog } = electron

export interface PdfPrintDependencies {
  getOwner(webContents: WebContents): BrowserWindowType | null
  showSaveDialog(
    owner: BrowserWindowType | null,
    options: SaveDialogOptions
  ): Promise<SaveDialogReturnValue>
  writeFile(path: string, data: Uint8Array): Promise<void>
}

const defaultDependencies: PdfPrintDependencies = {
  getOwner: (webContents) => BrowserWindow.fromWebContents(webContents),
  showSaveDialog: (owner, options) =>
    owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options),
  writeFile
}

export function safePdfFileName(suggestedFileName: string): string {
  const withoutControlCharacters = [...suggestedFileName]
    .map((character) => (character.charCodeAt(0) <= 31 ? '-' : character))
    .join('')
  const safeBase = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
  const withFallback = safeBase || 'Hauser Backlog Report'
  return withFallback.toLowerCase().endsWith('.pdf') ? withFallback : `${withFallback}.pdf`
}

export class PdfPrintService {
  constructor(private readonly dependencies: PdfPrintDependencies = defaultDependencies) {}

  async save(webContents: WebContents, request: SaveBacklogPdfRequest): Promise<SaveBacklogPdfResult> {
    if (webContents.isDestroyed()) throw new Error('The report window is no longer available.')

    const owner = this.dependencies.getOwner(webContents)
    const selection = await this.dependencies.showSaveDialog(owner, {
      title: 'Save Hauser Backlog Report PDF',
      defaultPath: safePdfFileName(request.suggestedFileName),
      buttonLabel: 'Save PDF',
      filters: [{ name: 'PDF document', extensions: ['pdf'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    })
    if (selection.canceled || !selection.filePath) {
      return { saved: false, cancelled: true, message: 'PDF save cancelled.' }
    }

    let pdf: Buffer
    try {
      pdf = await webContents.printToPDF({
        landscape: true,
        pageSize: 'Letter',
        printBackground: true,
        displayHeaderFooter: false,
        preferCSSPageSize: true,
        margins: { top: 0.28, bottom: 0.28, left: 0.28, right: 0.28 }
      })
    } catch {
      throw new Error('The PDF could not be generated. Try again.')
    }

    try {
      await this.dependencies.writeFile(selection.filePath, pdf)
    } catch {
      throw new Error('The PDF could not be saved to the selected location.')
    }
    return { saved: true, message: 'PDF saved successfully.' }
  }
}
