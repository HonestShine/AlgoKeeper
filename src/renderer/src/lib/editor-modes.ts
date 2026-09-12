/**
 * 编辑区模式状态机（纯函数）。
 * 不变式：mode === 'read' 时 source 恒为 false（阅读与源码互斥）。
 */
export interface EditorModeState {
  mode: 'edit' | 'read'
  /** 源码模式（CodeMirror）；仅编辑态可为真 */
  source: boolean
}

/** 是否处于「富文本可编辑」态：编辑态且非源码 */
export function isSourceEditable(s: EditorModeState): boolean {
  return s.mode === 'edit' && !s.source
}

export function setRead(_s: EditorModeState, on: boolean): EditorModeState {
  return on ? { mode: 'read', source: false } : { mode: 'edit', source: false }
}

export function setSource(_s: EditorModeState, on: boolean): EditorModeState {
  return on ? { mode: 'edit', source: true } : { mode: 'edit', source: false }
}

export function toggleRead(s: EditorModeState): EditorModeState {
  return setRead(s, s.mode !== 'read')
}
