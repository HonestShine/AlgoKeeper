import { describe, expect, it } from 'vitest'
import { schedule, newCardScheduling, EASE_MIN } from './sm2'
import type { SchedulingInfo } from '../types/srs'

describe('sm2 schedule（对齐 tech §5.2 演算）', () => {
  it('三连 Good 的 interval 阶梯 1→6→15，EF 不变', () => {
    const d1 = schedule(3, newCardScheduling('2026-08-30'), '2026-08-30')
    expect(d1).toMatchObject({ repetitions: 1, easeFactor: 2.5, interval: 1, due: '2026-08-31' })
    const d2 = schedule(3, d1, '2026-08-31')
    expect(d2).toMatchObject({ repetitions: 2, interval: 6, due: '2026-09-06' })
    const d3 = schedule(3, d2, '2026-09-06')
    expect(d3).toMatchObject({ repetitions: 3, interval: 15, easeFactor: 2.5, due: '2026-09-21' })
  })

  it('Again 重置 reps/interval、EF 保留、lapses+1', () => {
    const mature: SchedulingInfo = {
      repetitions: 5,
      easeFactor: 2.6,
      interval: 60,
      due: '2026-09-10',
      lapses: 1
    }
    const after = schedule(1, mature, '2026-09-10')
    expect(after.repetitions).toBe(0)
    expect(after.interval).toBe(1)
    expect(after.easeFactor).toBe(2.6)
    expect(after.lapses).toBe(2)
    expect(after.due).toBe('2026-09-11')
  })

  it('成熟卡 Hard → EF 2.6→2.46，Easy → 2.6→2.70', () => {
    const base: SchedulingInfo = { repetitions: 5, easeFactor: 2.6, interval: 60, due: '2026-09-10', lapses: 0 }
    expect(schedule(2, base, '2026-09-10').easeFactor).toBeCloseTo(2.46, 2)
    expect(schedule(4, base, '2026-09-10').easeFactor).toBeCloseTo(2.7, 2)
    expect(schedule(3, base, '2026-09-10').easeFactor).toBe(2.6)
  })

  it('EF 永不低于 1.3', () => {
    let s: SchedulingInfo = { repetitions: 9, easeFactor: 1.31, interval: 4, due: '2026-09-10', lapses: 0 }
    for (let i = 0; i < 5; i++) s = schedule(2, s, '2026-09-10')
    expect(s.easeFactor).toBeGreaterThanOrEqual(EASE_MIN)
  })

  it('newCardScheduling 初始值正确', () => {
    expect(newCardScheduling('2026-09-09')).toEqual({
      repetitions: 0,
      easeFactor: 2.5,
      interval: 0,
      due: '2026-09-09',
      lapses: 0
    })
  })
})
