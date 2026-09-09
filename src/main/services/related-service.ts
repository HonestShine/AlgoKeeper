import { promises as fs } from 'node:fs'
import { listNotes } from './note-store'
import { parseFrontmatter } from './markdown-parser'
import { parseWikiTargets } from '../../shared/utils/wikilinks'
import type { RelatedNotes } from '../../shared/types/export'
import type { NoteSummary } from '../../shared/types/note'

/** 双向关联：反链（正文含 [[目标名/别名/id]]）+ 同标签 Top5。 */
export async function relatedNotes(root: string, noteId: string): Promise<RelatedNotes> {
  const notes = await listNotes(root)
  const self = notes.find((s) => s.noteId === noteId)
  if (!self) return { backlinks: [], similar: [] }

  // 本篇可被引用的名字：title、aliases、id
  const names = new Set([self.title, self.id])
  try {
    const meta = parseFrontmatter(await fs.readFile(self.filePath, 'utf8')).meta
    for (const a of meta.aliases) names.add(a)
  } catch {
    /* 忽略 */
  }

  const backlinks: NoteSummary[] = []
  const scored: Array<{ s: NoteSummary; score: number }> = []
  for (const s of notes) {
    if (s.noteId === noteId) continue
    let raw: string
    try {
      raw = await fs.readFile(s.filePath, 'utf8')
    } catch {
      continue
    }
    const parsed = parseFrontmatter(raw)
    const refs = parseWikiTargets(parsed.bodyMd)
    if (refs.some((r) => names.has(r) || r === self.source + '/' + self.id)) backlinks.push(s)
    const overlap = parsed.meta.tags.filter((t) => self.tags.includes(t)).length
    if (overlap > 0) scored.push({ s, score: overlap })
  }
  const similar = scored
    .sort((a, b) => b.score - a.score || (a.s.title < b.s.title ? -1 : 1))
    .slice(0, 5)
    .map((x) => x.s)

  return { backlinks, similar }
}
