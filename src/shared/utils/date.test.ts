import { describe, expect, it } from 'vitest'
import { addDaysKey, parseDateKey, toDateKey, todayKey } from './date'

describe('date utils', () => {
  it('toDateKey 使用本地日期并补零', () => {
    expect(toDateKey(new Date(2026, 8, 9))).toBe('2026-09-09')
    expect(toDateKey(new Date(2026, 11, 3))).toBe('2026-12-03')
  })

  it('addDaysKey 跨月/跨年自动进位', () => {
    expect(addDaysKey(new Date(2026, 0, 31), 1)).toBe('2026-02-01')
    expect(addDaysKey(new Date(2026, 11, 31), 1)).toBe('2027-01-01')
    expect(addDaysKey(new Date(2026, 8, 9), 15)).toBe('2026-09-24')
  })

  it('parseDateKey 与 toDateKey 往返一致', () => {
    const key = '2026-09-21'
    expect(toDateKey(parseDateKey(key))).toBe(key)
  })

  it('todayKey 与当前本地日期一致', () => {
    expect(todayKey()).toBe(toDateKey(new Date()))
  })
})
