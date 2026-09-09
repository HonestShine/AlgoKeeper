import { describe, expect, it } from 'vitest'
import { buildNoteMd, parseFrontmatter } from './markdown-parser'

const A1 = `---
source: leetcode
id: two-sum
title: Two Sum
difficulty: Easy
tags: [array, hash-table]
status: active
aliases: [两数之和]
created: 2026-09-01T09:12:00+08:00
updated: 2026-09-08T21:47:00+08:00
scheduling:
  main:
    repetitions: 3
    easeFactor: 2.5
    interval: 15
    due: 2026-09-21
    lapses: 1
---

# Two Sum

## 解法一：哈希表

一遍遍历。
`

describe('markdown-parser (frontmatter)', () => {
  it('解析 A.1 样例的类型化字段', () => {
    const r = parseFrontmatter(A1)
    expect(r.warnings).toEqual([])
    expect(r.meta.source).toBe('leetcode')
    expect(r.meta.id).toBe('two-sum')
    expect(r.meta.title).toBe('Two Sum')
    expect(r.meta.difficulty).toBe('Easy')
    expect(r.meta.tags).toEqual(['array', 'hash-table'])
    expect(r.meta.aliases).toEqual(['两数之和'])
    expect(r.meta.status).toBe('active')
    expect(r.meta.updatedAt).toBe('2026-09-08T21:47:00+08:00')
    expect(r.bodyMd).toContain('# Two Sum')
  })

  it('未知键（scheduling）保留在 extras，不丢失', () => {
    const r = parseFrontmatter(A1)
    const sched = r.extras['scheduling'] as { main: { repetitions: number; easeFactor: number } }
    expect(sched.main.repetitions).toBe(3)
    expect(sched.main.easeFactor).toBe(2.5)
  })

  it('serialize(parse(x)) 语义往返一致（含未知键）', () => {
    const first = parseFrontmatter(A1)
    const rebuilt = buildNoteMd(first.meta, first.bodyMd, first.extras)
    const second = parseFrontmatter(rebuilt)
    expect(second.meta).toEqual(first.meta)
    expect(second.extras).toEqual(first.extras)
    expect(second.bodyMd).toBe(first.bodyMd)
    expect(second.warnings).toEqual([])
  })

  it('difficulty/status 非法值回退并告警', () => {
    const r = parseFrontmatter('---\ntitle: X\ndifficulty: Ultra\nstatus: wat\n---\nbody')
    expect(r.meta.difficulty).toBe('Easy')
    expect(r.meta.status).toBe('active')
    expect(r.warnings).toContain('invalid-difficulty')
  })

  it('无 frontmatter：告警 + 正文原样', () => {
    const r = parseFrontmatter('just body text')
    expect(r.warnings).toContain('no-frontmatter')
    expect(r.bodyMd).toBe('just body text')
  })
})
