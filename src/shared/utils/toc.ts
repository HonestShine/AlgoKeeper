/** 从 Markdown 正文提取大纲（跳过高亮代码围栏）。纯函数，供阅读 TOC 使用。 */
import type { TocItem } from '../types/export'

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/

export function parseToc(md: string): TocItem[] {
  const items: TocItem[] = []
  let inCode = false
  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('```')) {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    const m = HEADING_RE.exec(line)
    if (m) items.push({ text: m[2].trim(), depth: m[1].length })
  }
  return items
}
