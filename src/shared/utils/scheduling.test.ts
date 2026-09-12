import { describe, expect, it } from 'vitest'
import { schedulingFromExtras, toScheduling } from './scheduling'

const MAIN = { repetitions: 4, easeFactor: 2.36, interval: 7, due: '2026-09-15', lapses: 1, lastReviewed: '2026-09-08' }

describe('toScheduling', () => {
  it('完整对象解析成功', () => {
    expect(toScheduling(MAIN)).toEqual(MAIN)
  })

  it('缺必需字段视为未调度', () => {
    expect(toScheduling({ repetitions: 1, easeFactor: 2.5 })).toBeUndefined()
    expect(toScheduling({ ...MAIN, due: undefined })).toBeUndefined()
  })

  it('非对象返回 undefined', () => {
    expect(toScheduling(null)).toBeUndefined()
    expect(toScheduling('nope')).toBeUndefined()
    expect(toScheduling([1, 2])).toBeUndefined()
  })

  it('lapses 缺省为 0', () => {
    const r = toScheduling({ repetitions: 0, easeFactor: 2.5, interval: 0, due: '2026-09-12' })
    expect(r?.lapses).toBe(0)
    expect(r?.lastReviewed).toBeUndefined()
  })
})

describe('schedulingFromExtras', () => {
  it('无 scheduling 键返回 undefined', () => {
    expect(schedulingFromExtras({})).toBeUndefined()
    expect(schedulingFromExtras({ scheduling: 'nope' })).toBeUndefined()
  })

  it('只有 main 时返回 main', () => {
    expect(schedulingFromExtras({ scheduling: { main: MAIN } })).toEqual({ main: MAIN })
  })

  it('提取 cards 并跳过非法项', () => {
    const r = schedulingFromExtras({
      scheduling: { main: MAIN, cards: { q1: MAIN, q2: { repetitions: 1 }, q3: 'x' } }
    })
    expect(Object.keys(r?.cards ?? {})).toEqual(['q1'])
  })

  it('main 与 cards 全空返回 undefined', () => {
    expect(schedulingFromExtras({ scheduling: { main: { repetitions: 1 }, cards: {} } })).toBeUndefined()
  })
})
