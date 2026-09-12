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

/** 进入/退出阅读态。阅读态与源码态互斥：置为阅读态时必然清掉 source。 */
export function setRead(on: boolean): EditorModeState {
  return on ? { mode: 'read', source: false } : { mode: 'edit', source: false }
}

/** 进入/退出源码态。进入源码态必然落回编辑态。 */
export function setSource(on: boolean): EditorModeState {
  return on ? { mode: 'edit', source: true } : { mode: 'edit', source: false }
}

/** 编辑态 ⇄ 阅读态。源码态按此键会退出源码并进入阅读态（见规格 §4.1）。 */
export function toggleRead(s: EditorModeState): EditorModeState {
  return setRead(s.mode !== 'read')
}
