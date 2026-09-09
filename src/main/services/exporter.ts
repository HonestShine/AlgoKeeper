import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { marked } from 'marked'
import { listNotes } from './note-store'
import { buildNoteMd, parseFrontmatter } from './markdown-parser'
import { stripWikiSyntax } from '../../shared/utils/wikilinks'
import type { ExportFormat, ExportRequest, ExportResult } from '../../shared/types/export'

function extFor(format: ExportFormat): string {
  return format === 'md' ? 'md' : 'html'
}

/** share 剥离 scheduling；backup 保留（可整目录回导）。 */
function keptExtras(extras: Record<string, unknown>, variant: ExportRequest['variant']): Record<string, unknown> {
  if (variant === 'backup') return extras
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(extras)) if (k !== 'scheduling') out[k] = v
  return out
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

export function htmlDocument(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body{max-width:820px;margin:32px auto;padding:0 20px;color:#24292f;font:15px/1.8 -apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif}
  h1,h2{border-bottom:1px solid #e5e7eb;padding-bottom:6px}
  pre{background:#f6f8fa;padding:12px;border-radius:8px;overflow-x:auto}
  code{font-family:ui-monospace,Consolas,monospace}
  blockquote{color:#57606a;border-left:3px solid #d0d7de;margin:0;padding-left:12px}
  table{border-collapse:collapse}th,td{border:1px solid #d0d7de;padding:4px 10px}
</style></head><body>${bodyHtml}</body></html>`
}

/** 渲染一篇导出内容（markdown 原样 / html 用 marked 转义，双链 [[x]] 还原为纯文本）。 */
export async function renderNoteFile(
  root: string,
  noteId: string,
  req: Pick<ExportRequest, 'format' | 'variant'>
): Promise<{ filename: string; content: string }> {
  const file = join(root, ...noteId.split('/')) + '.md'
  const parsed = parseFrontmatter(await fs.readFile(file, 'utf8'))
  const title = parsed.meta.title
  const ext = extFor(req.format)

  if (req.format === 'md') {
    return { filename: `${noteId}.${ext}`, content: buildNoteMd(parsed.meta, parsed.bodyMd, keptExtras(parsed.extras, req.variant)) }
  }
  const bodyHtml = marked.parse(stripWikiSyntax(parsed.bodyMd), { async: false, breaks: true }) as string
  return { filename: `${noteId}.${ext}`, content: htmlDocument(title, bodyHtml) }
}

/** 导出单篇或整集到 outDir（文件名扁平化 source--id）。 */
export async function exportScope(root: string, outDir: string, req: ExportRequest): Promise<ExportResult> {
  const targets = req.scope === 'single' && req.noteId ? [{ noteId: req.noteId }] : (await listNotes(root)).map((s) => ({ noteId: s.noteId }))
  if (targets.length === 0) return { path: outDir, count: 0 }
  await fs.mkdir(outDir, { recursive: true })
  let count = 0
  for (const { noteId } of targets) {
    const { filename, content } = await renderNoteFile(root, noteId, req)
    const safe = filename.split('/').join('--').replace(/[\\:*?"<>|]/g, '_')
    await fs.writeFile(join(outDir, safe), content, 'utf8')
    count++
  }
  return { path: outDir, count }
}
