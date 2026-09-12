import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LAYOUT,
  LEFT_MAX,
  LEFT_MIN,
  clampInt,
  mergeLayout,
  normalizeLayout
} from './layout'

describe('clampInt', () => {
  it('四舍五入并夹在范围内', () => {
    expect(clampInt(240.6, 180, 480, 240)).toBe(241)
    expect(clampInt(10, 180, 480, 240)).toBe(180)
    expect(clampInt(9999, 180, 480, 240)).toBe(480)
  })

  it('非数值回落 fallback', () => {
    expect(clampInt(undefined, 180, 480, 240)).toBe(240)
    expect(clampInt('300', 180, 480, 240)).toBe(240)
    expect(clampInt(Number.NaN, 180, 480, 240)).toBe(240)
    expect(clampInt(Number.POSITIVE_INFINITY, 180, 480, 240)).toBe(240)
  })
})

describe('normalizeLayout', () => {
  it('空输入返回默认值', () => {
    expect(normalizeLayout(undefined)).toEqual(DEFAULT_LAYOUT)
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT)
    expect(normalizeLayout('nope')).toEqual(DEFAULT_LAYOUT)
  })

  it('越界宽度被夹到边界', () => {
    const r = normalizeLayout({ leftWidth: 5, rightWidth: 9999 })
    expect(r.leftWidth).toBe(LEFT_MIN)
    expect(r.rightWidth).toBe(520)
  })

  it('非法 contentWidth 回落 medium', () => {
    expect(normalizeLayout({ contentWidth: 'huge' }).contentWidth).toBe('medium')
  })

  it('合法 contentWidth 保留', () => {
    expect(normalizeLayout({ contentWidth: 'narrow' }).contentWidth).toBe('narrow')
    expect(normalizeLayout({ contentWidth: 'full' }).contentWidth).toBe('full')
  })

  it('非布尔值回落到默认布尔', () => {
    const r = normalizeLayout({ leftVisible: 'yes', autoSave: 1 })
    expect(r.leftVisible).toBe(true)
    expect(r.autoSave).toBe(false)
    expect(r.showStatus).toBe(true)
    expect(normalizeLayout({ showStatus: false }).showStatus).toBe(false)
  })

  it('默认值自洽：宽度在合法范围内', () => {
    expect(DEFAULT_LAYOUT.leftWidth).toBeGreaterThanOrEqual(LEFT_MIN)
    expect(DEFAULT_LAYOUT.leftWidth).toBeLessThanOrEqual(LEFT_MAX)
    expect(DEFAULT_LAYOUT.contentWidth).toBe('medium')
    expect(DEFAULT_LAYOUT.autoSave).toBe(false)
    expect(DEFAULT_LAYOUT.focusMode).toBe(false)
    expect(DEFAULT_LAYOUT.readMode).toBe(false)
    expect(DEFAULT_LAYOUT.showStatus).toBe(true)
  })
})

describe('mergeLayout', () => {
  it('patch 非对象时原样返回 current', () => {
    const cur = { ...DEFAULT_LAYOUT, leftWidth: 300 }
    expect(mergeLayout(cur, undefined)).toBe(cur)
    expect(mergeLayout(cur, null)).toBe(cur)
  })

  it('只覆盖 patch 提到的字段', () => {
    const cur = { ...DEFAULT_LAYOUT, leftWidth: 300, rightWidth: 300 }
    const next = mergeLayout(cur, { readMode: true })
    expect(next.readMode).toBe(true)
    expect(next.leftWidth).toBe(300)
    expect(next.rightWidth).toBe(300)
  })

  it('非法值回落到 current 而非默认值', () => {
    const cur = { ...DEFAULT_LAYOUT, contentWidth: 'narrow' as const, leftWidth: 300 }
    const next = mergeLayout(cur, { contentWidth: 'bogus', leftWidth: 'wide' })
    expect(next.contentWidth).toBe('narrow')
    expect(next.leftWidth).toBe(300)
  })
})
