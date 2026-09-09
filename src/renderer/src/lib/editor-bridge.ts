import type { Editor } from '@tiptap/react'

/** 编辑器单例桥：菜单/工具栏经由 EditorSurface 挂载的实例执行命令。 */
let active: Editor | null = null

export function setActiveEditor(e: Editor | null): void {
  active = e
}

export function getActiveEditor(): Editor | null {
  return active
}
