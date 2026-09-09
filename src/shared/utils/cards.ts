/** 拆解卡（`问题::答案`）解析与键派生（纯函数）。约定见 PRD A.2 / tech §4.2。 */
import type { EmbeddedCardLine } from '../types/srs'

/** 问句规范化后再哈希，降低编辑空白导致的键漂移 */
export function normalizeQuestion(q: string): string {
  return q.trim().replace(/\s+/g, ' ')
}

/** FNV-1a 32 → 8 位 hex；用于拆卡稳定身份 */
export function hashCardKey(question: string): string {
  let h = 0x811c9dc5
  const text = normalizeQuestion(question)
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

const CARD_LINE_RE = /^\s*(?:[-*+]\s+)?(.+?)\s*::\s*(.+?)\s*$/

/**
 * 从正文提取拆解卡：仅在代码围栏外、逐行按首个 `::` 切分。
 * 支持独立段落行与列表项单行两种写法（PRD A.2）。
 */
export function parseBodyCards(bodyMd: string): EmbeddedCardLine[] {
  const cards: EmbeddedCardLine[] = []
  let inCode = false
  for (const rawLine of bodyMd.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('```')) {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    const m = CARD_LINE_RE.exec(line)
    if (!m) continue
    const question = m[1].trim()
    const answer = m[2].trim()
    if (!question || !answer) continue
    cards.push({ qhash: hashCardKey(question), question, answer })
  }
  return cards
}
