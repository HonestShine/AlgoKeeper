import { getDb } from './db'
import type { AccuracyPoint, DifficultyCount, StatsOverview, TagCount, WeakTag } from '../../shared/types/insight'
import type { Difficulty } from '../../shared/types/note'

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']

interface Row {
  [key: string]: unknown
}

/** 仪表盘聚合（读 SQLite 索引；review_logs 提供正确率曲线与薄弱标签） */
export function statsOverview(): StatsOverview {
  const db = getDb()
  const total = (db.prepare('SELECT COUNT(*) AS n FROM notes').get() as Row)['n'] as number

  const difficulty: DifficultyCount[] = DIFFICULTIES.map((d) => ({
    difficulty: d,
    count: (db.prepare('SELECT COUNT(*) AS n FROM notes WHERE difficulty = ?').get(d) as Row)['n'] as number
  }))

  const tags: TagCount[] = (db.prepare('SELECT tag, COUNT(*) AS n FROM tags GROUP BY tag ORDER BY n DESC, tag').all() as Row[]).map(
    (r) => ({ tag: r['tag'] as string, count: r['n'] as number })
  )

  const withTags = (db.prepare("SELECT COUNT(*) AS n FROM notes WHERE tags_json <> '[]'").get() as Row)['n'] as number
  const tagCoverage = total > 0 ? withTags / total : 0

  const weak: WeakTag[] = (
    db
      .prepare(
        `SELECT tag, COUNT(*) AS n,
               1.0 * SUM(CASE WHEN grade >= 3 THEN 1 ELSE 0 END) / COUNT(*) AS acc
         FROM review_logs JOIN tags USING (note_id)
         GROUP BY tag HAVING n >= 3
         ORDER BY acc ASC`
      )
      .all() as Row[]
  )
    .filter((r) => (r['acc'] as number) < 0.6)
    .map((r) => ({ tag: r['tag'] as string, acc: r['acc'] as number, n: r['n'] as number }))

  const series: AccuracyPoint[] = (
    db
      .prepare(
        `SELECT substr(ts, 1, 10) AS date,
               1.0 * SUM(CASE WHEN grade >= 3 THEN 1 ELSE 0 END) / COUNT(*) AS acc,
               COUNT(*) AS n
         FROM review_logs GROUP BY date ORDER BY date ASC`
      )
      .all() as Row[]
  ).map((r) => ({ date: r['date'] as string, acc: r['acc'] as number, n: r['n'] as number }))

  return { total, difficulty, tags, tagCoverage, weakTags: weak, series }
}
