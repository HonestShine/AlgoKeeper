import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNote } from './note-store'
import { collectDue, commitReviews } from './srs-store'
import { parseFrontmatter } from './markdown-parser'
import { hashCardKey } from '../../shared/utils/cards'
import { todayKey } from '../../shared/utils/date'
import type { Difficulty, FileMeta } from '../../shared/types/note'

let root = ''

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ak-srs-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

function draft(source: string, id: string, difficulty: Difficulty, body: string) {
  const meta: FileMeta = {
    source,
    id,
    title: id,
    difficulty,
    tags: ['x'],
    status: 'active',
    aliases: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
  return { meta, bodyMd: body }
}

describe('srs-store（真实 fs 集成）', () => {
  it('collect：整题卡新卡 + 拆解卡新卡都被收集，且整题卡 count=题数', async () => {
    await createNote(root, draft('s', 'a', 'Easy', '# A\n\n循环不变量是什么?::low <= high\n'))
    await createNote(root, draft('s', 'b', 'Hard', '# B\n'))
    const all = await collectDue(root, { newLimit: 100 })
    // a: whole + split；b: whole
    expect(all.filter((c) => c.noteId === 's/a')).toHaveLength(2)
    expect(all.filter((c) => c.noteId === 's/b')).toHaveLength(1)
    expect(all.every((c) => c.isNew)).toBe(true)
  })

  it('难度过滤只保留匹配题', async () => {
    await createNote(root, draft('s', 'easy', 'Easy', '# E\n'))
    await createNote(root, draft('s', 'hard', 'Hard', '# H\n'))
    const hard = await collectDue(root, { difficulty: 'Hard', newLimit: 100 })
    expect(hard.map((c) => c.noteId)).toEqual(['s/hard'])
  })

  it('newLimit 截断新卡数量', async () => {
    await createNote(root, draft('s', 'a', 'Easy', '# A\n'))
    await createNote(root, draft('s', 'b', 'Easy', '# B\n'))
    expect((await collectDue(root, { newLimit: 1 })).length).toBe(1)
  })

  it('commit 后：整题卡与拆卡都写回 scheduling，且当天不再出现在队列', async () => {
    const today = todayKey()
    await createNote(root, draft('s', 'a', 'Easy', '# A\n\n循环不变量是什么?::low <= high\n'))
    const queue = await collectDue(root, { newLimit: 100 })
    expect(queue.length).toBe(2)

    await commitReviews(root, queue.map((c) => ({ cardId: c.cardId, grade: 3 })))

    const parsed = parseFrontmatter(await fs.readFile(join(root, 's', 'a.md'), 'utf8'))
    const sched = parsed.extras['scheduling'] as {
      main?: { repetitions: number; due: string }
      cards?: Record<string, { repetitions: number; due: string }>
    }
    expect(sched.main?.repetitions).toBe(1)
    expect(sched.main?.due).not.toBe(today)
    expect(sched.cards?.[hashCardKey('循环不变量是什么?')]?.repetitions).toBe(1)

    // 全部已调度、due 在未来 → 今日队列为空
    expect(await collectDue(root, { newLimit: 100 })).toHaveLength(0)
  })
})
