import { promises as fs } from 'node:fs'
import { listNotes, noteFilePath } from './note-store'
import { parseFrontmatter } from './markdown-parser'
import { parseBodyCards } from '../../shared/utils/cards'
import { newCardScheduling } from '../../shared/utils/sm2'
import { todayKey } from '../../shared/utils/date'
import { schedFromUnknown } from './srs-store'
import { getDb } from './db'
import type { ReviewLogEntry } from '../../shared/types/srs'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 重建一篇笔记在索引库中的行（notes/tags/cards）。文件不存在则清理。 */
export async function indexNote(root: string, noteId: string): Promise<void> {
  const file = noteFilePath(root, noteId)
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch {
    removeNote(noteId)
    return
  }
  const parsed = parseFrontmatter(raw)
  const meta = parsed.meta
  const stat = await fs.stat(file).catch(() => null)
  const db = getDb()
  const today = todayKey()

  const schedRoot = isRecord(parsed.extras['scheduling']) ? (parsed.extras['scheduling'] as Record<string, unknown>) : {}
  const mainSched = schedFromUnknown(schedRoot['main']) ?? newCardScheduling(today)
  const cardsRaw = isRecord(schedRoot['cards']) ? (schedRoot['cards'] as Record<string, unknown>) : {}

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO notes(note_id, source, id, title, difficulty, status, tags_json, file_path, mtime, updated_at)
       VALUES (@noteId, @source, @id, @title, @difficulty, @status, @tagsJson, @filePath, @mtime, @updated)
       ON CONFLICT(note_id) DO UPDATE SET title=@title, difficulty=@difficulty, status=@status,
         tags_json=@tagsJson, file_path=@filePath, mtime=@mtime, updated_at=@updated`
    ).run({
      noteId,
      source: meta.source,
      id: meta.id,
      title: meta.title,
      difficulty: meta.difficulty,
      status: meta.status,
      tagsJson: JSON.stringify(meta.tags),
      filePath: file,
      mtime: stat?.mtimeMs ?? 0,
      updated: meta.updatedAt
    })
    db.prepare('DELETE FROM tags WHERE note_id = ?').run(noteId)
    const insTag = db.prepare('INSERT INTO tags(note_id, tag) VALUES (?, ?)')
    for (const t of meta.tags) insTag.run(noteId, t)

    db.prepare('DELETE FROM cards WHERE note_id = ?').run(noteId)
    const insCard = db.prepare(
      `INSERT INTO cards(card_id, note_id, kind, question, answer_text, repetitions, ease_factor,
         interval_days, due, lapses, last_reviewed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const put = (
      cardId: string,
      kind: 'whole' | 'split',
      question: string,
      answer: string | null,
      s: ReturnType<typeof newCardScheduling>
    ): void => {
      insCard.run(
        cardId,
        noteId,
        kind,
        question,
        answer,
        s.repetitions,
        s.easeFactor,
        s.interval,
        s.due,
        s.lapses,
        s.lastReviewed ?? null,
        meta.updatedAt
      )
    }
    put(`${noteId}::main`, 'whole', `回顾 “${meta.title}” 的完整解法`, null, mainSched)
    for (const line of parseBodyCards(parsed.bodyMd)) {
      const s = schedFromUnknown(cardsRaw[line.qhash]) ?? newCardScheduling(today)
      put(`${noteId}::${line.qhash}`, 'split', line.question, line.answer, s)
    }
  })
  tx()
}

function removeNote(noteId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM tags WHERE note_id = ?').run(noteId)
  db.prepare('DELETE FROM cards WHERE note_id = ?').run(noteId)
  db.prepare('DELETE FROM notes WHERE note_id = ?').run(noteId)
}

/** 全量重建索引：遍历文件 upsert，清理磁盘上已不存在的笔记行。返回索引条数。 */
export async function syncAll(root: string): Promise<number> {
  const notes = await listNotes(root)
  const present = new Set<string>()
  for (const s of notes) {
    present.add(s.noteId)
    await indexNote(root, s.noteId)
  }
  const db = getDb()
  const rows = db.prepare('SELECT note_id FROM notes').all() as Array<{ note_id: string }>
  for (const r of rows) {
    if (!present.has(r.note_id)) removeNote(r.note_id)
  }
  return present.size
}

/** 复习日志落库（追加型分析数据）。 */
export function recordReviewLogs(logs: ReviewLogEntry[]): void {
  if (logs.length === 0) return
  const db = getDb()
  const ins = db.prepare(
    `INSERT INTO review_logs(card_id, note_id, ts, grade, interval_before, interval_after, ease_after)
     VALUES (@cardId, @noteId, @ts, @grade, @intervalBefore, @intervalAfter, @easeAfter)`
  )
  const tx = db.transaction((entries: ReviewLogEntry[]) => {
    for (const e of entries) {
      ins.run({
        cardId: e.cardId,
        noteId: e.noteId,
        ts: e.ts,
        grade: e.grade,
        intervalBefore: e.intervalBefore ?? null,
        intervalAfter: e.intervalAfter ?? null,
        easeAfter: e.easeAfter ?? null
      })
    }
  })
  tx(logs)
}
