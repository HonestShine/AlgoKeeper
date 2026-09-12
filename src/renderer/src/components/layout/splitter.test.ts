import { describe, expect, it } from 'vitest'
import { LEFT_MAX, LEFT_MIN, MIN_CONTENT_WIDTH, RIGHT_MIN } from '../../../../shared/utils/layout'
import { clampWidth, dragWidth, resolveWidths, stepWidth } from './splitter'

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

describe('dragWidth', () => {
  it('正常拖拽不被 cap 截断', () => {
    // container 1440, other 256 → cap = 1440-360-256 = 824；raw = 300
    expect(dragWidth(300, 'left', 0, 1440, 256)).toBe(300)
  })

  it('被 cap 截断（另一栏可见时保留正文最小宽）', () => {
    // container 800, other 200 → cap = 240；raw = 400 → 240
    expect(dragWidth(400, 'left', 0, 800, 200)).toBe(240)
  })

  it('cap 小于 min 时夹到最小值而非产出负宽', () => {
    // container 420, other 200 → cap = -140；raw = 300 → 夹到 LEFT_MIN
    expect(dragWidth(300, 'left', 0, 420, 200)).toBe(LEFT_MIN)
  })

  it('other = 0（另一栏折叠或专注模式）时放宽上限', () => {
    // container 900, other 0 → cap = 540；raw = 500 → 夹到 LEFT_MAX
    expect(dragWidth(500, 'left', 0, 900, 0)).toBe(LEFT_MAX)
  })

  it('拖右栏按容器右边界反向计算', () => {
    // container 1440, other 240 → cap = 840；raw = 1440-1000 = 440
    expect(dragWidth(1000, 'right', 0, 1440, 240)).toBe(440)
  })

  it('拖右栏靠近右边界时夹到 RIGHT_MIN', () => {
    expect(dragWidth(1430, 'right', 0, 1440, 240)).toBe(RIGHT_MIN)
  })
})
