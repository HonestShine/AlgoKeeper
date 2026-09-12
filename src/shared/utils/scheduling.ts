/** frontmatter `scheduling` 对象 → 类型化调度信息（纯函数，主进程共用）。 */
import type { NoteScheduling } from '../types/note'
import type { SchedulingInfo } from '../types/srs'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** 把 frontmatter 中的调度对象收紧为 SchedulingInfo；缺字段视为未调度 */
export function toScheduling(v: unknown): SchedulingInfo | undefined {
  if (!isRecord(v)) return undefined
  const repetitions = num(v.repetitions)
  const easeFactor = num(v.easeFactor)
  const interval = num(v.interval)
  const due = typeof v.due === 'string' ? v.due : undefined
  const lapses = num(v.lapses) ?? 0
  const lastReviewed = typeof v.lastReviewed === 'string' ? v.lastReviewed : undefined
  if (repetitions === undefined || easeFactor === undefined || interval === undefined || !due) return undefined
  return { repetitions, easeFactor, interval, due, lapses, lastReviewed }
}

/** frontmatter extras → NoteScheduling；无可用调度信息时返回 undefined */
export function schedulingFromExtras(extras: Record<string, unknown>): NoteScheduling | undefined {
  const root = extras['scheduling']
  if (!isRecord(root)) return undefined
  const main = toScheduling(root['main'])
  const cardsRaw = isRecord(root['cards']) ? root['cards'] : {}
  const cards: Record<string, SchedulingInfo> = {}
  for (const [k, v] of Object.entries(cardsRaw)) {
    const s = toScheduling(v)
    if (s) cards[k] = s
  }
  const hasCards = Object.keys(cards).length > 0
  if (!main && !hasCards) return undefined
  return { ...(main ? { main } : {}), ...(hasCards ? { cards } : {}) }
}
