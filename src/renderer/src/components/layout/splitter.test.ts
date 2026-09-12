import { describe, expect, it } from 'vitest'
import { LEFT_MAX, LEFT_MIN, MIN_CONTENT_WIDTH, RIGHT_MIN } from '../../../../shared/utils/layout'
import { clampWidth, resolveWidths, stepWidth } from './splitter'

describe('clampWidth', () => {
  it('夹到范围内并取整', () => {
    expect(clampWidth(300.4, 180, 480)).toBe(300)
    expect(clampWidth(100, 180, 480)).toBe(180)
    expect(clampWidth(999, 180, 480)).toBe(480)
  })

  it('非有限数取 min', () => {
    expect(clampWidth(Number.NaN, 180, 480)).toBe(180)
    expect(clampWidth(Number.POSITIVE_INFINITY, 180, 480)).toBe(480)
  })
})

describe('stepWidth', () => {
  it('按步长移动并夹取', () => {
    expect(stepWidth(300, -16, 180, 480)).toBe(284)
    expect(stepWidth(185, -16, 180, 480)).toBe(180)
    expect(stepWidth(475, 16, 180, 480)).toBe(480)
  })
})

describe('resolveWidths', () => {
  it('容器足够时不改动', () => {
    expect(resolveWidths(240, 256, 1440)).toEqual({ left: 240, right: 256 })
  })

  it('越界宽度先各自夹取', () => {
    expect(resolveWidths(10, 9999, 1440)).toEqual({ left: LEFT_MIN, right: 520 })
  })

  it('总宽超出时先压右栏', () => {
    // 容器 800 → 可用 440，左 240 右 256 共 496 超出
    expect(resolveWidths(240, 256, 800)).toEqual({ left: 240, right: 200 })
  })

  it('右栏压到 min 仍超出时再压左栏', () => {
    // 容器 600 → 可用 240；右栏 min 200 后左栏只剩 40，被压到 LEFT_MIN 180
    expect(resolveWidths(240, 256, 600)).toEqual({ left: LEFT_MIN, right: RIGHT_MIN })
  })

  it('极窄容器退化为两栏各取 min（允许超出，由折叠解决）', () => {
    const r = resolveWidths(240, 256, 400)
    expect(r.left).toBe(LEFT_MIN)
    expect(r.right).toBe(RIGHT_MIN)
    expect(r.left + r.right).toBeGreaterThan(400 - MIN_CONTENT_WIDTH)
  })

  it('左栏越界时不影响右栏', () => {
    expect(resolveWidths(9999, 256, 1440)).toEqual({ left: LEFT_MAX, right: 256 })
  })
})
