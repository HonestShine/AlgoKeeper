import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNote, listNotes, readNote, saveNote, assertSafeNoteId } from './note-store'
import { parseFrontmatter, buildNoteMd } from './markdown-parser'

let root = ''

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ak-note-store-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const DRAFT = {
  meta: {
    source: 'leetcode',
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy' as const,
    tags: ['array'],
    status: 'active' as const,
    aliases: ['两数之和'],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  },
  bodyMd: '# Two Sum\n\n## 解法一：哈希表\n'
}

describe('note-store (真实 fs)', () => {
  it('create 落盘到 {root}/{source}/{id}.md 并可在列表/读取中还原', async () => {
    const note = await createNote(root, DRAFT)
    expect(note.noteId).toBe('leetcode/two-sum')
    expect(note.filePath).toBe(join(root, 'leetcode', 'two-sum.md'))

    const onDisk = await fs.readFile(note.filePath, 'utf8')
    expect(onDisk).toContain('source: leetcode')
    expect(onDisk).toContain('title: Two Sum')

    const list = await listNotes(root)
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('Two Sum')

    const reopened = await readNote(root, 'leetcode/two-sum')
    expect(reopened.meta.tags).toEqual(['array'])
    expect(reopened.bodyMd).toContain('解法一')
  })

  it('重复创建同名笔记抛 notes.exist', async () => {
    await createNote(root, DRAFT)
    await expect(createNote(root, DRAFT)).rejects.toMatchObject({ code: 'notes.exist' })
  })

  it('save 合并重写并保留原文件的未知键（scheduling）', async () => {
    await createNote(root, DRAFT)
    // 模拟第三方/未来版本写入 scheduling（保留为未知键）
    const file = join(root, 'leetcode', 'two-sum.md')
    const existing = parseFrontmatter(await fs.readFile(file, 'utf8'))
    const withScheduling = buildNoteMd(existing.meta, existing.bodyMd, {
      ...existing.extras,
      scheduling: { main: { repetitions: 3, easeFactor: 2.5 } }
    })
    await fs.writeFile(file, withScheduling, 'utf8')

    await saveNote(root, {
      noteId: 'leetcode/two-sum',
      meta: { ...DRAFT.meta, difficulty: 'Hard', updatedAt: '2026-09-02T00:00:00.000Z' },
      bodyMd: '# Two Sum (改)\n'
    })

    const parsed = parseFrontmatter(await fs.readFile(file, 'utf8'))
    const sched = parsed.extras['scheduling'] as { main: { repetitions: number } }
    expect(sched.main.repetitions).toBe(3) // 未知键保留
    expect(parsed.meta.difficulty).toBe('Hard') // 元数据更新
    expect(parsed.bodyMd).toContain('(改)')
  })

  it('save 后文件系统干净（无 .tmp 残留）且可重读', async () => {
    const note = await createNote(root, DRAFT)
    await saveNote(root, { noteId: note.noteId, meta: DRAFT.meta, bodyMd: 'x' })
    const dir = join(root, 'leetcode')
    const files = await fs.readdir(dir)
    expect(files.filter((f) => f.includes('.tmp'))).toHaveLength(0)
  })

  it('拒绝路径穿越的 noteId', () => {
    expect(() => assertSafeNoteId('../etc/passwd')).toThrow()
    expect(() => assertSafeNoteId('a/../b')).toThrow()
    expect(() => assertSafeNoteId('leetcode/two-sum')).not.toThrow()
  })

  it('readNote 带出 frontmatter 的 scheduling', async () => {
    await createNote(root, DRAFT)
    const file = join(root, 'leetcode', 'two-sum.md')
    const raw = await fs.readFile(file, 'utf8')
    await fs.writeFile(file, raw.replace('---\n', `---\nscheduling:\n  main:\n    repetitions: 4\n    easeFactor: 2.36\n    interval: 7\n    due: "2026-09-15"\n    lapses: 1\n    lastReviewed: "2026-09-08"\n`), 'utf8')
    const note = await readNote(root, 'leetcode/two-sum')
    expect(note.scheduling?.main?.repetitions).toBe(4)
    expect(note.scheduling?.main?.easeFactor).toBe(2.36)
  })

  it('readNote 无 scheduling 时该字段缺省', async () => {
    await createNote(root, DRAFT)
    const note = await readNote(root, 'leetcode/two-sum')
    expect(note.scheduling).toBeUndefined()
  })
})
