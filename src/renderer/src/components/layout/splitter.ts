/** 面板宽度计算（纯函数，便于单测；不含任何 DOM 类型）。 */
import { LEFT_MAX, LEFT_MIN, MIN_CONTENT_WIDTH, RIGHT_MAX, RIGHT_MIN } from '../../../../shared/utils/layout'

/** 夹到 [min, max] 并取整；非有限数按 min / max 边界处理。 */
export function clampWidth(w: number, min: number, max: number): number {
  if (Number.isNaN(w)) return min
  if (w === Number.POSITIVE_INFINITY) return max
  if (w === Number.NEGATIVE_INFINITY) return min
  return Math.min(max, Math.max(min, Math.round(w)))
}

/** 键盘微调：在范围内按步长移动。 */
export function stepWidth(w: number, delta: number, min: number, max: number): number {
  return clampWidth(w + delta, min, max)
}

/**
 * 解析一组合法宽度：先各自夹取；总和超出可用宽（容器 − 正文最小宽）时，
 * 先压右栏到其 min，仍超出再压左栏。极窄容器下允许总宽超出，由折叠解决。
 */
export function resolveWidths(left: number, right: number, container: number): { left: number; right: number } {
  let l = clampWidth(left, LEFT_MIN, LEFT_MAX)
  let r = clampWidth(right, RIGHT_MIN, RIGHT_MAX)
  const avail = container - MIN_CONTENT_WIDTH
  if (l + r <= avail) return { left: l, right: r }
  r = Math.max(RIGHT_MIN, avail - l)
  if (l + r <= avail) return { left: l, right: r }
  l = Math.max(LEFT_MIN, avail - r)
  return { left: l, right: r }
}

/**
 * 拖拽中的目标宽度。
 * @param pointerX 指针 clientX
 * @param side 'left' 拖左栏右边界；'right' 拖右栏左边界
 * @param containerLeft 容器 getBoundingClientRect().left
 * @param containerRight 容器 getBoundingClientRect().right
 * @param otherVisibleWidth 另一侧可见栏的宽度（折叠或专注模式下传 0）
 */
export function dragWidth(
  pointerX: number,
  side: 'left' | 'right',
  containerLeft: number,
  containerRight: number,
  otherVisibleWidth: number
): number {
  const container = containerRight - containerLeft
  const min = side === 'left' ? LEFT_MIN : RIGHT_MIN
  const max = side === 'left' ? LEFT_MAX : RIGHT_MAX
  const raw = side === 'left' ? pointerX - containerLeft : containerRight - pointerX
  const cap = container - MIN_CONTENT_WIDTH - otherVisibleWidth
  return clampWidth(Math.min(raw, cap), min, max)
}
