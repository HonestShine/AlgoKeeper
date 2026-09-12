/** 布局偏好：默认值、范围常量、白名单与 clamp（纯函数，主进程与渲染层共用）。 */
import type { ContentWidth, LayoutPrefs } from '../types/settings'

export const LEFT_MIN = 180
export const LEFT_MAX = 480
export const RIGHT_MIN = 200
export const RIGHT_MAX = 520
export const DEFAULT_LEFT_WIDTH = 240
export const DEFAULT_RIGHT_WIDTH = 256
/** 折叠后保留的窄条宽度（用于「展开」按钮，避免藏起来找不回） */
export const RAIL_WIDTH = 28
/** 正文区最小宽度：拖拽分隔条时的反向约束 */
export const MIN_CONTENT_WIDTH = 360

export const DEFAULT_LAYOUT: LayoutPrefs = {
  leftWidth: DEFAULT_LEFT_WIDTH,
  rightWidth: DEFAULT_RIGHT_WIDTH,
  leftVisible: true,
  rightVisible: true,
  contentWidth: 'medium',
  focusMode: false,
  readMode: false,
  autoSave: false,
  showStatus: true
}

const CONTENT_WIDTHS: readonly ContentWidth[] = ['narrow', 'medium', 'full']

/** 数值夹取：非有限数回落 fallback，否则四舍五入后夹到 [min, max]。 */
export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, Math.round(v)))
}

function boolOr(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function widthOr(v: unknown, min: number, max: number, fallback: number): number {
  return clampInt(v, min, max, fallback)
}

/** 任意输入 → 合法 LayoutPrefs（非法值静默回落，不抛错）。 */
export function normalizeLayout(raw: unknown): LayoutPrefs {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...DEFAULT_LAYOUT }
  const r = raw as Record<string, unknown>
  const cw = r.contentWidth
  return {
    leftWidth: widthOr(r.leftWidth, LEFT_MIN, LEFT_MAX, DEFAULT_LAYOUT.leftWidth),
    rightWidth: widthOr(r.rightWidth, RIGHT_MIN, RIGHT_MAX, DEFAULT_LAYOUT.rightWidth),
    leftVisible: boolOr(r.leftVisible, DEFAULT_LAYOUT.leftVisible),
    rightVisible: boolOr(r.rightVisible, DEFAULT_LAYOUT.rightVisible),
    contentWidth: CONTENT_WIDTHS.includes(cw as ContentWidth)
      ? (cw as ContentWidth)
      : DEFAULT_LAYOUT.contentWidth,
    focusMode: boolOr(r.focusMode, DEFAULT_LAYOUT.focusMode),
    readMode: boolOr(r.readMode, DEFAULT_LAYOUT.readMode),
    autoSave: boolOr(r.autoSave, DEFAULT_LAYOUT.autoSave),
    showStatus: boolOr(r.showStatus, DEFAULT_LAYOUT.showStatus)
  }
}

/** 局部更新：只覆盖 patch 提到的字段；非法值回落到 current 对应值。 */
export function mergeLayout(current: LayoutPrefs, patch: unknown): LayoutPrefs {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return current
  const r = patch as Record<string, unknown>
  const cw = r.contentWidth
  return {
    leftWidth: widthOr(r.leftWidth, LEFT_MIN, LEFT_MAX, current.leftWidth),
    rightWidth: widthOr(r.rightWidth, RIGHT_MIN, RIGHT_MAX, current.rightWidth),
    leftVisible: boolOr(r.leftVisible, current.leftVisible),
    rightVisible: boolOr(r.rightVisible, current.rightVisible),
    contentWidth: CONTENT_WIDTHS.includes(cw as ContentWidth) ? (cw as ContentWidth) : current.contentWidth,
    focusMode: boolOr(r.focusMode, current.focusMode),
    readMode: boolOr(r.readMode, current.readMode),
    autoSave: boolOr(r.autoSave, current.autoSave),
    showStatus: boolOr(r.showStatus, current.showStatus)
  }
}
