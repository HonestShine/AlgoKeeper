import { promises as fs } from 'node:fs'
import { listNotes, noteFilePath, atomicWrite } from './note-store'
import { buildNoteMd, parseFrontmatter } from './markdown-parser'
import { parseBodyCards } from '../../shared/utils/cards'
import { newCardScheduling, schedule } from '../../shared/utils/sm2'
import { todayKey } from '../../shared/utils/date'
import type { CardSessionItem, ReviewResult, SchedulingInfo } from '../../shared/types/srs'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** 把 frontmatter 中的调度对象收紧为 SchedulingInfo；缺字段视为未调度 */
function toScheduling(v: unknown): SchedulingInfo | undefined {
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

const GRADES = new Set([1, 2, 3, 4])

export function isValidGrade(g: unknown): g is ReviewResult['grade'] {
  return typeof g === 'number' && GRADES.has(g)
}

/** 收集今日到期 + 新卡队列（按 CardSessionItem） */
export async function collectDue(root: string): Promise<CardSessionItem[]> {
  const today = todayKey()
  const out: CardSessionItem[] = []
  for (const s of await listNotes(root)) {
    let raw: string
    try {
      raw = await fs.readFile(s.filePath, 'utf8')
    } catch {
      continue
    }
    const parsed = parseFrontmatter(raw)
    const schedRoot = isRecord(parsed.extras['scheduling']) ? parsed.extras['scheduling'] : {}
    const mainRaw = schedRoot['main']
    const mainSched = toScheduling(mainRaw) ?? newCardScheduling(today)

    if (mainSched.due <= today) {
      out.push({
        cardId: `${s.noteId}::main`,
        noteId: s.noteId,
        noteTitle: parsed.meta.title || s.title,
        kind: 'whole',
        question: `回顾 “${parsed.meta.title || s.title}” 的完整解法`,
        answerText: parsed.bodyMd,
        due: mainSched.due,
        isNew: mainRaw === undefined
      })
    }

    const cardsRaw = isRecord(schedRoot['cards']) ? (schedRoot['cards'] as Record<string, unknown>) : {}
    for (const line of parseBodyCards(parsed.bodyMd)) {
      const sched = toScheduling(cardsRaw[line.qhash]) ?? newCardScheduling(today)
      if (sched.due <= today) {
        out.push({
          cardId: `${s.noteId}::${line.qhash}`,
          noteId: s.noteId,
          noteTitle: parsed.meta.title || s.title,
          kind: 'split',
          question: line.question,
          answerText: line.answer,
          due: sched.due,
          isNew: cardsRaw[line.qhash] === undefined
        })
      }
    }
  }
  return out
}

/** 提交一批评分：按 note 聚合，更新 scheduling 到 frontmatter 后原子写。返回写入的笔记数。 */
export async function commitReviews(root: string, results: ReviewResult[]): Promise<number> {
  const today = todayKey()
  const byNote = new Map<string, Map<string, ReviewResult>>()
  for (const r of results) {
    const idx = r.cardId.lastIndexOf('::')
    if (idx <= 0) continue
    const noteId = r.cardId.slice(0, idx)
    const key = r.cardId.slice(idx + 2)
    if (!isValidGrade(r.grade)) continue
    let map = byNote.get(noteId)
    if (!map) {
      map = new Map()
      byNote.set(noteId, map)
    }
    map.set(key, r)
  }

  let written = 0
  for (const [noteId, resultsMap] of byNote) {
    const file = noteFilePath(root, noteId)
    let raw: string
    try {
      raw = await fs.readFile(file, 'utf8')
    } catch {
      continue
    }
    const { meta, bodyMd, extras } = parseFrontmatter(raw)
    const schedRoot = isRecord(extras['scheduling']) ? (extras['scheduling'] as Record<string, unknown>) : {}
    const cardsRoot = isRecord(schedRoot['cards']) ? (schedRoot['cards'] as Record<string, unknown>) : {}
    const nextCards: Record<string, unknown> = { ...cardsRoot }
    let nextMain = toScheduling(schedRoot['main'])

    for (const [key, r] of resultsMap) {
      const current = key === 'main' ? (nextMain ?? newCardScheduling(today)) : (toScheduling(nextCards[key]) ?? newCardScheduling(today))
      const updated = schedule(r.grade, current, today)
      if (key === 'main') nextMain = updated
      else nextCards[key] = updated
    }

    const nextRoot: Record<string, unknown> = {}
    if (nextMain) nextRoot['main'] = nextMain
    if (Object.keys(nextCards).length) nextRoot['cards'] = nextCards
    extras['scheduling'] = nextRoot

    await atomicWrite(file, buildNoteMd(meta, bodyMd, extras))
    written++
  }
  return written
}
