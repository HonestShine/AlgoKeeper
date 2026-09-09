import { promises as fs } from 'node:fs'
import { listNotes } from './note-store'
import { parseFrontmatter } from './markdown-parser'
import type { SearchFilter } from '../../shared/types/insight'
import type { NoteSummary } from '../../shared/types/note'

/** 组合检索：难度/状态/标签 先 AND 过滤；给定 text 时再在 标题/标签/正文 中做包含匹配。 */
export async function searchNotes(root: string, filter: SearchFilter): Promise<NoteSummary[]> {
  const all = await listNotes(root)
  const out = all.filter((s) => {
    if (filter.difficulty && s.difficulty !== filter.difficulty) return false
    if (filter.status && s.status !== filter.status) return false
    if (filter.tag && !s.tags.includes(filter.tag)) return false
    return true
  })
  const text = (filter.text ?? '').trim().toLowerCase()
  if (!text) return out

  const hits: NoteSummary[] = []
  for (const s of out) {
    let matched = s.title.toLowerCase().includes(text) || s.tags.some((t) => t.toLowerCase().includes(text))
    if (!matched) {
      try {
        const raw = await fs.readFile(s.filePath, 'utf8')
        matched = parseFrontmatter(raw).bodyMd.toLowerCase().includes(text)
      } catch {
        /* 文件读取失败则视为不命中正文 */
      }
    }
    if (matched) hits.push(s)
  }
  return hits
}
