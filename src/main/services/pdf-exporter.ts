import { BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { listNotes } from './note-store'
import { renderNoteFile } from './exporter'
import type { ExportVariant } from '../../shared/types/export'

export interface PdfExportResult {
  path: string
  count: number
}

function codeError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code })
}

async function printHtmlToPdf(htmlPath: string, pdfPath: string): Promise<void> {
  const win = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { sandbox: true } })
  try {
    await win.loadFile(htmlPath)
    const data = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
    })
    await fs.writeFile(pdfPath, data)
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

/** 用隐藏窗口把笔记 HTML 渲染为 PDF 落盘。单篇或整集。 */
export async function exportPdf(root: string, outDir: string, scope: 'single' | 'all', noteId: string | undefined, variant: ExportVariant): Promise<PdfExportResult> {
  const targets = scope === 'all' ? await listNotes(root) : noteId ? [{ noteId }] : []
  if (scope === 'single' && targets.length === 0) {
    throw codeError('未指定要导出的笔记', 'export.no-note')
  }
  await fs.mkdir(outDir, { recursive: true })
  let count = 0
  for (const { noteId: id } of targets) {
    const { content } = await renderNoteFile(root, id, { format: 'html', variant })
    const safe = id.split('/').join('--').replace(/[\\:*?"<>|]/g, '_')
    const tmp = join(outDir, `.ak-pdf-${count}.html`)
    const pdf = join(outDir, `${safe}.pdf`)
    await fs.writeFile(tmp, content, 'utf8')
    await printHtmlToPdf(tmp, pdf)
    await fs.rm(tmp, { force: true })
    count++
  }
  return { path: outDir, count }
}
