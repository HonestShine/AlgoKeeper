import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNote } from './note-store'
import { buildNoteMd, parseFrontmatter } from './markdown-parser'
import { exportScope } from './exporter'
import type { FileMeta } from '../../shared/types/note'

let root = ''
let noteId = ''

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ak-export-'))
  const meta: FileMeta = {
    source: 'leetcode',
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy',
    tags: ['array'],
    status: 'active',
    aliases: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
  await createNote(root, { meta, bodyMd: '# Two Sum\n\n```ts\nconst a=1\n```\n' })
  noteId = 'leetcode/two-sum'
  // 注入调度作为未知键
  const file = join(root, 'leetcode', 'two-sum.md')
  const parsed = parseFrontmatter(await fs.readFile(file, 'utf8'))
  await fs.writeFile(file, buildNoteMd(parsed.meta, parsed.bodyMd, { ...parsed.extras, scheduling: { main: { repetitions: 3 } } }), 'utf8')
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('exporter', () => {
  it('share 版本剥离 scheduling；backup 保留', async () => {
    const dirA = join(root, 'out-share')
    const dirB = join(root, 'out-backup')
    await exportScope(root, dirA, { scope: 'single', noteId, format: 'md', variant: 'share' })
    await exportScope(root, dirB, { scope: 'single', noteId, format: 'md', variant: 'backup' })

    const share = await fs.readFile(join(dirA, 'leetcode--two-sum.md'), 'utf8')
    const backup = await fs.readFile(join(dirB, 'leetcode--two-sum.md'), 'utf8')
    expect(share).not.toContain('scheduling')
    expect(backup).toContain('scheduling')
    expect(backup).toContain('repetitions: 3')
  })

  it('导出 HTML：包含 doctype 与标题', async () => {
    const dir = join(root, 'out-html')
    await exportScope(root, dir, { scope: 'single', noteId, format: 'html', variant: 'share' })
    const html = await fs.readFile(join(dir, 'leetcode--two-sum.html'), 'utf8')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Two Sum')
  })

  it('整集导出 count 正确', async () => {
    const res = await exportScope(root, join(root, 'out-all'), { scope: 'all', format: 'md', variant: 'share' })
    expect(res.count).toBe(1)
  })
})
